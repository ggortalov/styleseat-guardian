import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func, case
from sqlalchemy.orm import joinedload

from app import db
from app.models import TestRun, TestResult, ResultHistory, TestCase, Suite, Section, Project, User
from app.audit import log_action
from app.routes import check_project_ownership

runs_bp = Blueprint("runs", __name__)

# In-memory tracking of the background import subprocess
_import_process = None
_import_output_lines = []

VALID_STATUSES = {"Passed", "Failed", "Blocked", "Retest", "Untested"}


def _get_user_tz():
    """Return the user's timezone from the X-Timezone header, falling back to UTC."""
    tz_name = request.headers.get("X-Timezone")
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except (KeyError, Exception):
            pass
    return timezone.utc


def _is_run_date_locked(run):
    """Check if a run is locked — editable only on the same calendar day in the user's timezone."""
    run_dt = run.run_date or run.created_at
    if not run_dt:
        return False
    run_dt = run_dt if run_dt.tzinfo else run_dt.replace(tzinfo=timezone.utc)
    user_tz = _get_user_tz()
    run_local = run_dt.astimezone(user_tz).date()
    today_local = datetime.now(user_tz).date()
    return run_local < today_local


def is_result_locked(result):
    """Check if a result is locked (its parent run is older than LOCK_HOURS)."""
    run = TestRun.query.get(result.run_id)
    if not run:
        return False
    return _is_run_date_locked(run)


def is_run_locked(run_id):
    """Check if a run is locked (run date is older than LOCK_HOURS)."""
    run = TestRun.query.get(run_id)
    if not run:
        return False
    return _is_run_date_locked(run)


def get_run_completed_at(run_id):
    """Get the latest tested_at timestamp for a run (completion date)."""
    result = TestResult.query.filter_by(run_id=run_id).order_by(TestResult.tested_at.desc()).first()
    return result.tested_at if result and result.tested_at else None


@runs_bp.route("/runs", methods=["GET"])
@jwt_required()
def list_all_runs():
    limit = min(request.args.get("limit", 30, type=int), 200)
    offset = max(request.args.get("offset", 0, type=int), 0)
    total_count = TestRun.query.count()
    effective_date = case(
        (TestRun.run_date.isnot(None), TestRun.run_date),
        else_=TestRun.created_at,
    )
    runs = (
        TestRun.query
        .options(joinedload(TestRun.project), joinedload(TestRun.suite))
        .order_by(effective_date.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    run_ids = [r.id for r in runs]
    # Batch result stats for all runs
    all_run_stats = {}
    if run_ids:
        rows = (
            db.session.query(TestResult.run_id, TestResult.status, func.count(TestResult.id))
            .filter(TestResult.run_id.in_(run_ids))
            .group_by(TestResult.run_id, TestResult.status)
            .all()
        )
        for rid, status, cnt in rows:
            all_run_stats.setdefault(rid, {})[status] = cnt
    result = []
    for run in runs:
        d = run.to_dict()
        d["project_name"] = run.project.name if run.project else None
        d["suite_name"] = run.suite.name if run.suite else "All Suites"
        counts = all_run_stats.get(run.id, {})
        d["stats"] = {
            "Passed": counts.get("Passed", 0),
            "Failed": counts.get("Failed", 0),
            "Blocked": counts.get("Blocked", 0),
            "Retest": counts.get("Retest", 0),
            "Untested": counts.get("Untested", 0),
        }
        total = sum(d["stats"].values())
        d["stats"]["total"] = total
        d["stats"]["pass_rate"] = round(d["stats"]["Passed"] / total * 100, 1) if total > 0 else 0
        d["is_locked"] = is_run_locked(run.id)
        if d["is_locked"]:
            completed_at = get_run_completed_at(run.id)
            d["completed_at"] = completed_at.isoformat() if completed_at else None
        result.append(d)
    return jsonify({"items": result, "total": total_count, "limit": limit, "offset": offset}), 200


@runs_bp.route("/projects/<int:project_id>/runs", methods=["GET"])
@jwt_required()
def list_runs(project_id):
    Project.query.get_or_404(project_id)
    effective_date = case(
        (TestRun.run_date.isnot(None), TestRun.run_date),
        else_=TestRun.created_at,
    )
    runs = TestRun.query.filter_by(project_id=project_id).options(
        joinedload(TestRun.suite)
    ).order_by(effective_date.desc()).all()
    run_ids = [r.id for r in runs]
    # Batch result stats for all runs
    all_run_stats = {}
    if run_ids:
        rows = (
            db.session.query(TestResult.run_id, TestResult.status, func.count(TestResult.id))
            .filter(TestResult.run_id.in_(run_ids))
            .group_by(TestResult.run_id, TestResult.status)
            .all()
        )
        for rid, status, cnt in rows:
            all_run_stats.setdefault(rid, {})[status] = cnt
    result = []
    for run in runs:
        d = run.to_dict()
        d["suite_name"] = run.suite.name if run.suite else "All Suites"
        counts = all_run_stats.get(run.id, {})
        d["stats"] = {
            "Passed": counts.get("Passed", 0),
            "Failed": counts.get("Failed", 0),
            "Blocked": counts.get("Blocked", 0),
            "Retest": counts.get("Retest", 0),
            "Untested": counts.get("Untested", 0),
        }
        total = sum(d["stats"].values())
        d["stats"]["total"] = total
        d["stats"]["pass_rate"] = round(d["stats"]["Passed"] / total * 100, 1) if total > 0 else 0
        result.append(d)
    return jsonify(result), 200


@runs_bp.route("/projects/<int:project_id>/runs", methods=["POST"])
@jwt_required()
def create_run(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    suite_id = data.get("suite_id")

    if not name or not suite_id:
        return jsonify({"error": "Name and suite_id are required"}), 400

    suite = Suite.query.get_or_404(suite_id)
    if suite.project_id != project_id:
        return jsonify({"error": "Suite does not belong to this project"}), 400

    run = TestRun(
        project_id=project_id,
        suite_id=suite_id,
        name=name,
        description=data.get("description", ""),
        created_by=int(get_jwt_identity()),
    )
    db.session.add(run)
    db.session.flush()  # get run.id

    # Get all test cases in the suite
    cases = TestCase.query.filter_by(suite_id=suite_id).all()
    for case in cases:
        result = TestResult(run_id=run.id, case_id=case.id, status="Untested")
        db.session.add(result)

    db.session.commit()

    d = run.to_dict()
    d["suite_name"] = suite.name
    total = TestResult.query.filter_by(run_id=run.id).count()
    d["stats"] = {"Passed": 0, "Failed": 0, "Blocked": 0, "Retest": 0, "Untested": total, "total": total, "pass_rate": 0}
    return jsonify(d), 201


@runs_bp.route("/runs/<int:run_id>", methods=["GET"])
@jwt_required()
def get_run(run_id):
    run = TestRun.query.get_or_404(run_id)
    d = run.to_dict()
    d["suite_name"] = run.suite.name if run.suite else "All Suites"
    d["cypress_path"] = run.suite.cypress_path if run.suite else None
    project = Project.query.get(run.project_id) if run.project_id else None
    d["project_name"] = project.name if project else None

    counts = dict(
        db.session.query(TestResult.status, func.count(TestResult.id))
        .filter_by(run_id=run.id)
        .group_by(TestResult.status)
        .all()
    )
    d["stats"] = {
        "Passed": counts.get("Passed", 0),
        "Failed": counts.get("Failed", 0),
        "Blocked": counts.get("Blocked", 0),
        "Retest": counts.get("Retest", 0),
        "Untested": counts.get("Untested", 0),
    }
    total = sum(d["stats"].values())
    d["stats"]["total"] = total
    d["stats"]["pass_rate"] = round(d["stats"]["Passed"] / total * 100, 1) if total > 0 else 0
    d["is_locked"] = is_run_locked(run.id)

    return jsonify(d), 200


@runs_bp.route("/runs/<int:run_id>/delta", methods=["GET"])
@jwt_required()
def get_run_delta(run_id):
    """Compare this run's test cases against the most recent prior run with the same suite(s)."""
    run = TestRun.query.get_or_404(run_id)

    effective_date = case(
        (TestRun.run_date.isnot(None), TestRun.run_date),
        else_=TestRun.created_at,
    )
    current_effective = run.run_date or run.created_at
    current_results = TestResult.query.filter_by(run_id=run.id).all()

    if run.suite_id:
        # Suite-scoped run: match by suite_id
        match_filter = TestRun.suite_id == run.suite_id
    else:
        # Combined run (no suite_id): find which suites this run's results belong to,
        # then find the most recent prior run whose results share the same suite(s).
        current_suite_ids = {
            r.test_case.suite_id for r in current_results
            if r.test_case and r.test_case.suite_id
        }
        if not current_suite_ids:
            return jsonify({"has_previous": False}), 200

        # Find run IDs (other than current) whose results reference the same suite(s)
        candidate_run_ids = (
            db.session.query(TestResult.run_id)
            .join(TestCase, TestResult.case_id == TestCase.id)
            .filter(
                TestResult.run_id != run.id,
                TestCase.suite_id.in_(current_suite_ids),
            )
            .distinct()
            .all()
        )
        candidate_ids = [row[0] for row in candidate_run_ids]
        if not candidate_ids:
            return jsonify({"has_previous": False}), 200

        match_filter = TestRun.id.in_(candidate_ids)

    prev_run = (
        TestRun.query
        .filter(
            match_filter,
            TestRun.id != run.id,
            case(
                (TestRun.run_date.isnot(None), TestRun.run_date),
                else_=TestRun.created_at,
            ) < current_effective,
        )
        .order_by(effective_date.desc())
        .first()
    )

    if not prev_run:
        return jsonify({"has_previous": False}), 200
    prev_results = TestResult.query.filter_by(run_id=prev_run.id).all()

    current_case_ids = {r.case_id for r in current_results}
    prev_case_ids = {r.case_id for r in prev_results}

    added_ids = current_case_ids - prev_case_ids
    removed_ids = prev_case_ids - current_case_ids

    # Filter out rename pairs (added+removed with similar titles)
    if added_ids and removed_ids:
        added_cases = {tc.id: tc for tc in TestCase.query.filter(TestCase.id.in_(added_ids)).all()}
        removed_cases = {tc.id: tc for tc in TestCase.query.filter(TestCase.id.in_(removed_ids)).all()}

        def _tokenize(s):
            return set(s.lower().split())

        def _jaccard(a, b):
            ta, tb = _tokenize(a), _tokenize(b)
            inter = len(ta & tb)
            union = len(ta | tb)
            return inter / union if union else 0.0

        matched_added = set()
        matched_removed = set()
        for aid, ac in added_cases.items():
            best_score, best_rid = 0, None
            for rid, rc in removed_cases.items():
                if rid in matched_removed:
                    continue
                score = _jaccard(ac.title, rc.title)
                if score > best_score:
                    best_score, best_rid = score, rid
            if best_score >= 0.6 and best_rid is not None:
                matched_added.add(aid)
                matched_removed.add(best_rid)

        added_ids -= matched_added
        removed_ids -= matched_removed

    common_ids = current_case_ids & prev_case_ids

    # Status changes for common cases
    current_status = {r.case_id: r.status for r in current_results if r.case_id in common_ids}
    prev_status = {r.case_id: r.status for r in prev_results if r.case_id in common_ids}

    regression_ids = []
    fix_ids = []
    other_changes = 0
    for cid in common_ids:
        cs = current_status.get(cid)
        ps = prev_status.get(cid)
        if cs == ps:
            continue
        if ps == "Passed" and cs == "Failed":
            regression_ids.append(cid)
        elif ps == "Failed" and cs == "Passed":
            fix_ids.append(cid)
        else:
            other_changes += 1

    # Build lookup for case details (added + removed + regressions + fixes)
    all_case_ids = added_ids | removed_ids | set(regression_ids) | set(fix_ids)
    cases = {}
    if all_case_ids:
        for tc in TestCase.query.filter(TestCase.id.in_(all_case_ids)).all():
            section_name = tc.section.name if tc.section else None
            cases[tc.id] = {"case_id": tc.id, "title": tc.title, "section_name": section_name}

    def _case_detail(cid):
        return cases.get(cid, {"case_id": cid, "title": f"Case #{cid}", "section_name": None})

    added = [_case_detail(cid) for cid in sorted(added_ids)]
    removed = [_case_detail(cid) for cid in sorted(removed_ids)]
    regressions = [_case_detail(cid) for cid in sorted(regression_ids)]
    fixes = [_case_detail(cid) for cid in sorted(fix_ids)]

    prev_date = prev_run.run_date or prev_run.created_at

    # Derive GitHub repo URL from CIRCLECI_PROJECT_SLUG (e.g. "gh/styleseat/cypress" → "styleseat/cypress")
    slug = os.environ.get('CIRCLECI_PROJECT_SLUG', '')
    vcs_repo = '/'.join(slug.split('/')[1:]) if '/' in slug else None

    return jsonify({
        "has_previous": True,
        "vcs_repo": vcs_repo,
        "previous_run": {
            "id": prev_run.id,
            "name": prev_run.name,
            "date": prev_date.isoformat() if prev_date else None,
            "total": len(prev_results),
            "triggered_by": prev_run.triggered_by,
            "commit_sha": prev_run.commit_sha,
        },
        "current_run": {
            "triggered_by": run.triggered_by,
            "commit_sha": run.commit_sha,
        },
        "current_total": len(current_results),
        "added": added,
        "removed": removed,
        "added_count": len(added),
        "removed_count": len(removed),
        "status_changes": {
            "regressions": len(regressions),
            "regression_details": regressions,
            "fixes": len(fixes),
            "fix_details": fixes,
            "other_changes": other_changes,
        },
    }), 200


@runs_bp.route("/runs/<int:run_id>", methods=["PUT"])
@jwt_required()
def update_run(run_id):
    run = TestRun.query.get_or_404(run_id)
    project = Project.query.get(run.project_id)
    denied = check_project_ownership(project)
    if denied:
        return denied
    data = request.get_json(silent=True) or {}

    if "name" in data:
        run.name = data["name"].strip()
    if "description" in data:
        run.description = data["description"]
    if "is_completed" in data:
        run.is_completed = data["is_completed"]
        if data["is_completed"]:
            run.completed_at = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify(run.to_dict()), 200


@runs_bp.route("/runs/<int:run_id>", methods=["DELETE"])
@jwt_required()
def delete_run(run_id):
    run = TestRun.query.get_or_404(run_id)
    project = Project.query.get(run.project_id)
    denied = check_project_ownership(project)
    if denied:
        return denied
    log_action("DELETE", "test_run", run_id)
    db.session.delete(run)
    db.session.commit()
    return jsonify({"message": "Test run deleted"}), 200


@runs_bp.route("/runs/bulk-delete", methods=["POST"])
@jwt_required()
def bulk_delete_runs():
    data = request.get_json(silent=True) or {}
    ids = data.get("ids", [])
    if not ids:
        return jsonify({"error": "No run IDs provided"}), 400
    runs = TestRun.query.filter(TestRun.id.in_(ids)).all()
    # Check ownership for all runs via their project
    checked_projects = {}
    for run in runs:
        pid = run.project_id
        if pid and pid not in checked_projects:
            project = Project.query.get(pid)
            if project:
                denied = check_project_ownership(project)
                if denied:
                    return denied
                checked_projects[pid] = True
    deleted_ids = [r.id for r in runs]
    for run in runs:
        db.session.delete(run)
    db.session.commit()
    log_action("BULK_DELETE", "test_run", deleted_ids)
    return jsonify({"message": f"{len(runs)} test run(s) deleted"}), 200


@runs_bp.route("/runs/<int:run_id>/results", methods=["GET"])
@jwt_required()
def list_results(run_id):
    TestRun.query.get_or_404(run_id)
    results = TestResult.query.filter_by(run_id=run_id).options(
        joinedload(TestResult.test_case).joinedload(TestCase.section)
    ).all()
    # Batch-fetch usernames for all tested_by IDs
    tester_ids = {r.tested_by for r in results if r.tested_by}
    tester_map = {}
    if tester_ids:
        users = User.query.filter(User.id.in_(tester_ids)).all()
        tester_map = {u.id: u.username for u in users}
    # Batch-fetch suite names for all suite_ids referenced by test cases
    suite_ids = {r.test_case.suite_id for r in results if r.test_case and r.test_case.suite_id}
    suite_map = {}
    if suite_ids:
        suites = Suite.query.filter(Suite.id.in_(suite_ids)).all()
        suite_map = {s.id: s.name for s in suites}
    # Batch-fetch parent section names for hierarchical grouping
    parent_ids = {r.test_case.section.parent_id for r in results if r.test_case and r.test_case.section and r.test_case.section.parent_id}
    parent_section_map = {}
    if parent_ids:
        parent_sections = Section.query.filter(Section.id.in_(parent_ids)).all()
        parent_section_map = {s.id: s.name for s in parent_sections}
    out = []
    for r in results:
        d = r.to_dict()
        d["tested_by_name"] = tester_map.get(r.tested_by, "Automation") if r.tested_by else "Automation"
        d["is_locked"] = is_result_locked(r)
        if r.test_case:
            d["case_title"] = r.test_case.title
            d["priority"] = r.test_case.priority
            d["suite_name"] = suite_map.get(r.test_case.suite_id, "Unknown")
            # Extract source file and describe title from preconditions if present
            preconditions = r.test_case.preconditions or ""
            source_file = None
            source_path_full = None
            describe_title = None
            for line in preconditions.split('\n'):
                line = line.strip()
                if line.startswith("Source:") or line.startswith("File:"):
                    source_path = line.split(":", 1)[1].strip()
                    source_path_full = source_path
                    source_file = source_path.split("/")[-1]
                elif line.startswith("Describe:"):
                    describe_title = line.split(":", 1)[1].strip()
            d["source_file"] = source_file
            d["source_path"] = source_path_full
            d["describe_title"] = describe_title
            # Group by file name when available, otherwise by section name
            d["section_name"] = source_file or (r.test_case.section.name if r.test_case.section else "Uncategorized")
            # Include parent section name for hierarchical grouping (e.g., Android > Client tests)
            if r.test_case.section and r.test_case.section.parent_id:
                d["parent_section_name"] = parent_section_map.get(r.test_case.section.parent_id)
            else:
                d["parent_section_name"] = None
        else:
            # Test case was deleted — preserve the result with fallback values
            d["case_title"] = f"[Deleted case #{r.case_id}]" if r.case_id else "[Deleted case]"
            d["priority"] = None
            d["suite_name"] = "Unknown"
            d["source_file"] = None
            d["source_path"] = None
            d["describe_title"] = None
            d["section_name"] = "Deleted"
            d["parent_section_name"] = None
        out.append(d)
    return jsonify(out), 200


@runs_bp.route("/results/<int:result_id>", methods=["GET"])
@jwt_required()
def get_result(result_id):
    result = TestResult.query.get_or_404(result_id)
    d = result.to_dict()
    d["is_locked"] = is_result_locked(result)
    run = TestRun.query.get(result.run_id) if result.run_id else None
    d["run_name"] = run.name if run else None
    if result.test_case:
        d["test_case"] = result.test_case.to_dict()
        d["test_case"]["section_name"] = result.test_case.section.name if result.test_case.section else None
    else:
        d["test_case"] = {
            "id": result.case_id,
            "title": f"[Deleted case #{result.case_id}]" if result.case_id else "[Deleted case]",
            "section_name": "Deleted",
        }
    return jsonify(d), 200


@runs_bp.route("/results/<int:result_id>", methods=["PUT"])
@jwt_required()
def update_result(result_id):
    result = TestResult.query.get_or_404(result_id)
    run = TestRun.query.get(result.run_id)
    if run:
        project = Project.query.get(run.project_id)
        denied = check_project_ownership(project)
        if denied:
            return denied
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())

    # Check if result is locked (tested more than 24 hours ago)
    if is_result_locked(result):
        return jsonify({"error": "Result is locked. Edits are not allowed after 24 hours."}), 403

    if "status" in data:
        if data["status"] not in VALID_STATUSES:
            return jsonify({"error": "Invalid status value"}), 400
        result.status = data["status"]
    if "comment" in data:
        result.comment = data["comment"]
    if "defect_id" in data:
        result.defect_id = data["defect_id"]
    if "error_message" in data:
        result.error_message = data["error_message"]
    if "artifacts" in data:

        result.artifacts = json.dumps(data["artifacts"]) if isinstance(data["artifacts"], list) else data["artifacts"]
    if "circleci_job_id" in data:
        result.circleci_job_id = data["circleci_job_id"]

    result.tested_by = user_id
    result.tested_at = datetime.now(timezone.utc)

    # Record history
    history = ResultHistory(
        result_id=result.id,
        status=result.status,
        comment=result.comment,
        defect_id=result.defect_id,
        error_message=result.error_message,
        artifacts=result.artifacts,
        changed_by=user_id,
    )
    db.session.add(history)
    db.session.commit()

    d = result.to_dict()
    d["is_locked"] = is_result_locked(result)
    user = User.query.get(user_id)
    d["tested_by_name"] = user.username if user else "Unknown"
    return jsonify(d), 200


@runs_bp.route("/results/<int:result_id>/history", methods=["GET"])
@jwt_required()
def get_result_history(result_id):
    TestResult.query.get_or_404(result_id)
    history = ResultHistory.query.filter_by(result_id=result_id).order_by(ResultHistory.changed_at.desc()).all()

    # Get usernames for all changed_by IDs
    user_ids = {h.changed_by for h in history if h.changed_by}
    user_map = {}
    if user_ids:
        users = User.query.filter(User.id.in_(user_ids)).all()
        user_map = {u.id: u.username for u in users}

    result = []
    for h in history:
        d = h.to_dict()
        d["changed_by_name"] = user_map.get(h.changed_by, "Automation") if h.changed_by else "Automation"
        result.append(d)

    return jsonify(result), 200


@runs_bp.route("/circleci/job/<job_number>", methods=["GET"])
@jwt_required()
def get_circleci_job_data(job_number):
    """Fetch error messages and artifacts from CircleCI for a job."""
    from app.services.circleci import circleci_service

    if not circleci_service.is_configured():
        return jsonify({"error": "CircleCI integration not configured"}), 400

    data = circleci_service.fetch_failure_data(job_number)
    return jsonify(data), 200


@runs_bp.route("/results/<int:result_id>/fetch-circleci", methods=["POST"])
@jwt_required()
def fetch_circleci_for_result(result_id):
    """Fetch and store CircleCI data for a result."""
    from app.services.circleci import circleci_service

    result = TestResult.query.get_or_404(result_id)
    run = TestRun.query.get(result.run_id)
    if run:
        project = Project.query.get(run.project_id)
        denied = check_project_ownership(project)
        if denied:
            return denied
    data = request.get_json(silent=True) or {}
    job_number = data.get("job_number") or result.circleci_job_id

    if not job_number:
        return jsonify({"error": "No CircleCI job number provided"}), 400

    if not circleci_service.is_configured():
        return jsonify({"error": "CircleCI integration not configured"}), 400

    # Check if result is locked
    if is_result_locked(result):
        return jsonify({"error": "Result is locked. Cannot update after 24 hours."}), 403

    # Fetch CircleCI data
    circleci_data = circleci_service.fetch_failure_data(job_number)

    # Update result
    result.circleci_job_id = str(job_number)
    if circleci_data.get("error_message"):
        result.error_message = circleci_data["error_message"]
    if circleci_data.get("artifacts"):
        result.artifacts = json.dumps(circleci_data["artifacts"])

    db.session.commit()

    d = result.to_dict()
    d["is_locked"] = is_result_locked(result)
    return jsonify(d), 200


# ---------------------------------------------------------------------------
# CircleCI workflow import (background subprocess)
# ---------------------------------------------------------------------------

_WORKFLOW_URL_RE = re.compile(
    r"(?:https?://app\.circleci\.com/pipelines/github/[^/]+/[^/]+/)?"
    r"(\d+/workflows/[0-9a-f-]+)"
    r"|^([0-9a-f-]{36})$",
    re.IGNORECASE,
)


def _validate_workflow_ref(value):
    """Return a sanitised workflow reference string, or None if invalid."""
    value = value.strip()
    # Full URL
    if value.startswith("http"):
        m = re.search(r"\d+/workflows/[0-9a-f-]+", value)
        return value if m else None
    # Path fragment  e.g. 61253/workflows/<uuid>
    if re.match(r"^\d+/workflows/[0-9a-f-]+$", value):
        return value
    # Bare UUID
    if re.match(r"^[0-9a-f-]{36}$", value, re.IGNORECASE):
        return value
    return None


@runs_bp.route("/runs/import-circleci", methods=["POST"])
@jwt_required()
def import_circleci():
    """Spawn import_circleci.py as a background subprocess."""
    global _import_process, _import_output_lines

    # Reject if an import is already running
    if _import_process is not None and _import_process.poll() is None:
        return jsonify({"error": "An import is already in progress"}), 409

    data = request.get_json(silent=True) or {}
    workflow_url = data.get("workflow_url", "")
    if not workflow_url:
        return jsonify({"error": "workflow_url is required"}), 400

    ref = _validate_workflow_ref(workflow_url)
    if ref is None:
        return jsonify({"error": "Invalid CircleCI workflow URL or ID"}), 400

    # Resolve paths
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir))
    script_path = os.path.join(backend_dir, "import_circleci.py")
    venv_python = os.path.join(backend_dir, "venv", "bin", "python")

    python_exe = venv_python if os.path.isfile(venv_python) else sys.executable

    if not os.path.isfile(script_path):
        return jsonify({"error": "import_circleci.py not found"}), 500

    # Reset output buffer
    _import_output_lines = []

    _import_process = subprocess.Popen(
        [python_exe, script_path, ref],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=backend_dir,
    )

    return jsonify({"status": "started", "workflow_ref": ref}), 202


@runs_bp.route("/runs/import-status", methods=["GET"])
@jwt_required()
def import_status():
    """Check whether a background import is still running."""
    global _import_process, _import_output_lines

    if _import_process is None:
        return jsonify({"running": False, "output": ""}), 200

    # Drain any available stdout without blocking
    import select
    while True:
        ready, _, _ = select.select([_import_process.stdout], [], [], 0)
        if not ready:
            break
        line = _import_process.stdout.readline()
        if not line:
            break
        _import_output_lines.append(line.rstrip("\n"))

    running = _import_process.poll() is None
    exit_code = _import_process.returncode

    # If finished, drain remaining output
    if not running:
        for line in _import_process.stdout:
            _import_output_lines.append(line.rstrip("\n"))

    output = "\n".join(_import_output_lines[-50:])  # last 50 lines

    resp = {"running": running, "output": output}
    if not running:
        resp["exit_code"] = exit_code
        resp["success"] = exit_code == 0
        # Parse the run ID from import output (e.g. "(ID: 42)" or "(ID: 42, 63 results)")
        for line in reversed(_import_output_lines):
            m = re.search(r'\(ID:\s*(\d+)', line)
            if m:
                resp["run_id"] = int(m.group(1))
                break

    return jsonify(resp), 200

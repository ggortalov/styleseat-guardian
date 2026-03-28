import base64
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
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

# Middle dot separator used in CircleCI-imported run names: "P0 · Mon, Mar 23, 2026"
_MIDDOT_SEP = " \u00b7 "


def _derive_suite_name(run_name, suite_names):
    """Derive suite name from a run name for runs without suite_id.

    Splits on the ' · ' separator used by CircleCI imports, then matches
    the prefix against known suite names (longest first to handle
    "P0 Devices" vs "P0").  Falls back to "All Suites" if no match.
    """
    if _MIDDOT_SEP not in run_name:
        return "All Suites"
    prefix = run_name.split(_MIDDOT_SEP, 1)[0].strip()
    if not prefix:
        return "All Suites"
    # Try exact match first
    if prefix in suite_names:
        return prefix
    # Try case-insensitive + dash-normalized match (run may use '-' while suite uses '–')
    prefix_lower = prefix.lower().replace("\u2013", "-").replace("-", "-")
    for sn in suite_names:
        sn_lower = sn.lower().replace("\u2013", "-").replace("-", "-")
        if prefix_lower == sn_lower:
            return sn
    # Strip branch/variant suffixes and retry: "P0 gem5240wallet · date" → "P0"
    parts = prefix.split()
    for length in range(len(parts) - 1, 0, -1):
        candidate = " ".join(parts[:length])
        if candidate in suite_names:
            return candidate
        candidate_lower = candidate.lower().replace("\u2013", "-").replace("-", "-")
        for sn in suite_names:
            sn_lower = sn.lower().replace("\u2013", "-").replace("-", "-")
            if candidate_lower == sn_lower:
                return sn
    return prefix  # use the raw prefix as-is (better than "All Suites")


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
    runs = (
        TestRun.query
        .options(joinedload(TestRun.project), joinedload(TestRun.suite))
        .order_by(TestRun.id.desc())
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
    # Collect suite names per project for derivation
    project_ids = {r.project_id for r in runs if r.project_id}
    _all_suites = Suite.query.filter(Suite.project_id.in_(project_ids)).all() if project_ids else []
    _suite_names_by_project = {}
    for s in _all_suites:
        _suite_names_by_project.setdefault(s.project_id, set()).add(s.name)
    result = []
    for run in runs:
        d = run.to_dict()
        d["project_name"] = run.project.name if run.project else None
        if run.suite:
            d["suite_name"] = run.suite.name
        else:
            d["suite_name"] = _derive_suite_name(
                run.name, _suite_names_by_project.get(run.project_id, set())
            )
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
    # Collect known suite names for derivation of runs without suite_id
    project_suite_names = {s.name for s in Suite.query.filter_by(project_id=project_id).all()}
    result = []
    for run in runs:
        d = run.to_dict()
        if run.suite:
            d["suite_name"] = run.suite.name
        else:
            d["suite_name"] = _derive_suite_name(run.name, project_suite_names)
        locked = _is_run_date_locked(run)
        d["is_locked"] = locked
        if locked:
            completed_at = get_run_completed_at(run.id)
            d["completed_at"] = completed_at.isoformat() if completed_at else None
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
    if run.suite:
        d["suite_name"] = run.suite.name
    else:
        project_suite_names = set()
        if run.project_id:
            project_suite_names = {s.name for s in Suite.query.filter_by(project_id=run.project_id).all()}
        d["suite_name"] = _derive_suite_name(run.name, project_suite_names)
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

    # Determine which suite(s) this run covers — either from run.suite_id or from its results
    current_suite_ids = {run.suite_id} if run.suite_id else {
        r.test_case.suite_id for r in current_results
        if r.test_case and r.test_case.suite_id
    }
    if not current_suite_ids:
        return jsonify({"has_previous": False}), 200

    # Find the most recent prior run (by date/time) whose results share the same suite(s).
    # This works regardless of whether the prior run has suite_id set or is a combined run.
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

    current_case_ids = {r.case_id for r in current_results if r.case_id is not None}
    prev_case_ids = {r.case_id for r in prev_results if r.case_id is not None}

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
            "total": len(prev_case_ids),
            "triggered_by": prev_run.triggered_by,
            "commit_sha": prev_run.commit_sha,
        },
        "current_run": {
            "triggered_by": run.triggered_by,
            "commit_sha": run.commit_sha,
        },
        "current_total": len(current_case_ids),
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


# ---------------------------------------------------------------------------
# Test Health Analysis
# ---------------------------------------------------------------------------

# Error pattern classification table
_ERROR_PATTERNS = [
    {
        "id": "timeout",
        "patterns": ["timed out", "timeout", "exceeded", "cy.wait", "waited for"],
        "label": "Timeout / Async Wait",
        "suggestion": (
            "Replace cy.wait(ms) with cy.intercept() + cy.wait('@alias'). "
            "In Electron/CI, timing is less predictable than local - always wait for "
            "specific network responses or DOM states instead of fixed delays."
        ),
    },
    {
        "id": "assertion",
        "patterns": ["assertionerror", "expected", "assert", "should have", "to equal"],
        "label": "Assertion Failure",
        "suggestion": (
            "Verify test expectations match current app behavior. If the app has A/B tests, "
            "the assertion may see a different variant in CI than locally. Use cy.intercept() "
            "to stub experiment endpoints and force a deterministic variant."
        ),
    },
    {
        "id": "element_not_found",
        "patterns": ["not found", "does not exist", "detached from dom"],
        "label": "Element Not Found",
        "suggestion": (
            "Use data-testid/data-cy selectors instead of CSS classes. Element may render "
            "later in Electron headless due to slower rendering. Add .should('be.visible') "
            "before interacting."
        ),
    },
    {
        "id": "network",
        "patterns": ["econnrefused", "net::err", "fetch failed", "status code", "500"],
        "label": "Network / API Error",
        "suggestion": (
            "Mock external APIs with cy.intercept() to avoid depending on real services "
            "in nightly CI runs. For backend errors, check if the test environment services "
            "are healthy. Consider using cy.intercept() to stub all non-essential API calls."
        ),
    },
    {
        "id": "state",
        "patterns": ["stale element", "not interactable", "not visible", "covered by"],
        "label": "Element State Issue",
        "suggestion": (
            "Electron renders differently than Chrome - elements may be covered by overlays "
            "or animations. Use cy.get().should('be.visible').click() instead of force:true. "
            "Wait for animations: cy.get('.element').should('not.have.class', 'animating')."
        ),
    },
    {
        "id": "data",
        "patterns": ["undefined", "null", "cannot read propert", "typeerror"],
        "label": "Data / Type Error",
        "suggestion": (
            "Likely a race condition: the test accesses data before it's loaded. "
            "Use cy.intercept() to wait for the data API to respond before asserting. "
            "Check fixtures load correctly in CI."
        ),
    },
    {
        "id": "auth",
        "patterns": ["401", "403", "unauthorized", "forbidden", "session expired"],
        "label": "Auth Issue",
        "suggestion": (
            "Sessions may expire between tests in nightly runs. Ensure cy.session() or "
            "programmatic login runs in beforeEach(). Check cookie domain/SameSite settings "
            "for Electron headless."
        ),
    },
    {
        "id": "viewport",
        "patterns": ["viewport", "responsive", "mobile", "breakpoint", "media query"],
        "label": "Viewport / Responsive",
        "suggestion": (
            "Electron's default viewport may differ from Chrome. Set cy.viewport() explicitly "
            "in beforeEach() to ensure consistent rendering across CI environments."
        ),
    },
    {
        "id": "resource",
        "patterns": ["enomem", "killed", "out of memory", "heap", "segfault"],
        "label": "CI Resource Exhaustion",
        "suggestion": (
            "CircleCI container may be running out of memory. Use resource_class: medium+ or "
            "larger for Electron jobs. Consider splitting specs across parallel containers."
        ),
    },
]

# Code smell detection patterns
_CODE_SMELLS = [
    {
        "id": "hardcoded_wait",
        "regex": r"cy\.wait\(\s*\d+\s*\)",
        "label": "Hardcoded cy.wait()",
        "suggestion": (
            "Replace cy.wait(ms) with cy.intercept() + cy.wait('@alias'). "
            "Hardcoded waits are the #1 cause of Electron CI flakiness because "
            "timing varies per resource_class."
        ),
    },
    {
        "id": "force_click",
        "regex": r"\.click\(\s*\{\s*force\s*:\s*true",
        "label": "Forced Click Actions",
        "suggestion": (
            "Remove { force: true } and fix the root cause. Force-clicking bypasses "
            "Cypress's visibility checks, masking real bugs that surface as flakes in Electron."
        ),
    },
    {
        "id": "fragile_selector",
        "regex": r"cy\.get\(\s*['\"][\.\#][^'\"]+['\"]\s*\)",
        "label": "Fragile CSS Selectors",
        "suggestion": (
            "Use data-testid or data-cy attributes. CSS selectors break when styles change, "
            "causing intermittent failures across branches."
        ),
    },
    {
        "id": "uncaught_exception",
        "regex": r"Cypress\.on\(\s*['\"]uncaught:exception['\"]",
        "label": "Suppressed Exceptions",
        "suggestion": (
            "Returning false from uncaught:exception hides real app errors. Instead, use "
            "cy.intercept() to prevent the error, or fix the app code causing it."
        ),
    },
    {
        "id": "ab_test",
        "regex": r"(?:variant|experiment|split_test|feature_flag|optimizely|launchdarkly)",
        "label": "A/B Test / Feature Flag",
        "suggestion": (
            "Test may hit different experiment groups in CI vs local. Use cy.intercept() to "
            "stub the experiment API and force a consistent variant. This is a top cause of "
            "'works locally, flakes in CI'."
        ),
    },
    {
        "id": "chained_commands",
        "regex": r"\.then\([^)]*\)\s*\.\s*then\([^)]*\)\s*\.\s*then\([^)]*\)\s*\.\s*then\(",
        "label": "Deeply Chained Commands",
        "suggestion": (
            "Break into smaller Cypress command chains. Deep nesting makes retry-ability "
            "harder and timing issues more likely in Electron."
        ),
    },
]


def _classify_error(error_msg):
    """Return the first matching error pattern ID, or None."""
    if not error_msg:
        return None
    lower = error_msg.lower()
    for pat in _ERROR_PATTERNS:
        for substr in pat["patterns"]:
            if substr in lower:
                return pat["id"]
    return None


def _get_error_pattern(pattern_id):
    """Lookup an error pattern by ID."""
    for p in _ERROR_PATTERNS:
        if p["id"] == pattern_id:
            return p
    return None


def _fetch_github_file(cypress_path, source_rel, file_cache):
    """Fetch a file from GitHub via `gh api`. Returns content string or None."""
    if not cypress_path and not source_rel:
        return None

    # Build the full path to fetch
    path = source_rel or cypress_path
    if not path:
        return None

    # Normalize: strip leading /
    path = path.lstrip("/")

    if path in file_cache:
        return file_cache[path]

    try:
        result = subprocess.run(
            ["gh", "api", f"repos/styleseat/cypress/contents/{path}",
             "--jq", ".content"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            content = base64.b64decode(result.stdout.strip()).decode("utf-8", errors="replace")
            file_cache[path] = content
            return content
    except Exception:
        pass

    file_cache[path] = None
    return None


def _analyze_code_smells(content):
    """Scan file content for code smell patterns. Returns list of smell dicts."""
    if not content:
        return []
    found = []
    lines = content.split("\n")
    for smell in _CODE_SMELLS:
        matches = []
        for i, line in enumerate(lines, 1):
            if re.search(smell["regex"], line, re.IGNORECASE):
                matches.append({"line": i, "code": line.strip()[:120]})
        if matches:
            found.append({
                "id": smell["id"],
                "label": smell["label"],
                "suggestion": smell["suggestion"],
                "occurrences": len(matches),
                "examples": matches[:3],
            })

    # Heuristic checks that need more context

    # no_intercept: has cy.visit but no cy.intercept
    visit_examples = [{"line": i, "code": line.strip()[:120]} for i, line in enumerate(lines, 1) if "cy.visit(" in line]
    has_intercept = any("cy.intercept(" in l for l in lines)
    if visit_examples and not has_intercept:
        found.append({
            "id": "no_intercept",
            "label": "No Network Interception",
            "suggestion": (
                "Add cy.intercept() to mock/wait on API calls. Without it, tests depend "
                "on real backend timing which varies wildly in nightly CI runs."
            ),
            "occurrences": len(visit_examples),
            "examples": visit_examples[:3],
        })

    # shared_state: let/var declared outside beforeEach (at describe level)
    shared_examples = []
    in_describe = False
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if "describe(" in stripped:
            in_describe = True
        if in_describe and (stripped.startswith("let ") or stripped.startswith("var ")):
            indent = len(line) - len(line.lstrip())
            if indent <= 4:
                shared_examples.append({"line": i, "code": stripped[:120]})
    if shared_examples:
        found.append({
            "id": "shared_state",
            "label": "Shared Mutable State",
            "suggestion": (
                "Move variable init inside beforeEach(). Shared state causes "
                "order-dependent flakiness - tests pass solo but fail when run together."
            ),
            "occurrences": len(shared_examples),
            "examples": shared_examples[:3],
        })

    # no_before_each: multiple it() but no beforeEach
    it_examples = [{"line": i, "code": line.strip()[:120]} for i, line in enumerate(lines, 1) if re.search(r"\bit\s*\(", line)]
    has_before_each = any("beforeEach(" in l for l in lines)
    if len(it_examples) >= 2 and not has_before_each:
        found.append({
            "id": "no_before_each",
            "label": "Missing beforeEach Setup",
            "suggestion": (
                "Add beforeEach() with cy.visit() and state reset. Without test isolation, "
                "later tests inherit state from earlier ones, causing order-dependent flakes."
            ),
            "occurrences": len(it_examples),
            "examples": it_examples[:3],
        })

    # no_cy_session: cy.visit('/login') in beforeEach without cy.session
    has_login_visit = any(
        "beforeeach" in l.lower() or ("cy.visit" in l and "login" in l.lower())
        for l in lines
    )
    has_session = any("cy.session(" in l for l in lines)
    if has_login_visit and not has_session:
        found.append({
            "id": "no_cy_session",
            "label": "Missing cy.session()",
            "suggestion": (
                "Use cy.session() for auth setup to cache login state across tests. "
                "Speeds up nightly suites and avoids login-related flakes."
            ),
            "occurrences": 1,
            "examples": [],
        })

    return found


def _compute_ewma_flip_rate(statuses, window_size=5, alpha=0.3):
    """Compute EWMA-smoothed flip rate over windowed status sequences."""
    if len(statuses) < 2:
        return 0.0

    # Divide into windows
    windows = []
    for i in range(0, len(statuses), window_size):
        windows.append(statuses[i:i + window_size])

    if not windows:
        return 0.0

    # Calculate flip rate per window
    ewma = 0.0
    first = True
    for window in windows:
        if len(window) < 2:
            window_flip_rate = 0.0
        else:
            flips = sum(
                1 for j in range(1, len(window))
                if window[j] != window[j - 1]
                and window[j] in ("Passed", "Failed")
                and window[j - 1] in ("Passed", "Failed")
            )
            window_flip_rate = flips / (len(window) - 1)

        if first:
            ewma = window_flip_rate
            first = False
        else:
            ewma = alpha * window_flip_rate + (1 - alpha) * ewma

    return round(ewma, 4)


@runs_bp.route("/projects/<int:project_id>/test-health", methods=["GET"])
@jwt_required()
def get_test_health(project_id):
    """Analyze test health: detect flaky, failing, and regressed tests."""
    Project.query.get_or_404(project_id)

    suite_id = request.args.get("suite_id", type=int)
    window = request.args.get("window", 30, type=int)
    window = max(1, min(window, 90))

    cutoff = datetime.now(timezone.utc) - timedelta(days=window)

    # Step 1: Get completed runs in window
    run_query = TestRun.query.filter(
        TestRun.project_id == project_id,
        TestRun.is_completed == True,
        TestRun.created_at >= cutoff,
    )
    if suite_id:
        run_query = run_query.filter(TestRun.suite_id == suite_id)
    else:
        # Exclude suites that are not relevant for health analysis
        excluded_paths = ['cypress/e2e/abTest/', 'cypress/e2e/devices/p0/']
        excluded_names = ['AB Test', 'P0 Devices']
        excluded_suite_ids = [
            s.id for s in Suite.query.filter(
                Suite.project_id == project_id,
                db.or_(
                    Suite.cypress_path.in_(excluded_paths),
                    Suite.name.in_(excluded_names),
                ),
            ).all()
        ]
        if excluded_suite_ids:
            run_query = run_query.filter(TestRun.suite_id.notin_(excluded_suite_ids))

    MIN_RUNS_FOR_ANALYSIS = 5

    runs = run_query.order_by(TestRun.created_at.asc()).all()

    # Insufficient data gate — need at least MIN_RUNS_FOR_ANALYSIS completed runs
    if len(runs) < MIN_RUNS_FOR_ANALYSIS:
        return jsonify({
            "summary": {
                "flaky": 0, "always_failing": 0, "consistently_failing": 0,
                "regression": 0, "healthy": 0, "total_analyzed": 0,
            },
            "error_pattern_summary": {},
            "code_smell_summary": {},
            "tests": [],
            "runs_analyzed": len(runs),
            "min_runs_required": MIN_RUNS_FOR_ANALYSIS,
            "confidence": "insufficient",
            "window_days": window,
        }), 200

    run_ids = [r.id for r in runs]
    run_commit_map = {r.id: r.commit_sha for r in runs}

    # Step 2: Batch-fetch all results for these runs
    results = (
        TestResult.query
        .filter(
            TestResult.run_id.in_(run_ids),
            TestResult.status != "Untested",
            TestResult.case_id.isnot(None),
        )
        .options(joinedload(TestResult.test_case).joinedload(TestCase.section))
        .all()
    )

    # Group results by case_id, preserving run order
    run_order = {rid: idx for idx, rid in enumerate(run_ids)}
    case_results = defaultdict(list)
    for r in results:
        case_results[r.case_id].append(r)

    # Sort each case's results by run order
    for cid in case_results:
        case_results[cid].sort(key=lambda r: run_order.get(r.run_id, 0))

    # Prefetch suite + section info for all relevant cases
    all_case_ids = list(case_results.keys())
    case_map = {}
    if all_case_ids:
        cases = (
            TestCase.query
            .filter(TestCase.id.in_(all_case_ids))
            .options(joinedload(TestCase.section))
            .all()
        )
        for tc in cases:
            case_map[tc.id] = tc

    suite_map = {}
    suite_ids = {tc.suite_id for tc in case_map.values() if tc.suite_id}
    if suite_ids:
        for s in Suite.query.filter(Suite.id.in_(suite_ids)).all():
            suite_map[s.id] = s

    # Step 3: Per-test metrics
    test_entries = []
    global_max_disruptions = 1  # avoid div-by-zero

    for cid, res_list in case_results.items():
        tc = case_map.get(cid)
        if not tc:
            continue

        statuses = [r.status for r in res_list]
        total = len(statuses)
        pass_count = statuses.count("Passed")
        fail_count = statuses.count("Failed")
        block_count = statuses.count("Blocked")

        failure_rate = fail_count / total if total > 0 else 0.0

        # Flip rate
        flips = 0
        for i in range(1, len(statuses)):
            prev_s, cur_s = statuses[i - 1], statuses[i]
            if prev_s in ("Passed", "Failed") and cur_s in ("Passed", "Failed") and prev_s != cur_s:
                flips += 1
        raw_flip_rate = flips / (total - 1) if total > 1 else 0.0
        disruption_count = flips

        if disruption_count > global_max_disruptions:
            global_max_disruptions = disruption_count

        # EWMA flip rate
        ewma_flip_rate = _compute_ewma_flip_rate(statuses)

        # Same-commit flakiness
        same_commit_flaky = False
        commit_statuses = defaultdict(set)
        for r in res_list:
            commit = run_commit_map.get(r.run_id)
            if commit:
                commit_statuses[commit].add(r.status)
        for commit, st_set in commit_statuses.items():
            if "Passed" in st_set and "Failed" in st_set:
                same_commit_flaky = True
                break

        # Streak
        streak = 1
        streak_status = statuses[-1] if statuses else "Untested"
        for i in range(len(statuses) - 2, -1, -1):
            if statuses[i] == streak_status:
                streak += 1
            else:
                break

        # Trend (last 10)
        trend = statuses[-10:]

        # Error analysis for failed results
        error_msgs = [r.error_message for r in res_list if r.status == "Failed" and r.error_message]
        error_freq = defaultdict(int)
        for msg in error_msgs:
            cat = _classify_error(msg)
            if cat:
                error_freq[cat] += 1

        # Most recent failed result for error/artifacts
        last_failed = None
        for r in reversed(res_list):
            if r.status == "Failed":
                last_failed = r
                break

        # Source file info from preconditions
        source_file = None
        source_path = None
        if tc.preconditions:
            for line in tc.preconditions.split("\n"):
                line = line.strip()
                if line.startswith("Source:") or line.startswith("File:"):
                    sp = line.split(":", 1)[1].strip()
                    source_path = sp
                    source_file = sp.split("/")[-1]
                    break

        entry = {
            "case_id": cid,
            "title": tc.title,
            "suite_id": tc.suite_id,
            "suite_name": suite_map.get(tc.suite_id, Suite()).name if tc.suite_id and tc.suite_id in suite_map else "Unknown",
            "section_name": tc.section.name if tc.section else "Uncategorized",
            "priority": tc.priority,
            "total_runs": total,
            "pass_count": pass_count,
            "fail_count": fail_count,
            "block_count": block_count,
            "failure_rate": round(failure_rate, 4),
            "flip_rate": round(raw_flip_rate, 4),
            "ewma_flip_rate": ewma_flip_rate,
            "disruption_count": disruption_count,
            "same_commit_flaky": same_commit_flaky,
            "last_status": statuses[-1] if statuses else "Untested",
            "streak": streak,
            "streak_status": streak_status,
            "trend": trend,
            "_error_freq": dict(error_freq),
            "_error_msgs": error_msgs,
            "_last_failed": last_failed,
            "_source_file": source_file,
            "_source_path": source_path,
            "_statuses": statuses,
        }
        test_entries.append(entry)

    # Step 4: Per-test confidence tier + classification
    # Confidence is per-test because each test may appear in different numbers of runs
    CATEGORY_ORDER = {"always_failing": 0, "flaky": 1, "consistently_failing": 2, "regression": 3, "healthy": 4}

    for entry in test_entries:
        statuses = entry["_statuses"]
        total = entry["total_runs"]
        failure_rate = entry["failure_rate"]
        ewma = entry["ewma_flip_rate"]

        # Per-test confidence tier based on how many runs this test appeared in
        if total < 5:
            entry["confidence"] = "low"
        elif total < 10:
            entry["confidence"] = "low"
        elif total < 20:
            entry["confidence"] = "medium"
        else:
            entry["confidence"] = "high"

        # Classification — same-commit flaky is definitive regardless of run count
        # For other categories, require minimum runs for the EWMA/rate-based classifications
        if failure_rate == 1.0 and total >= 2:
            entry["category"] = "always_failing"
        elif entry["same_commit_flaky"]:
            # Definitive signal — pass+fail on same commit proves flakiness
            entry["category"] = "flaky"
        elif ewma >= 0.3 and total >= 5:
            # Need at least 5 runs for EWMA to have one full window of data
            entry["category"] = "flaky"
        elif failure_rate >= 0.8 and total >= 5:
            entry["category"] = "consistently_failing"
        elif len(statuses) >= 3 and all(s == "Failed" for s in statuses[-2:]) and any(s == "Passed" for s in statuses[:-2]):
            entry["category"] = "regression"
        else:
            entry["category"] = "healthy"

    # Step 5: Severity score
    for entry in test_entries:
        recency = 0.0
        if entry["last_status"] == "Failed":
            recency = 1.0
        elif entry["fail_count"] > 0:
            # Failed within last 3 runs?
            last3 = entry["_statuses"][-3:]
            if "Failed" in last3:
                recency = 0.5

        severity = (
            entry["ewma_flip_rate"] * 0.4
            + entry["failure_rate"] * 0.3
            + (entry["disruption_count"] / global_max_disruptions) * 0.2
            + recency * 0.1
        )
        entry["severity"] = round(severity, 4)

    # Sort: category order, then severity desc
    test_entries.sort(key=lambda e: (CATEGORY_ORDER.get(e["category"], 99), -e["severity"]))

    # Step 6: Build diagnostics (only for unhealthy tests)
    # NOTE: Code smell analysis (GitHub file fetching) is NOT done here — it's
    # too slow for the listing endpoint (hundreds of subprocess calls).  Use the
    # per-test deep-analysis endpoint POST /test-health/<case_id>/analyze instead.
    error_pattern_summary = defaultdict(int)

    output_tests = []
    for entry in test_entries:
        is_unhealthy = entry["category"] != "healthy"

        diagnostics = None
        if is_unhealthy:
            # Error category
            error_freq = entry["_error_freq"]
            dominant_error = max(error_freq, key=error_freq.get) if error_freq else None
            error_pattern = _get_error_pattern(dominant_error) if dominant_error else None

            # Update global error pattern summary
            for eid, count in error_freq.items():
                error_pattern_summary[eid] += count

            # Artifacts from last failed result
            recent_artifacts = []
            last_error = None
            last_failed = entry["_last_failed"]
            if last_failed:
                last_error = last_failed.error_message
                for art in last_failed.artifacts_list:
                    if isinstance(art, dict):
                        recent_artifacts.append(art)
                    elif isinstance(art, str):
                        recent_artifacts.append({"name": art.split("/")[-1], "url": art})
                recent_artifacts = recent_artifacts[:3]

            suggestion = error_pattern["suggestion"] if error_pattern else None

            # Build contextual error snippet from actual error messages
            error_snippet = None
            if last_error:
                # Truncate to first meaningful line (up to 200 chars)
                first_line = last_error.strip().split("\n")[0][:200]
                error_snippet = first_line

            # Build contextual prefix from actual data
            error_msgs_list = entry.get("_error_msgs", [])
            if suggestion and error_msgs_list:
                freq_count = error_freq.get(dominant_error, 0)
                total_failures = entry["fail_count"]
                ctx_prefix = f"Seen in {freq_count} of {total_failures} failures. "
                if error_snippet:
                    ctx_prefix += f'Latest: "{error_snippet}" — '
                suggestion = ctx_prefix + suggestion

            diagnostics = {
                "error_category": dominant_error,
                "error_label": error_pattern["label"] if error_pattern else None,
                "suggestion": suggestion,
                "last_error": last_error,
                "error_frequency": dict(error_freq),
                "recent_artifacts": recent_artifacts,
                "source_file": entry["_source_file"],
                "source_path": entry["_source_path"],
            }

        # Build output (strip internal fields)
        out = {k: v for k, v in entry.items() if not k.startswith("_")}
        out["diagnostics"] = diagnostics
        output_tests.append(out)

    # Summary counts
    cat_counts = defaultdict(int)
    for e in output_tests:
        cat_counts[e["category"]] += 1

    # Overall confidence based on total completed runs analyzed
    num_runs = len(runs)
    if num_runs < 10:
        overall_confidence = "low"
    elif num_runs < 20:
        overall_confidence = "medium"
    else:
        overall_confidence = "high"

    return jsonify({
        "summary": {
            "flaky": cat_counts.get("flaky", 0),
            "always_failing": cat_counts.get("always_failing", 0),
            "consistently_failing": cat_counts.get("consistently_failing", 0),
            "regression": cat_counts.get("regression", 0),
            "healthy": cat_counts.get("healthy", 0),
            "total_analyzed": len(output_tests),
        },
        "error_pattern_summary": dict(error_pattern_summary),
        "tests": [t for t in output_tests if t["category"] != "healthy"],
        "runs_analyzed": num_runs,
        "min_runs_required": MIN_RUNS_FOR_ANALYSIS,
        "confidence": overall_confidence,
        "window_days": window,
    }), 200


# ─── Deep Analysis (on-demand per test) ─────────────────────────


def _normalize_error_for_grouping(msg):
    """Strip variable parts from error messages so similar errors group together."""
    if not msg:
        return ""
    msg = re.sub(r'\x1b\[[0-9;]*m', '', msg)  # ANSI codes
    msg = re.sub(r'after \d+ms', 'after Nms', msg)  # retry durations
    msg = re.sub(r':\d+:\d+', ':N:N', msg)  # stack trace line numbers
    msg = re.sub(r'\(attempt \d+\)', '(attempt N)', msg)  # retry attempts
    first_line = msg.strip().split('\n')[0][:300]
    return first_line.strip()


def _group_error_messages(failed_results, run_map):
    """Group error messages by normalized pattern to reveal distinct failure modes."""
    groups = defaultdict(lambda: {"count": 0, "runs": [], "raw_messages": [],
                                  "job_ids": [], "result_ids": []})

    for r in failed_results:
        if not r.error_message:
            continue
        key = _normalize_error_for_grouping(r.error_message)
        run = run_map.get(r.run_id)
        run_name = run.name if run else f"Run {r.run_id}"
        g = groups[key]
        g["count"] += 1
        g["runs"].append(run_name)
        g["raw_messages"].append(r.error_message[:800])
        if r.circleci_job_id:
            g["job_ids"].append(r.circleci_job_id)
        g["result_ids"].append(r.id)

    sorted_groups = sorted(groups.items(), key=lambda x: -x[1]["count"])

    return {
        "total_failures": len(failed_results),
        "distinct_patterns": len(groups),
        "groups": [
            {
                "pattern": k,
                "count": v["count"],
                "percentage": round(v["count"] / len(failed_results) * 100) if failed_results else 0,
                "runs": v["runs"][:10],
                "sample_message": v["raw_messages"][0] if v["raw_messages"] else None,
                "job_ids": v["job_ids"][:5],
            }
            for k, v in sorted_groups
        ],
        "same_root_cause": len(groups) <= 1,
    }


def _extract_test_block(source_content, test_title):
    """Extract the it() block and surrounding context for a specific test."""
    if not source_content or not test_title:
        return None

    lines = source_content.split('\n')

    # Find the it() line matching this test title
    target_line = None
    for i, line in enumerate(lines):
        if re.search(r'\bit\s*\(', line) and test_title.lower() in line.lower():
            target_line = i
            break

    if target_line is None:
        # Fuzzy match by key words
        title_words = set(re.findall(r'\w{4,}', test_title.lower()))
        best_match, best_score = None, 0
        for i, line in enumerate(lines):
            if re.search(r'\bit\s*\(', line):
                line_words = set(re.findall(r'\w{4,}', line.lower()))
                overlap = len(title_words & line_words) / max(len(title_words), 1)
                if overlap > best_score:
                    best_match, best_score = i, overlap
        if best_score > 0.5:
            target_line = best_match

    if target_line is None:
        return None

    # Find the end of the it() block by tracking braces
    start = target_line
    brace_count = 0
    end = start
    found_opening = False
    for i in range(start, min(start + 150, len(lines))):
        for ch in lines[i]:
            if ch == '{':
                brace_count += 1
                found_opening = True
            elif ch == '}':
                brace_count -= 1
                if found_opening and brace_count == 0:
                    end = i
                    break
        if found_opening and brace_count == 0:
            break

    # Include a few lines of context before (e.g., beforeEach)
    ctx_start = max(0, start - 5)
    ctx_end = min(len(lines), end + 2)

    block_lines = []
    for i in range(ctx_start, ctx_end):
        block_lines.append({
            "line": i + 1,
            "code": lines[i],
            "is_test_start": i == target_line,
        })

    return {
        "start_line": start + 1,
        "end_line": end + 1,
        "total_lines": end - start + 1,
        "lines": block_lines,
    }


def _extract_selectors(error_messages, test_code_lines=None):
    """Extract CSS selectors and data-testid values from errors and test code."""
    selectors = []
    seen = set()

    def _add(sel, source):
        if sel not in seen:
            seen.add(sel)
            selectors.append({"selector": sel, "source": source})

    for msg in error_messages:
        if not msg:
            continue
        # data-testid/data-cy selectors in brackets
        for m in re.finditer(r'\[data-(?:testid|cy|test)=["\']([^"\']+)["\']', msg):
            _add(m.group(1), "error_message")
        # Backtick-quoted selectors like `[data-testid="foo"]`
        for m in re.finditer(r'`(\[data-[^`]+\])`', msg):
            _add(m.group(1), "error_message")
        for m in re.finditer(r'`(\.[\w-]+(?:\s+\.[\w-]+)*)`', msg):
            _add(m.group(1), "error_message")

    if test_code_lines:
        for line_info in test_code_lines:
            code = line_info.get("code", "")
            for m in re.finditer(r'cy\.(?:get|find|contains)\s*\(\s*["\']([^"\']+)["\']', code):
                sel = m.group(1)
                _add(sel, f"test_code:L{line_info.get('line', '?')}")

    return selectors


def _search_github_for_selectors(selectors, max_selectors=3):
    """Search GitHub org for where selectors are defined in app repos."""
    refs = []

    for sel_info in selectors[:max_selectors]:
        sel = sel_info["selector"]
        # Extract the meaningful search term
        m = re.search(r'data-(?:testid|cy|test)="([^"]+)"', sel)
        search_term = m.group(1) if m else sel.strip('.#[]"\'')

        if len(search_term) < 4:
            continue

        try:
            result = subprocess.run(
                ["gh", "api", "search/code",
                 "-f", f"q={search_term}+org:styleseat",
                 "--jq", '.items[:8] | .[] | {repo: .repository.full_name, path: .path, url: .html_url}'],
                capture_output=True, text=True, timeout=20,
            )
            if result.returncode == 0 and result.stdout.strip():
                for line in result.stdout.strip().split('\n'):
                    try:
                        ref = json.loads(line)
                        repo = ref.get("repo", "")
                        path = ref.get("path", "")
                        # Skip the cypress repo (that's the test itself) and non-source files
                        if "cypress" in repo.lower():
                            continue
                        if any(path.endswith(ext) for ext in
                               ('.js', '.jsx', '.ts', '.tsx', '.html', '.erb',
                                '.haml', '.slim', '.vue', '.svelte')):
                            ref["selector"] = search_term
                            refs.append(ref)
                    except json.JSONDecodeError:
                        pass
        except Exception:
            pass

    # Deduplicate by (repo, path)
    seen = set()
    unique = []
    for ref in refs:
        key = (ref.get("repo"), ref.get("path"))
        if key not in seen:
            seen.add(key)
            unique.append(ref)

    return unique[:10]


def _analyze_commit_correlation(results, run_map):
    """Check if failures correlate with specific commits vs random (true flake)."""
    commit_runs = defaultdict(lambda: {"passed": 0, "failed": 0, "blocked": 0})
    passing_commits = set()
    failing_commits = set()

    for r in results:
        run = run_map.get(r.run_id)
        if not run or not run.commit_sha:
            continue
        sha = run.commit_sha
        if r.status == "Passed":
            commit_runs[sha]["passed"] += 1
            passing_commits.add(sha)
        elif r.status == "Failed":
            commit_runs[sha]["failed"] += 1
            failing_commits.add(sha)
        elif r.status == "Blocked":
            commit_runs[sha]["blocked"] += 1

    only_failing = failing_commits - passing_commits
    mixed = passing_commits & failing_commits  # same commit passes AND fails

    breakdown = sorted(
        [{"sha": sha[:8], "full_sha": sha, **counts}
         for sha, counts in commit_runs.items()],
        key=lambda x: -(x["failed"]),
    )

    return {
        "total_commits": len(commit_runs),
        "passing_commits": len(passing_commits),
        "failing_commits": len(failing_commits),
        "only_failing_commits": [s[:8] for s in only_failing][:5],
        "mixed_commits": [s[:8] for s in mixed][:5],
        "same_commit_flaky": len(mixed) > 0,
        "commit_breakdown": breakdown[:8],
    }


def _build_deep_diagnosis(error_groups, test_source, selectors,
                          app_refs, commit_analysis, code_smells):
    """Generate a specific diagnosis from all collected evidence."""
    findings = []
    fix_suggestions = []

    # 1. Error pattern findings
    eg = error_groups
    if eg["distinct_patterns"] == 1 and eg["total_failures"] > 1:
        findings.append(
            f"All {eg['total_failures']} failures produce the same error, "
            f"pointing to a single root cause."
        )
    elif eg["distinct_patterns"] > 1:
        findings.append(
            f"{eg['distinct_patterns']} distinct error patterns found across "
            f"{eg['total_failures']} failures — multiple issues may be contributing."
        )
        for g in eg["groups"]:
            findings.append(f"  • {g['pattern'][:120]} ({g['count']}x, {g['percentage']}%)")

    # 2. Selector analysis
    if eg["groups"]:
        primary_error = eg["groups"][0].get("sample_message", "")
        sel_match = re.search(r'\[data-testid="([^"]+)"\]', primary_error)
        if not sel_match:
            sel_match = re.search(r'\[data-cy="([^"]+)"\]', primary_error)
        if sel_match:
            selector_name = sel_match.group(1)
            if app_refs:
                repos_found = set(r.get("repo", "") for r in app_refs)
                paths = [r.get("path", "") for r in app_refs[:3]]
                findings.append(
                    f'Element `{selector_name}` found in {", ".join(repos_found)}: '
                    f'{"; ".join(paths)}'
                )
            else:
                findings.append(
                    f'Element `{selector_name}` was NOT found in any app repo. '
                    f'It may have been renamed, removed, or is dynamically generated.'
                )
                fix_suggestions.append(
                    f'Verify that `data-testid="{selector_name}"` still exists '
                    f'in the application. Search the relevant repo for this identifier.'
                )

    # 3. Code smell specifics
    if code_smells:
        for cs in code_smells:
            examples = cs.get("examples", [])
            if cs["id"] == "hardcoded_wait" and examples:
                lines_str = ", ".join(f"L{ex['line']}" for ex in examples[:3])
                findings.append(
                    f'Found {cs["occurrences"]} hardcoded `cy.wait(ms)` '
                    f'({lines_str}). This is the #1 cause of Cypress flakiness.'
                )
                # Generate a specific fix based on context
                if test_source and test_source.get("lines"):
                    for ex in examples[:1]:
                        ex_line = ex["line"]
                        # Find what comes after the wait in the test block
                        next_action = None
                        for tl in test_source["lines"]:
                            if tl["line"] > ex_line:
                                code = tl["code"].strip()
                                if code and not code.startswith("//"):
                                    next_action = code
                                    break
                        if next_action:
                            # Detect if it's a cy.get() call
                            get_match = re.search(r'cy\.get\(["\']([^"\']+)', next_action)
                            if get_match:
                                fix_suggestions.append(
                                    f'Line {ex_line}: Replace `{ex["code"]}` with '
                                    f'a `cy.intercept()` that waits for the API call '
                                    f'that populates `{get_match.group(1)}`.'
                                )
                            else:
                                fix_suggestions.append(
                                    f'Line {ex_line}: Replace `{ex["code"]}` with '
                                    f'`cy.intercept()` + `cy.wait(\'@alias\')` for '
                                    f'the network request this delay is covering.'
                                )
            elif cs["id"] == "no_cy_session":
                findings.append(
                    'Test performs login without `cy.session()`. Each run repeats '
                    'the full login flow, which is slow and flake-prone in CI.'
                )
                fix_suggestions.append(
                    'Wrap the login flow in `cy.session()` to cache auth state '
                    'across tests.'
                )
            elif cs["id"] == "force_click" and examples:
                lines_str = ", ".join(f"L{ex['line']}" for ex in examples[:3])
                findings.append(
                    f'Using `force: true` on click ({lines_str}) hides element '
                    f'visibility issues. The element may be covered by an overlay.'
                )
                fix_suggestions.append(
                    'Remove `force: true` and instead wait for the element to be '
                    'visible: `cy.get(selector).should("be.visible").click()`'
                )
            elif cs["id"] == "no_intercept":
                findings.append(
                    'No `cy.intercept()` found. Test relies on real API timing '
                    'which varies significantly in CI containers.'
                )
                fix_suggestions.append(
                    'Add `cy.intercept()` to wait for critical API responses '
                    'before asserting on DOM elements.'
                )

    # 4. Commit correlation
    ca = commit_analysis
    if ca.get("same_commit_flaky"):
        findings.append(
            f'Test passes AND fails on the same commit SHA '
            f'({", ".join(ca["mixed_commits"][:2])}). '
            f'This is definitive proof of non-deterministic behavior.'
        )
    elif ca.get("only_failing_commits"):
        findings.append(
            f'Failures only appear on commit(s): '
            f'{", ".join(ca["only_failing_commits"][:3])}. '
            f'This looks more like a regression than a flake.'
        )
        fix_suggestions.append(
            f'Check what changed in commit {ca["only_failing_commits"][0]}. '
            f'The failure may be caused by an app change, not a test issue.'
        )

    # Build summary
    summary_parts = []
    if findings:
        summary_parts.append(findings[0])
    if fix_suggestions:
        summary_parts.append(fix_suggestions[0])

    return {
        "findings": findings,
        "fix_suggestions": fix_suggestions,
        "summary": " ".join(summary_parts[:2]),
    }


@runs_bp.route("/test-health/<int:case_id>/analyze", methods=["POST"])
@jwt_required()
def deep_analyze_test(case_id):
    """On-demand deep analysis for a specific flaky/failing test case.

    Fetches all historical error messages, the actual test source code,
    searches app repos for failing selectors, and correlates with commit SHAs
    to produce a specific, actionable diagnosis.
    """
    tc = TestCase.query.get_or_404(case_id)
    data = request.get_json(silent=True) or {}
    project_id = data.get("project_id")
    window = max(1, min(data.get("window", 30), 90))

    if not project_id:
        return jsonify({"error": "project_id is required"}), 400

    cutoff = datetime.now(timezone.utc) - timedelta(days=window)

    # Get completed runs in window
    runs = TestRun.query.filter(
        TestRun.project_id == project_id,
        TestRun.is_completed == True,
        TestRun.completed_at >= cutoff,
    ).order_by(TestRun.completed_at).all()
    run_ids = [r.id for r in runs]
    run_map = {r.id: r for r in runs}

    if not run_ids:
        return jsonify({"error": "No completed runs in this time window"}), 404

    # Get all results for this case across runs
    results = TestResult.query.filter(
        TestResult.run_id.in_(run_ids),
        TestResult.case_id == case_id,
    ).all()

    if not results:
        return jsonify({"error": "No results found for this test case"}), 404

    # Sort results by run order
    run_order = {rid: idx for idx, rid in enumerate(run_ids)}
    results.sort(key=lambda r: run_order.get(r.run_id, 0))

    failed_results = [r for r in results if r.status == "Failed"]

    # ── 1. Error grouping ──
    error_groups = _group_error_messages(failed_results, run_map)

    # ── 2. Fetch test source code ──
    source_path = None
    source_content = None
    if tc.preconditions:
        for line in tc.preconditions.split("\n"):
            line = line.strip()
            if line.startswith("Source:") or line.startswith("File:"):
                source_path = line.split(":", 1)[1].strip()
                break

    suite = Suite.query.get(tc.suite_id) if tc.suite_id else None
    cypress_path = suite.cypress_path if suite else None
    file_cache = {}
    source_content = _fetch_github_file(cypress_path, source_path, file_cache)

    test_source = None
    if source_content:
        test_source = _extract_test_block(source_content, tc.title)

    # ── 3. Extract selectors from errors and test code ──
    error_msgs = [r.error_message for r in failed_results if r.error_message]
    test_lines = test_source.get("lines") if test_source else None
    selectors = _extract_selectors(error_msgs, test_lines)

    # ── 4. Search app repos for selectors ──
    app_refs = _search_github_for_selectors(selectors)

    # ── 5. Commit correlation ──
    commit_analysis = _analyze_commit_correlation(results, run_map)

    # ── 6. Code smells (reuse existing) ──
    code_smells = _analyze_code_smells(source_content) if source_content else []

    # ── 7. Build diagnosis ──
    diagnosis = _build_deep_diagnosis(
        error_groups, test_source, selectors,
        app_refs, commit_analysis, code_smells,
    )

    return jsonify({
        "case_id": case_id,
        "title": tc.title,
        "suite_name": suite.name if suite else None,
        "error_analysis": error_groups,
        "test_source": {
            "file": source_path or (cypress_path if cypress_path else None),
            "repo": "styleseat/cypress",
            "block": test_source,
        } if source_content else None,
        "selectors": selectors,
        "app_references": app_refs,
        "commit_analysis": commit_analysis,
        "code_smells": code_smells,
        "diagnosis": diagnosis,
    }), 200


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

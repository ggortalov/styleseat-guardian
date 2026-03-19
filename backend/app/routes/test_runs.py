from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from app import db
from app.models import TestRun, TestResult, ResultHistory, TestCase, Suite, Project, User

runs_bp = Blueprint("runs", __name__)

LOCK_HOURS = 24  # Results are locked after this many hours


def is_result_locked(result):
    """Check if a result is locked (tested more than LOCK_HOURS ago)."""
    if not result.tested_at:
        return False
    # Use naive datetime for comparison (database stores naive datetimes)
    lock_threshold = datetime.utcnow() - timedelta(hours=LOCK_HOURS)
    # Handle both naive and aware datetimes
    tested_at = result.tested_at.replace(tzinfo=None) if result.tested_at.tzinfo else result.tested_at
    return tested_at < lock_threshold


def is_run_locked(run_id):
    """Check if a run is locked (all results tested more than LOCK_HOURS ago)."""
    results = TestResult.query.filter_by(run_id=run_id).all()
    if not results:
        return False
    # Run is locked only if ALL results are locked (all tested > 24h ago)
    lock_threshold = datetime.utcnow() - timedelta(hours=LOCK_HOURS)
    for r in results:
        if not r.tested_at:
            return False  # Untested result means run is still open
        tested_at = r.tested_at.replace(tzinfo=None) if r.tested_at.tzinfo else r.tested_at
        if tested_at >= lock_threshold:
            return False  # Result tested within 24h means run is still open
    return True


def get_run_completed_at(run_id):
    """Get the latest tested_at timestamp for a run (completion date)."""
    result = TestResult.query.filter_by(run_id=run_id).order_by(TestResult.tested_at.desc()).first()
    return result.tested_at if result and result.tested_at else None


@runs_bp.route("/runs", methods=["GET"])
@jwt_required()
def list_all_runs():
    runs = TestRun.query.order_by(TestRun.created_at.desc()).all()
    result = []
    for run in runs:
        d = run.to_dict()
        d["project_name"] = run.project.name if run.project else None
        d["suite_name"] = run.suite.name if run.suite else None
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
        if d["is_locked"]:
            completed_at = get_run_completed_at(run.id)
            d["completed_at"] = completed_at.isoformat() if completed_at else None
        result.append(d)
    return jsonify(result), 200


@runs_bp.route("/projects/<int:project_id>/runs", methods=["GET"])
@jwt_required()
def list_runs(project_id):
    Project.query.get_or_404(project_id)
    runs = TestRun.query.filter_by(project_id=project_id).order_by(TestRun.created_at.desc()).all()
    result = []
    for run in runs:
        d = run.to_dict()
        d["suite_name"] = run.suite.name if run.suite else None
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
        result.append(d)
    return jsonify(result), 200


@runs_bp.route("/projects/<int:project_id>/runs", methods=["POST"])
@jwt_required()
def create_run(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
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
    d["suite_name"] = run.suite.name if run.suite else None
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

    return jsonify(d), 200


@runs_bp.route("/runs/<int:run_id>", methods=["PUT"])
@jwt_required()
def update_run(run_id):
    run = TestRun.query.get_or_404(run_id)
    data = request.get_json()

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
    db.session.delete(run)
    db.session.commit()
    return jsonify({"message": "Test run deleted"}), 200


@runs_bp.route("/runs/<int:run_id>/results", methods=["GET"])
@jwt_required()
def list_results(run_id):
    TestRun.query.get_or_404(run_id)
    results = TestResult.query.filter_by(run_id=run_id).all()
    # Batch-fetch usernames for all tested_by IDs
    tester_ids = {r.tested_by for r in results if r.tested_by}
    tester_map = {}
    if tester_ids:
        users = User.query.filter(User.id.in_(tester_ids)).all()
        tester_map = {u.id: u.username for u in users}
    out = []
    for r in results:
        d = r.to_dict()
        d["tested_by_name"] = tester_map.get(r.tested_by, "Automation") if r.tested_by else "Automation"
        d["is_locked"] = is_result_locked(r)
        if r.test_case:
            d["case_title"] = r.test_case.title
            d["priority"] = r.test_case.priority
            # Extract source file and describe title from preconditions if present
            preconditions = r.test_case.preconditions or ""
            source_file = None
            describe_title = None
            for line in preconditions.split('\n'):
                line = line.strip()
                if line.startswith("Source:") or line.startswith("File:"):
                    source_path = line.split(":", 1)[1].strip()
                    source_file = source_path.split("/")[-1]
                elif line.startswith("Describe:"):
                    describe_title = line.split(":", 1)[1].strip()
            d["source_file"] = source_file
            d["describe_title"] = describe_title
            # Group by file name when available, otherwise by section name
            d["section_name"] = source_file or (r.test_case.section.name if r.test_case.section else "Uncategorized")
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
    return jsonify(d), 200


@runs_bp.route("/results/<int:result_id>", methods=["PUT"])
@jwt_required()
def update_result(result_id):
    result = TestResult.query.get_or_404(result_id)
    data = request.get_json()
    user_id = int(get_jwt_identity())

    # Check if result is locked (tested more than 24 hours ago)
    if is_result_locked(result):
        return jsonify({"error": "Result is locked. Edits are not allowed after 24 hours."}), 403

    if "status" in data:
        result.status = data["status"]
    if "comment" in data:
        result.comment = data["comment"]
    if "defect_id" in data:
        result.defect_id = data["defect_id"]
    if "error_message" in data:
        result.error_message = data["error_message"]
    if "artifacts" in data:
        import json
        result.artifacts = json.dumps(data["artifacts"]) if isinstance(data["artifacts"], list) else data["artifacts"]
    if "circleci_job_id" in data:
        result.circleci_job_id = data["circleci_job_id"]

    result.tested_by = user_id
    result.tested_at = datetime.now(timezone.utc)

    # Record history
    import json
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
    data = request.get_json()
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
    import json
    result.circleci_job_id = str(job_number)
    if circleci_data.get("error_message"):
        result.error_message = circleci_data["error_message"]
    if circleci_data.get("artifacts"):
        result.artifacts = json.dumps(circleci_data["artifacts"])

    db.session.commit()

    d = result.to_dict()
    d["is_locked"] = is_result_locked(result)
    return jsonify(d), 200

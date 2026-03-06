from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from app import db
from app.models import TestRun, TestResult, ResultHistory, TestCase, Suite, Project

runs_bp = Blueprint("runs", __name__)


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
    out = []
    for r in results:
        d = r.to_dict()
        if r.test_case:
            d["case_title"] = r.test_case.title
            d["section_name"] = r.test_case.section.name if r.test_case.section else None
            d["priority"] = r.test_case.priority
        out.append(d)
    return jsonify(out), 200


@runs_bp.route("/results/<int:result_id>", methods=["GET"])
@jwt_required()
def get_result(result_id):
    result = TestResult.query.get_or_404(result_id)
    d = result.to_dict()
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

    if "status" in data:
        result.status = data["status"]
    if "comment" in data:
        result.comment = data["comment"]
    if "defect_id" in data:
        result.defect_id = data["defect_id"]

    result.tested_by = user_id
    result.tested_at = datetime.now(timezone.utc)

    # Record history
    history = ResultHistory(
        result_id=result.id,
        status=result.status,
        comment=result.comment,
        defect_id=result.defect_id,
        changed_by=user_id,
    )
    db.session.add(history)
    db.session.commit()

    return jsonify(result.to_dict()), 200


@runs_bp.route("/results/<int:result_id>/history", methods=["GET"])
@jwt_required()
def get_result_history(result_id):
    TestResult.query.get_or_404(result_id)
    history = ResultHistory.query.filter_by(result_id=result_id).order_by(ResultHistory.changed_at.desc()).all()
    return jsonify([h.to_dict() for h in history]), 200

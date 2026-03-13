from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models import Project, TestCase, TestRun, TestResult, Section, Suite

projects_bp = Blueprint("projects", __name__)


@projects_bp.route("/projects", methods=["GET"])
@jwt_required()
def list_projects():
    projects = Project.query.order_by(Project.created_at.asc()).all()
    result = []
    for p in projects:
        d = p.to_dict()
        suites = Suite.query.filter_by(project_id=p.id).order_by(Suite.created_at.asc()).all()
        first_suite = suites[0] if suites else None
        d["first_suite_id"] = first_suite.id if first_suite else None
        d["first_suite_name"] = first_suite.name if first_suite else None
        d["suite_count"] = len(suites)
        # Include lightweight suite list for sidebar navigation
        suite_list = []
        for s in suites:
            section_ids = [sec.id for sec in Section.query.filter_by(suite_id=s.id).all()]
            case_count = TestCase.query.filter(TestCase.section_id.in_(section_ids)).count() if section_ids else 0
            suite_list.append({"id": s.id, "name": s.name, "case_count": case_count})
        d["suites"] = suite_list
        result.append(d)
    return jsonify(result), 200


@projects_bp.route("/projects", methods=["POST"])
@jwt_required()
def create_project():
    data = request.get_json()
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Project name is required"}), 400

    project = Project(
        name=name,
        description=data.get("description", ""),
        created_by=int(get_jwt_identity()),
    )
    db.session.add(project)
    db.session.commit()
    return jsonify(project.to_dict()), 201


@projects_bp.route("/projects/<int:project_id>", methods=["GET"])
@jwt_required()
def get_project(project_id):
    project = Project.query.get_or_404(project_id)
    result = project.to_dict()

    suite_ids = [s.id for s in Suite.query.filter_by(project_id=project_id).all()]
    section_ids = [s.id for s in Section.query.filter(Section.suite_id.in_(suite_ids)).all()] if suite_ids else []
    result["suite_count"] = len(suite_ids)
    result["case_count"] = TestCase.query.filter(TestCase.section_id.in_(section_ids)).count() if section_ids else 0
    result["run_count"] = TestRun.query.filter_by(project_id=project_id).count()

    return jsonify(result), 200


@projects_bp.route("/projects/<int:project_id>", methods=["PUT"])
@jwt_required()
def update_project(project_id):
    project = Project.query.get_or_404(project_id)
    data = request.get_json()

    if "name" in data:
        project.name = data["name"].strip()
    if "description" in data:
        project.description = data["description"]

    db.session.commit()
    return jsonify(project.to_dict()), 200


@projects_bp.route("/projects/<int:project_id>", methods=["DELETE"])
@jwt_required()
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    db.session.delete(project)
    db.session.commit()
    return jsonify({"message": "Project deleted"}), 200


@projects_bp.route("/projects/<int:project_id>/stats", methods=["GET"])
@jwt_required()
def get_project_stats(project_id):
    Project.query.get_or_404(project_id)

    runs = TestRun.query.filter_by(project_id=project_id).all()
    run_ids = [r.id for r in runs]

    stats = {"Passed": 0, "Failed": 0, "Blocked": 0, "Retest": 0, "Untested": 0}
    if run_ids:
        results = TestResult.query.filter(TestResult.run_id.in_(run_ids)).all()
        for r in results:
            if r.status in stats:
                stats[r.status] += 1

    return jsonify(stats), 200

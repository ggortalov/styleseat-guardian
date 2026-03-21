import json

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models import TestCase, Section, Suite, User, Project
from app.audit import log_action
from app.routes import check_project_ownership

cases_bp = Blueprint("cases", __name__)


@cases_bp.route("/sections/<int:section_id>/cases", methods=["GET"])
@jwt_required()
def list_cases_by_section(section_id):
    Section.query.get_or_404(section_id)
    cases = TestCase.query.filter_by(section_id=section_id).order_by(TestCase.created_at).all()
    return jsonify([c.to_dict() for c in cases]), 200


@cases_bp.route("/suites/<int:suite_id>/cases", methods=["GET"])
@jwt_required()
def list_cases_by_suite(suite_id):
    Suite.query.get_or_404(suite_id)
    cases = TestCase.query.filter_by(suite_id=suite_id).order_by(TestCase.created_at).all()
    # Batch-fetch section names
    section_ids = {c.section_id for c in cases if c.section_id}
    section_map = {}
    if section_ids:
        sections = Section.query.filter(Section.id.in_(section_ids)).all()
        section_map = {s.id: s.name for s in sections}
    # Batch-fetch author usernames
    author_ids = {c.updated_by or c.created_by for c in cases if c.updated_by or c.created_by}
    user_map = {}
    if author_ids:
        users = User.query.filter(User.id.in_(author_ids)).all()
        user_map = {u.id: u.username for u in users}
    result = []
    for c in cases:
        d = c.to_dict()
        d["section_name"] = section_map.get(c.section_id)
        author_id = c.updated_by or c.created_by
        d["author_name"] = user_map.get(author_id) if author_id else "Automation"
        result.append(d)
    return jsonify(result), 200


@cases_bp.route("/projects/<int:project_id>/cases", methods=["GET"])
@jwt_required()
def list_cases_by_project(project_id):
    """Return all test cases across all suites in a project."""
    Project.query.get_or_404(project_id)
    suite_ids = [s.id for s in Suite.query.filter_by(project_id=project_id).all()]
    if not suite_ids:
        return jsonify([]), 200
    cases = TestCase.query.filter(TestCase.suite_id.in_(suite_ids)).order_by(TestCase.created_at).all()
    # Batch-fetch section names
    section_ids = {c.section_id for c in cases if c.section_id}
    section_map = {}
    if section_ids:
        sections = Section.query.filter(Section.id.in_(section_ids)).all()
        section_map = {s.id: s.name for s in sections}
    # Batch-fetch author usernames
    author_ids = {c.updated_by or c.created_by for c in cases if c.updated_by or c.created_by}
    user_map = {}
    if author_ids:
        users = User.query.filter(User.id.in_(author_ids)).all()
        user_map = {u.id: u.username for u in users}
    result = []
    for c in cases:
        d = c.to_dict()
        d["section_name"] = section_map.get(c.section_id)
        author_id = c.updated_by or c.created_by
        d["author_name"] = user_map.get(author_id) if author_id else None
        result.append(d)
    return jsonify(result), 200


@cases_bp.route("/cases", methods=["POST"])
@jwt_required()
def create_case():
    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip()
    suite_id = data.get("suite_id")
    section_id = data.get("section_id")

    if not title or not suite_id or not section_id:
        return jsonify({"error": "Title, suite_id, and section_id are required"}), 400

    existing = TestCase.query.filter(
        db.func.lower(TestCase.title) == title.lower(),
        TestCase.suite_id == suite_id
    ).first()
    if existing:
        return jsonify({"error": f"A test case with the title \"{title}\" already exists in this suite"}), 409

    Suite.query.get_or_404(suite_id)
    Section.query.get_or_404(section_id)

    case = TestCase(
        suite_id=suite_id,
        section_id=section_id,
        title=title,
        case_type=data.get("case_type", "Functional"),
        priority=data.get("priority", "Medium"),
        preconditions=data.get("preconditions", ""),
        expected_result=data.get("expected_result", ""),
        created_by=int(get_jwt_identity()),
    )
    if "steps" in data:
        case.steps = json.dumps(data["steps"])

    db.session.add(case)
    db.session.commit()
    return jsonify(case.to_dict()), 201


@cases_bp.route("/cases/<int:case_id>", methods=["GET"])
@jwt_required()
def get_case(case_id):
    case = TestCase.query.get_or_404(case_id)
    result = case.to_dict()
    result["section_name"] = case.section.name if case.section else None
    suite = Suite.query.get(case.suite_id) if case.suite_id else None
    result["project_id"] = suite.project_id if suite else None
    result["suite_name"] = suite.name if suite else None
    if suite:
        project = Project.query.get(suite.project_id)
        result["project_name"] = project.name if project else None
    else:
        result["project_name"] = None
    author_id = case.updated_by or case.created_by
    if author_id:
        user = User.query.get(author_id)
        result["author_name"] = user.username if user else "Automation"
    else:
        result["author_name"] = "Automation"
    return jsonify(result), 200


@cases_bp.route("/cases/<int:case_id>", methods=["PUT"])
@jwt_required()
def update_case(case_id):
    case = TestCase.query.get_or_404(case_id)
    suite = Suite.query.get(case.suite_id) if case.suite_id else None
    project = Project.query.get(suite.project_id) if suite else None
    if project:
        denied = check_project_ownership(project)
        if denied:
            return denied
    data = request.get_json(silent=True) or {}

    if "title" in data:
        new_title = data["title"].strip()
        if new_title.lower() != case.title.lower():
            existing = TestCase.query.filter(
                db.func.lower(TestCase.title) == new_title.lower(),
                TestCase.suite_id == case.suite_id,
                TestCase.id != case_id
            ).first()
            if existing:
                return jsonify({"error": f"A test case with the title \"{new_title}\" already exists in this suite"}), 409
        case.title = new_title
    if "suite_id" in data:
        case.suite_id = data["suite_id"]
    if "section_id" in data:
        case.section_id = data["section_id"] or None
    if "case_type" in data:
        case.case_type = data["case_type"]
    if "priority" in data:
        case.priority = data["priority"]
    if "preconditions" in data:
        case.preconditions = data["preconditions"]
    if "steps" in data:
        case.steps = json.dumps(data["steps"])
    if "expected_result" in data:
        case.expected_result = data["expected_result"]

    case.updated_by = int(get_jwt_identity())

    db.session.commit()
    return jsonify(case.to_dict()), 200


@cases_bp.route("/cases/<int:case_id>", methods=["DELETE"])
@jwt_required()
def delete_case(case_id):
    case = TestCase.query.get_or_404(case_id)
    suite = Suite.query.get(case.suite_id) if case.suite_id else None
    project = Project.query.get(suite.project_id) if suite else None
    if project:
        denied = check_project_ownership(project)
        if denied:
            return denied
    log_action("DELETE", "test_case", case_id)
    db.session.delete(case)
    db.session.commit()
    return jsonify({"message": "Test case deleted"}), 200


@cases_bp.route("/cases/bulk-delete", methods=["POST"])
@jwt_required()
def bulk_delete_cases():
    data = request.get_json(silent=True) or {}
    ids = data.get("ids", [])
    if not ids:
        return jsonify({"error": "No case IDs provided"}), 400
    cases = TestCase.query.filter(TestCase.id.in_(ids)).all()
    # Check ownership for all cases (via their suite's project)
    checked_projects = {}
    for case in cases:
        pid = None
        if case.suite_id:
            suite = Suite.query.get(case.suite_id)
            pid = suite.project_id if suite else None
        if pid and pid not in checked_projects:
            project = Project.query.get(pid)
            if project:
                denied = check_project_ownership(project)
                if denied:
                    return denied
                checked_projects[pid] = True
    deleted_ids = [c.id for c in cases]
    for case in cases:
        db.session.delete(case)
    db.session.commit()
    log_action("BULK_DELETE", "test_case", deleted_ids)
    return jsonify({"message": f"{len(cases)} test case(s) deleted"}), 200

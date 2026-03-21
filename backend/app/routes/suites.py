from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app import db
from app.models import Suite, Project, Section, TestCase
from app.audit import log_action
from app.routes import check_project_ownership

suites_bp = Blueprint("suites", __name__)


@suites_bp.route("/projects/<int:project_id>/suites", methods=["GET"])
@jwt_required()
def list_suites(project_id):
    Project.query.get_or_404(project_id)
    suites = Suite.query.filter_by(project_id=project_id).order_by(Suite.created_at.asc()).all()
    suite_ids = [s.id for s in suites]

    # Batch section counts per suite
    section_counts = dict(
        db.session.query(Section.suite_id, func.count(Section.id))
        .filter(Section.suite_id.in_(suite_ids))
        .group_by(Section.suite_id)
        .all()
    ) if suite_ids else {}

    # Batch case counts per suite
    case_counts = dict(
        db.session.query(TestCase.suite_id, func.count(TestCase.id))
        .filter(TestCase.suite_id.in_(suite_ids))
        .group_by(TestCase.suite_id)
        .all()
    ) if suite_ids else {}

    result = []
    for s in suites:
        d = s.to_dict()
        d["section_count"] = section_counts.get(s.id, 0)
        d["case_count"] = case_counts.get(s.id, 0)
        result.append(d)
    return jsonify(result), 200


@suites_bp.route("/projects/<int:project_id>/suites", methods=["POST"])
@jwt_required()
def create_suite(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Suite name is required"}), 400

    suite = Suite(project_id=project_id, name=name, description=data.get("description", ""),
                  cypress_path=data.get("cypress_path"))
    db.session.add(suite)
    db.session.commit()
    return jsonify(suite.to_dict()), 201


@suites_bp.route("/suites/<int:suite_id>", methods=["GET"])
@jwt_required()
def get_suite(suite_id):
    suite = Suite.query.get_or_404(suite_id)
    result = suite.to_dict()
    result["case_count"] = TestCase.query.filter_by(suite_id=suite_id).count()
    return jsonify(result), 200


@suites_bp.route("/suites/<int:suite_id>", methods=["PUT"])
@jwt_required()
def update_suite(suite_id):
    suite = Suite.query.get_or_404(suite_id)
    project = Project.query.get(suite.project_id)
    denied = check_project_ownership(project)
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    if "name" in data:
        suite.name = data["name"].strip()
    if "description" in data:
        suite.description = data["description"]
    if "cypress_path" in data:
        suite.cypress_path = data["cypress_path"]
    db.session.commit()
    return jsonify(suite.to_dict()), 200


@suites_bp.route("/suites/<int:suite_id>", methods=["DELETE"])
@jwt_required()
def delete_suite(suite_id):
    suite = Suite.query.get_or_404(suite_id)
    project = Project.query.get(suite.project_id)
    denied = check_project_ownership(project)
    if denied:
        return denied
    log_action("DELETE", "suite", suite_id)
    db.session.delete(suite)
    db.session.commit()
    return jsonify({"message": "Suite deleted"}), 200

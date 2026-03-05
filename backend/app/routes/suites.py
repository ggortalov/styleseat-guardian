from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from app import db
from app.models import Suite, Project, Section, TestCase

suites_bp = Blueprint("suites", __name__)


@suites_bp.route("/projects/<int:project_id>/suites", methods=["GET"])
@jwt_required()
def list_suites(project_id):
    Project.query.get_or_404(project_id)
    suites = Suite.query.filter_by(project_id=project_id).order_by(Suite.created_at.desc()).all()
    result = []
    for s in suites:
        d = s.to_dict()
        section_ids = [sec.id for sec in Section.query.filter_by(suite_id=s.id).all()]
        d["section_count"] = len(section_ids)
        d["case_count"] = TestCase.query.filter(TestCase.section_id.in_(section_ids)).count() if section_ids else 0
        result.append(d)
    return jsonify(result), 200


@suites_bp.route("/projects/<int:project_id>/suites", methods=["POST"])
@jwt_required()
def create_suite(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Suite name is required"}), 400

    suite = Suite(project_id=project_id, name=name, description=data.get("description", ""))
    db.session.add(suite)
    db.session.commit()
    return jsonify(suite.to_dict()), 201


@suites_bp.route("/suites/<int:suite_id>", methods=["GET"])
@jwt_required()
def get_suite(suite_id):
    suite = Suite.query.get_or_404(suite_id)
    result = suite.to_dict()
    section_ids = [s.id for s in Section.query.filter_by(suite_id=suite_id).all()]
    result["case_count"] = TestCase.query.filter(TestCase.section_id.in_(section_ids)).count() if section_ids else 0
    return jsonify(result), 200


@suites_bp.route("/suites/<int:suite_id>", methods=["PUT"])
@jwt_required()
def update_suite(suite_id):
    suite = Suite.query.get_or_404(suite_id)
    data = request.get_json()
    if "name" in data:
        suite.name = data["name"].strip()
    if "description" in data:
        suite.description = data["description"]
    db.session.commit()
    return jsonify(suite.to_dict()), 200


@suites_bp.route("/suites/<int:suite_id>", methods=["DELETE"])
@jwt_required()
def delete_suite(suite_id):
    suite = Suite.query.get_or_404(suite_id)
    db.session.delete(suite)
    db.session.commit()
    return jsonify({"message": "Suite deleted"}), 200

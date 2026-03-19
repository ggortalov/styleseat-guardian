from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from app import db
from app.models import Section, Suite, TestCase, Project

sections_bp = Blueprint("sections", __name__)


@sections_bp.route("/suites/<int:suite_id>/sections", methods=["GET"])
@jwt_required()
def list_sections(suite_id):
    Suite.query.get_or_404(suite_id)
    sections = Section.query.filter_by(suite_id=suite_id).order_by(Section.display_order).all()
    result = []
    for s in sections:
        d = s.to_dict()
        d["case_count"] = TestCase.query.filter_by(section_id=s.id).count()
        result.append(d)
    return jsonify(result), 200


@sections_bp.route("/projects/<int:project_id>/sections", methods=["GET"])
@jwt_required()
def list_sections_by_project(project_id):
    """Return all sections across all suites in a project."""
    Project.query.get_or_404(project_id)
    suite_ids = [s.id for s in Suite.query.filter_by(project_id=project_id).all()]
    if not suite_ids:
        return jsonify([]), 200
    sections = Section.query.filter(Section.suite_id.in_(suite_ids)).order_by(Section.display_order).all()
    result = []
    for s in sections:
        d = s.to_dict()
        d["case_count"] = TestCase.query.filter_by(section_id=s.id).count()
        result.append(d)
    return jsonify(result), 200


@sections_bp.route("/suites/<int:suite_id>/sections", methods=["POST"])
@jwt_required()
def create_section(suite_id):
    Suite.query.get_or_404(suite_id)
    data = request.get_json()
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Section name is required"}), 400

    parent_id = data.get("parent_id")
    if parent_id:
        parent = Section.query.get(parent_id)
        if not parent or parent.suite_id != suite_id:
            return jsonify({"error": "Parent section does not belong to this suite"}), 400

    section = Section(
        suite_id=suite_id,
        parent_id=parent_id,
        name=name,
        description=data.get("description", ""),
        display_order=data.get("display_order", 0),
    )
    db.session.add(section)
    db.session.commit()
    return jsonify(section.to_dict()), 201


@sections_bp.route("/sections/<int:section_id>", methods=["PUT"])
@jwt_required()
def update_section(section_id):
    section = Section.query.get_or_404(section_id)
    data = request.get_json()
    if "name" in data:
        section.name = data["name"].strip()
    if "description" in data:
        section.description = data["description"]
    if "display_order" in data:
        section.display_order = data["display_order"]
    if "parent_id" in data:
        new_parent_id = data["parent_id"]
        if new_parent_id:
            parent = Section.query.get(new_parent_id)
            if not parent or parent.suite_id != section.suite_id:
                return jsonify({"error": "Parent section does not belong to this suite"}), 400
        section.parent_id = new_parent_id
    db.session.commit()
    return jsonify(section.to_dict()), 200


@sections_bp.route("/sections/<int:section_id>", methods=["DELETE"])
@jwt_required()
def delete_section(section_id):
    section = Section.query.get_or_404(section_id)
    db.session.delete(section)
    db.session.commit()
    return jsonify({"message": "Section deleted"}), 200

from flask_jwt_extended import get_jwt_identity
from flask import jsonify


def check_project_ownership(project):
    """Return None if user owns the project, or a (response, 403) tuple."""
    user_id = int(get_jwt_identity())
    # Projects with no owner (seeded/synced) are accessible to all authenticated users
    if project.created_by is not None and project.created_by != user_id:
        return jsonify({"error": "Forbidden"}), 403
    return None

import logging

from flask_jwt_extended import get_jwt_identity

audit_logger = logging.getLogger("guardian.audit")


def log_action(action: str, resource_type: str, resource_id, details: str = ""):
    user_id = get_jwt_identity()
    audit_logger.info(
        "AUDIT | user=%s action=%s resource=%s id=%s %s",
        user_id, action, resource_type, resource_id, details
    )

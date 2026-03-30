import logging
import os

from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from sqlalchemy import event as sa_event
from sqlalchemy.engine import Engine

db = SQLAlchemy()
jwt = JWTManager()


# Enable SQLite foreign key enforcement globally
@sa_event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    import sqlite3
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")  # Wait up to 60s for locks
        cursor.close()


def create_app():
    app = Flask(__name__)
    app.config.from_object("config.Config")

    db.init_app(app)
    jwt.init_app(app)
    CORS(app, resources={r"/api/.*": {"origins": [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://styleseat.github.io",
        "https://ggortalov.github.io",
    ]}}, supports_credentials=True)

    # --- Rate limiter ---
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        storage_uri=app.config.get("RATELIMIT_STORAGE_URI", "memory://"),
    )

    # --- Token blocklist check ---
    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(_jwt_header, jwt_payload):
        from app.models import TokenBlocklist
        jti = jwt_payload["jti"]
        token = TokenBlocklist.query.filter_by(jti=jti).first()
        return token is not None

    # --- Global error handlers (prevent stack trace leaks) ---
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request"}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(413)
    def payload_too_large(e):
        return jsonify({"error": "File too large"}), 413

    @app.errorhandler(429)
    def rate_limited(e):
        return jsonify({"error": "Too many requests. Please try again later."}), 429

    @app.errorhandler(500)
    def internal_error(e):
        app.logger.exception("Internal server error: %s", e)
        return jsonify({"error": "Internal server error"}), 500

    # --- Security headers ---
    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store"
        return response

    from app.routes.auth import auth_bp
    from app.routes.projects import projects_bp
    from app.routes.suites import suites_bp
    from app.routes.sections import sections_bp
    from app.routes.test_cases import cases_bp
    from app.routes.test_runs import runs_bp
    from app.routes.dashboard import dashboard_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(projects_bp, url_prefix="/api")
    app.register_blueprint(suites_bp, url_prefix="/api")
    app.register_blueprint(sections_bp, url_prefix="/api")
    app.register_blueprint(cases_bp, url_prefix="/api")
    app.register_blueprint(runs_bp, url_prefix="/api")
    app.register_blueprint(dashboard_bp, url_prefix="/api")

    # Apply rate limits to auth endpoints after registration
    limiter.limit("5 per minute")(app.view_functions["auth.login"])
    limiter.limit("3 per minute")(app.view_functions["auth.register"])
    limiter.limit("10 per minute")(app.view_functions["auth.upload_avatar"])

    # Ensure avatar upload directory exists
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    # --- Audit logger ---
    _audit = logging.getLogger("guardian.audit")
    _audit.setLevel(logging.INFO)
    _audit_handler = logging.StreamHandler()
    _audit_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    _audit.addHandler(_audit_handler)

    # --- Scheduled jobs ---
    from app.retention import run_full_cleanup
    from apscheduler.schedulers.background import BackgroundScheduler
    import atexit
    import subprocess as _sp

    def _run_cypress_sync():
        """Run sync_cypress.py as a subprocess (requires `gh` CLI auth)."""
        _sync_logger = logging.getLogger("guardian.sync")
        _sync_logger.info("Scheduled Cypress sync starting...")
        try:
            result = _sp.run(
                ["python", os.path.join(os.path.dirname(__file__), "..", "sync_cypress.py")],
                capture_output=True, text=True, timeout=600,
            )
            if result.returncode == 0:
                _sync_logger.info("Scheduled Cypress sync completed:\n%s", result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
            else:
                _sync_logger.error("Scheduled Cypress sync failed (exit %d):\n%s", result.returncode, result.stderr[-500:] if len(result.stderr) > 500 else result.stderr)
        except _sp.TimeoutExpired:
            _sync_logger.error("Scheduled Cypress sync timed out after 600s")
        except Exception as e:
            _sync_logger.error("Scheduled Cypress sync error: %s", e)

    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(
        func=run_full_cleanup,
        args=[app],
        trigger="cron",
        hour=2,        # Run daily at 2:00 AM
        minute=0,
        id="retention_cleanup",
        replace_existing=True,
    )
    scheduler.add_job(
        func=_run_cypress_sync,
        trigger="cron",
        hour=0,        # Run daily at midnight
        minute=0,
        id="cypress_sync",
        replace_existing=True,
    )
    scheduler.start()
    atexit.register(lambda: scheduler.shutdown(wait=False))

    return app

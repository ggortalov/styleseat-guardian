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
        cursor.close()


def create_app():
    app = Flask(__name__)
    app.config.from_object("config.Config")

    db.init_app(app)
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}},
         supports_credentials=True)

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

    # Ensure avatar upload directory exists
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    return app

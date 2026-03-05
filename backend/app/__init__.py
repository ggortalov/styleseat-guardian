import os

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_jwt_extended import JWTManager
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

    # Ensure avatar upload directory exists
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    return app

import os
import secrets
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(basedir, 'app.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or secrets.token_hex(32)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_BLACKLIST_ENABLED = True
    JWT_BLACKLIST_TOKEN_CHECKS = ["access"]
    UPLOAD_FOLDER = os.path.join(basedir, "uploads", "avatars")
    MAX_CONTENT_LENGTH = 2 * 1024 * 1024  # 2MB

    # Rate limiting
    RATELIMIT_STORAGE_URI = "memory://"

    # Data retention — completed test runs older than this are purged automatically
    RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", 30))

    # CircleCI Integration
    CIRCLECI_API_TOKEN = os.environ.get("CIRCLECI_API_TOKEN")
    CIRCLECI_PROJECT_SLUG = os.environ.get("CIRCLECI_PROJECT_SLUG")  # e.g., "gh/org/repo"

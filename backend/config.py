import os
import secrets
from datetime import timedelta
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))

# Load .env from the backend directory so JWT_SECRET_KEY (and other vars) survive restarts
load_dotenv(os.path.join(basedir, ".env"))


def _stable_jwt_secret():
    """Return a JWT secret that persists across restarts.

    Priority: env var → .jwt_secret file → generate + write to file.
    Never falls back to an ephemeral random key.
    """
    key = os.environ.get("JWT_SECRET_KEY")
    if key:
        return key
    secret_path = os.path.join(basedir, ".jwt_secret")
    if os.path.exists(secret_path):
        with open(secret_path) as f:
            return f.read().strip()
    key = secrets.token_hex(32)
    with open(secret_path, "w") as f:
        f.write(key)
    return key


class Config:
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(basedir, 'app.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"timeout": 60},  # Wait up to 60s for DB lock to clear
        "pool_pre_ping": True,            # Verify connections before checkout
    }
    JWT_SECRET_KEY = _stable_jwt_secret()
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_BLACKLIST_ENABLED = True
    JWT_BLACKLIST_TOKEN_CHECKS = ["access"]
    UPLOAD_FOLDER = os.path.join(basedir, "uploads", "avatars")
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB

    # Rate limiting
    RATELIMIT_STORAGE_URI = "memory://"

    # Data retention — completed test runs older than this are purged automatically
    RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", 30))

    # CircleCI Integration
    CIRCLECI_API_TOKEN = os.environ.get("CIRCLECI_API_TOKEN")
    CIRCLECI_PROJECT_SLUG = os.environ.get("CIRCLECI_PROJECT_SLUG")  # e.g., "gh/org/repo"

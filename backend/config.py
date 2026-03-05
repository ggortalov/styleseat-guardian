import os
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(basedir, 'app.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = "dev-secret-change-in-production"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    UPLOAD_FOLDER = os.path.join(basedir, "uploads", "avatars")
    MAX_CONTENT_LENGTH = 2 * 1024 * 1024  # 2MB

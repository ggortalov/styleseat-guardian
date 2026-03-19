import os
import re
import uuid

from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity, get_jwt,
)
from werkzeug.utils import secure_filename

from app import db
from app.models import User, TokenBlocklist

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "avif", "tiff", "tif"}

EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]+$")

MIN_PASSWORD_LENGTH = 8
MAX_USERNAME_LENGTH = 80
MIN_USERNAME_LENGTH = 3


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def validate_password(password):
    """Return a list of error messages for all failing requirements, or empty list."""
    errors = []
    if len(password) < MIN_PASSWORD_LENGTH:
        errors.append(f"At least {MIN_PASSWORD_LENGTH} characters long")
    if not re.search(r"[A-Z]", password):
        errors.append("At least one uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("At least one lowercase letter")
    if not re.search(r"[0-9]", password):
        errors.append("At least one digit")
    return errors


def validate_username(username):
    """Return an error message if the username is invalid, else None."""
    if len(username) < MIN_USERNAME_LENGTH:
        return f"Username must be at least {MIN_USERNAME_LENGTH} characters long"
    if len(username) > MAX_USERNAME_LENGTH:
        return f"Username must be at most {MAX_USERNAME_LENGTH} characters long"
    if not USERNAME_RE.match(username):
        return "Username may only contain letters, digits, underscores, dots, and hyphens"
    return None


def validate_email(email):
    """Return an error message if the email is invalid, else None."""
    if not EMAIL_RE.match(email):
        return "Invalid email address format"
    return None


auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not username or not email or not password:
        return jsonify({"error": "Username, email, and password are required"}), 400

    # Validate username
    err = validate_username(username)
    if err:
        return jsonify({"error": err}), 400

    # Validate email
    err = validate_email(email)
    if err:
        return jsonify({"error": err}), 400

    # Validate password strength
    pw_errors = validate_password(password)
    if pw_errors:
        return jsonify({"error": "Password does not meet requirements", "password_errors": pw_errors}), 400

    # Use a generic message to prevent username/email enumeration
    if User.query.filter_by(username=username).first() or User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with that username or email already exists"}), 409

    user = User(username=username, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify({"id": user.id, "username": user.username, "avatar": None, "token": token}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid username or password"}), 401

    token = create_access_token(identity=str(user.id))
    avatar_url = f"/api/auth/avatars/{user.avatar}" if user.avatar else None
    return jsonify({"id": user.id, "username": user.username, "avatar": avatar_url, "token": token}), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Blacklist the current JWT so it can no longer be used."""
    jti = get_jwt()["jti"]
    db.session.add(TokenBlocklist(jti=jti))
    db.session.commit()
    return jsonify({"message": "Successfully logged out"}), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user.to_dict()), 200


@auth_bp.route("/avatar", methods=["POST"])
@jwt_required()
def upload_avatar():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Only image files are allowed (JPEG, PNG, GIF, WebP, BMP, SVG, HEIC, AVIF, TIFF)"}), 400

    filename = secure_filename(file.filename)
    ext = filename.rsplit(".", 1)[1].lower()
    # Use UUID to make filenames non-predictable
    saved_name = f"{uuid.uuid4().hex}.{ext}"

    upload_folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)

    # Remove old avatar file if it exists
    if user.avatar:
        old_path = os.path.join(upload_folder, user.avatar)
        if os.path.exists(old_path):
            os.remove(old_path)

    file.save(os.path.join(upload_folder, saved_name))
    user.avatar = saved_name
    db.session.commit()

    return jsonify(user.to_dict()), 200


@auth_bp.route("/avatars/<filename>", methods=["GET"])
def serve_avatar(filename):
    upload_folder = current_app.config["UPLOAD_FOLDER"]
    return send_from_directory(upload_folder, filename)
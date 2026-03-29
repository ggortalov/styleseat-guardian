import logging
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

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif", "avif", "tiff", "tif", "ico", "jxl"}


def validate_image_bytes(file_stream):
    """Read file header and verify it matches a known image format."""
    header = file_stream.read(32)
    file_stream.seek(0)

    if not header:
        return False

    # PNG
    if header.startswith(b'\x89PNG\r\n\x1a\n'):
        return True
    # JPEG
    if header.startswith(b'\xff\xd8\xff'):
        return True
    # GIF
    if header[:6] in (b'GIF87a', b'GIF89a'):
        return True
    # WebP (RIFF....WEBP)
    if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        return True
    # BMP
    if header[:2] == b'BM':
        return True
    # TIFF
    if header[:4] in (b'II\x2a\x00', b'MM\x00\x2a'):
        return True
    # HEIC / HEIF / AVIF (ISO BMFF ftyp box)
    if len(header) >= 12 and header[4:8] == b'ftyp':
        brand = header[8:12].lower()
        if brand in (b'heic', b'heix', b'hevc', b'heif', b'avif', b'avis', b'mif1'):
            return True
    # ICO (Windows icon)
    if header[:4] == b'\x00\x00\x01\x00':
        return True
    # JPEG XL
    if header[:2] == b'\xff\x0a' or header[:12] == b'\x00\x00\x00\x0cJXL \r\n\x87\n':
        return True

    return False

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


ALLOWED_EMAIL_DOMAIN = os.environ.get("ALLOWED_EMAIL_DOMAIN", "styleseat.com")


def validate_email(email):
    """Return an error message if the email is invalid, else None."""
    if not EMAIL_RE.match(email):
        return "Invalid email address format"
    return None


def is_allowed_email_domain(email):
    """Check if email belongs to the allowed domain. Returns True for all if ALLOWED_EMAIL_DOMAIN is '*'."""
    if ALLOWED_EMAIL_DOMAIN == "*":
        return True
    domain = email.rsplit("@", 1)[-1].lower()
    return domain == ALLOWED_EMAIL_DOMAIN


logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not username or not email or not password:
        return jsonify({"error": "Username, email, and password are required"}), 400

    # Validate username
    err = validate_username(username)
    if err:
        return jsonify({"error": err}), 400

    # Validate email format
    err = validate_email(email)
    if err:
        return jsonify({"error": err}), 400

    # Validate password strength
    pw_errors = validate_password(password)
    if pw_errors:
        return jsonify({"error": "Password does not meet requirements", "password_errors": pw_errors}), 400

    # Generic rejection: domain not allowed OR username/email already taken
    # Same message and status code to prevent enumeration and domain discovery
    if (not is_allowed_email_domain(email)
            or User.query.filter_by(username=username).first()
            or User.query.filter_by(email=email).first()):
        logger.warning("Registration rejected for username=%s ip=%s", username, request.remote_addr)
        return jsonify({"error": "Unable to create account. Please contact your administrator."}), 403

    user = User(username=username, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify({"id": user.id, "username": user.username, "avatar": None, "token": token}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        logger.warning("Login failed for username=%s ip=%s", username, request.remote_addr)
        return jsonify({"error": "Invalid username or password"}), 401

    if not is_allowed_email_domain(user.email or ""):
        logger.warning("Login rejected (domain) for username=%s ip=%s", username, request.remote_addr)
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
        return jsonify({"error": "File type not allowed. Please upload an image file."}), 400

    if not validate_image_bytes(file):
        return jsonify({"error": "File does not appear to be a valid image"}), 400

    filename = secure_filename(file.filename)
    ext = filename.rsplit(".", 1)[1].lower()
    # Use UUID to make filenames non-predictable
    saved_name = f"{uuid.uuid4().hex}.{ext}"

    upload_folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)

    # Remove old avatar file if it exists (verify path stays inside upload dir)
    if user.avatar:
        old_path = os.path.realpath(os.path.join(upload_folder, user.avatar))
        if old_path.startswith(os.path.realpath(upload_folder) + os.sep) and os.path.exists(old_path):
            os.remove(old_path)

    file.save(os.path.join(upload_folder, saved_name))
    user.avatar = saved_name
    db.session.commit()

    return jsonify(user.to_dict()), 200


@auth_bp.route("/avatars/<filename>", methods=["GET"])
def serve_avatar(filename):
    """Intentionally public (no @jwt_required) — <img> tags cannot send Bearer tokens.
    UUID-based filenames prevent enumeration."""
    upload_folder = current_app.config["UPLOAD_FOLDER"]
    response = send_from_directory(upload_folder, filename)
    response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Disposition"] = "inline"
    return response
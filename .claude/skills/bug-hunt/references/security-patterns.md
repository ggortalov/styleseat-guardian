# Security Patterns Reference — OWASP Top 10:2025

Deep-dive security checklist and remediation patterns for StyleSeat Guardian.

## A01 — Broken Access Control

### Checklist
- [ ] Every CRUD endpoint verifies the authenticated user owns or has access to the resource
- [ ] No horizontal privilege escalation: user A cannot access user B's projects/suites/runs
- [ ] No vertical privilege escalation: regular users cannot perform admin-only actions
- [ ] All ID-based routes checked for IDOR (Insecure Direct Object Reference)
- [ ] No SSRF potential in URL-accepting endpoints
- [ ] Cascade deletes don't allow one user to delete another user's dependent data

### Common Violations in This App
```python
# BAD: No ownership check — any authenticated user can delete any project
@bp.route("/projects/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_project(id):
    project = Project.query.get_or_404(id)
    db.session.delete(project)  # Missing: verify project.created_by == current_user
```

## A02 — Security Misconfiguration

### Checklist
- [ ] `DEBUG = False` in production
- [ ] `SECRET_KEY` / `JWT_SECRET_KEY` loaded from environment, not hardcoded
- [ ] Fallback secret uses `secrets.token_hex(32)`, not a static string
- [ ] CORS origins restricted to known frontends (`localhost:5173`), never `*`
- [ ] No `supports_credentials=True` with wildcard origins
- [ ] No wildcard methods or headers in CORS
- [ ] Directory listing disabled on upload folders

### Required Security Headers
Verify via `@app.after_request`:
```python
response.headers["X-Content-Type-Options"] = "nosniff"
response.headers["X-Frame-Options"] = "DENY"
response.headers["X-XSS-Protection"] = "1; mode=block"
response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
response.headers["Cache-Control"] = "no-store"
# Production only:
# response.headers["Strict-Transport-Security"] = "max-age=63072000"
# response.headers["Content-Security-Policy"] = "default-src 'self'"
```

## A03 — Software Supply Chain Failures

### Checklist
- [ ] All Python deps pinned to exact versions in `requirements.txt`
- [ ] All npm deps pinned in `package.json` (no `^` or `~` ranges for production deps)
- [ ] No known CVEs (`pip audit`, `npm audit`)
- [ ] No unused dependencies increasing attack surface
- [ ] `package-lock.json` committed and enforced

## A04 — Cryptographic Failures

### Checklist
- [ ] JWT secret >= 256 bits (32 bytes), cryptographically random
- [ ] Password hashing uses Werkzeug PBKDF2 (acceptable) or bcrypt/argon2 (preferred)
- [ ] No plaintext secrets in source, seed scripts, or comments
- [ ] Token expiry configured (`JWT_ACCESS_TOKEN_EXPIRES <= 24h`)

## A05 — Injection

### Checklist
- [ ] All database queries use SQLAlchemy ORM parameterization (no raw SQL)
- [ ] No `subprocess`, `os.system`, `eval`, `exec` with user input
- [ ] Path traversal: `secure_filename()` + `send_from_directory()` on all file ops
- [ ] No Jinja2 `|safe` on user-supplied content
- [ ] JSON columns: user input parsed safely, schema validated

### Path Traversal Pattern
```python
# SAFE: werkzeug.utils.secure_filename strips directory components
from werkzeug.utils import secure_filename
filename = secure_filename(file.filename)
# SAFE: send_from_directory restricts to specific directory
return send_from_directory(UPLOAD_FOLDER, filename)
```

## A06 — Insecure Design

### Checklist
- [ ] Rate limiting on auth endpoints (login: 5/min, register: 3/min)
- [ ] Rate limit responses return 429 with clear message
- [ ] No fail-open patterns (auth exception = deny, not allow)
- [ ] No account lockout gaps (repeated failed logins)

### Rate Limiting Pattern
```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, app=app, storage_uri="memory://")
limiter.limit("5 per minute")(app.view_functions["auth.login"])
limiter.limit("3 per minute")(app.view_functions["auth.register"])
```

## A07 — Authentication Failures

### Checklist
- [ ] Login error: `"Invalid username or password"` for ALL cases (wrong password, non-existent user, bad domain) — 401
- [ ] Register error: `"Unable to create account. Please contact your administrator."` for ALL rejection cases (bad domain, duplicate user, duplicate email) — 403
- [ ] Error responses NEVER reveal: allowed domains, accepted extensions, internal paths, which check failed
- [ ] HTTP status codes identical across all rejection paths within same endpoint
- [ ] Password complexity enforced: 8+ chars, uppercase + lowercase + digit
- [ ] Seed/demo passwords meet same complexity rules

### Domain Restriction Pattern
```python
ALLOWED_EMAIL_DOMAIN = "styleseat.com"

# Registration: combine ALL rejection cases under ONE response
if (not is_allowed_email_domain(email)
        or User.query.filter_by(username=username).first()
        or User.query.filter_by(email=email).first()):
    return jsonify({"error": "Unable to create account. Please contact your administrator."}), 403

# Login: domain rejection IDENTICAL to wrong password
if domain != ALLOWED_EMAIL_DOMAIN:
    return jsonify({"error": "Invalid username or password"}), 401
```

### Password Validation
```python
import re
def validate_password(password):
    if len(password) < 8:
        return "Password must be at least 8 characters long"
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter"
    if not re.search(r"[0-9]", password):
        return "Password must contain at least one digit"
    return None
```

## A08 — Software/Data Integrity Failures

### Checklist
- [ ] JWT signature algorithm validated (reject `alg: none`)
- [ ] `json.loads()` on user input wrapped in try/except with safe defaults
- [ ] Test case `steps` column: JSON text parsing is safe (handled by `steps_list` property)
- [ ] File uploads validated beyond extension (magic byte check)

## A09 — Logging & Alerting Failures

### Checklist
- [ ] Failed login attempts logged with username (not password) and IP
- [ ] Registration attempts logged
- [ ] Data deletion events logged
- [ ] No silent `except: pass` blocks
- [ ] Structured logging format for production parsing

## A10 — Mishandling of Exceptional Conditions (NEW in 2025)

### Checklist
- [ ] No empty `catch`/`except` blocks
- [ ] No fail-open logic (security defaults to "deny" on exception)
- [ ] `db.session.rollback()` in all error paths
- [ ] Global exception handler catches unhandled Flask errors (no 500 with stack trace)
- [ ] Error responses never leak: stack traces, file paths, SQL queries, domain names
- [ ] Frontend: error boundaries for component crashes
- [ ] Frontend: unhandled promise rejections caught
- [ ] Database constraint violations (IntegrityError) caught gracefully

### Fail-Open Anti-Pattern
```python
# BAD: Exception causes auth check to be skipped
try:
    user = verify_token(token)
except Exception:
    pass  # Silently fails — request proceeds unauthenticated!

# GOOD: Exception = deny
try:
    user = verify_token(token)
except Exception:
    return jsonify({"error": "Authentication failed"}), 401
```

## File Upload Security

### Magic Byte Validation
```python
def validate_image_bytes(file_stream):
    header = file_stream.read(32)
    file_stream.seek(0)
    if not header:
        return False
    if header.startswith(b'\x89PNG\r\n\x1a\n'):       return True  # PNG
    if header.startswith(b'\xff\xd8\xff'):              return True  # JPEG
    if header[:6] in (b'GIF87a', b'GIF89a'):           return True  # GIF
    if header[:4] == b'RIFF' and header[8:12] == b'WEBP': return True  # WebP
    if header[:2] == b'BM':                             return True  # BMP
    if header[:4] in (b'II\x2a\x00', b'MM\x00\x2a'):  return True  # TIFF
    if len(header) >= 12 and header[4:8] == b'ftyp':
        brand = header[8:12].lower()
        if brand in (b'heic', b'heix', b'hevc', b'heif', b'avif', b'avis', b'mif1'):
            return True  # HEIC/AVIF
    return False
# ALWAYS block SVG — can contain <script> tags (XSS vector)
```

### Upload Rules
- Whitelist extensions only
- `secure_filename()` on all uploads
- UUID-based filenames (not user-predictable)
- Max file size enforced server-side (not just client)
- Magic byte verification matches claimed format

## Token Lifecycle

### Checklist
- [ ] `TokenBlocklist` model with indexed `jti` column
- [ ] `@jwt.token_in_blocklist_loader` registered in app factory
- [ ] Logout endpoint blacklists current JWT
- [ ] Frontend `logout()` calls backend BEFORE clearing localStorage
- [ ] Token expiry <= 24 hours
- [ ] Blacklisted tokens return 401

## Post-Fix Verification Smoke Tests

After applying security fixes, verify:

1. Login correct credentials (@styleseat.com) -> 200 + token
2. Login wrong password -> 401 + "Invalid username or password"
3. Login bad domain -> 401 + same message (indistinguishable from #2)
4. Register weak password -> 400 + specific validation error
5. Register bad email format -> 400
6. Register bad domain -> 403 + "Unable to create account..."
7. Register duplicate user -> 403 + same message (indistinguishable from #6)
8. Verify #6 and #7 return identical body AND status code
9. Logout -> token blacklisted -> subsequent requests return 401
10. Security headers present on all responses
11. Rate limits trigger 429 after threshold
12. Avatar upload -> UUID filename
13. Renamed non-image file upload -> 400
14. SVG upload attempt -> 400
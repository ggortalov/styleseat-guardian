# StyleSeat Guardian Security Audit & Remediation Skill

When auditing or hardening this application, systematically review every layer against the checklist below. Report findings by severity, then fix them in priority order.

## Audit Scope

Perform a full-stack review covering:

1. **Backend auth routes** (`backend/app/routes/auth.py`)
2. **App factory & middleware** (`backend/app/__init__.py`)
3. **Configuration & secrets** (`backend/config.py`)
4. **Database models** (`backend/app/models.py`)
5. **All other API routes** (`backend/app/routes/*.py`)
6. **Frontend auth flow** (`frontend/src/context/AuthContext.jsx`, `frontend/src/services/authService.js`)
7. **API client & interceptors** (`frontend/src/services/api.js`)
8. **Frontend pages that handle user input** (`frontend/src/pages/*.jsx`)
9. **Dependency manifests** (`backend/requirements.txt`, `frontend/package.json`)

## Severity Levels

Classify every finding into one of these:

| Severity | Criteria |
|----------|----------|
| **CRITICAL** | Immediate exploitability: auth bypass, secret exposure, RCE, SQL injection |
| **HIGH** | Brute-force, token theft, missing rate limits, weak credentials, privilege escalation |
| **MEDIUM** | Information disclosure, missing headers, CSRF gaps, enumeration vectors |
| **LOW** | Best-practice gaps, cosmetic leaks, missing validation on non-sensitive fields |

## Security Checklist

### Authentication & Secrets

- [ ] JWT secret loaded from environment variable (`os.environ`), never hardcoded
- [ ] JWT secret is cryptographically random (>= 32 bytes / 256 bits)
- [ ] Fallback secret generation uses `secrets.token_hex(32)`, not a static string
- [ ] Password hashing uses `werkzeug.security.generate_password_hash` (PBKDF2) or bcrypt
- [ ] Password complexity enforced: minimum 8 characters, requires uppercase + lowercase + digit
- [ ] No plaintext passwords in seed scripts, config, or comments
- [ ] Demo/seed passwords meet the same complexity rules as user passwords

### Rate Limiting

- [ ] `Flask-Limiter` installed and wired in `create_app()`
- [ ] Login endpoint: max 5 requests/minute per IP
- [ ] Registration endpoint: max 3 requests/minute per IP
- [ ] Rate limit responses return 429 with clear error message
- [ ] Storage backend configured (`memory://` for dev, Redis for production)

### Token Lifecycle

- [ ] `TokenBlocklist` model exists with `jti` column (indexed, unique)
- [ ] `@jwt.token_in_blocklist_loader` callback registered in app factory
- [ ] `POST /api/auth/logout` endpoint blacklists current JWT `jti`
- [ ] Frontend `logout()` calls backend logout endpoint before clearing localStorage
- [ ] Token expiry configured (`JWT_ACCESS_TOKEN_EXPIRES`), ideally <= 24 hours
- [ ] Blacklisted tokens return 401 on subsequent requests

### Input Validation

- [ ] Username: 3-80 characters, alphanumeric + `_.-` only (`^[a-zA-Z0-9_.-]+$`)
- [ ] Email: regex validated (`^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$`)
- [ ] All string inputs `.strip()`-ped before processing
- [ ] No raw user input interpolated into SQL (SQLAlchemy ORM parameterizes)
- [ ] File uploads: whitelist extensions, `secure_filename()`, max size enforced
- [ ] Avatar filenames use UUID (not predictable `user_id_` prefix)

### Enumeration Prevention

- [ ] Login error: generic message `"Invalid username or password"` (no username/email differentiation)
- [ ] Registration error: single message `"An account with that username or email already exists"` (never reveals which field matched)
- [ ] Password reset (if implemented): always returns success regardless of whether email exists

### HTTP Security Headers

Verify these are set via `@app.after_request` or Flask-Talisman:

- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `X-XSS-Protection: 1; mode=block`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Cache-Control: no-store` (prevents caching of authenticated responses)
- [ ] `Strict-Transport-Security` (when deployed over HTTPS)
- [ ] `Content-Security-Policy` (when deployed to production)

### CORS

- [ ] Origins restricted to known frontends (`localhost:5173`, `127.0.0.1:5173`), never `*`
- [ ] `supports_credentials=True` only if cookies are used
- [ ] No wildcard methods or headers

### Frontend Security

- [ ] JWT stored in `localStorage` (acceptable for this app; note XSS risk in report)
- [ ] 401 response interceptor clears token and redirects to `/login`
- [ ] Error messages displayed from backend are safe (no stack traces, no internal paths)
- [ ] No `dangerouslySetInnerHTML` with user-supplied content
- [ ] No secrets, API keys, or credentials in frontend source

### Dependency Security

- [ ] No known CVEs in Python dependencies (check with `pip audit` if available)
- [ ] No known CVEs in npm dependencies (check with `npm audit`)
- [ ] All dependencies pinned to specific versions

### Database

- [ ] SQLite foreign keys enforced (`PRAGMA foreign_keys=ON`)
- [ ] Cascade deletes configured on relationships
- [ ] No raw SQL queries (all via SQLAlchemy ORM)
- [ ] `db.create_all()` does NOT migrate existing tables — document manual `ALTER TABLE` for schema changes

## Audit Report Format

Structure findings as:

```
## Security Audit Report: [Area]

### CRITICAL Issues
**[N]. [Title]** — `file:line`
- **Severity**: CRITICAL
- **Description**: ...
- **Exploit scenario**: ...
- **Fix**: ...

### HIGH Issues
...

### MEDIUM Issues
...

### LOW Issues
...

### What's Done Well
- Bullet points of correct security implementations

### Priority Remediation Order
| Priority | Issue | Effort |
|----------|-------|--------|
| 1 | ... | Low/Medium/High |
```

## Remediation Patterns

When fixing issues, follow these established patterns from this codebase:

### Adding rate limiting
```python
# In __init__.py create_app():
limiter = Limiter(key_func=get_remote_address, app=app, storage_uri="memory://")
# After blueprint registration:
limiter.limit("5 per minute")(app.view_functions["auth.login"])
limiter.limit("3 per minute")(app.view_functions["auth.register"])
```

### Adding token blacklist
```python
# Model in models.py:
class TokenBlocklist(db.Model):
    __tablename__ = "token_blocklist"
    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, unique=True, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

# Callback in __init__.py:
@jwt.token_in_blocklist_loader
def check_if_token_revoked(_jwt_header, jwt_payload):
    from app.models import TokenBlocklist
    return TokenBlocklist.query.filter_by(jti=jwt_payload["jti"]).first() is not None

# Endpoint in auth.py:
@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    jti = get_jwt()["jti"]
    db.session.add(TokenBlocklist(jti=jti))
    db.session.commit()
    return jsonify({"message": "Successfully logged out"}), 200
```

### Adding input validation
```python
import re
EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]+$")

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

### Adding security headers
```python
@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store"
    return response
```

### Securing file uploads
```python
import uuid
saved_name = f"{uuid.uuid4().hex}.{ext}"  # non-predictable filename
```

## Post-Fix Verification

After applying fixes, run this smoke test sequence:

1. Login with correct credentials returns 200 + token
2. Login with wrong password returns 401 + generic error
3. Register with weak password returns 400 + specific validation error
4. Register with invalid email returns 400
5. Register with short/invalid username returns 400
6. Register with duplicate username/email returns 409 + generic message (no enumeration)
7. Logout blacklists token — subsequent requests with that token return 401
8. Security headers present on all responses
9. Rate limits trigger 429 after threshold exceeded
10. Avatar upload produces UUID-based filename

## Ongoing Monitoring Recommendations

- Run `pip audit` and `npm audit` on each dependency update
- Rotate `JWT_SECRET_KEY` periodically in production
- Implement token blocklist cleanup (purge expired JTI entries older than `JWT_ACCESS_TOKEN_EXPIRES`)
- Add structured logging for failed login attempts (monitor for brute-force patterns)
- Consider moving JWT to `httpOnly` + `Secure` + `SameSite=Strict` cookies for XSS resilience
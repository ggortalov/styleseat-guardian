---
name: security-audit
description: "Deep OWASP Top 10:2025 security audit for StyleSeat Guardian. Performs systematic security review of authentication, access control, injection, cryptography, exception handling, supply chain, and all other OWASP categories. Use for security hardening, vulnerability assessment, or pre-deployment security review."
allowed-tools: Read, Grep, Glob, Bash
---

# StyleSeat Guardian Security Audit

This skill runs the **bug-hunt** skill in **Security Audit mode** — a focused deep-dive on OWASP Top 10:2025 compliance.

## Activation

When this skill is invoked, operate as the bug-hunt skill with these overrides:

1. **Skip Phase 2 (Surface Correctness)** — go straight to security
2. **Expand Phase 4 (Security)** to be the primary focus — check every item in `references/security-patterns.md`
3. **Include post-fix verification smoke tests** from the security patterns reference
4. **Report format**: Use the security audit report structure below instead of the standard bug hunt report

## Scope

Perform a full-stack security review covering these files in priority order:

1. `backend/app/routes/auth.py` — Authentication, registration, domain restriction
2. `backend/app/__init__.py` — App factory, middleware, CORS, rate limiting
3. `backend/config.py` — Secrets, configuration
4. `backend/app/models.py` — Serialization (to_dict exposure)
5. `backend/app/routes/*.py` — All API routes (access control, injection)
6. `frontend/src/context/AuthContext.jsx` — Auth state, token handling
7. `frontend/src/services/api.js` — JWT interceptor, error handling
8. `frontend/src/pages/*.jsx` — User input handling, error display
9. `backend/requirements.txt` — Python dependency CVEs
10. `frontend/package.json` — npm dependency CVEs

## Report Format

```
# Security Audit Report: StyleSeat Guardian

**Date**: [date]
**Reviewer**: Claude (OWASP Security Audit)
**Framework**: OWASP Top 10:2025

## OWASP Compliance Matrix
| Category | Status | Key Findings |
|----------|--------|-------------|
| A01-A10  | Pass/Partial/Fail | Brief summary |

## CRITICAL Issues
**[1]. [Title]** — `file:line`
- **OWASP**: A0X
- **Description**: ...
- **Exploit scenario**: ...
- **Fix**: [minimal diff]

## HIGH Issues
...

## MEDIUM Issues
...

## LOW Issues
...

## What's Done Well
- [positive security observations]

## Supply Chain Audit (A03)
| Package | Version | Status |
|---------|---------|--------|
| ... | ... | OK / CVE-XXXX |

## Post-Fix Verification
[Smoke test results if fixes were applied]

## Priority Remediation Order
| # | Issue | OWASP | Effort |
|---|-------|-------|--------|
| 1 | ... | A0X | Low/Med/High |
```

## Non-Negotiable Security Rules

These are the established patterns. Any deviation is CRITICAL:

| Endpoint | Message | Status |
|----------|---------|--------|
| Register (bad domain) | "Unable to create account. Please contact your administrator." | 403 |
| Register (duplicate) | Same as above (identical) | 403 |
| Login (wrong password) | "Invalid username or password" | 401 |
| Login (bad domain) | Same as above (identical) | 401 |

## Reference

Load the full OWASP checklist and remediation patterns from:
- `../bug-hunt/references/security-patterns.md`
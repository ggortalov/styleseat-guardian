# Pre-Merge Gate Check Reference

Unified quality gate for pre-commit/pre-merge validation. Produces a single go/no-go verdict across security, design, and code quality.

## When to Run

After code is written, before commit. Audits:
- All files modified in working tree (`git diff` + `git status`)
- New files added
- Files that import or depend on changed files (blast radius)

## Process

### Phase 0: Scope Discovery

1. `git diff --name-only` + `git status` to identify changes
2. For each changed file, trace its dependents (importers)
3. Build blast radius
4. Categorize: Backend (Python), Frontend (JSX/CSS), Config, Tests

Output:
```
## Scope
- Changed files: [count]
- Blast radius: [count] additional files
- Categories: Backend [N], Frontend [N], Config [N]
```

### Phase 1: Security Gate (OWASP Top 10:2025)

#### Must-Pass (blocks merge)
- [ ] **A01**: No new endpoints without ownership/auth checks
- [ ] **A05**: No raw SQL, no `eval`/`exec`, no unsanitized input
- [ ] **A07**: Error messages generic — no domain/format/path leaks
- [ ] **A07**: Registration=403, Login=401, identical messages per endpoint
- [ ] **A10**: No empty catch blocks, no fail-open, no stack traces in responses

#### Should-Pass (warning only)
- [ ] **A02**: Security headers present, no debug mode, CORS locked
- [ ] **A03**: New deps pinned, no known CVEs
- [ ] **A04**: No hardcoded secrets
- [ ] **A06**: Rate limiting on new public endpoints
- [ ] **A08**: JSON parsing validates schema
- [ ] **A09**: Auth changes have audit logging

### Phase 2: Design & Accessibility Gate (WCAG 2.2 AA)

#### Must-Pass (blocks merge)
- [ ] Semantic HTML (`<button>` not `<div onClick>`)
- [ ] Keyboard accessible (Tab, Enter, Space on all interactive elements)
- [ ] Focus visible (not obscured)
- [ ] Color contrast (4.5:1 text, 3:1 UI)
- [ ] Touch targets >= 24x24px
- [ ] No color-only information
- [ ] ARIA attributes correct
- [ ] Error messages generic in UI

#### Should-Pass (warning only)
- [ ] `prefers-reduced-motion` on new animations
- [ ] CLS prevention (dimensions on images, reserved space)
- [ ] INP safety (no long sync tasks)
- [ ] Brand compliance (green palette, correct buttons)
- [ ] Responsive at 1024/768/640px
- [ ] Form a11y (labels, aria-describedby)

### Phase 3: Code Quality Gate

#### Must-Pass (blocks merge)
- [ ] No cross-tenant data access
- [ ] No `password_hash` in `to_dict()` or API responses
- [ ] `db.session.commit()` in success, `rollback()` in error
- [ ] No race conditions on shared resources
- [ ] Cascade deletes don't orphan records
- [ ] No stale closures, proper useEffect cleanup

#### Should-Pass (warning only)
- [ ] No N+1 queries
- [ ] No unbounded queries
- [ ] No dead code
- [ ] Follows existing patterns
- [ ] React keys on lists, no index-as-key on dynamic lists

### Phase 4: Verdict

```
## Gate Check Verdict

### Result: PASS / FAIL / PASS WITH WARNINGS

### Summary
| Phase | Must-Pass | Should-Pass | Blockers | Warnings |
|-------|-----------|-------------|----------|----------|
| Security | X/Y | X/Y | [N] | [N] |
| Design | X/Y | X/Y | [N] | [N] |
| Code Quality | X/Y | X/Y | [N] | [N] |
| **Total** | **X/Y** | **X/Y** | **[N]** | **[N]** |
```

#### Verdict Rules
- **PASS**: All must-pass pass, <= 3 warnings
- **PASS WITH WARNINGS**: All must-pass pass, > 3 warnings
- **FAIL**: Any must-pass fails

### Blocker Detail
```
**[B1] [Phase] — [Check Name]**
- File: `path/to/file:line`
- Issue: [what's wrong]
- Fix: [minimal code change]
- Reference: [OWASP/WCAG code]
```

### Warning Detail
```
**[W1] [Phase] — [Check Name]**
- File: `path/to/file:line`
- Issue: [what's wrong]
- Recommendation: [suggested improvement]
```

## Report Template

```
# Gate Check Report

**Date**: [date]
**Reviewer**: Claude (Automated Gate Check)
**Framework**: OWASP Top 10:2025 + WCAG 2.2 AA + Core Web Vitals

## Scope
[Changed files, blast radius, categories]

## Phase 1: Security
[Findings by OWASP category]

## Phase 2: Design & Accessibility
[Findings by WCAG category]

## Phase 3: Code Quality
[Findings by type]

## Phase 4: Verdict
[Table + blocker/warning details]

## Recommended Fix Order
[Numbered list]
```

## Quick Reference: Established Security Rules

| Endpoint | Message | Status |
|----------|---------|--------|
| Register (bad domain) | "Unable to create account. Please contact your administrator." | 403 |
| Register (duplicate) | Same as above | 403 |
| Login (wrong password) | "Invalid username or password" | 401 |
| Login (bad domain) | Same as above | 401 |

**Any deviation from these messages is an automatic FAIL.**

## Rules

- Read every changed file before checking. Never assume.
- Reference specific lines: `file_path:line_number`
- Strict on must-pass, constructive on warnings
- Check blast radius — a change to `models.py` affects all routes
- Cross-reference frontend <-> backend for response format changes
- Show minimal diffs for fixes
- If no changed files: "No changes detected" and exit
---
name: gate-check
description: "Pre-merge quality gate for StyleSeat Guardian. Runs unified audit across security (OWASP), design (WCAG 2.2 AA), and code quality, producing a single PASS/FAIL/PASS WITH WARNINGS verdict. Use before committing or merging code changes."
allowed-tools: Read, Grep, Glob, Bash
---

# StyleSeat Guardian Pre-Merge Gate Check

This skill runs the **bug-hunt** skill in **Gate Check mode** — a structured pass/fail quality gate across all three review disciplines.

## Activation

When this skill is invoked:

1. Start with **Phase 0: Scope Discovery** — identify all changed files via `git diff` and `git status`
2. Build the blast radius (files that import changed files)
3. Run all three audit phases with must-pass/should-pass classification
4. Produce a single verdict with the structured report format

## Process

Follow the complete gate check process defined in:
- `../bug-hunt/references/gate-check.md`

This includes:
- **Phase 0**: Scope discovery (git diff, blast radius)
- **Phase 1**: Security gate (OWASP must-pass + should-pass checks)
- **Phase 2**: Design & accessibility gate (WCAG must-pass + should-pass checks)
- **Phase 3**: Code quality gate (must-pass + should-pass checks)
- **Phase 4**: Verdict (PASS / FAIL / PASS WITH WARNINGS)

## Verdict Rules

- **PASS**: All must-pass checks pass, <= 3 warnings
- **PASS WITH WARNINGS**: All must-pass checks pass, > 3 warnings (list them)
- **FAIL**: Any must-pass check fails (list all blockers with file:line and fix instructions)

## Automatic Blockers

These are always a FAIL, regardless of other findings:
- Any endpoint returning error messages that leak domain names, file formats, internal paths, or validation logic
- Any new endpoint without ownership/auth checks
- Any empty catch/except block
- Any `password_hash` exposed in API responses
- Missing `db.session.rollback()` in error paths
- `<div onClick>` instead of `<button>` for interactive elements

## Reference Files

For detailed checklists:
- Security: `../bug-hunt/references/security-patterns.md`
- Frontend: `../bug-hunt/references/frontend-patterns.md`
- Performance: `../bug-hunt/references/performance-patterns.md`
- Full gate process: `../bug-hunt/references/gate-check.md`
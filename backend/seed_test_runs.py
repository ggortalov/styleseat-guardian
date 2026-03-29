"""Generate synthetic completed test runs so every suite has enough data for
Test Health analysis (which requires >= 5 completed runs per suite).

Usage standalone:
    cd backend && source venv/bin/activate && python seed_test_runs.py

Or imported by seed.py / seed_local.py:
    from seed_test_runs import generate_runs
    generate_runs(project_id)
"""

import hashlib
import os
import random
import re
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TARGET_COMPLETED_RUNS = 7  # headroom above the 5-run minimum
_SPREAD_DAYS = 14          # runs spread over the last N days

# Cypress paths that are excluded from health analysis — skip seeding runs
EXCLUDED_CYPRESS_PATHS = frozenset([
    "cypress/e2e/abTest/",
    "cypress/e2e/devices/p0/",
])

# Suite names that map to the excluded paths (for projects without cypress_path)
EXCLUDED_SUITE_NAMES = frozenset([
    "AB Test",
    "P0 Devices",
])

# Realistic Cypress error messages sampled for failed results
CYPRESS_ERRORS = [
    "AssertionError: Timed out retrying after 4000ms: Expected to find element: `.btn-submit`, but never found it.",
    "CypressError: `cy.click()` failed because this element is `disabled`.",
    "AssertionError: expected 200 to equal 201",
    "CypressError: `cy.intercept()` was called with an invalid argument. Expected a URL or RouteMatcher.",
    "AssertionError: Timed out retrying after 10000ms: `cy.get()` could not find a visible element matching `.modal-overlay`.",
    "Error: Request failed with status code 500",
    "CypressError: `cy.type()` failed because this element is not visible.",
    "AssertionError: expected '' to include 'Success'",
    "CypressError: Timed out retrying after 4000ms: expected true to be false",
    "Error: connect ECONNREFUSED 127.0.0.1:3000",
    "AssertionError: expected [ Array(3) ] to have length 5",
    "CypressError: `cy.visit()` failed trying to load: /dashboard. The response we received was a 404.",
    "TypeError: Cannot read properties of undefined (reading 'map')",
    "AssertionError: Timed out retrying after 6000ms: Expected element `.toast-success` to exist in the DOM.",
    "CypressError: `cy.contains()` failed because no content matched: 'Welcome back'",
]


def _is_excluded(suite):
    """Return True if a suite should be skipped (excluded from health analysis)."""
    if suite.cypress_path and suite.cypress_path in EXCLUDED_CYPRESS_PATHS:
        return True
    if suite.name in EXCLUDED_SUITE_NAMES:
        return True
    return False


def _fake_sha(index, suite_id):
    """Produce a deterministic but realistic-looking 40-char commit SHA."""
    raw = f"seed-run-{suite_id}-{index}"
    return hashlib.sha1(raw.encode()).hexdigest()


def generate_runs(project_id, target=TARGET_COMPLETED_RUNS, spread_days=_SPREAD_DAYS):
    """Top-up completed runs for every suite so each has at least *target*.

    Must be called inside a Flask app context with an active DB session.
    Returns the total number of new runs created.
    """
    from app import db
    from app.models import (
        Suite, TestCase, TestRun, TestResult, ResultHistory, User,
    )

    suites = Suite.query.filter_by(project_id=project_id).all()
    if not suites:
        print("  seed_test_runs: no suites found — skipping.")
        return 0

    # Grab a user id for created_by / changed_by
    user = User.query.first()
    user_id = user.id if user else None

    now = datetime.now(timezone.utc)
    total_created = 0

    for suite in suites:
        if _is_excluded(suite):
            continue

        # Count existing completed runs for this suite
        existing_runs = (
            TestRun.query
            .filter_by(project_id=project_id, suite_id=suite.id, is_completed=True)
            .order_by(TestRun.created_at.asc())
            .all()
        )
        existing = len(existing_runs)

        needed = target - existing
        if needed <= 0:
            continue

        # Gather all test cases in this suite
        cases = TestCase.query.filter_by(suite_id=suite.id).all()
        if not cases:
            continue

        # Designate ~5% of cases as flaky, ~3% as always-failing
        # Use a seeded RNG for deterministic selection per suite
        rng = random.Random(suite.id)
        case_ids = [c.id for c in cases]
        rng.shuffle(case_ids)
        n_flaky = max(1, int(len(case_ids) * 0.05))
        n_always_fail = max(1, int(len(case_ids) * 0.03))
        flaky_ids = set(case_ids[:n_flaky])
        always_fail_ids = set(case_ids[n_flaky:n_flaky + n_always_fail])

        # Retroactively patch pre-existing results so always-failing cases
        # have 100% failure rate and flaky cases show alternation across
        # ALL runs (not just the new ones).
        _patch_existing_results(
            db, existing_runs, flaky_ids, always_fail_ids, user_id,
        )

        # Space runs evenly across the last spread_days days
        interval = spread_days / max(needed, 1)
        # Per-suite hour offset so runs from different suites don't share
        # the exact same timestamp on a given day
        suite_hour_offset = (suite.id * 37) % 12  # 0-11h deterministic jitter

        for i in range(needed):
            # run_index counts across ALL runs (existing + new) so flaky
            # alternation is continuous
            run_index = existing + i
            days_ago = spread_days - (i * interval)
            run_ts = now - timedelta(days=days_ago, hours=-suite_hour_offset)

            # Match CircleCI import naming: "Suite Name · Wed, Mar 26, 2026"
            run_date_str = run_ts.strftime("%a, %b %d, %Y").replace(" 0", " ")
            run_name = f"{suite.name} \u00b7 {run_date_str}"

            run = TestRun(
                project_id=project_id,
                suite_id=suite.id,
                name=run_name,
                created_by=user_id,
                created_at=run_ts,
                run_date=run_ts.strftime("%Y-%m-%d"),
                completed_at=run_ts + timedelta(minutes=random.randint(8, 45)),
                is_completed=True,
                commit_sha=_fake_sha(run_index, suite.id),
            )
            db.session.add(run)
            db.session.flush()  # get run.id

            for tc in cases:
                status = _pick_status(
                    tc.id, run_index, flaky_ids, always_fail_ids,
                )
                error_msg = random.choice(CYPRESS_ERRORS) if status == "Failed" else None
                comment = None
                defect_id = None
                if status == "Failed":
                    defect_id = f"AUTO-{random.randint(100, 9999)}"

                result = TestResult(
                    run_id=run.id,
                    case_id=tc.id,
                    status=status,
                    comment=comment,
                    defect_id=defect_id,
                    error_message=error_msg,
                    tested_by=user_id if status != "Untested" else None,
                    tested_at=run_ts if status != "Untested" else None,
                )
                db.session.add(result)
                db.session.flush()

                if status != "Untested":
                    hist = ResultHistory(
                        result_id=result.id,
                        status=status,
                        comment=comment,
                        defect_id=defect_id,
                        error_message=error_msg,
                        changed_by=user_id,
                        changed_at=run_ts,
                    )
                    db.session.add(hist)

            total_created += 1

        db.session.commit()
        print(f"  seed_test_runs: {suite.name} — created {needed} runs "
              f"({len(cases)} cases each, "
              f"flaky={len(flaky_ids)}, always_fail={len(always_fail_ids)})")

    return total_created


def _patch_existing_results(db, existing_runs, flaky_ids, always_fail_ids, user_id):
    """Update pre-existing run results so designated cases show correct patterns.

    - always-failing cases → set to Failed in every existing run
    - flaky cases → alternate Passed/Failed by run index
    """
    from app.models import TestResult

    for run_idx, run in enumerate(existing_runs):
        patch_case_ids = flaky_ids | always_fail_ids
        if not patch_case_ids:
            return
        results = TestResult.query.filter(
            TestResult.run_id == run.id,
            TestResult.case_id.in_(patch_case_ids),
        ).all()
        for r in results:
            new_status = _pick_status(r.case_id, run_idx, flaky_ids, always_fail_ids)
            if r.status != new_status:
                r.status = new_status
                if new_status == "Failed":
                    r.error_message = random.choice(CYPRESS_ERRORS)
                else:
                    r.error_message = None


def _pick_status(case_id, run_index, flaky_ids, always_fail_ids):
    """Choose a status for a single test result.

    - always-failing cases → always Failed
    - flaky cases → deterministic alternation (P,F,P,F,...) by run index
    - normal cases → weighted distribution (~82% Passed)
    """
    if case_id in always_fail_ids:
        return "Failed"
    if case_id in flaky_ids:
        # Deterministic alternation: even runs → Passed, odd runs → Failed
        return "Passed" if run_index % 2 == 0 else "Failed"
    # Normal distribution: ~82% Passed, ~8% Failed, ~4% Blocked, ~3% Retest, ~3% Untested
    return random.choices(
        ["Passed", "Failed", "Blocked", "Retest", "Untested"],
        weights=[82, 8, 4, 3, 3],
    )[0]


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Seed synthetic test runs for Test Health analysis.")
    parser.add_argument("target", nargs="?", type=int, default=TARGET_COMPLETED_RUNS,
                        help=f"Target number of completed runs per suite (default: {TARGET_COMPLETED_RUNS})")
    parser.add_argument("--days", type=int, default=_SPREAD_DAYS,
                        help=f"Spread runs over the last N days (default: {_SPREAD_DAYS})")
    args = parser.parse_args()

    from app import create_app, db
    from app.models import Project

    app = create_app()
    with app.app_context():
        projects = Project.query.all()
        if not projects:
            print("No projects found. Run seed.py first.")
            sys.exit(1)

        print(f"Target: {args.target} completed runs per suite, spread over {args.days} days")
        for proj in projects:
            print(f"\nGenerating runs for project: {proj.name} (id={proj.id})")
            n = generate_runs(proj.id, target=args.target, spread_days=args.days)
            print(f"  Total new runs created: {n}")

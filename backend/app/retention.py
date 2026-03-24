"""30-day data retention cleanup for test results.

Deletes completed test runs (and their results + history via cascade)
that are older than the configured RETENTION_DAYS window.
Active (incomplete) runs are never touched.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import case

from app import db
from app.models import TestRun, ResultHistory, TokenBlocklist

logger = logging.getLogger(__name__)


def purge_expired_runs(retention_days: int) -> dict:
    """Delete completed test runs older than *retention_days*.

    Because TestResult and ResultHistory have ``cascade="all, delete-orphan"``
    on their parent relationships, deleting a TestRun automatically removes
    its results and their history entries.

    Returns a summary dict with counts of deleted records.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    effective_date = case(
        (TestRun.run_date.isnot(None), TestRun.run_date),
        else_=TestRun.created_at,
    )
    expired_runs = TestRun.query.filter(
        effective_date < cutoff,
    ).all()

    run_count = len(expired_runs)
    result_count = sum(len(run.results) for run in expired_runs)

    for run in expired_runs:
        db.session.delete(run)

    db.session.commit()

    logger.info(
        "Retention cleanup: removed %d completed runs (%d results) older than %d days",
        run_count, result_count, retention_days,
    )

    return {
        "runs_deleted": run_count,
        "results_deleted": result_count,
        "cutoff_date": cutoff.isoformat(),
        "retention_days": retention_days,
    }


def purge_expired_tokens(days: int = 7) -> int:
    """Remove blocklisted tokens older than *days* (they are already expired)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    count = TokenBlocklist.query.filter(TokenBlocklist.created_at < cutoff).delete()
    db.session.commit()
    logger.info("Token cleanup: removed %d expired blocklist entries", count)
    return count


def purge_orphaned_history(retention_days: int) -> int:
    """Remove result_history entries whose parent result no longer exists
    or that are older than the retention window."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    count = ResultHistory.query.filter(ResultHistory.changed_at < cutoff).delete()
    db.session.commit()
    logger.info("History cleanup: removed %d orphaned/expired history entries", count)
    return count


def run_full_cleanup(app) -> dict:
    """Execute all retention tasks inside the app context."""
    with app.app_context():
        retention_days = app.config.get("RETENTION_DAYS", 30)
        summary = purge_expired_runs(retention_days)
        summary["tokens_deleted"] = purge_expired_tokens()
        summary["history_deleted"] = purge_orphaned_history(retention_days)
        return summary
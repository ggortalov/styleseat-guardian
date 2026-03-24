from flask import Blueprint, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from app import db
from app.audit import log_action
from app.models import Project, Suite, Section, TestCase, TestRun, TestResult, SyncLog

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/dashboard", methods=["GET"])
@jwt_required()
def global_dashboard():
    # Return a flat list of suites (no project grouping)
    suites = Suite.query.order_by(Suite.created_at.asc()).all()
    suite_ids = [s.id for s in suites]

    # Batch case counts per suite
    case_counts = dict(
        db.session.query(TestCase.suite_id, func.count(TestCase.id))
        .filter(TestCase.suite_id.in_(suite_ids))
        .group_by(TestCase.suite_id)
        .all()
    ) if suite_ids else {}

    # Batch run counts per suite
    run_counts = dict(
        db.session.query(TestRun.suite_id, func.count(TestRun.id))
        .filter(TestRun.suite_id.in_(suite_ids))
        .group_by(TestRun.suite_id)
        .all()
    ) if suite_ids else {}

    # Batch result stats per suite (via test_runs join)
    suite_result_stats = {}
    if suite_ids:
        rows = (
            db.session.query(TestRun.suite_id, TestResult.status, func.count(TestResult.id))
            .join(TestResult, TestResult.run_id == TestRun.id)
            .filter(TestRun.suite_id.in_(suite_ids))
            .group_by(TestRun.suite_id, TestResult.status)
            .all()
        )
        for sid, status, cnt in rows:
            suite_result_stats.setdefault(sid, {})[status] = cnt

    result = []
    for suite in suites:
        d = suite.to_dict()
        d["project_id"] = suite.project_id
        d["case_count"] = case_counts.get(suite.id, 0)
        d["run_count"] = run_counts.get(suite.id, 0)

        stats = {"Passed": 0, "Failed": 0, "Blocked": 0, "Retest": 0, "Untested": 0}
        suite_stats = suite_result_stats.get(suite.id, {})
        for status in stats:
            stats[status] = suite_stats.get(status, 0)

        d["stats"] = stats
        total = sum(stats.values())
        d["stats"]["total"] = total
        d["stats"]["pass_rate"] = round(stats["Passed"] / total * 100, 1) if total > 0 else 0
        result.append(d)

    # Global totals
    total_suites = len(suites)
    total_cases = TestCase.query.count()
    total_runs = TestRun.query.count()

    all_results = db.session.query(TestResult.status, func.count(TestResult.id)).group_by(TestResult.status).all()
    global_stats = {"Passed": 0, "Failed": 0, "Blocked": 0, "Retest": 0, "Untested": 0}
    for status, count in all_results:
        if status in global_stats:
            global_stats[status] = count
    global_total = sum(global_stats.values())
    global_stats["total"] = global_total
    global_stats["pass_rate"] = round(global_stats["Passed"] / global_total * 100, 1) if global_total > 0 else 0

    # Recent runs (last 10) — eager-load project and suite
    recent_runs = TestRun.query.options(
        joinedload(TestRun.project), joinedload(TestRun.suite)
    ).order_by(TestRun.created_at.desc()).limit(10).all()
    recent_run_ids = [r.id for r in recent_runs]
    # Batch result stats for recent runs
    recent_stats = {}
    if recent_run_ids:
        rows = (
            db.session.query(TestResult.run_id, TestResult.status, func.count(TestResult.id))
            .filter(TestResult.run_id.in_(recent_run_ids))
            .group_by(TestResult.run_id, TestResult.status)
            .all()
        )
        for rid, status, cnt in rows:
            recent_stats.setdefault(rid, {})[status] = cnt
    recent = []
    for run in recent_runs:
        rd = run.to_dict()
        rd["project_name"] = run.project.name if run.project else None
        rd["suite_name"] = run.suite.name if run.suite else "All Suites"
        counts = recent_stats.get(run.id, {})
        t = sum(counts.values())
        rd["pass_rate"] = round(counts.get("Passed", 0) / t * 100, 1) if t > 0 else 0
        rd["total_results"] = t
        recent.append(rd)

    return jsonify({
        "suites": result,
        "totals": {
            "suites": total_suites,
            "cases": total_cases,
            "runs": total_runs,
        },
        "global_stats": global_stats,
        "recent_runs": recent,
    }), 200


@dashboard_bp.route("/projects/<int:project_id>/dashboard", methods=["GET"])
@jwt_required()
def project_dashboard(project_id):
    from flask import request
    from datetime import date as date_type, datetime, timedelta, timezone

    project = Project.query.get_or_404(project_id)

    # Optional date filter for suite_stats (YYYY-MM-DD)
    date_param = request.args.get("date")
    filter_date = None
    if date_param:
        try:
            filter_date = date_type.fromisoformat(date_param)
        except ValueError:
            pass

    runs = TestRun.query.filter_by(project_id=project_id).options(
        joinedload(TestRun.suite)
    ).order_by(TestRun.created_at.desc()).all()
    run_ids = [r.id for r in runs]

    # Batch result stats for all runs in one query
    all_run_stats = {}
    overall = {"Passed": 0, "Failed": 0, "Blocked": 0, "Retest": 0, "Untested": 0}
    if run_ids:
        rows = (
            db.session.query(TestResult.run_id, TestResult.status, func.count(TestResult.id))
            .filter(TestResult.run_id.in_(run_ids))
            .group_by(TestResult.run_id, TestResult.status)
            .all()
        )
        for rid, status, cnt in rows:
            all_run_stats.setdefault(rid, {})[status] = cnt
            if status in overall:
                overall[status] += cnt

    runs_data = []
    for run in runs:
        rd = run.to_dict()
        rd["suite_name"] = run.suite.name if run.suite else "All Suites"
        counts = all_run_stats.get(run.id, {})
        rd["stats"] = {
            "Passed": counts.get("Passed", 0),
            "Failed": counts.get("Failed", 0),
            "Blocked": counts.get("Blocked", 0),
            "Retest": counts.get("Retest", 0),
            "Untested": counts.get("Untested", 0),
        }
        total = sum(rd["stats"].values())
        rd["stats"]["total"] = total
        rd["stats"]["pass_rate"] = round(rd["stats"]["Passed"] / total * 100, 1) if total > 0 else 0
        runs_data.append(rd)
    total = sum(overall.values())
    overall["total"] = total
    overall["pass_rate"] = round(overall["Passed"] / total * 100, 1) if total > 0 else 0

    # Per-suite stats — filter runs to selected date (or latest by date)
    suite_stats = {}
    if run_ids:
        run_date_map = {r.id: (r.run_date or r.created_at) for r in runs}

        # If date filter, only consider runs from that date
        if filter_date:
            date_run_ids = [
                rid for rid, dt in run_date_map.items()
                if dt and dt.date() == filter_date
            ]
        else:
            date_run_ids = run_ids

        if date_run_ids:
            # Find all (suite_id, run_id) pairs
            suite_run_pairs = (
                db.session.query(TestCase.suite_id, TestResult.run_id)
                .join(TestCase, TestResult.case_id == TestCase.id)
                .filter(TestResult.run_id.in_(date_run_ids))
                .filter(TestCase.suite_id.isnot(None))
                .distinct()
                .all()
            )

            # Pick the run with the latest date per suite
            suite_run_map = {}
            for sid, rid in suite_run_pairs:
                if sid is None:
                    continue
                run_dt = run_date_map.get(rid)
                if sid not in suite_run_map or (run_dt and run_dt > run_date_map.get(suite_run_map[sid])):
                    suite_run_map[sid] = rid

            if suite_run_map:
                for sid, rid in suite_run_map.items():
                    rows = (
                        db.session.query(TestResult.status, func.count(TestResult.id))
                        .join(TestCase, TestResult.case_id == TestCase.id)
                        .filter(TestResult.run_id == rid, TestCase.suite_id == sid)
                        .group_by(TestResult.status)
                        .all()
                    )
                    stats = {"Passed": 0, "Failed": 0, "Blocked": 0, "Retest": 0, "Untested": 0, "total": 0}
                    for status, cnt in rows:
                        if status in stats:
                            stats[status] = cnt
                            stats["total"] += cnt
                    if stats["total"] > 0:
                        stats["run_id"] = rid
                        run_dt = run_date_map.get(rid)
                        stats["run_date"] = run_dt.isoformat() if run_dt else None
                        suite_stats[sid] = stats

    # Collect dates that have runs (for date navigation)
    run_dates = sorted(set(
        (r.run_date or r.created_at).date().isoformat()
        for r in runs if (r.run_date or r.created_at)
    ), reverse=True)

    return jsonify({
        "project": project.to_dict(),
        "runs": runs_data,
        "run_dates": run_dates,
        "overall_stats": overall,
        "suite_stats": suite_stats,
    }), 200


@dashboard_bp.route("/sync-logs", methods=["GET"])
@jwt_required()
def get_sync_logs():
    """Return recent sync logs, optionally filtered by project_id."""
    from flask import request
    project_id = request.args.get("project_id", type=int)
    limit = min(request.args.get("limit", 20, type=int), 200)

    query = SyncLog.query.order_by(SyncLog.created_at.desc())
    if project_id:
        query = query.filter_by(project_id=project_id)
    logs = query.limit(limit).all()
    return jsonify([log.to_dict() for log in logs]), 200


@dashboard_bp.route("/retention/cleanup", methods=["POST"])
@jwt_required()
def manual_cleanup():
    """Manually trigger the 30-day retention cleanup."""
    user_id = int(get_jwt_identity())
    # Only users who created at least one project can trigger cleanup
    has_projects = Project.query.filter_by(created_by=user_id).first()
    if not has_projects:
        return jsonify({"error": "Forbidden"}), 403
    log_action("CLEANUP", "retention", "manual")
    from app.retention import run_full_cleanup
    summary = run_full_cleanup(current_app._get_current_object())
    return jsonify(summary), 200


@dashboard_bp.route("/retention/status", methods=["GET"])
@jwt_required()
def retention_status():
    """Return current retention config and counts of data that would be purged."""
    from datetime import datetime, timedelta, timezone

    retention_days = current_app.config.get("RETENTION_DAYS", 30)
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    expired_runs = TestRun.query.filter(
        TestRun.is_completed.is_(True),
        TestRun.completed_at.isnot(None),
        TestRun.completed_at < cutoff,
    ).count()

    total_runs = TestRun.query.count()
    total_results = TestResult.query.count()

    return jsonify({
        "retention_days": retention_days,
        "cutoff_date": cutoff.isoformat(),
        "expired_runs": expired_runs,
        "total_runs": total_runs,
        "total_results": total_results,
    }), 200

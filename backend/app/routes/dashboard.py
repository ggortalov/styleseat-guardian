from flask import Blueprint, jsonify, current_app
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app import db
from app.models import Project, Suite, Section, TestCase, TestRun, TestResult

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/dashboard", methods=["GET"])
@jwt_required()
def global_dashboard():
    # Return a flat list of suites (no project grouping)
    suites = Suite.query.order_by(Suite.created_at.asc()).all()
    result = []

    for suite in suites:
        d = suite.to_dict()
        d["project_id"] = suite.project_id

        section_ids = [sec.id for sec in Section.query.filter_by(suite_id=suite.id).all()]
        d["case_count"] = TestCase.query.filter(TestCase.section_id.in_(section_ids)).count() if section_ids else 0

        # Runs for this suite
        runs = TestRun.query.filter_by(suite_id=suite.id).all()
        d["run_count"] = len(runs)
        run_ids = [r.id for r in runs]

        stats = {"Passed": 0, "Failed": 0, "Blocked": 0, "Retest": 0, "Untested": 0}
        if run_ids:
            counts = dict(
                db.session.query(TestResult.status, func.count(TestResult.id))
                .filter(TestResult.run_id.in_(run_ids))
                .group_by(TestResult.status)
                .all()
            )
            for status in stats:
                stats[status] = counts.get(status, 0)

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

    # Recent runs (last 10)
    recent_runs = TestRun.query.order_by(TestRun.created_at.desc()).limit(10).all()
    recent = []
    for run in recent_runs:
        rd = run.to_dict()
        rd["project_name"] = run.project.name if run.project else None
        rd["suite_name"] = run.suite.name if run.suite else None
        counts = dict(
            db.session.query(TestResult.status, func.count(TestResult.id))
            .filter_by(run_id=run.id)
            .group_by(TestResult.status)
            .all()
        )
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
    project = Project.query.get_or_404(project_id)

    runs = TestRun.query.filter_by(project_id=project_id).order_by(TestRun.created_at.desc()).all()
    runs_data = []
    for run in runs:
        rd = run.to_dict()
        rd["suite_name"] = run.suite.name if run.suite else None
        counts = dict(
            db.session.query(TestResult.status, func.count(TestResult.id))
            .filter_by(run_id=run.id)
            .group_by(TestResult.status)
            .all()
        )
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

    # Overall stats
    run_ids = [r.id for r in runs]
    overall = {"Passed": 0, "Failed": 0, "Blocked": 0, "Retest": 0, "Untested": 0}
    if run_ids:
        counts = dict(
            db.session.query(TestResult.status, func.count(TestResult.id))
            .filter(TestResult.run_id.in_(run_ids))
            .group_by(TestResult.status)
            .all()
        )
        for status in overall:
            overall[status] = counts.get(status, 0)
    total = sum(overall.values())
    overall["total"] = total
    overall["pass_rate"] = round(overall["Passed"] / total * 100, 1) if total > 0 else 0

    return jsonify({
        "project": project.to_dict(),
        "runs": runs_data,
        "overall_stats": overall,
    }), 200


@dashboard_bp.route("/retention/cleanup", methods=["POST"])
@jwt_required()
def manual_cleanup():
    """Manually trigger the 30-day retention cleanup."""
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

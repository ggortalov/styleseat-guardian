from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app import db
from app.models import Project, Suite, Section, TestCase, TestRun, TestResult

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/dashboard", methods=["GET"])
@jwt_required()
def global_dashboard():
    projects = Project.query.order_by(Project.created_at.asc()).all()
    result = []

    for project in projects:
        d = project.to_dict()

        suites = Suite.query.filter_by(project_id=project.id).order_by(Suite.created_at.asc()).all()
        suite_ids = [s.id for s in suites]

        d["suite_count"] = len(suite_ids)
        d["first_suite_id"] = suites[0].id if suites else None
        d["first_suite_name"] = suites[0].name if suites else None
        d["case_count"] = TestCase.query.filter(TestCase.suite_id.in_(suite_ids)).count() if suite_ids else 0
        d["run_count"] = TestRun.query.filter_by(project_id=project.id).count()

        # Aggregate stats across all runs
        run_ids = [r.id for r in TestRun.query.filter_by(project_id=project.id).all()]
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

        # Latest run
        latest_run = TestRun.query.filter_by(project_id=project.id).order_by(TestRun.created_at.desc()).first()
        d["latest_run"] = latest_run.to_dict() if latest_run else None

        result.append(d)

    # Global totals
    total_projects = len(projects)
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
        "projects": result,
        "totals": {
            "projects": total_projects,
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

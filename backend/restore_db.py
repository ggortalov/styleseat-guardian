"""
Restore database from JSON backup after schema migration.
"""
import json
import sys
from datetime import datetime

from app import create_app, db
from app.models import (
    User, Project, Suite, Section, TestCase,
    TestRun, TestResult, ResultHistory, SyncBaseline, SyncLog
)


def _parse_dt(value):
    """Parse an ISO datetime string, returning None for falsy values."""
    if not value:
        return None
    return datetime.fromisoformat(value)


def restore_database(input_file="db_backup.json"):
    app = create_app()

    with app.app_context():
        # Ensure all tables exist (fresh DB)
        db.create_all()

        # Load backup data
        with open(input_file, "r", encoding="utf-8") as f:
            backup_data = json.load(f)

        print(f"Restoring from backup created: {backup_data['backup_date']}")

        # Restore users (with password hashes)
        for u_data in backup_data["users"]:
            user = User(
                id=u_data["id"],
                username=u_data["username"],
                email=u_data["email"],
                password_hash=u_data["password_hash"],
                avatar=u_data.get("avatar_filename") or u_data.get("avatar"),
                created_at=_parse_dt(u_data.get("created_at"))
            )
            db.session.add(user)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['users'])} users")

        # Restore projects
        for p_data in backup_data["projects"]:
            project = Project(
                id=p_data["id"],
                name=p_data["name"],
                description=p_data.get("description"),
                created_by=p_data.get("created_by"),
                created_at=_parse_dt(p_data.get("created_at")),
                updated_at=_parse_dt(p_data.get("updated_at"))
            )
            db.session.add(project)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['projects'])} projects")

        # Restore suites (with cypress_path)
        for s_data in backup_data["suites"]:
            suite = Suite(
                id=s_data["id"],
                project_id=s_data["project_id"],
                name=s_data["name"],
                description=s_data.get("description"),
                cypress_path=s_data.get("cypress_path"),
                created_at=_parse_dt(s_data.get("created_at"))
            )
            db.session.add(suite)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['suites'])} suites")

        # Restore sections
        for s_data in backup_data["sections"]:
            section = Section(
                id=s_data["id"],
                suite_id=s_data["suite_id"],
                parent_id=s_data.get("parent_id"),
                name=s_data["name"],
                description=s_data.get("description"),
                display_order=s_data.get("display_order", 0)
            )
            db.session.add(section)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['sections'])} sections")

        # Restore test cases
        for c_data in backup_data["test_cases"]:
            case = TestCase(
                id=c_data["id"],
                suite_id=c_data["suite_id"],
                section_id=c_data.get("section_id"),
                title=c_data["title"],
                case_type=c_data.get("case_type", "Functional"),
                priority=c_data.get("priority", "Medium"),
                preconditions=c_data.get("preconditions"),
                steps=c_data.get("steps_raw"),  # Use raw JSON string
                expected_result=c_data.get("expected_result"),
                created_by=c_data.get("created_by"),
                updated_by=c_data.get("updated_by"),
                created_at=_parse_dt(c_data.get("created_at")),
                updated_at=_parse_dt(c_data.get("updated_at"))
            )
            db.session.add(case)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['test_cases'])} test cases")

        # Restore test runs (with run_date)
        for r_data in backup_data["test_runs"]:
            run = TestRun(
                id=r_data["id"],
                project_id=r_data["project_id"],
                suite_id=r_data.get("suite_id"),
                name=r_data["name"],
                description=r_data.get("description"),
                created_by=r_data.get("created_by"),
                run_date=_parse_dt(r_data.get("run_date")),
                created_at=_parse_dt(r_data.get("created_at")),
                completed_at=_parse_dt(r_data.get("completed_at")),
                is_completed=r_data.get("is_completed", False)
            )
            db.session.add(run)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['test_runs'])} test runs")

        # Restore test results (with error_message, artifacts, circleci_job_id)
        for r_data in backup_data["test_results"]:
            result = TestResult(
                id=r_data["id"],
                run_id=r_data["run_id"],
                case_id=r_data["case_id"],
                status=r_data.get("status", "Untested"),
                comment=r_data.get("comment"),
                defect_id=r_data.get("defect_id"),
                tested_by=r_data.get("tested_by"),
                tested_at=_parse_dt(r_data.get("tested_at")),
                error_message=r_data.get("error_message"),
                artifacts=r_data.get("artifacts_raw"),  # Raw JSON string
                circleci_job_id=r_data.get("circleci_job_id"),
            )
            db.session.add(result)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['test_results'])} test results")

        # Restore result history (with error_message, artifacts)
        for h_data in backup_data["result_history"]:
            history = ResultHistory(
                id=h_data["id"],
                result_id=h_data["result_id"],
                status=h_data["status"],
                comment=h_data.get("comment"),
                defect_id=h_data.get("defect_id"),
                error_message=h_data.get("error_message"),
                artifacts=h_data.get("artifacts_raw"),  # Raw JSON string
                changed_by=h_data.get("changed_by"),
                changed_at=_parse_dt(h_data.get("changed_at"))
            )
            db.session.add(history)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['result_history'])} result history entries")

        # Restore sync baselines
        baselines = backup_data.get("sync_baselines", [])
        for b_data in baselines:
            baseline = SyncBaseline(
                id=b_data["id"],
                project_id=b_data["project_id"],
                case_ids=b_data["case_ids"],        # Raw JSON string
                case_titles=b_data["case_titles"],    # Raw JSON string
                case_count=b_data.get("case_count", 0),
                created_at=_parse_dt(b_data.get("created_at"))
            )
            db.session.add(baseline)
        if baselines:
            db.session.commit()
        print(f"[OK] Restored {len(baselines)} sync baselines")

        # Restore sync logs
        sync_logs = backup_data.get("sync_logs", [])
        for sl_data in sync_logs:
            # new_case_names may be a parsed list from to_dict(); re-serialize
            new_names = sl_data.get("new_case_names")
            if isinstance(new_names, list):
                new_names = json.dumps(new_names)

            sync_log = SyncLog(
                id=sl_data["id"],
                sync_type=sl_data["sync_type"],
                project_id=sl_data.get("project_id"),
                total_cases=sl_data.get("total_cases", 0),
                new_cases=sl_data.get("new_cases", 0),
                removed_cases=sl_data.get("removed_cases", 0),
                suites_processed=sl_data.get("suites_processed", 0),
                new_case_names=new_names,
                status=sl_data.get("status", "success"),
                error_message=sl_data.get("error_message"),
                created_at=_parse_dt(sl_data.get("created_at"))
            )
            db.session.add(sync_log)
        if sync_logs:
            db.session.commit()
        print(f"[OK] Restored {len(sync_logs)} sync logs")

        print("\n[OK] Database restoration complete!")


if __name__ == "__main__":
    input_file = sys.argv[1] if len(sys.argv) > 1 else "db_backup.json"
    restore_database(input_file)

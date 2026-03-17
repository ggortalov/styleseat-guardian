"""
Restore database from JSON backup after schema migration.
"""
import json
from datetime import datetime

from app import create_app, db
from app.models import (
    User, Project, Suite, Section, TestCase,
    TestRun, TestResult, ResultHistory
)


def restore_database(input_file="db_backup.json"):
    app = create_app()

    with app.app_context():
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
                avatar=u_data.get("avatar"),
                created_at=datetime.fromisoformat(u_data["created_at"]) if u_data.get("created_at") else None
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
                created_at=datetime.fromisoformat(p_data["created_at"]) if p_data.get("created_at") else None,
                updated_at=datetime.fromisoformat(p_data["updated_at"]) if p_data.get("updated_at") else None
            )
            db.session.add(project)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['projects'])} projects")

        # Restore suites
        for s_data in backup_data["suites"]:
            suite = Suite(
                id=s_data["id"],
                project_id=s_data["project_id"],
                name=s_data["name"],
                description=s_data.get("description"),
                created_at=datetime.fromisoformat(s_data["created_at"]) if s_data.get("created_at") else None
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
                created_at=datetime.fromisoformat(c_data["created_at"]) if c_data.get("created_at") else None,
                updated_at=datetime.fromisoformat(c_data["updated_at"]) if c_data.get("updated_at") else None
            )
            db.session.add(case)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['test_cases'])} test cases")

        # Restore test runs
        for r_data in backup_data["test_runs"]:
            run = TestRun(
                id=r_data["id"],
                project_id=r_data["project_id"],
                suite_id=r_data["suite_id"],
                name=r_data["name"],
                description=r_data.get("description"),
                created_by=r_data.get("created_by"),
                created_at=datetime.fromisoformat(r_data["created_at"]) if r_data.get("created_at") else None,
                completed_at=datetime.fromisoformat(r_data["completed_at"]) if r_data.get("completed_at") else None,
                is_completed=r_data.get("is_completed", False)
            )
            db.session.add(run)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['test_runs'])} test runs")

        # Restore test results
        for r_data in backup_data["test_results"]:
            result = TestResult(
                id=r_data["id"],
                run_id=r_data["run_id"],
                case_id=r_data["case_id"],
                status=r_data.get("status", "Untested"),
                comment=r_data.get("comment"),
                defect_id=r_data.get("defect_id"),
                tested_by=r_data.get("tested_by"),
                tested_at=datetime.fromisoformat(r_data["tested_at"]) if r_data.get("tested_at") else None
            )
            db.session.add(result)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['test_results'])} test results")

        # Restore result history
        for h_data in backup_data["result_history"]:
            history = ResultHistory(
                id=h_data["id"],
                result_id=h_data["result_id"],
                status=h_data["status"],
                comment=h_data.get("comment"),
                defect_id=h_data.get("defect_id"),
                changed_by=h_data.get("changed_by"),
                changed_at=datetime.fromisoformat(h_data["changed_at"]) if h_data.get("changed_at") else None
            )
            db.session.add(history)
        db.session.commit()
        print(f"[OK] Restored {len(backup_data['result_history'])} result history entries")

        print("\n[OK] Database restoration complete!")


if __name__ == "__main__":
    restore_database()
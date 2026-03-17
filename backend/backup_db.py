"""
Export all database data to JSON for backup before schema migration.
"""
import json
from datetime import datetime

from app import create_app, db
from app.models import (
    User, Project, Suite, Section, TestCase,
    TestRun, TestResult, ResultHistory
)


def backup_database(output_file="db_backup.json"):
    app = create_app()

    with app.app_context():
        backup_data = {
            "backup_date": datetime.now().isoformat(),
            "users": [u.to_dict() for u in User.query.all()],
            "projects": [p.to_dict() for p in Project.query.all()],
            "suites": [s.to_dict() for s in Suite.query.all()],
            "sections": [s.to_dict() for s in Section.query.all()],
            "test_cases": [],
            "test_runs": [r.to_dict() for r in TestRun.query.all()],
            "test_results": [r.to_dict() for r in TestResult.query.all()],
            "result_history": [h.to_dict() for h in ResultHistory.query.all()],
        }

        # For test cases, we need to preserve the password hashes and raw steps JSON
        for user in User.query.all():
            # Find the user dict and add password_hash
            for u in backup_data["users"]:
                if u["id"] == user.id:
                    u["password_hash"] = user.password_hash
                    break

        # For test cases, preserve raw steps JSON
        for case in TestCase.query.all():
            case_dict = case.to_dict()
            case_dict["steps_raw"] = case.steps  # Store raw JSON string
            backup_data["test_cases"].append(case_dict)

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, indent=2, ensure_ascii=False)

        print(f"[OK] Database backed up to {output_file}")
        print(f"  - {len(backup_data['users'])} users")
        print(f"  - {len(backup_data['projects'])} projects")
        print(f"  - {len(backup_data['suites'])} suites")
        print(f"  - {len(backup_data['sections'])} sections")
        print(f"  - {len(backup_data['test_cases'])} test cases")
        print(f"  - {len(backup_data['test_runs'])} test runs")
        print(f"  - {len(backup_data['test_results'])} test results")
        print(f"  - {len(backup_data['result_history'])} result history entries")


if __name__ == "__main__":
    backup_database()

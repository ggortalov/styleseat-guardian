"""
Export all database data to JSON for backup before schema migration.
"""
import json
import sys
from datetime import datetime

from app import create_app, db
from app.models import (
    User, Project, Suite, Section, TestCase,
    TestRun, TestResult, ResultHistory, SyncBaseline, SyncLog
)


def backup_database(output_file="db_backup.json"):
    app = create_app()

    with app.app_context():
        backup_data = {
            "backup_date": datetime.now().isoformat(),
            "users": [],
            "projects": [p.to_dict() for p in Project.query.all()],
            "suites": [s.to_dict() for s in Suite.query.all()],
            "sections": [s.to_dict() for s in Section.query.all()],
            "test_cases": [],
            "test_runs": [r.to_dict() for r in TestRun.query.all()],
            "test_results": [],
            "result_history": [],
            "sync_baselines": [],
            "sync_logs": [sl.to_dict() for sl in SyncLog.query.all()],
        }

        # Users: include password_hash (not in to_dict for security)
        for user in User.query.all():
            u_dict = user.to_dict()
            u_dict["password_hash"] = user.password_hash
            # Store raw avatar filename (to_dict wraps it in a URL path)
            u_dict["avatar_filename"] = user.avatar
            backup_data["users"].append(u_dict)

        # Test cases: preserve raw steps JSON string
        for case in TestCase.query.all():
            case_dict = case.to_dict()
            case_dict["steps_raw"] = case.steps  # Store raw JSON string
            backup_data["test_cases"].append(case_dict)

        # Test results: include all fields (to_dict already has them)
        # Store raw artifacts JSON for lossless restore
        for result in TestResult.query.all():
            r_dict = result.to_dict()
            r_dict["artifacts_raw"] = result.artifacts  # Raw JSON string
            backup_data["test_results"].append(r_dict)

        # Result history: store raw artifacts JSON
        for history in ResultHistory.query.all():
            h_dict = history.to_dict()
            h_dict["artifacts_raw"] = history.artifacts  # Raw JSON string
            backup_data["result_history"].append(h_dict)

        # Sync baselines: store raw JSON fields
        for baseline in SyncBaseline.query.all():
            backup_data["sync_baselines"].append({
                "id": baseline.id,
                "project_id": baseline.project_id,
                "case_ids": baseline.case_ids,      # Raw JSON string
                "case_titles": baseline.case_titles,  # Raw JSON string
                "case_count": baseline.case_count,
                "created_at": baseline.created_at.isoformat() if baseline.created_at else None,
            })

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
        print(f"  - {len(backup_data['sync_baselines'])} sync baselines")
        print(f"  - {len(backup_data['sync_logs'])} sync logs")


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "db_backup.json"
    backup_database(output)

import sys
import os

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db

app = create_app()

with app.app_context():
    db.create_all()
    # Lightweight migration: add updated_by column if missing
    import sqlite3
    db_path = app.config["SQLALCHEMY_DATABASE_URI"].replace("sqlite:///", "")
    conn = sqlite3.connect(db_path)
    cols = [row[1] for row in conn.execute("PRAGMA table_info(test_cases)").fetchall()]
    if "updated_by" not in cols:
        conn.execute("ALTER TABLE test_cases ADD COLUMN updated_by INTEGER REFERENCES users(id)")
        conn.commit()
    # Add cypress_path column to suites if missing
    suite_cols = [row[1] for row in conn.execute("PRAGMA table_info(suites)").fetchall()]
    if "cypress_path" not in suite_cols:
        conn.execute("ALTER TABLE suites ADD COLUMN cypress_path VARCHAR(500)")
        conn.commit()
        # Backfill existing suites using name→path reverse lookup
        from app.suite_utils import cypress_path_to_name
        _BACKFILL = {
            'PO': 'cypress/e2e/p0/',
            'P1 API': 'cypress/e2e/p1/api/',
            'P1 Client': 'cypress/e2e/p1/client/',
            'P1 Common': 'cypress/e2e/p1/common/',
            'P1 Pro': 'cypress/e2e/p1/pro/',
            'P1 Search': 'cypress/e2e/p1/search/',
            'P3 - Admin': 'cypress/e2e/p3/',
            'PROD': 'cypress/e2e/prod/',
            'Pre Prod': 'cypress/e2e/preprod/',
            'P0 Devices': 'cypress/e2e/devices/p0/',
            'P1 Devices': 'cypress/e2e/devices/p1/',
            'AB Test': 'cypress/e2e/abtest/',
            'Communications': 'cypress/e2e/communications/',
            'Events Mobile': 'cypress/e2e/events/',
        }
        for name, path in _BACKFILL.items():
            conn.execute("UPDATE suites SET cypress_path = ? WHERE name = ? AND cypress_path IS NULL", (path, name))
        conn.commit()
    # Migrate test_runs.suite_id from NOT NULL to nullable
    run_cols = conn.execute("PRAGMA table_info(test_runs)").fetchall()
    suite_id_col = next((c for c in run_cols if c[1] == "suite_id"), None)
    if suite_id_col and suite_id_col[3] == 1:  # notnull == 1 means NOT NULL
        print("Migrating test_runs.suite_id to nullable...")
        conn.execute("ALTER TABLE test_runs RENAME TO test_runs_old")
        conn.execute("""
            CREATE TABLE test_runs (
                id INTEGER PRIMARY KEY,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                suite_id INTEGER REFERENCES suites(id),
                name VARCHAR(200) NOT NULL,
                description TEXT,
                created_by INTEGER REFERENCES users(id),
                run_date DATETIME,
                created_at DATETIME,
                completed_at DATETIME,
                is_completed BOOLEAN DEFAULT 0
            )
        """)
        conn.execute("""
            INSERT INTO test_runs (id, project_id, suite_id, name, description,
                                   created_by, run_date, created_at, completed_at, is_completed)
            SELECT id, project_id, suite_id, name, description,
                   created_by, run_date, created_at, completed_at, is_completed
            FROM test_runs_old
        """)
        conn.execute("DROP TABLE test_runs_old")
        conn.commit()
        print("Migration complete.")
    # Migrate test_results.case_id from NOT NULL CASCADE to nullable SET NULL
    # so deleting a test case preserves the historical result
    result_cols = conn.execute("PRAGMA table_info(test_results)").fetchall()
    case_id_col = next((c for c in result_cols if c[1] == "case_id"), None)
    if case_id_col and case_id_col[3] == 1:  # notnull == 1 means NOT NULL
        print("Migrating test_results.case_id to nullable (SET NULL)...")
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("ALTER TABLE test_results RENAME TO test_results_old")
        conn.execute("""
            CREATE TABLE test_results (
                id INTEGER PRIMARY KEY,
                run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
                case_id INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
                status VARCHAR(20) DEFAULT 'Untested',
                comment TEXT,
                defect_id VARCHAR(100),
                tested_by INTEGER REFERENCES users(id),
                tested_at DATETIME,
                error_message TEXT,
                artifacts TEXT,
                circleci_job_id VARCHAR(100)
            )
        """)
        conn.execute("""
            INSERT INTO test_results (id, run_id, case_id, status, comment, defect_id,
                                      tested_by, tested_at, error_message, artifacts, circleci_job_id)
            SELECT id, run_id, case_id, status, comment, defect_id,
                   tested_by, tested_at, error_message, artifacts, circleci_job_id
            FROM test_results_old
        """)
        conn.execute("DROP TABLE test_results_old")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.commit()
        print("Migration complete.")
    # Add CircleCI attribution columns to test_runs if missing
    run_col_names = [row[1] for row in conn.execute("PRAGMA table_info(test_runs)").fetchall()]
    if "circleci_workflow_id" not in run_col_names:
        conn.execute("ALTER TABLE test_runs ADD COLUMN circleci_workflow_id VARCHAR(100)")
        conn.execute("ALTER TABLE test_runs ADD COLUMN commit_sha VARCHAR(40)")
        conn.execute("ALTER TABLE test_runs ADD COLUMN triggered_by VARCHAR(100)")
        conn.commit()
        print("Added CircleCI attribution columns to test_runs.")
    # Reformat manual run names from "M/D/YYYY" to "Fri, Mar 27, 2026" style
    import re
    from datetime import datetime as _dt
    rows = conn.execute(
        "SELECT id, name FROM test_runs WHERE name LIKE '%Manual Run %'"
    ).fetchall()
    _date_pat = re.compile(r'(\d{1,2}/\d{1,2}/\d{4})')
    updated = 0
    for row_id, name in rows:
        m = _date_pat.search(name)
        if m:
            try:
                parsed = _dt.strptime(m.group(1), '%m/%d/%Y')
                new_date = parsed.strftime('%a, %b %d, %Y')
                new_name = name[:m.start()] + new_date + name[m.end():]
                conn.execute("UPDATE test_runs SET name = ? WHERE id = ?", (new_name, row_id))
                updated += 1
            except ValueError:
                pass
    if updated:
        conn.commit()
        print(f"Reformatted {updated} manual run name(s) to long date format.")
    # Migrate run_date from datetime to YYYY-MM-DD local calendar date string.
    # Extract the date from the run name (e.g. "P1 Client · Sat, Mar 28, 2026")
    # because the name was always formatted using local time.
    from datetime import datetime as _dt2
    _name_date_pat = re.compile(r'(\w{3}, \w{3} \d{1,2}, \d{4})')
    run_rows = conn.execute("SELECT id, name, run_date, created_at FROM test_runs").fetchall()
    migrated = 0
    for rid, rname, rdate, rcreated in run_rows:
        # Skip if already a YYYY-MM-DD string (10 chars, starts with digit)
        if rdate and len(str(rdate)) == 10 and str(rdate)[4] == '-':
            continue
        # Try to extract date from the run name first (most reliable)
        m = _name_date_pat.search(rname or '')
        if m:
            try:
                parsed = _dt2.strptime(m.group(1), '%a, %b %d, %Y')
                new_date = parsed.strftime('%Y-%m-%d')
                conn.execute("UPDATE test_runs SET run_date = ? WHERE id = ?", (new_date, rid))
                migrated += 1
                continue
            except ValueError:
                pass
        # Fallback: use created_at date portion
        if rcreated:
            try:
                new_date = _dt2.fromisoformat(str(rcreated).replace('+00:00', '')).strftime('%Y-%m-%d')
                conn.execute("UPDATE test_runs SET run_date = ? WHERE id = ?", (new_date, rid))
                migrated += 1
            except (ValueError, TypeError):
                pass
    if migrated:
        conn.commit()
        print(f"Migrated run_date to YYYY-MM-DD on {migrated} test run(s).")
    # Rename project "Cypress Automation" → "Automation Overview"
    renamed = conn.execute(
        "UPDATE projects SET name = 'Automation Overview', description = 'Test cases synced from the StyleSeat E2E test repository' WHERE name = 'Cypress Automation'"
    ).rowcount
    if renamed:
        conn.commit()
        print("Renamed project 'Cypress Automation' → 'Automation Overview'.")
    conn.close()

if __name__ == "__main__":
    app.run(debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true', port=5001)

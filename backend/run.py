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
    conn.close()

if __name__ == "__main__":
    app.run(debug=True, port=5001)

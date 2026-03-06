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
    conn.close()

if __name__ == "__main__":
    app.run(debug=True, port=5001)

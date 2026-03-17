"""
Create all database tables with the new schema.
"""
from app import create_app, db

app = create_app()

with app.app_context():
    db.create_all()
    print("[OK] All tables created with CASCADE DELETE on test_results.case_id")
"""Seed script to bootstrap the database with demo data.

If seed_data.json exists, restores the full dataset (users, projects, suites,
sections, test cases, test runs, results, history).  Otherwise falls back to
creating the bare-minimum demo user and project.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import User, Project

SEED_FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data.json")

app = create_app()

# Drop and recreate all tables
with app.app_context():
    db.drop_all()
    db.create_all()

if os.path.exists(SEED_FIXTURE):
    # Full restore from fixture (restore_db creates its own app context)
    from restore_db import restore_database
    restore_database(SEED_FIXTURE)
    print("\nSeed completed (restored from seed_data.json).")
else:
    # Minimal seed: demo user + project
    with app.app_context():
        user = User(username="demo", email="demo@styleseat.com")
        user.set_password("Demo1234")
        db.session.add(user)
        db.session.flush()

        project = Project(
            name="Automation Overview",
            description="Test cases synced from the StyleSeat E2E test repository",
            created_by=user.id,
        )
        db.session.add(project)
        db.session.commit()

        print("Seed data created (minimal).")
        print(f"  User:    demo / Demo1234")
        print(f"  Project: {project.name}")
        print()
        print("Next: run 'python sync_cypress.py' to populate test cases.")

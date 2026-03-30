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

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.db")
fresh = not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0

if fresh:
    # First time: create all tables from scratch
    with app.app_context():
        db.create_all()

    if os.path.exists(SEED_FIXTURE):
        from restore_db import restore_database
        restore_database(SEED_FIXTURE)
        print("\nSeed completed (restored from seed_data.json).")
    else:
        with app.app_context():
            user = User(username="demo", email="demo@styleseat.com")
            user.set_password("Demo1234")
            db.session.add(user)
            db.session.flush()

            project = Project(
                name="Automation Overview",
                description="Test cases synced from the StyleSeat E2E test repository",
                created_by=None,
            )
            db.session.add(project)
            db.session.commit()

            print("Seed data created (minimal).")
            print(f"  User:    demo / Demo1234")
            print(f"  Project: {project.name}")
            print()
            print("Next: run 'python sync_cypress.py' to populate test cases.")
else:
    # Database already exists — ensure demo user is present but preserve everything else
    with app.app_context():
        db.create_all()  # creates any NEW tables without touching existing ones
        demo = User.query.filter_by(username="demo").first()
        if not demo:
            demo = User(username="demo", email="demo@styleseat.com")
            demo.set_password("Demo1234")
            db.session.add(demo)
            db.session.flush()

            project = Project(
                name="Automation Overview",
                description="Test cases synced from the StyleSeat E2E test repository",
                created_by=None,
            )
            db.session.add(project)
            db.session.commit()
            print("Demo user was missing — re-created.")
        else:
            print("Database already exists — skipping seed (all accounts preserved).")

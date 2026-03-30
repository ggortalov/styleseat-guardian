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
    # Database already exists — ensure team accounts are present but preserve everything else
    with app.app_context():
        db.create_all()  # creates any NEW tables without touching existing ones

        # Team accounts that should always exist after any reset
        TEAM_ACCOUNTS = [
            {"username": "demo",      "email": "demo@styleseat.com",      "password": "Demo1234"},
            {"username": "ivolkov",   "email": "ivolkov@styleseat.com",   "password": "SSpassword123"},
            {"username": "jenni",     "email": "jnemeth@styleseat.com",   "password": "yfm-afr2pdc3bxj@PXC"},
            {"username": "vchau",     "email": "vchau@styleseat.com",     "password": "SSpassword123"},
            {"username": "Gennady",   "email": "ggortalov@styleseat.com", "password": "SSpassword123"},
            {"username": "pcruz",     "email": "pcruz@styleseat.com",    "password": "Peterjay1"},
        ]

        created = []
        for acct in TEAM_ACCOUNTS:
            existing = User.query.filter_by(username=acct["username"]).first()
            if not existing:
                user = User(username=acct["username"], email=acct["email"])
                user.set_password(acct["password"])
                db.session.add(user)
                created.append(acct["username"])

        # Ensure default project exists
        if not User.query.filter_by(username="demo").first():
            # demo was just created above, flush to get ID
            db.session.flush()

        if not Project.query.filter_by(name="Automation Overview").first():
            project = Project(
                name="Automation Overview",
                description="Test cases synced from the StyleSeat E2E test repository",
                created_by=None,
            )
            db.session.add(project)
            created.append("project:Automation Overview")

        db.session.commit()

        if created:
            print(f"Re-created missing accounts/resources: {', '.join(created)}")
        else:
            print("Database already exists — all team accounts present.")

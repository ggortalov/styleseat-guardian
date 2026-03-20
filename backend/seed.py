"""Seed script to bootstrap the database with the demo user and project.

Test case data is populated by sync_cypress.py (pulls from the Cypress repo).
Test run data is populated by import_circleci.py (pulls from CircleCI).
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import User, Project

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    # Create demo user
    user = User(username="demo", email="demo@styleseat.com")
    user.set_password("Demo1234")
    db.session.add(user)
    db.session.flush()

    # Create the Cypress Automation project (sync_cypress.py expects this)
    project = Project(
        name="Cypress Automation",
        description="Test cases synced from the StyleSeat Cypress repository",
        created_by=user.id,
    )
    db.session.add(project)
    db.session.commit()

    print("Seed data created successfully!")
    print(f"  User:    demo / Demo1234")
    print(f"  Project: {project.name}")
    print()
    print("Next: run 'python sync_cypress.py' to populate test cases.")
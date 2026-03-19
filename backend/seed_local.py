"""Seed the database from locally saved TestRail data (testrail_data.json).

No network access required. This script replaces seed_testrail.py for
environments where TestRail is unavailable.

Usage:
    cd backend
    source venv/bin/activate
    python seed_local.py
"""

import json
import os
import sys
import random
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "testrail_data.json")


def main():
    from app import create_app, db
    from app.models import User, Project, Suite, Section, TestCase, TestRun, TestResult, ResultHistory

    if not os.path.exists(DATA_FILE):
        print(f"ERROR: {DATA_FILE} not found.")
        print("This file contains the exported TestRail data needed for seeding.")
        sys.exit(1)

    with open(DATA_FILE, "r") as f:
        data = json.load(f)

    app = create_app()

    with app.app_context():
        db.create_all()

        # --- Users ---
        user_map = {}  # old id -> new User
        for u_data in data["users"]:
            user = User.query.filter_by(username=u_data["username"]).first()
            if not user:
                user = User(username=u_data["username"], email=u_data["email"])
                user.set_password("DemoStyleSeat22@")
                db.session.add(user)
                db.session.flush()
                print(f"Created user: {user.username} (id={user.id})")
            else:
                print(f"User already exists: {user.username} (id={user.id})")
            user_map[u_data["id"]] = user

        # --- Project ---
        proj_data = data["project"]
        project = Project.query.filter_by(name=proj_data["name"]).first()
        if project:
            print(f"\nProject '{proj_data['name']}' already exists (id={project.id}). Skipping import.")
            print("To re-import, delete the project first or drop the database.")
            sys.exit(0)

        creator = user_map.get(proj_data["created_by"], list(user_map.values())[0])
        project = Project(
            name=proj_data["name"],
            description=proj_data["description"],
            created_by=creator.id,
        )
        db.session.add(project)
        db.session.flush()
        print(f"\nCreated project: {project.name} (id={project.id})")

        # --- Suites ---
        suite_map = {}  # old id -> new Suite
        for s_data in data["suites"]:
            suite = Suite(
                project_id=project.id,
                name=s_data["name"],
                description=s_data.get("description"),
            )
            db.session.add(suite)
            db.session.flush()
            suite_map[s_data["id"]] = suite

        print(f"Created {len(suite_map)} suites")

        # --- Sections ---
        # Process in order so parents are created before children
        section_map = {}  # old id -> new Section
        for sec_data in data["sections"]:
            parent_id = None
            if sec_data.get("parent_id") and sec_data["parent_id"] in section_map:
                parent_id = section_map[sec_data["parent_id"]].id

            new_suite = suite_map.get(sec_data["suite_id"])
            if not new_suite:
                continue

            section = Section(
                suite_id=new_suite.id,
                parent_id=parent_id,
                name=sec_data["name"],
                display_order=sec_data.get("display_order", 0),
            )
            db.session.add(section)
            db.session.flush()
            section_map[sec_data["id"]] = section

        print(f"Created {len(section_map)} sections")

        # --- Test Cases ---
        case_count = 0
        case_map = {}  # old id -> new TestCase
        for tc_data in data["test_cases"]:
            new_suite = suite_map.get(tc_data["suite_id"])
            new_section = section_map.get(tc_data["section_id"])
            if not new_suite or not new_section:
                continue

            tc_creator = user_map.get(tc_data.get("created_by"), creator)
            tc = TestCase(
                suite_id=new_suite.id,
                section_id=new_section.id,
                title=tc_data["title"],
                case_type=tc_data.get("case_type", "Other"),
                priority=tc_data.get("priority", "Medium"),
                preconditions=tc_data.get("preconditions"),
                steps=tc_data.get("steps"),
                expected_result=tc_data.get("expected_result"),
                created_by=tc_creator.id,
            )
            db.session.add(tc)
            db.session.flush()
            case_map[tc_data["id"]] = tc
            case_count += 1

        print(f"Created {case_count} test cases")

        # --- Test Runs with realistic status distributions ---
        testers = list(user_map.values())
        statuses = ["Passed", "Failed", "Blocked", "Retest", "Untested"]

        # Find P0 Devices and P1 Pro suites by name
        p0_suite = None
        p1_suite = None
        for old_id, suite in suite_map.items():
            if suite.name == "P0 Devices":
                p0_suite = suite
            elif suite.name == "P1 Pro":
                p1_suite = suite

        runs_created = 0

        if p0_suite:
            run1 = TestRun(project_id=project.id, suite_id=p0_suite.id,
                           name="P0 Devices - Release 4.2", created_by=creator.id)
            db.session.add(run1)
            db.session.flush()
            p0_cases = TestCase.query.filter_by(suite_id=p0_suite.id).all()
            for tc in p0_cases:
                s = random.choices(statuses, weights=[80, 8, 4, 4, 4])[0]
                tester = random.choice(testers) if s != "Untested" else None
                r = TestResult(
                    run_id=run1.id, case_id=tc.id, status=s,
                    tested_by=tester.id if tester else None,
                    tested_at=datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 48)) if s != "Untested" else None,
                    comment="Verified on device" if s == "Passed" else ("Device issue" if s == "Failed" else None),
                    defect_id=f"DEV-{random.randint(100, 999)}" if s == "Failed" else None,
                )
                db.session.add(r)
                db.session.flush()
                if s != "Untested":
                    h = ResultHistory(result_id=r.id, status=s, comment=r.comment,
                                     defect_id=r.defect_id, changed_by=tester.id)
                    db.session.add(h)
            runs_created += 1
            print(f"Created run: {run1.name} ({len(p0_cases)} cases)")

        if p1_suite:
            run2 = TestRun(project_id=project.id, suite_id=p1_suite.id,
                           name="P1 Pro - Sprint 28 Regression", created_by=creator.id)
            db.session.add(run2)
            db.session.flush()
            p1_cases = TestCase.query.filter_by(suite_id=p1_suite.id).all()
            for tc in p1_cases:
                s = random.choices(statuses, weights=[70, 8, 5, 5, 12])[0]
                tester = random.choice(testers) if s != "Untested" else None
                r = TestResult(
                    run_id=run2.id, case_id=tc.id, status=s,
                    tested_by=tester.id if tester else None,
                    tested_at=datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 72)) if s != "Untested" else None,
                    comment="Passed successfully" if s == "Passed" else ("Bug detected" if s == "Failed" else ("Env issue" if s == "Blocked" else None)),
                    defect_id=f"PRO-{random.randint(1000, 9999)}" if s == "Failed" else None,
                )
                db.session.add(r)
                db.session.flush()
                if s != "Untested":
                    h = ResultHistory(result_id=r.id, status=s, comment=r.comment,
                                     defect_id=r.defect_id, changed_by=tester.id)
                    db.session.add(h)
            runs_created += 1
            print(f"Created run: {run2.name} ({len(p1_cases)} cases)")

        db.session.commit()

        print("\n" + "=" * 50)
        print("Local seed complete!")
        print(f"  Project:    {project.name}")
        print(f"  Suites:     {len(suite_map)}")
        print(f"  Sections:   {len(section_map)}")
        print(f"  Test Cases: {case_count}")
        print(f"  Test Runs:  {runs_created}")
        print(f"  Credentials: demo / DemoStyleSeat22@, Gennady / DemoStyleSeat22@")
        print("=" * 50)


if __name__ == "__main__":
    main()

"""Import test suites, sections, and cases from TestRail project 23 into Guardian.

Usage:
    cd backend
    source venv/bin/activate
    python seed_testrail.py

Fetches all data live from the TestRail API, maps it to the Guardian schema,
and inserts it under a "Cypress Automation" project.  Skips suites that have
zero active test cases.
"""

import json
import sys
import time
import urllib.request
import base64
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# TestRail connection
# ---------------------------------------------------------------------------
TESTRAIL_BASE = "https://styleseat.testrail.io/index.php?/api/v2"
TESTRAIL_EMAIL = "ggortalov@styleseat.com"
TESTRAIL_PASSWORD = "Nikolay2013@home"
PROJECT_ID = 23

AUTH_HEADER = "Basic " + base64.b64encode(
    f"{TESTRAIL_EMAIL}:{TESTRAIL_PASSWORD}".encode()
).decode()


def testrail_get(endpoint: str) -> dict:
    """GET a TestRail API endpoint with auth and rate-limit handling."""
    url = f"{TESTRAIL_BASE}/{endpoint}"
    req = urllib.request.Request(url, headers={
        "Content-Type": "application/json",
        "Authorization": AUTH_HEADER,
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            retry = int(e.headers.get("Retry-After", 5))
            print(f"  Rate limited, waiting {retry}s...")
            time.sleep(retry)
            return testrail_get(endpoint)
        raise


def testrail_get_all(endpoint: str, key: str) -> list:
    """Paginate through a TestRail list endpoint, collecting all items."""
    items = []
    offset = 0
    limit = 250
    while True:
        sep = "&" if "?" in endpoint or "&" in endpoint else "?"
        data = testrail_get(f"{endpoint}{sep}limit={limit}&offset={offset}")
        batch = data.get(key, [])
        items.extend(batch)
        if data.get("_links", {}).get("next") is None or len(batch) == 0:
            break
        offset += limit
    return items


# ---------------------------------------------------------------------------
# Mapping tables: TestRail IDs → Guardian string values
# ---------------------------------------------------------------------------
TYPE_MAP = {
    1: "Functional",     # Acceptance → Functional
    2: "Usability",      # Accessibility → Usability
    3: "Regression",     # Automated → Regression
    4: "Functional",     # Compatibility → Functional
    5: "Functional",     # Destructive → Functional
    6: "Functional",
    7: "Other",
    8: "Performance",
    9: "Regression",
    10: "Security",
    11: "Smoke",         # Smoke & Sanity
    12: "Usability",
}

PRIORITY_MAP = {
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Critical",
}


def map_steps(case: dict) -> str | None:
    """Convert TestRail step formats to Guardian JSON steps."""
    # Structured steps (custom_steps_separated)
    separated = case.get("custom_steps_separated")
    if separated:
        steps = []
        for s in separated:
            steps.append({
                "action": (s.get("content") or "").strip(),
                "expected": (s.get("expected") or "").strip(),
            })
        return json.dumps(steps) if steps else None

    # Plain text steps (custom_steps)
    text = case.get("custom_steps")
    if text and text.strip():
        lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
        steps = [{"action": line, "expected": ""} for line in lines]
        return json.dumps(steps) if steps else None

    return None


# ---------------------------------------------------------------------------
# Main import
# ---------------------------------------------------------------------------
def main():
    # Add backend dir to path so we can import the app
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    from app import create_app, db
    from app.models import User, Project, Suite, Section, TestCase
    from app.suite_utils import cypress_path_to_name

    # Map known TestRail suite names to cypress paths
    TESTRAIL_PATH_MAP = {
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

    app = create_app()

    with app.app_context():
        db.create_all()

        # Ensure demo users exist
        user = User.query.filter_by(username="demo").first()
        if not user:
            user = User(username="demo", email="demo@styleseat.com")
            user.set_password("DemoStyleSeat22@")
            db.session.add(user)
            db.session.flush()

        gennady = User.query.filter_by(username="Gennady").first()
        if not gennady:
            gennady = User(username="Gennady", email="ggortalov@styleseat.com")
            gennady.set_password("demo123")
            db.session.add(gennady)
            db.session.flush()

        # Create or find the project
        project = Project.query.filter_by(name="Cypress Automation").first()
        if project:
            print(f"Project 'Cypress Automation' already exists (id={project.id}). Skipping import.")
            print("To re-import, delete the project first or rename it.")
            sys.exit(0)

        project = Project(
            name="Cypress Automation",
            description="Imported from TestRail project 23 — StyleSeat Cypress automation suites.",
            created_by=user.id,
        )
        db.session.add(project)
        db.session.flush()
        print(f"Created project: Cypress Automation (id={project.id})")

        # Fetch suites from TestRail
        print("\nFetching suites from TestRail...")
        suites_resp = testrail_get(f"get_suites/{PROJECT_ID}")
        tr_suites = suites_resp.get("suites", suites_resp) if isinstance(suites_resp, dict) else suites_resp
        print(f"Found {len(tr_suites)} suites")

        total_sections = 0
        total_cases = 0

        for tr_suite in tr_suites:
            suite_name = tr_suite["name"]
            tr_suite_id = tr_suite["id"]

            # Fetch cases first to check if suite has any
            print(f"\n--- Suite: {suite_name} (TR id={tr_suite_id}) ---")
            print(f"  Fetching cases...")
            tr_cases = testrail_get_all(
                f"get_cases/{PROJECT_ID}&suite_id={tr_suite_id}", "cases"
            )
            # Filter out deleted cases
            tr_cases = [c for c in tr_cases if not c.get("is_deleted")]

            if not tr_cases:
                print(f"  No active cases, skipping suite.")
                continue

            # Create suite in Guardian
            suite = Suite(
                project_id=project.id,
                name=suite_name,
                description=tr_suite.get("description"),
                cypress_path=TESTRAIL_PATH_MAP.get(suite_name),
            )
            db.session.add(suite)
            db.session.flush()
            print(f"  Created suite (id={suite.id})")

            # Fetch sections
            print(f"  Fetching sections...")
            tr_sections = testrail_get_all(
                f"get_sections/{PROJECT_ID}&suite_id={tr_suite_id}", "sections"
            )

            # Build a mapping: TestRail section_id → Guardian section_id
            # Process parents before children (sort by depth)
            tr_sections.sort(key=lambda s: s.get("depth", 0))

            section_map = {}  # TR section id → Guardian Section object

            for tr_sec in tr_sections:
                parent_guardian_id = None
                if tr_sec.get("parent_id") and tr_sec["parent_id"] in section_map:
                    parent_guardian_id = section_map[tr_sec["parent_id"]].id

                section = Section(
                    suite_id=suite.id,
                    parent_id=parent_guardian_id,
                    name=tr_sec["name"],
                    description=tr_sec.get("description"),
                    display_order=tr_sec.get("display_order", 0),
                )
                db.session.add(section)
                db.session.flush()
                section_map[tr_sec["id"]] = section

            section_count = len(section_map)
            total_sections += section_count
            print(f"  Created {section_count} sections")

            # If there are cases without a section, create a default one
            default_section = None

            # Insert cases
            case_count = 0
            for tr_case in tr_cases:
                tr_section_id = tr_case.get("section_id")
                guardian_section = section_map.get(tr_section_id)

                if not guardian_section:
                    if not default_section:
                        default_section = Section(
                            suite_id=suite.id,
                            name="General",
                            display_order=0,
                        )
                        db.session.add(default_section)
                        db.session.flush()
                        total_sections += 1
                    guardian_section = default_section

                tc = TestCase(
                    suite_id=suite.id,
                    section_id=guardian_section.id,
                    title=tr_case["title"],
                    case_type=TYPE_MAP.get(tr_case.get("type_id", 7), "Other"),
                    priority=PRIORITY_MAP.get(tr_case.get("priority_id", 2), "Medium"),
                    preconditions=tr_case.get("custom_preconds"),
                    steps=None,
                    expected_result=tr_case.get("custom_expected"),
                    created_by=user.id,
                )
                db.session.add(tc)
                case_count += 1

            db.session.flush()
            total_cases += case_count
            print(f"  Imported {case_count} test cases")

        db.session.commit()

        print("\n" + "=" * 50)
        print("TestRail import complete!")
        print(f"  Project:  Cypress Automation")
        print(f"  Suites:   {Suite.query.filter_by(project_id=project.id).count()}")
        print(f"  Sections: {total_sections}")
        print(f"  Cases:    {total_cases}")
        print("=" * 50)


if __name__ == "__main__":
    main()
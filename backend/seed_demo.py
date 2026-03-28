"""Complete demo seed script - creates database with TestRail data and CircleCI test runs."""
import sys
import os
import requests
import json
import re
import time
import urllib.request
import base64
from datetime import datetime, timezone
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import User, Project, Suite, Section, TestCase, TestRun, TestResult, ResultHistory

# CircleCI config
CIRCLECI_TOKEN = os.environ.get('CIRCLECI_API_TOKEN')
PROJECT_SLUG = os.environ.get('CIRCLECI_PROJECT_SLUG', 'gh/styleseat/cypress')
CIRCLECI_BASE_URL = 'https://circleci.com/api/v2'

# TestRail config
TESTRAIL_BASE = os.environ.get('TESTRAIL_BASE_URL', 'https://styleseat.testrail.io/index.php?/api/v2')
TESTRAIL_EMAIL = os.environ.get('TESTRAIL_EMAIL', '')
TESTRAIL_PASSWORD = os.environ.get('TESTRAIL_PASSWORD', '')
TESTRAIL_PROJECT_ID = int(os.environ.get('TESTRAIL_PROJECT_ID', '23'))

TESTRAIL_AUTH_HEADER = "Basic " + base64.b64encode(
    f"{TESTRAIL_EMAIL}:{TESTRAIL_PASSWORD}".encode()
).decode()

# Default CircleCI workflows to import for demo
DEFAULT_WORKFLOWS = [
    'e2d6bec1-40e3-4813-9721-9d31a106977a',  # p1_search
]

def extract_tests(obj, job_num, parent_suite=''):
    """Extract test results from CircleCI report JSON."""
    tests = []
    if isinstance(obj, dict):
        if 'title' in obj and 'state' in obj and 'fullTitle' in obj:
            tests.append({
                'job_num': job_num,
                'title': obj.get('title'),
                'fullTitle': obj.get('fullTitle'),
                'state': obj.get('state'),
                'err': obj.get('err', {})
            })
        for test in obj.get('tests', []):
            tests.extend(extract_tests(test, job_num, parent_suite))
        for suite in obj.get('suites', []):
            tests.extend(extract_tests(suite, job_num, suite.get('title', parent_suite)))
        for result in obj.get('results', []):
            tests.extend(extract_tests(result, job_num, parent_suite))
    elif isinstance(obj, list):
        for item in obj:
            tests.extend(extract_tests(item, job_num, parent_suite))
    return tests

def clean_title(title):
    """Remove test case ID prefixes for matching."""
    return re.sub(r'^(C\d+\s*|DP\d+-P\d+-\d+\s*)', '', title).strip().lower()

def match_artifacts(title, artifacts):
    """Match failure artifacts to test by title."""
    matched = []
    for a in artifacts:
        path = a.get('path', '').lower()
        if ('.png' in path or '.mp4' in path) and (title.lower()[:30] in path):
            matched.append(a)
    return matched

def import_circleci_workflow(workflow_id, suite_map, user_id):
    """Import a CircleCI workflow's test results."""
    headers = {'Circle-Token': CIRCLECI_TOKEN, 'Content-Type': 'application/json'}

    # Get workflow jobs
    response = requests.get(f'{CIRCLECI_BASE_URL}/workflow/{workflow_id}/job', headers=headers, timeout=30)
    jobs = response.json()

    job_numbers = []
    workflow_name = None
    for job in jobs.get('items', []):
        job_numbers.append(job.get('job_number'))
        if not workflow_name:
            workflow_name = re.sub(r'_\d+$', '', job.get('name', ''))

    print(f"\nImporting workflow: {workflow_name} ({len(job_numbers)} jobs)")

    # Fetch test results and artifacts from each job
    all_tests = []
    job_artifacts = {}

    for job_num in job_numbers:
        artifacts_resp = requests.get(
            f'{CIRCLECI_BASE_URL}/project/{PROJECT_SLUG}/{job_num}/artifacts',
            headers=headers, timeout=30
        ).json()

        job_artifacts[job_num] = [
            {'name': a.get('path', '').split('/')[-1], 'url': a.get('url'), 'path': a.get('path')}
            for a in artifacts_resp.get('items', [])
            if '.png' in a.get('path', '') or '.mp4' in a.get('path', '')
        ]

        report_url = next(
            (a.get('url') for a in artifacts_resp.get('items', []) if a.get('path', '').endswith('report.json')),
            None
        )

        if report_url:
            report = requests.get(report_url, headers=headers, timeout=60).json()
            tests = extract_tests(report, job_num)
            all_tests.extend(tests)

    print(f"  Found {len(all_tests)} tests")

    # Build lookup by cleaned title
    circleci_by_title = {}
    for t in all_tests:
        t['matched_artifacts'] = match_artifacts(t['title'], job_artifacts.get(t['job_num'], []))
        circleci_by_title[clean_title(t['title'])] = t

    # Match to database cases
    cases_by_title = {c.title.strip().lower(): c for c in TestCase.query.all()}
    matches = [(circleci_by_title[t], cases_by_title[t]) for t in circleci_by_title if t in cases_by_title]
    print(f"  Matched {len(matches)} tests to cases")

    # Determine suite
    suite_id = suite_map.get(workflow_name, 4)
    suite = db.session.get(Suite, suite_id)
    project = Project.query.filter_by(name='Automation Overview').first()

    # Create test run
    run = TestRun(
        project_id=project.id if project else 1,
        suite_id=suite_id,
        name=f'cronschedule_{workflow_name}',
        description=f'Imported from CircleCI workflow {workflow_id[:8]}'
    )
    db.session.add(run)
    db.session.flush()

    # Create results
    results_data = []
    for test, case in matches:
        status = {'passed': 'Passed', 'failed': 'Failed', 'pending': 'Blocked'}.get(test['state'], 'Untested')
        err = test.get('err', {})
        error_msg = None
        if isinstance(err, dict) and err:
            error_msg = (err.get('message', '') + '\n\n' + err.get('stack', '')[:500])

        artifacts_json = None
        if test['state'] == 'failed' and test.get('matched_artifacts'):
            artifacts_json = json.dumps(sorted(
                test.get('matched_artifacts', [])[:5],
                key=lambda a: '(attempt' in (a.get('name') or '')
            ))

        result = TestResult(
            run_id=run.id,
            case_id=case.id,
            status=status,
            circleci_job_id=str(test['job_num']),
            error_message=error_msg,
            artifacts=artifacts_json,
            tested_at=datetime.now(timezone.utc),
            tested_by=user_id
        )
        db.session.add(result)
        results_data.append((result, status, error_msg, artifacts_json))

    db.session.flush()

    # Create history entries
    for result, status, error_msg, artifacts_json in results_data:
        db.session.add(ResultHistory(
            result_id=result.id,
            status=status,
            error_message=error_msg,
            artifacts=artifacts_json,
            changed_by=user_id
        ))

    db.session.commit()

    # Summary
    final_results = TestResult.query.filter_by(run_id=run.id).all()
    statuses = Counter(r.status for r in final_results)
    print(f"  Created run: {run.name} (suite: {suite.name if suite else 'Unknown'})")
    print(f"  Results: {len(final_results)} (Passed: {statuses.get('Passed', 0)}, Failed: {statuses.get('Failed', 0)})")

    return run

def testrail_get(endpoint: str) -> dict:
    """GET a TestRail API endpoint with auth and rate-limit handling."""
    url = f"{TESTRAIL_BASE}/{endpoint}"
    req = urllib.request.Request(url, headers={
        "Content-Type": "application/json",
        "Authorization": TESTRAIL_AUTH_HEADER,
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


# Mapping tables: TestRail IDs → Guardian string values
TYPE_MAP = {
    1: "Functional", 2: "Usability", 3: "Regression", 4: "Functional",
    5: "Functional", 6: "Functional", 7: "Other", 8: "Performance",
    9: "Regression", 10: "Security", 11: "Smoke", 12: "Usability",
}

PRIORITY_MAP = {1: "Low", 2: "Medium", 3: "High", 4: "Critical"}


def seed_testrail_data(user_id):
    """Import test suites and cases from TestRail."""
    # Create project
    project = Project(
        name='Automation Overview',
        description='Imported from TestRail - Cypress test automation project',
        created_by=user_id
    )
    db.session.add(project)
    db.session.flush()
    print(f"\nCreated project: {project.name} (id={project.id})")

    # Suite ID mapping for CircleCI imports
    suite_map = {}

    # Fetch suites from TestRail
    print("\nFetching suites from TestRail...")
    suites_resp = testrail_get(f"get_suites/{TESTRAIL_PROJECT_ID}")
    tr_suites = suites_resp.get("suites", suites_resp) if isinstance(suites_resp, dict) else suites_resp
    print(f"Found {len(tr_suites)} suites")

    total_sections = 0
    total_cases = 0

    for tr_suite in tr_suites:
        suite_name = tr_suite["name"]
        tr_suite_id = tr_suite["id"]

        print(f"\n--- Suite: {suite_name} (TR id={tr_suite_id}) ---")

        # Fetch cases first to check if suite has any
        print(f"  Fetching cases...")
        tr_cases = testrail_get_all(f"get_cases/{TESTRAIL_PROJECT_ID}&suite_id={tr_suite_id}", "cases")
        tr_cases = [c for c in tr_cases if not c.get("is_deleted")]

        if not tr_cases:
            print(f"  No active cases, skipping suite.")
            continue

        # Create suite
        suite = Suite(project_id=project.id, name=suite_name, description=tr_suite.get('description'))
        db.session.add(suite)
        db.session.flush()
        print(f"  Created suite (id={suite.id})")

        # Map workflow names to suite IDs for CircleCI import
        workflow_key = suite_name.lower().replace(' ', '_').replace('-', '_').replace('__', '_')
        suite_map[workflow_key] = suite.id

        # Fetch sections
        print(f"  Fetching sections...")
        tr_sections = testrail_get_all(f"get_sections/{TESTRAIL_PROJECT_ID}&suite_id={tr_suite_id}", "sections")
        tr_sections.sort(key=lambda s: s.get("depth", 0))

        # Create sections
        section_map = {}
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

        print(f"  Created {len(section_map)} sections")
        total_sections += len(section_map)

        # Default section for cases without one
        default_section = None

        # Create test cases
        case_count = 0
        for tr_case in tr_cases:
            tr_section_id = tr_case.get("section_id")
            guardian_section = section_map.get(tr_section_id)

            if not guardian_section:
                if not default_section:
                    default_section = Section(suite_id=suite.id, name="General", display_order=0)
                    db.session.add(default_section)
                    db.session.flush()
                    total_sections += 1
                guardian_section = default_section

            case = TestCase(
                suite_id=suite.id,
                section_id=guardian_section.id,
                title=tr_case["title"],
                case_type=TYPE_MAP.get(tr_case.get("type_id", 7), "Other"),
                priority=PRIORITY_MAP.get(tr_case.get("priority_id", 2), "Medium"),
                preconditions=tr_case.get("custom_preconds"),
                expected_result=tr_case.get("custom_expected"),
                created_by=user_id,
            )
            db.session.add(case)
            case_count += 1

        db.session.flush()
        print(f"  Imported {case_count} test cases")
        total_cases += case_count

    db.session.commit()
    print(f"\n{'='*50}")
    print(f"TestRail import complete!")
    print(f"  Suites:   {Suite.query.filter_by(project_id=project.id).count()}")
    print(f"  Sections: {total_sections}")
    print(f"  Cases:    {total_cases}")
    print(f"{'='*50}")

    return suite_map

def main():
    print("=" * 60)
    print("StyleSeat Guardian - Demo Database Setup")
    print("=" * 60)

    app = create_app()

    with app.app_context():
        # Reset database
        print("\nResetting database...")
        db.drop_all()
        db.create_all()

        # Create demo user
        user = User(username="demo", email="ggortalov+demo@styleseat.com")
        user.set_password("DemoStyleSeat22@")
        db.session.add(user)
        db.session.flush()
        print(f"Created user: demo")

        # Import TestRail data
        suite_map = seed_testrail_data(user.id)

        # Import CircleCI workflows
        print("\n" + "=" * 60)
        print("Importing CircleCI test runs...")
        print("=" * 60)

        for workflow_id in DEFAULT_WORKFLOWS:
            try:
                import_circleci_workflow(workflow_id, suite_map, user.id)
            except Exception as e:
                print(f"  Error importing workflow {workflow_id}: {e}")

        # Final summary
        project = Project.query.filter_by(name='Automation Overview').first()
        suites = Suite.query.filter_by(project_id=project.id).count() if project else 0
        cases = TestCase.query.count()
        runs = TestRun.query.count()
        results = TestResult.query.count()

        print("\n" + "=" * 60)
        print("DEMO SETUP COMPLETE!")
        print("=" * 60)
        print(f"\nCredentials: demo / DemoStyleSeat22@")
        print(f"\nData summary:")
        print(f"  Projects:    1 (Automation Overview)")
        print(f"  Suites:      {suites}")
        print(f"  Test Cases:  {cases}")
        print(f"  Test Runs:   {runs}")
        print(f"  Results:     {results}")
        print("\nOpen http://localhost:5173 to access the application")

if __name__ == '__main__':
    main()

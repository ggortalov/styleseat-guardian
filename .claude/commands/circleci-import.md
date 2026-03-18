# CircleCI Test Results Import Skill

Import test results from a CircleCI workflow URL into the Regression Guard system. Uses Cypress repo as source of truth for test definitions.

## Usage

```
/circleci-import <workflow-url>
```

Example:
```
/circleci-import https://app.circleci.com/pipelines/github/styleseat/cypress/61253/workflows/e2d6bec1-40e3-4813-9721-9d31a106977a
```

## Instructions

When the user provides a CircleCI workflow URL, execute the following steps:

### Step 1: Parse the URL

Extract the workflow ID from the URL. The URL format is:
```
https://app.circleci.com/pipelines/github/{org}/{repo}/{pipeline}/workflows/{workflow_id}
```

### Step 2: Run the Import Script

Execute the following Python script in the backend directory, replacing `WORKFLOW_ID` with the extracted ID:

```bash
cd /Users/gennadyg/PycharmProjects/regression-guard/backend && source venv/bin/activate && python3 << 'EOF'
import requests
import json
import re
import subprocess
import base64
from datetime import datetime, timezone
from collections import Counter, defaultdict
from app import create_app, db
from app.models import TestRun, TestResult, TestCase, Suite, Section, Project, ResultHistory

TOKEN = 'CCIPAT_viPDJFUPE6SkpK28xtBzF_b2b0141bff75f1c1b1d4a78adba9ae68369fb199'
PROJECT_SLUG = 'gh/styleseat/cypress'
BASE_URL = 'https://circleci.com/api/v2'
WORKFLOW_ID = '<REPLACE_WITH_WORKFLOW_ID>'

headers = {'Circle-Token': TOKEN, 'Content-Type': 'application/json'}

# Suite mapping for workflow names
SUITE_MAP = {
    'p0': 'PO',
    'p1_common': 'P1 Common',
    'p1_client': 'P1 Client',
    'p1_pro': 'P1 Pro',
    'p1_api': 'P1 API',
    'p1_search': 'P1 Search',
    'po': 'PO',
}

def get_cypress_tests_for_workflow(workflow_name):
    """Get all test files and tests from Cypress repo for this workflow."""
    # Map workflow to folder path
    folder_map = {
        'p0': 'cypress/e2e/p0/',
        'p1_common': 'cypress/e2e/p1/common/',
        'p1_client': 'cypress/e2e/p1/client/',
        'p1_pro': 'cypress/e2e/p1/pro/',
        'p1_api': 'cypress/e2e/p1/api/',
        'p1_search': 'cypress/e2e/p1/search/',
        'po': 'cypress/e2e/p0/',
    }
    folder = folder_map.get(workflow_name.lower(), f'cypress/e2e/{workflow_name}/')

    # Get file tree
    result = subprocess.run(
        ['gh', 'api', 'repos/styleseat/cypress/git/trees/master?recursive=1'],
        capture_output=True, text=True
    )
    tree = json.loads(result.stdout)
    test_files = [f['path'] for f in tree.get('tree', [])
                  if f['path'].startswith(folder) and f['path'].endswith('.cy.js')]

    # Extract tests from each file
    tests_by_file = {}
    for file_path in test_files:
        result = subprocess.run(
            ['gh', 'api', f'repos/styleseat/cypress/contents/{file_path}', '--jq', '.content'],
            capture_output=True, text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            content = base64.b64decode(result.stdout.strip()).decode('utf-8', errors='ignore')
            it_pattern = r'it(?:\.only|\.skip)?\s*\(\s*["\'\`]([^"\'\`]+)["\'\`]'
            tests = [m.group(1).strip() for m in re.finditer(it_pattern, content) if len(m.group(1).strip()) > 3]
            if tests:
                tests_by_file[file_path] = tests

    return tests_by_file

# Get workflow jobs
response = requests.get(f'{BASE_URL}/workflow/{WORKFLOW_ID}/job', headers=headers, timeout=30)
jobs = response.json()

print(f'Found {len(jobs.get("items", []))} jobs:')
job_numbers = []
workflow_name = None
for job in jobs.get('items', []):
    print(f"  - Job {job.get('job_number')}: {job.get('name')} ({job.get('status')})")
    job_numbers.append(job.get('job_number'))
    if not workflow_name:
        workflow_name = re.sub(r'_\d+$', '', job.get('name', ''))

print(f"\nWorkflow: {workflow_name}")

def extract_tests(obj, job_num, current_file=''):
    tests = []
    if isinstance(obj, dict):
        file_path = obj.get('file') or obj.get('fullFile') or current_file
        if 'title' in obj and 'state' in obj and 'fullTitle' in obj:
            tests.append({
                'job_num': job_num,
                'title': obj.get('title'),
                'fullTitle': obj.get('fullTitle'),
                'state': obj.get('state'),
                'err': obj.get('err', {}),
                'file': file_path
            })
        for key in ['tests', 'suites', 'results']:
            if key in obj:
                for item in (obj[key] if isinstance(obj[key], list) else [obj[key]]):
                    tests.extend(extract_tests(item, job_num, file_path))
    elif isinstance(obj, list):
        for item in obj:
            tests.extend(extract_tests(item, job_num, current_file))
    return tests

def clean_title(title):
    return re.sub(r'^(C\d+\s*|DP\d+-P\d+-\d+\s*)', '', title).strip().lower()

def match_artifacts(title, artifacts):
    matched = []
    for a in artifacts:
        path = a.get('path', '').lower()
        if ('.png' in path or '.mp4' in path) and (title.lower()[:30] in path):
            matched.append(a)
    return matched

# Fetch CircleCI results
all_tests, job_artifacts, failed_files = [], {}, set()
for job_num in job_numbers:
    artifacts = requests.get(f'{BASE_URL}/project/{PROJECT_SLUG}/{job_num}/artifacts', headers=headers, timeout=30).json().get('items', [])
    job_artifacts[job_num] = [{'name': a.get('path', '').split('/')[-1], 'url': a.get('url'), 'path': a.get('path')} for a in artifacts if '.png' in a.get('path', '') or '.mp4' in a.get('path', '')]
    report_url = next((a.get('url') for a in artifacts if a.get('path', '').endswith('report.json')), None)
    if report_url:
        report = requests.get(report_url, headers=headers, timeout=60).json()
        tests = extract_tests(report, job_num)
        all_tests.extend(tests)
        # Track files that failed to load
        for t in tests:
            if 'uncaught error' in t['title'].lower() and t.get('file'):
                failed_files.add(t['file'])
        print(f"Job {job_num}: {len(tests)} tests")

print(f"\nTotal CircleCI tests: {len(all_tests)}")
states = Counter(t['state'] for t in all_tests)
print(f"States: {dict(states)}")

if failed_files:
    print(f"\nFiles that failed to load: {len(failed_files)}")
    for f in failed_files:
        print(f"  - {f}")

# Build CircleCI results lookup
circleci_by_title = {}
for t in all_tests:
    t['matched_artifacts'] = match_artifacts(t['title'], job_artifacts.get(t['job_num'], []))
    circleci_by_title[clean_title(t['title'])] = t

# Get Cypress tests (source of truth)
print(f"\nFetching Cypress tests for {workflow_name}...")
cypress_tests = get_cypress_tests_for_workflow(workflow_name)
total_cypress = sum(len(tests) for tests in cypress_tests.values())
print(f"Found {total_cypress} tests in {len(cypress_tests)} files from Cypress repo")

app = create_app()
with app.app_context():
    # Get suite
    suite_name = SUITE_MAP.get(workflow_name.lower(), workflow_name.upper())
    suite = Suite.query.filter(Suite.name.ilike(f'%{suite_name}%')).first()
    project = Project.query.filter_by(name='Cypress Automation').first()

    if not project or not suite:
        print(f"ERROR: Project or suite not found. Suite name: {suite_name}")
        exit(1)

    print(f"\nSuite: {suite.name} (ID: {suite.id})")

    # Get all test cases for this suite
    suite_cases = {clean_title(c.title): c for c in TestCase.query.filter_by(suite_id=suite.id).all()}
    print(f"Test cases in suite: {len(suite_cases)}")

    # Create test run
    run = TestRun(project_id=project.id, suite_id=suite.id, name=f'cronschedule_{workflow_name}',
                  description=f'Imported from CircleCI workflow {WORKFLOW_ID[:8]}')
    db.session.add(run)
    db.session.flush()
    print(f"\nCreated run {run.id}: {run.name}")

    # Track results
    results_created = {'Passed': 0, 'Failed': 0, 'Blocked': 0, 'Untested': 0}
    untested_tests = []
    blocked_tests = []

    # Process all Cypress tests
    for file_path, tests in cypress_tests.items():
        is_blocked_file = file_path in failed_files

        for title in tests:
            cleaned = clean_title(title)

            # Find case in database
            case = suite_cases.get(cleaned)
            if not case:
                # Try to find by original title
                case = TestCase.query.filter(TestCase.suite_id == suite.id,
                                            TestCase.title.ilike(f'%{title[:50]}%')).first()

            if not case:
                # Create new case
                section = Section.query.filter_by(suite_id=suite.id, name='CircleCI Imports').first()
                if not section:
                    section = Section(suite_id=suite.id, name='CircleCI Imports', display_order=9999)
                    db.session.add(section)
                    db.session.flush()

                case = TestCase(suite_id=suite.id, section_id=section.id, title=title,
                               case_type='Regression', priority='Medium',
                               preconditions=f'Source: {file_path}', created_by=1)
                db.session.add(case)
                db.session.flush()
                suite_cases[cleaned] = case

            # Determine status
            if is_blocked_file:
                status = 'Blocked'
                error_msg = f"File failed to load: {file_path}\n\nAll tests in this file were blocked due to a syntax or import error."
                artifacts_json = None
                blocked_tests.append(title)
            elif cleaned in circleci_by_title:
                ci_test = circleci_by_title[cleaned]
                status = {'passed': 'Passed', 'failed': 'Failed', 'pending': 'Blocked'}.get(ci_test['state'], 'Untested')
                err = ci_test.get('err', {})
                error_msg = (err.get('message', '') + '\n\n' + err.get('stack', '')[:500]) if isinstance(err, dict) and err else None
                artifacts_json = json.dumps(ci_test.get('matched_artifacts', [])[:5]) if status == 'Failed' and ci_test.get('matched_artifacts') else None
            else:
                status = 'Untested'
                error_msg = f"Test not found in CircleCI results.\nSource file: {file_path}"
                artifacts_json = None
                untested_tests.append(title)

            # Create result
            result = TestResult(run_id=run.id, case_id=case.id, status=status,
                               error_message=error_msg, artifacts=artifacts_json,
                               tested_at=datetime.now(timezone.utc), tested_by=1)
            db.session.add(result)
            db.session.flush()

            # Create history
            db.session.add(ResultHistory(result_id=result.id, status=status,
                                        error_message=error_msg, artifacts=artifacts_json, changed_by=1))
            results_created[status] += 1

    db.session.commit()

    # Final report
    print(f"\n{'='*60}")
    print(f"IMPORT COMPLETE")
    print(f"{'='*60}")
    print(f"Run: {run.name}")
    print(f"Suite: {suite.name}")
    print(f"\nResults:")
    print(f"  Passed:   {results_created['Passed']}")
    print(f"  Failed:   {results_created['Failed']}")
    print(f"  Blocked:  {results_created['Blocked']}")
    print(f"  Untested: {results_created['Untested']}")
    print(f"  Total:    {sum(results_created.values())}")

    if blocked_tests:
        print(f"\nBlocked tests ({len(blocked_tests)}) - file failed to load:")
        for t in blocked_tests[:5]:
            print(f"  - {t[:60]}...")
        if len(blocked_tests) > 5:
            print(f"  ... and {len(blocked_tests) - 5} more")

    if untested_tests:
        print(f"\nUntested tests ({len(untested_tests)}) - not in CircleCI results:")
        for t in untested_tests[:10]:
            print(f"  - {t[:60]}...")
        if len(untested_tests) > 10:
            print(f"  ... and {len(untested_tests) - 10} more")

    # Show failed tests
    failed = TestResult.query.filter_by(run_id=run.id, status='Failed').all()
    if failed:
        print(f"\nFailed tests ({len(failed)}):")
        for r in failed[:10]:
            case = db.session.get(TestCase, r.case_id)
            print(f"  - {case.title[:60]}...")
EOF
```

### Step 3: Report Results

After the script completes, provide a summary including:
- Run name and suite
- Results breakdown (Passed, Failed, Blocked, Untested)
- List of **Blocked tests** (files that failed to load)
- List of **Untested tests** (in Cypress but not in CircleCI)
- List of **Failed tests**

The report distinguishes between:
- **Blocked**: Test file had a syntax/import error and couldn't run
- **Untested**: Test exists in Cypress repo but wasn't executed in CircleCI
- **Failed**: Test ran but failed
- **Passed**: Test ran successfully
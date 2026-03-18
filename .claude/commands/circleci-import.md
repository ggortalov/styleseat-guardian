# CircleCI Test Results Import Skill

Import test results from a CircleCI workflow URL into the Regression Guard system.

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
from datetime import datetime, timezone
from collections import Counter
from app import create_app, db
from app.models import TestRun, TestResult, TestCase, Suite, Project, ResultHistory

TOKEN = 'REDACTED_CIRCLECI_TOKEN'
PROJECT_SLUG = 'gh/styleseat/cypress'
BASE_URL = 'https://circleci.com/api/v2'
WORKFLOW_ID = '<REPLACE_WITH_WORKFLOW_ID>'

headers = {'Circle-Token': TOKEN, 'Content-Type': 'application/json'}

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

def extract_tests(obj, job_num, parent_suite=''):
    tests = []
    if isinstance(obj, dict):
        if 'title' in obj and 'state' in obj and 'fullTitle' in obj:
            tests.append({'job_num': job_num, 'title': obj.get('title'), 'fullTitle': obj.get('fullTitle'), 'state': obj.get('state'), 'err': obj.get('err', {})})
        for test in obj.get('tests', []): tests.extend(extract_tests(test, job_num, parent_suite))
        for suite in obj.get('suites', []): tests.extend(extract_tests(suite, job_num, suite.get('title', parent_suite)))
        for result in obj.get('results', []): tests.extend(extract_tests(result, job_num, parent_suite))
    elif isinstance(obj, list):
        for item in obj: tests.extend(extract_tests(item, job_num, parent_suite))
    return tests

def clean_title(title):
    return re.sub(r'^(C\d+\s*|DP\d+-P\d+-\d+\s*)', '', title).strip().lower()

def match_artifacts(title, full_title, artifacts):
    matched = []
    for a in artifacts:
        path = a.get('path', '').lower()
        if ('.png' in path or '.mp4' in path) and (title.lower()[:30] in path):
            matched.append(a)
    return matched

all_tests, job_artifacts = [], {}
for job_num in job_numbers:
    artifacts = requests.get(f'{BASE_URL}/project/{PROJECT_SLUG}/{job_num}/artifacts', headers=headers, timeout=30).json().get('items', [])
    job_artifacts[job_num] = [{'name': a.get('path', '').split('/')[-1], 'url': a.get('url'), 'path': a.get('path')} for a in artifacts if '.png' in a.get('path', '') or '.mp4' in a.get('path', '')]
    report_url = next((a.get('url') for a in artifacts if a.get('path', '').endswith('report.json')), None)
    if report_url:
        report = requests.get(report_url, headers=headers, timeout=60).json()
        tests = extract_tests(report, job_num)
        all_tests.extend(tests)
        print(f"Job {job_num}: {len(tests)} tests")

print(f"\nTotal: {len(all_tests)} tests")
states = Counter(t['state'] for t in all_tests)
print(f"States: {dict(states)}")

circleci_by_title = {}
for t in all_tests:
    t['matched_artifacts'] = match_artifacts(t['title'], t.get('fullTitle'), job_artifacts.get(t['job_num'], []))
    circleci_by_title[clean_title(t['title'])] = t

app = create_app()
with app.app_context():
    cases_by_title = {c.title.strip().lower(): c for c in TestCase.query.all()}
    matches = [(circleci_by_title[t], cases_by_title[t]) for t in circleci_by_title if t in cases_by_title]
    print(f"\nMatched {len(matches)} tests to cases")

    suite_map = {'p0': 1, 'p1_common': 7, 'p1_client': 2, 'p1_pro': 6, 'p1_api': 3, 'p1_search': 14}
    suite_id = suite_map.get(workflow_name, 1)
    suite = db.session.get(Suite, suite_id)
    project = Project.query.filter_by(name='Cypress Automation').first()

    run = TestRun(project_id=project.id if project else 1, suite_id=suite_id, name=f'cronschedule_{workflow_name}', description=f'Imported from CircleCI workflow {WORKFLOW_ID[:8]}')
    db.session.add(run)
    db.session.flush()
    print(f"Created run {run.id}: {run.name} (suite: {suite.name if suite else 'Unknown'})")

    results_data = []
    for test, case in matches:
        status = {'passed': 'Passed', 'failed': 'Failed', 'pending': 'Blocked'}.get(test['state'], 'Untested')
        err = test.get('err', {})
        error_msg = (err.get('message', '') + '\n\n' + err.get('stack', '')[:500]) if isinstance(err, dict) and err else None
        artifacts_json = json.dumps(sorted(test.get('matched_artifacts', [])[:5], key=lambda a: '(attempt' in (a.get('name') or ''))) if test['state'] == 'failed' and test.get('matched_artifacts') else None

        result = TestResult(run_id=run.id, case_id=case.id, status=status, circleci_job_id=str(test['job_num']), error_message=error_msg, artifacts=artifacts_json, tested_at=datetime.now(timezone.utc), tested_by=1)
        db.session.add(result)
        results_data.append((result, status, error_msg, artifacts_json))

    db.session.flush()
    for result, status, error_msg, artifacts_json in results_data:
        db.session.add(ResultHistory(result_id=result.id, status=status, error_message=error_msg, artifacts=artifacts_json, changed_by=1))
    db.session.commit()

    final_results = TestResult.query.filter_by(run_id=run.id).all()
    statuses = Counter(r.status for r in final_results)
    print(f"\n=== IMPORT COMPLETE ===")
    print(f"Run: {run.name}")
    print(f"Suite: {suite.name if suite else 'Unknown'}")
    print(f"Results: {len(final_results)}")
    print(f"  Passed: {statuses.get('Passed', 0)}")
    print(f"  Failed: {statuses.get('Failed', 0)}")
    print(f"  Blocked: {statuses.get('Blocked', 0)}")

    failed = [r for r in final_results if r.status == 'Failed']
    if failed:
        print(f"\nFailed tests:")
        for r in failed[:10]:
            case = db.session.get(TestCase, r.case_id)
            print(f"  - {case.title[:70]}...")
EOF
```

### Step 3: Report Results

After the script completes, summarize the import results to the user:
- Run name and suite
- Total tests imported
- Status breakdown (Passed, Failed, Blocked)
- List of failed tests (if any)

Let the user know the new run is available in the sidebar under Test Runs.
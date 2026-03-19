---
allowed-tools: Bash(*)
---

/make test file te# CircleCI Test Results Import Skill

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
from collections import Counter
from app import create_app, db
from app.models import TestRun, TestResult, TestCase, Suite, Section, Project, ResultHistory
from app.suite_utils import workflow_name_to_cypress_path, cypress_path_to_name

TOKEN = 'CCIPAT_viPDJFUPE6SkpK28xtBzF_b2b0141bff75f1c1b1d4a78adba9ae68369fb199'
PROJECT_SLUG = 'gh/styleseat/cypress'
BASE_URL = 'https://circleci.com/api/v2'
WORKFLOW_ID = '<REPLACE_WITH_WORKFLOW_ID>'

headers = {'Circle-Token': TOKEN, 'Content-Type': 'application/json'}

# Regex to extract test titles from Cypress files
# Handles: it("title"), it([Tag.X], "title"), it.only("title"), itStage("title"), escaped quotes (doesn\'t)
# Works with double quotes, single quotes, and template literals
IT_PATTERN = r'it(?:Stage|\.only|\.skip)?\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`((?:[^`\\]|\\.)*)`)'

# Regex to extract describe() title from Cypress files (first describe block)
DESCRIBE_PATTERN = r'describe(?:\.only|\.skip)?\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`((?:[^`\\]|\\.)*)`)'

def extract_it_title(match):
    """Extract and unescape test title from regex match."""
    title = (match.group(1) or match.group(2) or match.group(3) or '')
    return title.replace("\\'", "'").replace('\\"', '"').strip()

def normalize(title):
    """Normalize title for matching: lowercase, strip whitespace. Preserves full title including case ID."""
    return title.strip().lower()

def _tokenize(s):
    """Split a string into lowercase alphanumeric tokens."""
    return set(re.findall(r'[a-z0-9]+', s.lower()))

def fuzzy_match(cypress_title, ci_candidates, threshold=0.6):
    """Find the best fuzzy match for a Cypress title among CI candidates from the same file.

    Scoring:
      1. Substring containment (one title inside the other) → automatic match
      2. Token overlap ratio (Jaccard-like) above threshold → best score wins
    Returns (ci_test, score) or (None, 0).
    """
    norm_cy = normalize(cypress_title)
    best, best_score = None, 0

    for ci_test in ci_candidates:
        norm_ci = normalize(ci_test['title'])

        # Already matched by exact — skip
        if norm_ci == norm_cy:
            continue

        # Substring containment (handles template-literal interpolation)
        if norm_cy in norm_ci or norm_ci in norm_cy:
            return ci_test, 0.95

        # Token overlap (Jaccard)
        tokens_cy = _tokenize(cypress_title)
        tokens_ci = _tokenize(ci_test['title'])
        if not tokens_cy or not tokens_ci:
            continue
        overlap = len(tokens_cy & tokens_ci) / len(tokens_cy | tokens_ci)
        if overlap > best_score:
            best, best_score = ci_test, overlap

    if best_score >= threshold:
        return best, best_score
    return None, 0

def get_cypress_tests_for_workflow(workflow_name):
    """Get all test files and tests from Cypress repo for this workflow (source of truth)."""
    folder = workflow_name_to_cypress_path(workflow_name)

    result = subprocess.run(
        ['gh', 'api', 'repos/styleseat/cypress/git/trees/master?recursive=1'],
        capture_output=True, text=True
    )
    tree = json.loads(result.stdout)
    test_files = [f['path'] for f in tree.get('tree', [])
                  if f['path'].startswith(folder) and f['path'].endswith('.cy.js')]

    tests_by_file = {}
    for file_path in test_files:
        result = subprocess.run(
            ['gh', 'api', f'repos/styleseat/cypress/contents/{file_path}', '--jq', '.content'],
            capture_output=True, text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            content = base64.b64decode(result.stdout.strip()).decode('utf-8', errors='ignore')
            tests = [extract_it_title(m) for m in re.finditer(IT_PATTERN, content)]
            tests = [t for t in tests if len(t) > 3]
            # Extract first describe() title
            describe_match = re.search(DESCRIBE_PATTERN, content)
            describe_title = extract_it_title(describe_match) if describe_match else None
            if tests:
                tests_by_file[file_path] = {'tests': tests, 'describe': describe_title}

    return tests_by_file

def extract_ci_tests(obj, job_num, current_file=''):
    """Recursively extract test results from CircleCI report JSON."""
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
                    tests.extend(extract_ci_tests(item, job_num, file_path))
    elif isinstance(obj, list):
        for item in obj:
            tests.extend(extract_ci_tests(item, job_num, current_file))
    return tests

def match_artifacts(title, artifacts):
    """Match screenshot/video artifacts to a test by title prefix."""
    matched = []
    for a in artifacts:
        path = a.get('path', '').lower()
        if ('.png' in path or '.mp4' in path) and (title.lower()[:30] in path):
            matched.append(a)
    return matched

# === Step 1: Get CircleCI jobs and results ===
response = requests.get(f'{BASE_URL}/workflow/{WORKFLOW_ID}/job', headers=headers, timeout=30)
jobs = response.json()

print(f'Found {len(jobs.get("items", []))} jobs:')
job_numbers = []
job_info = {}  # job_num → {name, status}
workflow_name = None
for job in jobs.get('items', []):
    print(f"  - Job {job.get('job_number')}: {job.get('name')} ({job.get('status')})")
    job_numbers.append(job.get('job_number'))
    job_info[job.get('job_number')] = {'name': job.get('name', ''), 'status': job.get('status', '')}
    if not workflow_name:
        workflow_name = re.sub(r'_\d+$', '', job.get('name', ''))

print(f"\nWorkflow: {workflow_name}")

all_ci_tests, job_artifacts, failed_files = [], {}, set()
failed_jobs = []  # Jobs that failed/errored without producing a report.json
for job_num in job_numbers:
    artifacts = requests.get(f'{BASE_URL}/project/{PROJECT_SLUG}/{job_num}/artifacts', headers=headers, timeout=30).json().get('items', [])
    job_artifacts[job_num] = [{'name': a.get('path', '').split('/')[-1], 'url': a.get('url'), 'path': a.get('path')} for a in artifacts if '.png' in a.get('path', '') or '.mp4' in a.get('path', '')]
    report_url = next((a.get('url') for a in artifacts if a.get('path', '').endswith('report.json')), None)
    if report_url:
        report = requests.get(report_url, headers=headers, timeout=60).json()
        tests = extract_ci_tests(report, job_num)
        all_ci_tests.extend(tests)
        for t in tests:
            if 'uncaught error' in t['title'].lower() and t.get('file'):
                failed_files.add(t['file'])
        print(f"Job {job_num}: {len(tests)} tests")
    else:
        ji = job_info[job_num]
        if ji['status'] in ('failed', 'error', 'infrastructure_fail', 'timedout'):
            failed_jobs.append(ji)
            print(f"Job {job_num}: NO report.json (job {ji['status']})")
        else:
            print(f"Job {job_num}: no report.json (status: {ji['status']})")

print(f"\nCircleCI: {len(all_ci_tests)} tests  |  States: {dict(Counter(t['state'] for t in all_ci_tests))}")
if failed_jobs:
    total_jobs = len(job_numbers)
    print(f"\n⚠ WARNING: {len(failed_jobs)}/{total_jobs} job(s) failed without producing test results:")
    for fj in failed_jobs:
        print(f"  - {fj['name']} ({fj['status']})")
    print(f"  Tests from these jobs will be marked as Untested.")
if failed_files:
    print(f"Files that failed to load: {len(failed_files)}")
    for f in failed_files:
        print(f"  - {f}")

# Build CircleCI lookups
ci_by_title = {}   # normalized title → ci_test
ci_by_file = {}    # file path → [ci_test, ...]
for t in all_ci_tests:
    t['matched_artifacts'] = match_artifacts(t['title'], job_artifacts.get(t['job_num'], []))
    ci_by_title[normalize(t['title'])] = t
    if t.get('file'):
        ci_by_file.setdefault(t['file'], []).append(t)

# === Step 2: Get Cypress tests (source of truth) ===
print(f"\nFetching Cypress tests for {workflow_name}...")
cypress_tests = get_cypress_tests_for_workflow(workflow_name)
total_cypress = sum(len(info['tests']) for info in cypress_tests.values())
print(f"Cypress: {total_cypress} tests in {len(cypress_tests)} files")

# === Step 3: Import into database ===
app = create_app()
with app.app_context():
    cypress_path = workflow_name_to_cypress_path(workflow_name)
    suite_name = cypress_path_to_name(cypress_path)
    project = Project.query.filter_by(name='Cypress Automation').first()

    if not project:
        print(f"ERROR: Project 'Cypress Automation' not found.")
        exit(1)

    suite = Suite.query.filter_by(project_id=project.id, cypress_path=cypress_path).first()
    if not suite:
        suite = Suite(project_id=project.id, name=suite_name, cypress_path=cypress_path,
                      description='Auto-created from CircleCI import')
        db.session.add(suite)
        db.session.flush()
        print(f"Created suite: {suite_name} ({cypress_path})")

    print(f"\nSuite: {suite.name} (ID: {suite.id})")

    # Delete previous run with same name if exists
    old_run = TestRun.query.filter_by(name=f'cronschedule_{workflow_name}', suite_id=suite.id).first()
    if old_run:
        result_ids = [r.id for r in TestResult.query.filter_by(run_id=old_run.id).all()]
        if result_ids:
            ResultHistory.query.filter(ResultHistory.result_id.in_(result_ids)).delete(synchronize_session=False)
        TestResult.query.filter_by(run_id=old_run.id).delete()
        db.session.delete(old_run)
        db.session.commit()
        print("Deleted previous run.")

    # Lookup existing test cases by full normalized title
    existing_cases = {normalize(c.title): c for c in TestCase.query.filter_by(suite_id=suite.id).all()}

    # Create test run
    run_desc = f'Imported from CircleCI workflow {WORKFLOW_ID[:8]}'
    if failed_jobs:
        run_desc += f'\n⚠ {len(failed_jobs)}/{len(job_numbers)} job(s) failed without results: ' + ', '.join(fj["name"] for fj in failed_jobs)
    run = TestRun(project_id=project.id, suite_id=suite.id, name=f'cronschedule_{workflow_name}',
                  description=run_desc)
    db.session.add(run)
    db.session.flush()

    results_created = {'Passed': 0, 'Failed': 0, 'Blocked': 0, 'Untested': 0}
    blocked_tests, untested_tests, failed_tests = [], [], []
    fuzzy_matched_tests = []  # (cypress_title, ci_title, score)
    matched_ci_titles = set()

    # --- Phase 1: Cypress tests (source of truth) ---
    # Every Cypress test gets a result. Each test is unique by its full title (including case ID).
    # Tests may or may not have a case ID prefix (e.g. "C12345 title" or just "title").
    for file_path, file_info in cypress_tests.items():
        tests = file_info['tests']
        describe_title = file_info.get('describe')
        is_blocked_file = file_path in failed_files

        for title in tests:
            norm = normalize(title)

            # Build preconditions with source file and describe title
            preconditions_text = f'Source: {file_path}'
            if describe_title:
                preconditions_text += f'\nDescribe: {describe_title}'

            # Find or create test case by full normalized title
            case = existing_cases.get(norm)
            if not case:
                section = Section.query.filter_by(suite_id=suite.id, name='Cypress Tests').first()
                if not section:
                    section = Section(suite_id=suite.id, name='Cypress Tests', display_order=9999)
                    db.session.add(section)
                    db.session.flush()
                case = TestCase(suite_id=suite.id, section_id=section.id, title=title,
                               case_type='Regression', priority='Medium',
                               preconditions=preconditions_text, created_by=1)
                db.session.add(case)
                db.session.flush()
                existing_cases[norm] = case
            else:
                # Update preconditions on existing cases to add describe title
                if case.preconditions != preconditions_text:
                    case.preconditions = preconditions_text

            # Determine status from CircleCI results
            ci_test = None
            if is_blocked_file:
                status = 'Blocked'
                error_msg = f"File failed to load: {file_path}\n\nAll tests blocked due to syntax/import error."
                artifacts_json = None
                blocked_tests.append(title)
            elif norm in ci_by_title:
                ci_test = ci_by_title[norm]
            else:
                # Fuzzy fallback: match within CI tests from the same file
                candidates = ci_by_file.get(file_path, [])
                # Also try without leading path components (CI may report relative paths)
                if not candidates:
                    for ci_file_key in ci_by_file:
                        if ci_file_key.endswith('/' + file_path.split('/')[-1]):
                            candidates = ci_by_file[ci_file_key]
                            break
                if candidates:
                    match, score = fuzzy_match(title, [c for c in candidates if normalize(c['title']) not in matched_ci_titles])
                    if match:
                        ci_test = match
                        fuzzy_matched_tests.append((title, match['title'], score))

            if ci_test and not is_blocked_file:
                status = {'passed': 'Passed', 'failed': 'Failed', 'pending': 'Blocked'}.get(ci_test['state'], 'Untested')
                err = ci_test.get('err', {})
                error_msg = (err.get('message', '') + '\n\n' + err.get('stack', '')[:500]) if isinstance(err, dict) and err else None
                artifacts_json = json.dumps(ci_test.get('matched_artifacts', [])[:5]) if status == 'Failed' and ci_test.get('matched_artifacts') else None
                matched_ci_titles.add(normalize(ci_test['title']))
                if status == 'Failed':
                    failed_tests.append(title)
            elif not is_blocked_file:
                status = 'Untested'
                if failed_jobs:
                    error_msg = f"Test not found in CircleCI results — {len(failed_jobs)} job(s) failed without producing results.\nSource: {file_path}"
                else:
                    error_msg = f"Test not found in CircleCI results.\nSource: {file_path}"
                artifacts_json = None
                untested_tests.append(title)

            result = TestResult(run_id=run.id, case_id=case.id, status=status,
                               error_message=error_msg, artifacts=artifacts_json,
                               tested_at=datetime.now(timezone.utc) if status != 'Untested' else None,
                               tested_by=1 if status != 'Untested' else None)
            db.session.add(result)
            db.session.flush()
            db.session.add(ResultHistory(result_id=result.id, status=status,
                                        error_message=error_msg, artifacts=artifacts_json, changed_by=1))
            results_created[status] += 1

    # --- Phase 2: CircleCI-only tests (ran in CI but not found in Cypress repo) ---
    unmatched_ci = [t for t in all_ci_tests
                    if normalize(t['title']) not in matched_ci_titles
                    and 'uncaught error' not in t['title'].lower()]

    if unmatched_ci:
        print(f"\nPhase 2: Adding {len(unmatched_ci)} CircleCI-only tests...")
        section = Section.query.filter_by(suite_id=suite.id, name='CircleCI Only').first()
        if not section:
            section = Section(suite_id=suite.id, name='CircleCI Only', display_order=9998)
            db.session.add(section)
            db.session.flush()

        for ci_test in unmatched_ci:
            title = ci_test['title']
            norm = normalize(title)
            case = existing_cases.get(norm)
            if not case:
                case = TestCase(suite_id=suite.id, section_id=section.id, title=title,
                               case_type='Regression', priority='Medium',
                               preconditions='Source: CircleCI (no Cypress match)', created_by=1)
                db.session.add(case)
                db.session.flush()
                existing_cases[norm] = case

            status = {'passed': 'Passed', 'failed': 'Failed', 'pending': 'Blocked'}.get(ci_test['state'], 'Untested')
            err = ci_test.get('err', {})
            error_msg = (err.get('message', '') + '\n\n' + err.get('stack', '')[:500]) if isinstance(err, dict) and err else None
            artifacts_json = json.dumps(ci_test.get('matched_artifacts', [])[:5]) if status == 'Failed' and ci_test.get('matched_artifacts') else None
            if status == 'Failed':
                failed_tests.append(title)

            result = TestResult(run_id=run.id, case_id=case.id, status=status,
                               error_message=error_msg, artifacts=artifacts_json,
                               tested_at=datetime.now(timezone.utc), tested_by=1)
            db.session.add(result)
            db.session.flush()
            db.session.add(ResultHistory(result_id=result.id, status=status,
                                        error_message=error_msg, artifacts=artifacts_json, changed_by=1))
            results_created[status] += 1

    db.session.commit()

    # === Final Report ===
    total = sum(results_created.values())
    print(f"\n{'='*60}")
    print(f"IMPORT COMPLETE")
    print(f"{'='*60}")
    print(f"Run: {run.name}  |  Suite: {suite.name}")
    if failed_jobs:
        print(f"\n  ⚠ INCOMPLETE RUN: {len(failed_jobs)}/{len(job_numbers)} job(s) failed without results")
        for fj in failed_jobs:
            print(f"    - {fj['name']} ({fj['status']})")
    print(f"\n  Passed:   {results_created['Passed']}")
    print(f"  Failed:   {results_created['Failed']}")
    print(f"  Blocked:  {results_created['Blocked']}")
    print(f"  Untested: {results_created['Untested']}")
    print(f"  Total:    {total}")
    print(f"\n  Phase 1 (Cypress):       {total - len(unmatched_ci)} results")
    print(f"  Phase 2 (CircleCI-only): {len(unmatched_ci)} results")

    if failed_tests:
        print(f"\nFailed ({len(failed_tests)}):")
        for t in failed_tests:
            print(f"  - {t[:80]}")

    if blocked_tests:
        print(f"\nBlocked ({len(blocked_tests)}) - file failed to load:")
        for t in blocked_tests[:5]:
            print(f"  - {t[:80]}")
        if len(blocked_tests) > 5:
            print(f"  ... and {len(blocked_tests) - 5} more")

    if untested_tests:
        print(f"\nUntested ({len(untested_tests)}) - in Cypress but not in CircleCI:")
        for t in untested_tests:
            print(f"  - {t[:80]}")

    if fuzzy_matched_tests:
        print(f"\nFuzzy matched ({len(fuzzy_matched_tests)}) - matched by file path + similarity:")
        for cy_title, ci_title, score in fuzzy_matched_tests:
            print(f"  - [{score:.0%}] '{cy_title[:40]}' ↔ '{ci_title[:40]}'")

    if unmatched_ci:
        print(f"\nCircleCI-only ({len(unmatched_ci)}) - ran in CI but not in Cypress repo:")
        for t in unmatched_ci:
            print(f"  - [{t['state']}] {t['title'][:80]}")
EOF
```

### Step 3: Report Results

After the script completes, provide a summary including:
- Run name and suite
- Results breakdown (Passed, Failed, Blocked, Untested)
- Phase 1 (Cypress) vs Phase 2 (CircleCI-only) counts
- List of **Failed tests**
- List of **Blocked tests** (files that failed to load)
- List of **Untested tests** (in Cypress but not in CircleCI)
- List of **CircleCI-only tests** (ran in CI but not found in Cypress repo)

The report distinguishes between:
- **Passed**: Test ran successfully in CircleCI
- **Failed**: Test ran but failed in CircleCI
- **Blocked**: Test file had a syntax/import error and couldn't run
- **Untested**: Test exists in Cypress repo but wasn't executed in CircleCI
- **CircleCI-only**: Test ran in CircleCI but has no matching test definition in the Cypress repo

### Matching Logic

**Cypress is the source of truth** for test case definitions. The import works in two phases:

1. **Phase 1 (Cypress tests)**: Every `it()` block extracted from Cypress `.cy.js` files gets a test result. Matching uses a three-tier strategy:
   - **Exact match**: Normalized title (case-insensitive) looked up in `ci_by_title`
   - **File-path + fuzzy match (fallback)**: If exact match fails, narrows candidates to CI tests from the same source file (`ci_by_file`), then applies fuzzy matching: substring containment (score 0.95) or token overlap (Jaccard index, threshold 0.6). This catches template-literal interpolation, minor wording differences, and dynamic test titles.
   - **Untested**: If neither match hits, the Cypress test is marked Untested.

2. **Phase 2 (CircleCI-only)**: Any CircleCI test results that weren't matched (exact or fuzzy) to a Cypress test are added as separate results under a "CircleCI Only" section.

### Test Title Extraction

The `it()` regex handles these Cypress patterns:
- `it("title", ...)` — standard
- `it([Tag.CRITICAL], "title", ...)` — tag array as first arg
- `it.only("title", ...)` / `it.skip("title", ...)` — mocha modifiers
- `itStage("title", ...)` — custom wrapper for staging-only tests
- `it("doesn\'t break", ...)` — escaped quotes in title
- Single quotes, double quotes, and template literals
- Titles with or without case ID prefix (`C12345 title` or just `title`)
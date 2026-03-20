#!/usr/bin/env python3
"""Import test results from a CircleCI workflow into Regression Guard.

Usage:
    python import_circleci.py <workflow-ref>

Examples:
    python import_circleci.py 61253/workflows/e2d6bec1-40e3-4813-9721-9d31a106977a
    python import_circleci.py https://app.circleci.com/pipelines/github/styleseat/cypress/61253/workflows/e2d6bec1-40e3-4813-9721-9d31a106977a
"""
import sys
import os
import re
import json
import base64
import subprocess
import requests
from datetime import datetime, timezone
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / '.env')

from app import create_app, db
from app.models import (
    TestRun, TestResult, TestCase, Suite, Section, Project, ResultHistory
)
from app.suite_utils import workflow_name_to_cypress_path, cypress_path_to_name

TOKEN = os.environ.get('CIRCLECI_API_TOKEN')
if not TOKEN:
    print("ERROR: CIRCLECI_API_TOKEN environment variable is not set.")
    print("Set it with: export CIRCLECI_API_TOKEN=your_token_here")
    sys.exit(1)

PROJECT_SLUG = os.environ.get('CIRCLECI_PROJECT_SLUG', 'gh/styleseat/cypress')
BASE_URL = 'https://circleci.com/api/v2'
BASE_URL_V1 = 'https://circleci.com/api/v1.1'

HEADERS = {'Circle-Token': TOKEN, 'Content-Type': 'application/json'}

# Statuses that indicate a job actually executed (or attempted to)
EXECUTED_STATUSES = {'success', 'failed', 'error', 'infrastructure_fail', 'timedout'}

# Workflow names that should show a variant label in the run name
WORKFLOW_VARIANTS = {
    'p0_mobile': 'LC environment',
}

# Regex to strip one or more C-ID or CXXXX placeholder prefixes from display titles
STRIP_CID_RE = re.compile(r'^(?:C(?:\d+|X+\d+)\s+)+')

# Regex to extract test titles from Cypress files
IT_PATTERN = (
    r'\bit(?:Stage|\.only|\.skip)?\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?'
    r'(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`((?:[^`\\]|\\.)*)`)'
)
DESCRIBE_PATTERN = (
    r'describe(?:\.only|\.skip)?\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?'
    r'(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`((?:[^`\\]|\\.)*)`)'
)


ANSI_RE = re.compile(r'\x1b\[[0-9;]*m')

# Regex to parse Cypress runner summary table rows.
# Matches lines like:  │ ✔  path/to/spec.cy.js  01:23  7  7  -  -  - │
# or without time:     │ ✖  path/to/spec.cy.js         7  3  1  -  3 │
RUNNER_ROW_RE = re.compile(
    r'[│|]\s*[✔✖☠]\s+'            # row start + status icon
    r'(\S+\.cy\.js)\s+'            # spec file path (capture group 1)
    r'(?:\d+:\d+\s+)?'             # optional MM:SS duration
    r'(\d+)\s+'                    # tests (capture group 2)
    r'(\d+|-)\s+'                  # passing (capture group 3)
    r'(\d+|-)\s+'                  # failing (capture group 4)
    r'(\d+|-)\s+'                  # pending (capture group 5)
    r'(\d+|-)'                     # skipped (capture group 6)
)


def _parse_runner_count(val):
    """Parse a runner summary count: '-' means 0, otherwise int."""
    return 0 if val == '-' else int(val)


def get_runner_summary(job_num):
    """Fetch the Cypress runner summary table from a CircleCI job's step output.

    Uses the v1.1 API to get step output, finds the step that contains the
    Cypress runner summary table, and parses per-spec-file test counts.

    Returns:
        dict: {spec_relative_path: {tests, passing, failing, pending, skipped}}
              Empty dict if no summary table found.
    """
    try:
        resp = requests.get(
            f'{BASE_URL_V1}/project/{PROJECT_SLUG}/{job_num}',
            headers=HEADERS, timeout=30
        )
        resp.raise_for_status()
        job_data = resp.json()
    except Exception as e:
        print(f"  Warning: Could not fetch v1.1 job details for {job_num}: {e}")
        return {}

    # Find the step output that contains the Cypress runner summary.
    # Steps named "run p1_client_2", "run p0_smoke", etc. contain the main
    # Cypress output. We prefer steps matching "run p\d+_" over other "run "
    # steps (e.g. "run addFlagSwitch") which are utility scripts.
    output_url = None
    fallback_url = None
    for step in job_data.get('steps', []):
        step_name = step.get('name', '')
        for action in step.get('actions', []):
            action_output_url = action.get('output_url')
            if not action_output_url:
                continue
            if re.match(r'run p\d+', step_name):
                output_url = action_output_url
                break
            elif step_name.startswith('run ') and not fallback_url:
                fallback_url = action_output_url
        if output_url:
            break
    if not output_url:
        output_url = fallback_url

    if not output_url:
        return {}

    try:
        resp = requests.get(output_url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        output_data = resp.json()
    except Exception as e:
        print(f"  Warning: Could not fetch step output for job {job_num}: {e}")
        return {}

    # Concatenate all output messages
    raw_output = ''
    for entry in output_data:
        msg = entry.get('message', '')
        raw_output += msg

    # Strip ANSI escape codes
    clean_output = ANSI_RE.sub('', raw_output)

    # Parse the runner summary table
    specs = {}
    for m in RUNNER_ROW_RE.finditer(clean_output):
        spec_path = m.group(1)
        specs[spec_path] = {
            'tests': int(m.group(2)),
            'passing': _parse_runner_count(m.group(3)),
            'failing': _parse_runner_count(m.group(4)),
            'pending': _parse_runner_count(m.group(5)),
            'skipped': _parse_runner_count(m.group(6)),
        }

    return specs


def get_report_spec_files(suite_ci_tests):
    """Return the set of spec file basenames present in extracted CI tests.

    Used to identify which spec files are covered by report.json so we can
    find specs that are missing (only in runner summary).
    """
    spec_files = set()
    for t in suite_ci_tests:
        f = t.get('file', '')
        if f:
            spec_files.add(f.split('/')[-1])
    return spec_files


def extract_it_title(match):
    """Extract and unescape test title from regex match."""
    title = (match.group(1) or match.group(2) or match.group(3) or '')
    return title.replace("\\'", "'").replace('\\"', '"').strip()


def normalize(title):
    """Normalize title for matching: lowercase, strip whitespace, strip C-ID prefix."""
    return STRIP_CID_RE.sub('', title.strip()).lower()


def _tokenize(s):
    """Split a string into lowercase alphanumeric tokens."""
    return set(re.findall(r'[a-z0-9]+', s.lower()))


def fuzzy_match(cypress_title, ci_candidates, threshold=0.6):
    """Find the best fuzzy match for a Cypress title among CI candidates."""
    norm_cy = normalize(cypress_title)
    best, best_score = None, 0

    for ci_test in ci_candidates:
        norm_ci = normalize(ci_test['title'])
        if norm_ci == norm_cy:
            continue
        if norm_cy in norm_ci or norm_ci in norm_cy:
            return ci_test, 0.95
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
    """Get all test files and tests from Cypress repo for this workflow."""
    folder = workflow_name_to_cypress_path(workflow_name)

    result = subprocess.run(
        ['gh', 'api', 'repos/styleseat/cypress/git/trees/master?recursive=1'],
        capture_output=True, text=True
    )
    tree = json.loads(result.stdout)
    test_files = [
        f['path'] for f in tree.get('tree', [])
        if f['path'].startswith(folder) and f['path'].endswith('.cy.js')
    ]

    tests_by_file = {}
    for file_path in test_files:
        result = subprocess.run(
            ['gh', 'api', f'repos/styleseat/cypress/contents/{file_path}',
             '--jq', '.content'],
            capture_output=True, text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            content = base64.b64decode(result.stdout.strip()).decode('utf-8', errors='ignore')
            tests = [extract_it_title(m) for m in re.finditer(IT_PATTERN, content)]
            tests = [STRIP_CID_RE.sub('', t) for t in tests if len(t) > 3 and not t.startswith('@')]
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
                'file': file_path,
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


def parse_workflow_url(url):
    """Extract the workflow ID from a CircleCI workflow URL.

    Accepts:
        Full URL:  https://app.circleci.com/pipelines/github/org/repo/123/workflows/<id>
        Short:     123/workflows/<id>
        Bare UUID: <id>
    """
    m = re.search(r'workflows/([0-9a-f-]{36})', url)
    if m:
        return m.group(1)
    # Check if the input itself is a bare UUID
    if re.match(r'^[0-9a-f-]{36}$', url.strip()):
        return url.strip()
    return None


def import_workflow(workflow_id):
    """Main import logic: fetch CircleCI results and create test runs."""
    # Step 1: Get CircleCI jobs
    response = requests.get(
        f'{BASE_URL}/workflow/{workflow_id}/job',
        headers=HEADERS, timeout=30
    )
    response.raise_for_status()
    jobs = response.json()

    all_jobs = jobs.get('items', [])
    print(f'Found {len(all_jobs)} jobs:')
    for job in all_jobs:
        print(f"  - Job {job.get('job_number', 'N/A')}: {job.get('name')} ({job.get('status')})")

    # Filter out hold gates and non-executed jobs
    executed_jobs = []
    skipped_jobs = []
    for job in all_jobs:
        name = job.get('name', '')
        status = job.get('status', '')
        if re.search(r'[-_]hold$', name, re.IGNORECASE):
            skipped_jobs.append(job)
            continue
        if status in EXECUTED_STATUSES:
            executed_jobs.append(job)
        else:
            skipped_jobs.append(job)

    if skipped_jobs:
        print(f"\nSkipped {len(skipped_jobs)} non-executed jobs:")
        for job in skipped_jobs:
            print(f"  - {job.get('name')} ({job.get('status')})")

    if not executed_jobs:
        print("\nNo executed jobs found in this workflow. Nothing to import.")
        return

    print(f"\nExecuted jobs: {len(executed_jobs)}")

    # Step 2: Group executed jobs by suite
    suite_jobs = {}
    for job in executed_jobs:
        name = job.get('name', '')
        # Strip rerun suffixes (e.g. _1_rerun, -2-rerun) then trailing job numbers
        wf_name = re.sub(r'[-_]\d*[-_]?rerun$', '', name, flags=re.IGNORECASE)
        wf_name = re.sub(r'[-_]\d+$', '', wf_name)
        wf_name = wf_name.replace('-', '_')
        suite_jobs.setdefault(wf_name, []).append(job)

    print(f"\nDetected {len(suite_jobs)} suite(s):")
    for wf_name, wf_jobs in suite_jobs.items():
        job_nums = [str(j.get('job_number', '?')) for j in wf_jobs]
        print(f"  - {wf_name}: {len(wf_jobs)} job(s) [{', '.join(job_nums)}]")

    # Step 3: Fetch workflow metadata
    wf_response = requests.get(
        f'{BASE_URL}/workflow/{workflow_id}',
        headers=HEADERS, timeout=30
    )
    wf_data = wf_response.json()
    wf_created = wf_data.get('created_at', '')
    if wf_created:
        wf_date = datetime.fromisoformat(wf_created.replace('Z', '+00:00'))
    else:
        wf_date = datetime.now(timezone.utc)
    run_date_str = wf_date.strftime('%a, %b %d, %Y')

    # Derive display name from the CircleCI workflow name
    wf_name_raw = wf_data.get('name', '')
    if wf_name_raw:
        # Strip scheduling/trigger prefixes (e.g. cronschedule_p1_pro → p1_pro)
        wf_name_clean = re.sub(
            r'^(?:cronschedule|nightly|scheduled)[-_]', '',
            wf_name_raw, flags=re.IGNORECASE
        )
        try:
            wf_display = cypress_path_to_name(
                workflow_name_to_cypress_path(wf_name_clean)
            )
        except Exception:
            wf_display = wf_name_clean
        variant = WORKFLOW_VARIANTS.get(wf_name_clean.lower())
        if variant:
            wf_display = f'{wf_display} ({variant})'
    else:
        wf_display = 'Workflow'

    # Step 4: Create single combined run and process all suites
    app = create_app()
    with app.app_context():
        project = Project.query.filter_by(name='Cypress Automation').first()
        if not project:
            print("ERROR: Project 'Cypress Automation' not found.")
            sys.exit(1)

        # Duplicate detection at workflow level
        existing_run = TestRun.query.filter(
            TestRun.project_id == project.id,
            TestRun.description.contains(workflow_id[:8])
        ).first()
        if existing_run:
            print(f"WARNING: Workflow {workflow_id[:8]} already imported as run "
                  f"'{existing_run.name}' (ID: {existing_run.id}). Aborting.")
            return

        # Create single combined run (suite_id=None)
        run_name = f'{wf_display} \u00b7 {run_date_str}'
        run_desc = f'Imported from CircleCI workflow {workflow_id[:8]}'
        run = TestRun(
            project_id=project.id, suite_id=None, name=run_name,
            description=run_desc, run_date=wf_date
        )
        db.session.add(run)
        db.session.flush()

        print(f"\nCreated combined run: {run.name} (ID: {run.id})")

        grand_totals = {'Passed': 0, 'Failed': 0, 'Blocked': 0, 'Untested': 0}
        suite_reports = []
        all_failed_jobs = []

        for wf_name, wf_jobs in suite_jobs.items():
            wf_job_numbers = [j.get('job_number') for j in wf_jobs]
            wf_job_info = {
                j.get('job_number'): {'name': j.get('name', ''), 'status': j.get('status', '')}
                for j in wf_jobs
            }

            print(f"\n{'=' * 60}")
            print(f"Processing suite: {wf_name}")
            print(f"{'=' * 60}")

            # Fetch artifacts and CI test results
            suite_ci_tests = []
            suite_job_artifacts = {}
            suite_failed_files = set()
            suite_failed_jobs = []

            for job_num in wf_job_numbers:
                artifacts_resp = requests.get(
                    f'{BASE_URL}/project/{PROJECT_SLUG}/{job_num}/artifacts',
                    headers=HEADERS, timeout=30
                ).json().get('items', [])

                suite_job_artifacts[job_num] = [
                    {'name': a.get('path', '').split('/')[-1],
                     'url': a.get('url'), 'path': a.get('path')}
                    for a in artifacts_resp
                    if '.png' in a.get('path', '') or '.mp4' in a.get('path', '')
                ]

                report_url = next(
                    (a.get('url') for a in artifacts_resp
                     if a.get('path', '').endswith('report.json')),
                    None
                )
                if report_url:
                    report = requests.get(report_url, headers=HEADERS, timeout=60).json()
                    tests = extract_ci_tests(report, job_num)
                    suite_ci_tests.extend(tests)
                    for t in tests:
                        if 'uncaught error' in t['title'].lower() and t.get('file'):
                            suite_failed_files.add(t['file'])
                    print(f"Job {job_num}: {len(tests)} tests")
                else:
                    ji = wf_job_info[job_num]
                    if ji['status'] in ('failed', 'error', 'infrastructure_fail', 'timedout'):
                        suite_failed_jobs.append(ji)
                        print(f"Job {job_num}: NO report.json (job {ji['status']})")
                    else:
                        print(f"Job {job_num}: no report.json (status: {ji['status']})")

            print(f"\nCircleCI: {len(suite_ci_tests)} tests  |  "
                  f"States: {dict(Counter(t['state'] for t in suite_ci_tests))}")

            if suite_failed_jobs:
                all_failed_jobs.extend(suite_failed_jobs)
                print(f"\nWARNING: {len(suite_failed_jobs)}/{len(wf_job_numbers)} "
                      f"job(s) failed without producing test results:")
                for fj in suite_failed_jobs:
                    print(f"  - {fj['name']} ({fj['status']})")
                print("  Tests from these jobs will be marked as Untested.")

            if suite_failed_files:
                print(f"Files that failed to load: {len(suite_failed_files)}")
                for f in suite_failed_files:
                    print(f"  - {f}")

            # Fetch runner summary from step output (v1.1 API) to find
            # specs that ran but are missing from report.json
            runner_summary = {}
            for job_num in wf_job_numbers:
                job_summary = get_runner_summary(job_num)
                if job_summary:
                    runner_summary.update(job_summary)

            report_spec_files = get_report_spec_files(suite_ci_tests)
            missing_specs = {}
            if runner_summary:
                for spec_path, counts in runner_summary.items():
                    spec_basename = spec_path.split('/')[-1]
                    if spec_basename not in report_spec_files:
                        missing_specs[spec_path] = counts

                if missing_specs:
                    total_missing_tests = sum(c['tests'] for c in missing_specs.values())
                    print(f"\nRunner summary: {len(runner_summary)} specs total, "
                          f"{len(missing_specs)} missing from report.json "
                          f"({total_missing_tests} tests)")
                    for spec, counts in missing_specs.items():
                        print(f"  - {spec}: {counts['tests']} tests "
                              f"({counts['passing']}P {counts['failing']}F "
                              f"{counts['pending']}Pend {counts['skipped']}S)")
                else:
                    print(f"\nRunner summary: {len(runner_summary)} specs, "
                          f"all covered by report.json")
            else:
                print("\nRunner summary: not available (v1.1 API)")

            # Build CircleCI lookups — file-aware to handle same-title tests
            # across different files (e.g. serviceInfoPageDesktop vs Mobile)
            ci_by_title = {}       # norm_title → ci_test (last wins, fallback only)
            ci_by_file = {}        # file_path → [ci_test, ...]
            ci_by_file_title = {}  # (filename, norm_title) → ci_test
            for t in suite_ci_tests:
                t['matched_artifacts'] = match_artifacts(
                    t['title'], suite_job_artifacts.get(t['job_num'], [])
                )
                norm_t = normalize(t['title'])
                ci_by_title[norm_t] = t
                if t.get('file'):
                    ci_by_file.setdefault(t['file'], []).append(t)
                    # Index by (filename, title) for file-aware exact matching
                    file_suffix = t['file'].split('/')[-1]
                    ci_by_file_title[(file_suffix, norm_t)] = t

            # Fetch Cypress tests (source of truth)
            print(f"\nFetching Cypress tests for {wf_name}...")
            cypress_tests = get_cypress_tests_for_workflow(wf_name)
            total_cypress = sum(len(info['tests']) for info in cypress_tests.values())
            print(f"Cypress: {total_cypress} tests in {len(cypress_tests)} files")

            # Resolve suite in DB
            cypress_path = workflow_name_to_cypress_path(wf_name)
            suite_name = cypress_path_to_name(cypress_path)

            suite = Suite.query.filter_by(
                project_id=project.id, cypress_path=cypress_path
            ).first()
            if not suite:
                suite = Suite(
                    project_id=project.id, name=suite_name,
                    cypress_path=cypress_path,
                    description='Auto-created from CircleCI import'
                )
                db.session.add(suite)
                db.session.flush()
                print(f"Created suite: {suite_name} ({cypress_path})")

            print(f"\nSuite: {suite.name} (ID: {suite.id})")

            # Build section-aware case index: (section_id, norm_title) → case
            # Plus a secondary title-only index for fallback
            all_suite_cases = TestCase.query.filter_by(suite_id=suite.id).all()
            existing_cases_by_section = {}  # (section_id, norm_title) → case
            existing_cases_by_title = {}    # norm_title → case (first match only, for fallback)
            for c in all_suite_cases:
                norm_t = normalize(c.title)
                existing_cases_by_section[(c.section_id, norm_t)] = c
                if norm_t not in existing_cases_by_title:
                    existing_cases_by_title[norm_t] = c

            # Cache existing sections by name for quick lookup
            existing_sections = {s.name: s for s in Section.query.filter_by(suite_id=suite.id).all()}

            results_created = {'Passed': 0, 'Failed': 0, 'Blocked': 0, 'Untested': 0}
            blocked_tests, untested_tests, failed_tests = [], [], []
            runner_only_tests = []  # tests from specs in runner summary but not in report.json
            fuzzy_matched_tests = []
            matched_ci_ids = set()     # track matched CI tests by object id
            cases_with_results = set()  # case IDs that already have a result

            # Phase 1: Cypress tests (source of truth)
            for file_path, file_info in cypress_tests.items():
                tests = file_info['tests']
                describe_title = file_info.get('describe')
                is_blocked_file = file_path in suite_failed_files

                # Check if this file's spec is in the runner summary but
                # missing from report.json (ran but mochawesome didn't capture)
                filename = file_path.split('/')[-1]
                runner_spec_counts = None
                if not is_blocked_file:
                    for spec_path, counts in missing_specs.items():
                        if spec_path.endswith('/' + filename) or spec_path == filename:
                            runner_spec_counts = counts
                            break

                # Resolve the section for this file (mirrors sync_cypress.py logic)
                old_section_name = filename.replace('.cy.js', '')
                section_name = describe_title if describe_title else old_section_name

                # Find existing section by describe title or filename
                section = existing_sections.get(section_name) or existing_sections.get(old_section_name)
                if not section:
                    # Create section in the correct suite
                    section = Section(
                        suite_id=suite.id, name=section_name,
                        display_order=len(existing_sections)
                    )
                    db.session.add(section)
                    db.session.flush()
                    existing_sections[section_name] = section

                for title in tests:
                    norm = normalize(title)
                    preconditions_text = f'Source: {file_path}'
                    if describe_title:
                        preconditions_text += f'\nDescribe: {describe_title}'

                    # Primary: match by (section_id, title) — section-aware
                    case = existing_cases_by_section.get((section.id, norm))
                    if not case:
                        # Fallback: title-only match (for cases not yet synced to correct section)
                        case = existing_cases_by_title.get(norm)
                        # Only use fallback if the case isn't already claimed by another file
                        if case and case.id in cases_with_results:
                            case = None  # Another file already claimed this case
                    if not case:
                        case = TestCase(
                            suite_id=suite.id, section_id=section.id,
                            title=title, case_type='Regression',
                            priority='Medium',
                            preconditions=preconditions_text, created_by=None
                        )
                        db.session.add(case)
                        db.session.flush()
                        existing_cases_by_section[(section.id, norm)] = case
                        existing_cases_by_title.setdefault(norm, case)
                    else:
                        if case.preconditions != preconditions_text:
                            case.preconditions = preconditions_text

                    ci_test = None
                    if is_blocked_file:
                        status = 'Blocked'
                        error_msg = (f"File failed to load: {file_path}\n\n"
                                     f"All tests blocked due to syntax/import error.")
                        artifacts_json = None
                        blocked_tests.append(title)
                    elif runner_spec_counts:
                        # Spec ran (per runner summary) but mochawesome didn't
                        # capture results — mark as Untested with summary counts
                        c = runner_spec_counts
                        status = 'Untested'
                        error_msg = (
                            f"Spec ran but mochawesome report not generated.\n"
                            f"Runner summary: {c['tests']} tests "
                            f"({c['passing']} passed, {c['failing']} failed, "
                            f"{c['pending']} pending)\n"
                            f"Source: {filename}"
                        )
                        artifacts_json = None
                        runner_only_tests.append(title)
                    else:
                        # 1. File-specific exact match (handles same-title-different-file)
                        cy_filename = file_path.split('/')[-1]
                        ft = ci_by_file_title.get((cy_filename, norm))
                        if ft and id(ft) not in matched_ci_ids:
                            ci_test = ft

                        # 2. Title-only fallback (any file)
                        if not ci_test:
                            ft = ci_by_title.get(norm)
                            if ft and id(ft) not in matched_ci_ids:
                                ci_test = ft

                        # 3. Fuzzy match within same file's CI tests
                        if not ci_test:
                            candidates = ci_by_file.get(file_path, [])
                            if not candidates:
                                for ci_file_key in ci_by_file:
                                    if ci_file_key.endswith('/' + cy_filename):
                                        candidates = ci_by_file[ci_file_key]
                                        break
                            if candidates:
                                match, score = fuzzy_match(
                                    title,
                                    [c for c in candidates
                                     if id(c) not in matched_ci_ids]
                                )
                                if match:
                                    ci_test = match
                                    fuzzy_matched_tests.append(
                                        (title, match['title'], score))

                    if ci_test and not is_blocked_file and not runner_spec_counts:
                        status = {
                            'passed': 'Passed', 'failed': 'Failed', 'pending': 'Blocked'
                        }.get(ci_test['state'], 'Untested')
                        err = ci_test.get('err', {})
                        error_msg = None
                        if isinstance(err, dict) and err:
                            error_msg = (err.get('message', '') + '\n\n' +
                                         err.get('stack', '')[:500])
                        artifacts_json = None
                        if (status == 'Failed' and ci_test.get('matched_artifacts')):
                            artifacts_json = json.dumps(
                                ci_test['matched_artifacts'][:5]
                            )
                        matched_ci_ids.add(id(ci_test))
                        if status == 'Failed':
                            failed_tests.append(title)
                    elif not is_blocked_file and not runner_spec_counts:
                        status = 'Untested'
                        if suite_failed_jobs:
                            error_msg = (
                                f"Test not found in CircleCI results — "
                                f"{len(suite_failed_jobs)} job(s) failed without "
                                f"producing results.\nSource: {file_path}"
                            )
                        else:
                            error_msg = (f"Test not found in CircleCI results.\n"
                                         f"Source: {file_path}")
                        artifacts_json = None
                        untested_tests.append(title)

                    result = TestResult(
                        run_id=run.id, case_id=case.id, status=status,
                        error_message=error_msg, artifacts=artifacts_json,
                        tested_at=(datetime.now(timezone.utc)
                                   if status != 'Untested' else None),
                        tested_by=None
                    )
                    db.session.add(result)
                    db.session.flush()
                    db.session.add(ResultHistory(
                        result_id=result.id, status=status,
                        error_message=error_msg, artifacts=artifacts_json,
                        changed_by=None
                    ))
                    results_created[status] += 1
                    cases_with_results.add(case.id)

            # Phase 2: CircleCI-only tests
            unmatched_ci = [
                t for t in suite_ci_tests
                if id(t) not in matched_ci_ids
                and 'uncaught error' not in t['title'].lower()
            ]

            if unmatched_ci:
                print(f"\nPhase 2: Adding {len(unmatched_ci)} CircleCI-only tests...")
                section = Section.query.filter_by(
                    suite_id=suite.id, name='CircleCI Only'
                ).first()
                if not section:
                    section = Section(
                        suite_id=suite.id, name='CircleCI Only',
                        display_order=9998
                    )
                    db.session.add(section)
                    db.session.flush()

                for ci_test in unmatched_ci:
                    title = ci_test['title']
                    norm = normalize(title)
                    ci_file = ci_test.get('file', '')
                    preconditions_ci = (
                        f'Source: CircleCI (no Cypress match)\nFile: {ci_file}'
                        if ci_file else 'Source: CircleCI (no Cypress match)'
                    )
                    # Look up by (CircleCI Only section, title) first, then title-only fallback
                    case = existing_cases_by_section.get((section.id, norm))
                    if not case:
                        case = existing_cases_by_title.get(norm)
                    # If Phase 1 already created a result for this case, this is
                    # a different execution (e.g. desktop vs mobile variant) —
                    # create a separate case instead of skipping
                    if case and case.id in cases_with_results:
                        case = None
                    if not case:
                        case = TestCase(
                            suite_id=suite.id, section_id=section.id,
                            title=title, case_type='Regression',
                            priority='Medium',
                            preconditions=preconditions_ci,
                            created_by=None
                        )
                        db.session.add(case)
                        db.session.flush()

                    status = {
                        'passed': 'Passed', 'failed': 'Failed', 'pending': 'Blocked'
                    }.get(ci_test['state'], 'Untested')
                    err = ci_test.get('err', {})
                    error_msg = None
                    if isinstance(err, dict) and err:
                        error_msg = (err.get('message', '') + '\n\n' +
                                     err.get('stack', '')[:500])
                    artifacts_json = None
                    if status == 'Failed' and ci_test.get('matched_artifacts'):
                        artifacts_json = json.dumps(
                            ci_test['matched_artifacts'][:5]
                        )
                    if status == 'Failed':
                        failed_tests.append(title)

                    result = TestResult(
                        run_id=run.id, case_id=case.id, status=status,
                        error_message=error_msg, artifacts=artifacts_json,
                        tested_at=datetime.now(timezone.utc), tested_by=None
                    )
                    db.session.add(result)
                    db.session.flush()
                    db.session.add(ResultHistory(
                        result_id=result.id, status=status,
                        error_message=error_msg, artifacts=artifacts_json,
                        changed_by=None
                    ))
                    results_created[status] += 1

            # Per-suite report
            total = sum(results_created.values())
            print(f"\n  Suite: {suite.name}")
            print(f"  Passed:   {results_created['Passed']}")
            print(f"  Failed:   {results_created['Failed']}")
            print(f"  Blocked:  {results_created['Blocked']}")
            print(f"  Untested: {results_created['Untested']}")
            print(f"  Total:    {total}")
            print(f"  Phase 1 (Cypress):       {total - len(unmatched_ci)} results")
            print(f"  Phase 2 (CircleCI-only): {len(unmatched_ci)} results")

            if failed_tests:
                print(f"\n  Failed ({len(failed_tests)}):")
                for t in failed_tests:
                    print(f"    - {t[:80]}")

            if blocked_tests:
                print(f"\n  Blocked ({len(blocked_tests)}) - file failed to load:")
                for t in blocked_tests[:5]:
                    print(f"    - {t[:80]}")
                if len(blocked_tests) > 5:
                    print(f"    ... and {len(blocked_tests) - 5} more")

            if runner_only_tests:
                print(f"\n  Runner-only ({len(runner_only_tests)}) - "
                      f"spec ran but mochawesome report missing:")
                for t in runner_only_tests[:10]:
                    print(f"    - {t[:80]}")
                if len(runner_only_tests) > 10:
                    print(f"    ... and {len(runner_only_tests) - 10} more")
                if missing_specs:
                    print(f"  Supplemented specs:")
                    for spec, counts in missing_specs.items():
                        print(f"    - {spec}: {counts['tests']} tests "
                              f"({counts['passing']}P {counts['failing']}F "
                              f"{counts['pending']}Pend)")

            if untested_tests:
                print(f"\n  Untested ({len(untested_tests)}) - in Cypress but not in CircleCI:")
                for t in untested_tests:
                    print(f"    - {t[:80]}")

            if fuzzy_matched_tests:
                print(f"\n  Fuzzy matched ({len(fuzzy_matched_tests)}) - "
                      f"matched by file path + similarity:")
                for cy_title, ci_title, score in fuzzy_matched_tests:
                    print(f"    - [{score:.0%}] '{cy_title[:40]}' <-> '{ci_title[:40]}'")

            if unmatched_ci:
                print(f"\n  CircleCI-only ({len(unmatched_ci)}) - "
                      f"ran in CI but not in Cypress repo:")
                for t in unmatched_ci:
                    print(f"    - [{t['state']}] {t['title'][:80]}")

            for status_key, count in results_created.items():
                grand_totals[status_key] += count

            suite_reports.append({
                'suite_name': suite.name,
                'results': dict(results_created),
                'total': total,
                'failed_jobs': list(suite_failed_jobs),
                'job_count': len(wf_job_numbers),
                'runner_only_count': len(runner_only_tests),
                'missing_specs': dict(missing_specs),
            })

        # Update run description with failed job info
        if all_failed_jobs:
            failed_names = ', '.join(fj['name'] for fj in all_failed_jobs)
            run.description += (f'\nWARNING: {len(all_failed_jobs)} '
                                f'job(s) failed without results: {failed_names}')

        # Note runner-supplemented specs in run description
        all_missing_specs = {}
        for sr in suite_reports:
            all_missing_specs.update(sr.get('missing_specs', {}))
        if all_missing_specs:
            spec_names = ', '.join(s.split('/')[-1] for s in all_missing_specs)
            run.description += (
                f'\nSupplemented from runner summary: {spec_names}'
            )

        db.session.commit()

        # Final Report
        print(f"\n{'=' * 60}")
        print(f"IMPORT COMPLETE - 1 combined run with {len(suite_reports)} suite(s)")
        print(f"Run: {run.name} (ID: {run.id})")
        print(f"{'=' * 60}")

        total_runner_only = 0
        for sr in suite_reports:
            has_failed = sr['failed_jobs']
            runner_note = ''
            if sr.get('runner_only_count'):
                runner_note = f' +{sr["runner_only_count"]} from runner'
                total_runner_only += sr['runner_only_count']
            flag = ' WARNING' if has_failed else ''
            print(f"  {sr['suite_name']}: {sr['total']} results "
                  f"(P:{sr['results']['Passed']} F:{sr['results']['Failed']} "
                  f"B:{sr['results']['Blocked']} U:{sr['results']['Untested']})"
                  f"{runner_note}{flag}")

        grand_total = sum(grand_totals.values())
        print(f"\n  Grand total: {grand_total}")
        print(f"    Passed:   {grand_totals['Passed']}")
        print(f"    Failed:   {grand_totals['Failed']}")
        print(f"    Blocked:  {grand_totals['Blocked']}")
        print(f"    Untested: {grand_totals['Untested']}")

        if total_runner_only:
            print(f"\n  Runner summary supplemented: {total_runner_only} tests "
                  f"from specs missing in report.json")


def main():
    if len(sys.argv) < 2:
        print("Usage: python import_circleci.py <workflow-ref>")
        print("\nAccepted formats:")
        print("  python import_circleci.py 61253/workflows/e2d6bec1-40e3-4813-9721-9d31a106977a")
        print("  python import_circleci.py https://app.circleci.com/pipelines/github/styleseat/cypress/61253/workflows/e2d6bec1-40e3-4813-9721-9d31a106977a")
        print("  python import_circleci.py e2d6bec1-40e3-4813-9721-9d31a106977a")
        sys.exit(1)

    url = sys.argv[1]
    workflow_id = parse_workflow_url(url)
    if not workflow_id:
        print(f"ERROR: Could not extract workflow ID from: {url}")
        print("Expected: <pipeline>/workflows/<uuid>, full URL, or bare UUID")
        sys.exit(1)

    print(f"Workflow ID: {workflow_id}")
    print(f"{'=' * 60}\n")
    import_workflow(workflow_id)


if __name__ == '__main__':
    main()
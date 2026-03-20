#!/usr/bin/env python3
"""Import test results from a CircleCI workflow URL into Regression Guard.

Usage:
    python import_circleci.py <workflow-url>

Example:
    python import_circleci.py https://app.circleci.com/pipelines/github/styleseat/cypress/61253/workflows/e2d6bec1-40e3-4813-9721-9d31a106977a
"""
import sys
import re
import json
import base64
import subprocess
import requests
from datetime import datetime, timezone
from collections import Counter

from app import create_app, db
from app.models import (
    TestRun, TestResult, TestCase, Suite, Section, Project, ResultHistory
)
from app.suite_utils import workflow_name_to_cypress_path, cypress_path_to_name

TOKEN = 'REDACTED_CIRCLECI_TOKEN'
PROJECT_SLUG = 'gh/styleseat/cypress'
BASE_URL = 'https://circleci.com/api/v2'

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

    Accepts full URLs like:
        https://app.circleci.com/pipelines/github/org/repo/123/workflows/<id>
    Or bare workflow IDs.
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
        wf_name = re.sub(r'[-_]\d+$', '', name)
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

    # Step 4: Per-suite processing
    app = create_app()
    with app.app_context():
        project = Project.query.filter_by(name='Cypress Automation').first()
        if not project:
            print("ERROR: Project 'Cypress Automation' not found.")
            sys.exit(1)

        suite_reports = []

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
                print(f"\nWARNING: {len(suite_failed_jobs)}/{len(wf_job_numbers)} "
                      f"job(s) failed without producing test results:")
                for fj in suite_failed_jobs:
                    print(f"  - {fj['name']} ({fj['status']})")
                print("  Tests from these jobs will be marked as Untested.")

            if suite_failed_files:
                print(f"Files that failed to load: {len(suite_failed_files)}")
                for f in suite_failed_files:
                    print(f"  - {f}")

            # Build CircleCI lookups
            ci_by_title = {}
            ci_by_file = {}
            for t in suite_ci_tests:
                t['matched_artifacts'] = match_artifacts(
                    t['title'], suite_job_artifacts.get(t['job_num'], [])
                )
                ci_by_title[normalize(t['title'])] = t
                if t.get('file'):
                    ci_by_file.setdefault(t['file'], []).append(t)

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

            # Duplicate detection
            existing_run = TestRun.query.filter(
                TestRun.suite_id == suite.id,
                TestRun.description.contains(workflow_id[:8])
            ).first()
            if existing_run:
                print(f"WARNING: Workflow {workflow_id[:8]} already imported as run "
                      f"'{existing_run.name}' (ID: {existing_run.id}). Skipping this suite.")
                continue

            existing_cases = {
                normalize(c.title): c
                for c in TestCase.query.filter_by(suite_id=suite.id).all()
            }

            # Determine run name
            variant_label = WORKFLOW_VARIANTS.get(wf_name.lower())
            if variant_label:
                run_name = f'{suite_name} ({variant_label}) \u00b7 {run_date_str}'
            else:
                run_name = f'{suite_name} \u00b7 {run_date_str}'

            run_desc = f'Imported from CircleCI workflow {workflow_id[:8]}'
            if suite_failed_jobs:
                failed_names = ', '.join(fj['name'] for fj in suite_failed_jobs)
                run_desc += (f'\nWARNING: {len(suite_failed_jobs)}/{len(wf_job_numbers)} '
                             f'job(s) failed without results: {failed_names}')

            run = TestRun(
                project_id=project.id, suite_id=suite.id, name=run_name,
                description=run_desc, run_date=wf_date
            )
            db.session.add(run)
            db.session.flush()

            results_created = {'Passed': 0, 'Failed': 0, 'Blocked': 0, 'Untested': 0}
            blocked_tests, untested_tests, failed_tests = [], [], []
            fuzzy_matched_tests = []
            matched_ci_titles = set()

            # Phase 1: Cypress tests (source of truth)
            for file_path, file_info in cypress_tests.items():
                tests = file_info['tests']
                describe_title = file_info.get('describe')
                is_blocked_file = file_path in suite_failed_files

                for title in tests:
                    norm = normalize(title)
                    preconditions_text = f'Source: {file_path}'
                    if describe_title:
                        preconditions_text += f'\nDescribe: {describe_title}'

                    case = existing_cases.get(norm)
                    if not case:
                        section = Section.query.filter_by(
                            suite_id=suite.id, name='Cypress Tests'
                        ).first()
                        if not section:
                            section = Section(
                                suite_id=suite.id, name='Cypress Tests',
                                display_order=9999
                            )
                            db.session.add(section)
                            db.session.flush()
                        case = TestCase(
                            suite_id=suite.id, section_id=section.id,
                            title=title, case_type='Regression',
                            priority='Medium',
                            preconditions=preconditions_text, created_by=1
                        )
                        db.session.add(case)
                        db.session.flush()
                        existing_cases[norm] = case
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
                    elif norm in ci_by_title:
                        ci_test = ci_by_title[norm]
                    else:
                        candidates = ci_by_file.get(file_path, [])
                        if not candidates:
                            for ci_file_key in ci_by_file:
                                if ci_file_key.endswith('/' + file_path.split('/')[-1]):
                                    candidates = ci_by_file[ci_file_key]
                                    break
                        if candidates:
                            match, score = fuzzy_match(
                                title,
                                [c for c in candidates
                                 if normalize(c['title']) not in matched_ci_titles]
                            )
                            if match:
                                ci_test = match
                                fuzzy_matched_tests.append((title, match['title'], score))

                    if ci_test and not is_blocked_file:
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
                        matched_ci_titles.add(normalize(ci_test['title']))
                        if status == 'Failed':
                            failed_tests.append(title)
                    elif not is_blocked_file:
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
                        tested_by=1 if status != 'Untested' else None
                    )
                    db.session.add(result)
                    db.session.flush()
                    db.session.add(ResultHistory(
                        result_id=result.id, status=status,
                        error_message=error_msg, artifacts=artifacts_json,
                        changed_by=1
                    ))
                    results_created[status] += 1

            # Phase 2: CircleCI-only tests
            unmatched_ci = [
                t for t in suite_ci_tests
                if normalize(t['title']) not in matched_ci_titles
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
                    case = existing_cases.get(norm)
                    if not case:
                        case = TestCase(
                            suite_id=suite.id, section_id=section.id,
                            title=title, case_type='Regression',
                            priority='Medium',
                            preconditions='Source: CircleCI (no Cypress match)',
                            created_by=1
                        )
                        db.session.add(case)
                        db.session.flush()
                        existing_cases[norm] = case

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
                        tested_at=datetime.now(timezone.utc), tested_by=1
                    )
                    db.session.add(result)
                    db.session.flush()
                    db.session.add(ResultHistory(
                        result_id=result.id, status=status,
                        error_message=error_msg, artifacts=artifacts_json,
                        changed_by=1
                    ))
                    results_created[status] += 1

            db.session.commit()

            # Per-suite report
            total = sum(results_created.values())
            print(f"\n  Run: {run.name}")
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

            suite_reports.append({
                'run_name': run.name,
                'suite_name': suite.name,
                'results': dict(results_created),
                'total': total,
                'failed_jobs': list(suite_failed_jobs),
                'job_count': len(wf_job_numbers),
            })

        # Final Report (all suites)
        print(f"\n{'=' * 60}")
        print(f"IMPORT COMPLETE - {len(suite_reports)} suite(s)")
        print(f"{'=' * 60}")

        grand_totals = {'Passed': 0, 'Failed': 0, 'Blocked': 0, 'Untested': 0}
        for sr in suite_reports:
            for status, count in sr['results'].items():
                grand_totals[status] = grand_totals.get(status, 0) + count
            has_failed = sr['failed_jobs']
            flag = ' WARNING' if has_failed else ''
            print(f"  {sr['run_name']}: {sr['total']} results "
                  f"(P:{sr['results']['Passed']} F:{sr['results']['Failed']} "
                  f"B:{sr['results']['Blocked']} U:{sr['results']['Untested']}){flag}")

        grand_total = sum(grand_totals.values())
        if len(suite_reports) > 1:
            print(f"\n  Grand total: {grand_total}")
            print(f"    Passed:   {grand_totals['Passed']}")
            print(f"    Failed:   {grand_totals['Failed']}")
            print(f"    Blocked:  {grand_totals['Blocked']}")
            print(f"    Untested: {grand_totals['Untested']}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python import_circleci.py <circleci-workflow-url>")
        print("\nExample:")
        print("  python import_circleci.py https://app.circleci.com/pipelines/"
              "github/styleseat/cypress/61253/workflows/"
              "e2d6bec1-40e3-4813-9721-9d31a106977a")
        sys.exit(1)

    url = sys.argv[1]
    workflow_id = parse_workflow_url(url)
    if not workflow_id:
        print(f"ERROR: Could not extract workflow ID from: {url}")
        print("Expected format: https://app.circleci.com/pipelines/github/"
              "org/repo/N/workflows/<uuid>")
        sys.exit(1)

    print(f"Workflow ID: {workflow_id}")
    print(f"{'=' * 60}\n")
    import_workflow(workflow_id)


if __name__ == '__main__':
    main()
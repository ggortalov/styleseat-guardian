#!/usr/bin/env python3
"""Sync test cases from the StyleSeat Cypress repository into Regression Guard.

Usage:
    python sync_cypress.py

The Cypress repo (styleseat/cypress) is the source of truth for test definitions.
This script fetches all .cy.js files, extracts test titles, and syncs them into the database.
"""
import sys
import re
import json
import time
import base64
import subprocess
from collections import defaultdict

from app import create_app, db
from app.models import Suite, Section, TestCase, Project, SyncLog, SyncBaseline
from app.suite_utils import determine_cypress_path, cypress_path_to_name

# Regex to extract TestRail ID prefix (e.g. "C5412853" from "C5412853 Validate Email...")
TESTRAIL_ID_RE = re.compile(r'^(C\d+)\s')
# Regex to strip one or more C-ID or CXXXX placeholder prefixes from display titles
STRIP_CID_RE = re.compile(r'^(?:C(?:\d+|X+\d+)\s+)+')

# Cypress paths to skip during sync (not relevant for test management)
EXCLUDED_PATHS = {
    'cypress/e2e/manual/',
    'cypress/e2e/utility/',
    'cypress/e2e/utility_lifecycle/',
    'cypress/e2e/weekly/',
}

# Regex patterns for extracting test and describe titles
IT_PATTERN = (
    r'\bit(?:Stage|\.only|\.skip)?\s*\(\s*'
    r'(?:\[[^\]]*\]\s*,\s*)?'
    r'(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`((?:[^`\\]|\\.)*)`)'
)

DESCRIBE_PATTERN = (
    r'describe(?:\.only|\.skip)?\s*\(\s*'
    r'(?:\[[^\]]*\]\s*,\s*)?'
    r'(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'|`((?:[^`\\]|\\.)*)`)'
)


def get_repo_tree():
    """Get all .cy.js files from cypress/e2e directory via GitHub API."""
    result = subprocess.run(
        ['gh', 'api', 'repos/styleseat/cypress/git/trees/master?recursive=1'],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"ERROR: Failed to fetch repo tree: {result.stderr}")
        sys.exit(1)
    tree = json.loads(result.stdout)
    return [f for f in tree.get('tree', [])
            if f['path'].startswith('cypress/e2e/') and f['path'].endswith('.cy.js')]


def get_file_content(sha, path, retries=3):
    """Fetch file content from GitHub using the blob API (reliable for all file sizes)."""
    for attempt in range(retries):
        result = subprocess.run(
            ['gh', 'api', f'repos/styleseat/cypress/git/blobs/{sha}', '--jq', '.content'],
            capture_output=True, text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            return base64.b64decode(result.stdout.strip()).decode('utf-8', errors='ignore')
        if attempt < retries - 1:
            time.sleep(1 * (attempt + 1))
    print(f"  WARNING: Failed to fetch {path} after {retries} attempts")
    return None


def extract_title(match):
    """Extract and unescape a title from a regex match."""
    title = (match.group(1) or match.group(2) or match.group(3) or '')
    return title.replace("\\'", "'").replace('\\"', '"').strip()


def extract_tests(content):
    """Extract it() test titles from Cypress file content."""
    tests = [extract_title(m) for m in re.finditer(IT_PATTERN, content)]
    return [t for t in tests if len(t) > 3 and not t.startswith('@')]


def extract_describe(content):
    """Extract first describe() block title for section naming."""
    match = re.search(DESCRIBE_PATTERN, content)
    if match:
        return extract_title(match)
    return None


def main():
    app = create_app()
    with app.app_context():
        db.create_all()  # Ensure new tables (e.g. sync_baselines) exist
        project = Project.query.filter_by(name='Cypress Automation').first()
        if not project:
            print("ERROR: 'Cypress Automation' project not found. Run 'npm run demo' first.")
            sys.exit(1)

        print("Fetching test files from Cypress repo...")
        files = get_repo_tree()
        print(f"Found {len(files)} test files")

        # Group files by cypress_path (suite), skipping excluded paths
        suite_files = defaultdict(list)
        skipped = 0
        for f in files:
            cp = determine_cypress_path(f['path'])
            if cp in EXCLUDED_PATHS:
                skipped += 1
                continue
            suite_files[cp].append((f['path'], f['sha']))

        print(f"Suites detected: {len(suite_files)} (skipped {skipped} files from excluded paths)")

        total_tests = 0
        total_new = 0
        total_orphaned = 0
        new_case_names = []  # Track names of newly created cases

        for cypress_path, file_entries in sorted(suite_files.items()):
            suite_name = cypress_path_to_name(cypress_path)
            print(f"\n=== {suite_name} ({len(file_entries)} files) ===")

            # Find or create suite
            suite = Suite.query.filter_by(project_id=project.id, cypress_path=cypress_path).first()
            if not suite:
                suite = Suite(project_id=project.id, name=suite_name, cypress_path=cypress_path,
                              description='Synced from Cypress repo')
                db.session.add(suite)
                db.session.flush()
                print(f"  Created suite: {suite_name} ({cypress_path})")

            # Cache existing sections and cases
            # Primary key: (section_id, title_lower) — file-aware dedup
            # Secondary key: title_lower → [list of cases] — fallback for TestRail ID migrations
            existing_sections = {s.name: s for s in Section.query.filter_by(suite_id=suite.id).all()}
            all_cases = TestCase.query.filter_by(suite_id=suite.id).all()
            existing_cases_by_section = {}  # (section_id, title_lower) → case
            existing_cases_by_title = defaultdict(list)  # title_lower → [case, ...]
            for c in all_cases:
                existing_cases_by_section[(c.section_id, c.title.lower())] = c
                existing_cases_by_title[c.title.lower()].append(c)
            existing_by_testrail_id = {}
            for c in all_cases:
                m = TESTRAIL_ID_RE.match(c.title)
                if m:
                    existing_by_testrail_id[m.group(1)] = c

            # Track which case IDs were visited during this sync
            visited_case_ids = set()

            suite_tests = 0
            suite_new = 0
            files_fetched = 0

            for file_path, file_sha in file_entries:
                content = get_file_content(file_sha, file_path)
                if not content:
                    continue

                files_fetched += 1
                tests = extract_tests(content)
                if not tests:
                    continue

                # Section name from describe() title, fallback to filename
                describe_title = extract_describe(content)
                filename = file_path.split('/')[-1]
                old_section_name = filename.replace('.cy.js', '')
                section_name = describe_title if describe_title else old_section_name

                # Rename existing section if it used the old filename-based name
                if old_section_name in existing_sections and section_name != old_section_name:
                    section = existing_sections[old_section_name]
                    section.name = section_name
                    existing_sections[section_name] = section
                    del existing_sections[old_section_name]
                elif section_name not in existing_sections:
                    section = Section(suite_id=suite.id, name=section_name,
                                     display_order=len(existing_sections))
                    db.session.add(section)
                    db.session.flush()
                    existing_sections[section_name] = section
                else:
                    section = existing_sections[section_name]

                preconditions_text = f'File: {filename}'

                for title in tests:
                    title_lower = title.lower()
                    suite_tests += 1

                    # Match by exact title (raw or stripped) first, then fall back to TestRail ID
                    display_title = STRIP_CID_RE.sub('', title)
                    display_lower = display_title.lower()

                    # Primary: match by (section_id, title) — section-aware dedup
                    case = (existing_cases_by_section.get((section.id, title_lower)) or
                            existing_cases_by_section.get((section.id, display_lower)))

                    if not case:
                        # Secondary: try TestRail ID match (cross-section, for migrations only)
                        m = TESTRAIL_ID_RE.match(title)
                        if m:
                            case = existing_by_testrail_id.get(m.group(1))
                            # Only use the TestRail match if it's in THIS section,
                            # or if there's no same-titled case in another section
                            # (i.e., it's a genuine migration, not a cross-file duplicate)
                            if case and case.section_id != section.id:
                                # Check if another section already owns a case with this title
                                same_title_cases = existing_cases_by_title.get(display_lower, [])
                                if any(c.section_id == section.id for c in same_title_cases):
                                    case = None  # There's already one in this section

                    if case:
                        # Update existing case (strip C-ID prefix from stored title)
                        if case.title != display_title:
                            case.title = display_title
                        if case.preconditions != preconditions_text:
                            case.preconditions = preconditions_text
                        if case.section_id != section.id:
                            case.section_id = section.id
                    else:
                        case = TestCase(
                            suite_id=suite.id,
                            section_id=section.id,
                            title=display_title,
                            case_type='Regression',
                            priority='Medium',
                            preconditions=preconditions_text,
                            created_by=None
                        )
                        db.session.add(case)
                        db.session.flush()
                        suite_new += 1
                        new_case_names.append(f"{suite_name} > {section_name} > {display_title}")

                    visited_case_ids.add(case.id)

                    # Index by (section, title) for dedup within this sync run
                    existing_cases_by_section[(section.id, title_lower)] = case
                    existing_cases_by_section[(section.id, display_lower)] = case
                    existing_cases_by_title[display_lower].append(case)
                    testrail_m = TESTRAIL_ID_RE.match(title)
                    if testrail_m:
                        existing_by_testrail_id[testrail_m.group(1)] = case

            # Remove orphaned cases only if we successfully fetched most files
            # (protects against API rate limits or network failures wiping the DB)
            if files_fetched >= len(file_entries) * 0.5:
                orphan_cases = [c for c in all_cases if c.id not in visited_case_ids]
                if orphan_cases:
                    for c in orphan_cases:
                        db.session.delete(c)
                    print(f"  Removed {len(orphan_cases)} orphaned case(s)")
                    total_orphaned += len(orphan_cases)

                # Remove empty sections (no remaining cases)
                db.session.flush()
                for section in Section.query.filter_by(suite_id=suite.id).all():
                    if TestCase.query.filter_by(section_id=section.id).count() == 0:
                        db.session.delete(section)
                        print(f"  Removed empty section: {section.name}")
            elif files_fetched < len(file_entries):
                failed = len(file_entries) - files_fetched
                print(f"  WARNING: {failed}/{len(file_entries)} file fetches failed — "
                      f"skipping orphan cleanup for this suite")

            print(f"  Tests: {suite_tests}, New: {suite_new}")
            total_tests += suite_tests
            total_new += suite_new

        # ── Baseline diffing ──
        # Build current snapshot of all case IDs and titles
        all_current_cases = (
            db.session.query(TestCase.id, TestCase.title, Suite.name, Section.name)
            .join(Suite, TestCase.suite_id == Suite.id)
            .outerjoin(Section, TestCase.section_id == Section.id)
            .filter(Suite.project_id == project.id)
            .all()
        )
        current_case_ids = {c[0] for c in all_current_cases}
        current_case_titles = {
            str(c[0]): f"{c[2]} > {c[3] or 'Unknown'} > {c[1]}"
            for c in all_current_cases
        }

        # Load previous baseline
        prev_baseline = (
            SyncBaseline.query
            .filter_by(project_id=project.id)
            .order_by(SyncBaseline.created_at.desc())
            .first()
        )

        baseline_new_names = []
        baseline_removed_names = []
        baseline_new_count = 0
        baseline_removed_count = 0

        if prev_baseline:
            prev_ids = prev_baseline.get_case_ids()
            prev_titles = prev_baseline.get_case_titles()

            added_ids = current_case_ids - prev_ids
            removed_ids = prev_ids - current_case_ids

            baseline_new_count = len(added_ids)
            baseline_removed_count = len(removed_ids)

            baseline_new_names = [
                current_case_titles.get(str(cid), f"Case #{cid}")
                for cid in sorted(added_ids)
            ]
            baseline_removed_names = [
                prev_titles.get(str(cid), f"Case #{cid}")
                for cid in sorted(removed_ids)
            ]

            print(f"\n--- Baseline diff (vs {prev_baseline.created_at.strftime('%Y-%m-%d %H:%M')}) ---")
            print(f"  Previous baseline: {prev_baseline.case_count} cases")
            print(f"  Current snapshot:  {len(current_case_ids)} cases")
            print(f"  New since baseline:     +{baseline_new_count}")
            print(f"  Removed since baseline: -{baseline_removed_count}")
        else:
            print("\n--- No previous baseline found — creating initial baseline ---")

        # Save new baseline (snapshot for next comparison)
        new_baseline = SyncBaseline(
            project_id=project.id,
            case_ids=json.dumps(sorted(current_case_ids)),
            case_titles=json.dumps(current_case_titles),
            case_count=len(current_case_ids),
        )
        db.session.add(new_baseline)

        # Save sync log with baseline-aware counts
        sync_log = SyncLog(
            sync_type='cypress_sync',
            project_id=project.id,
            total_cases=len(current_case_ids),
            new_cases=baseline_new_count,
            removed_cases=baseline_removed_count,
            suites_processed=len(suite_files),
            new_case_names=json.dumps(baseline_new_names) if baseline_new_names else None,
            status='success',
        )
        db.session.add(sync_log)
        db.session.commit()

        print(f"\n{'=' * 50}")
        print(f"CYPRESS SYNC COMPLETE")
        print(f"{'=' * 50}")
        print(f"Total tests found:  {len(current_case_ids)}")
        print(f"New since baseline: +{baseline_new_count}")
        print(f"Removed since baseline: -{baseline_removed_count}")
        print(f"Suites processed:   {len(suite_files)}")
        if baseline_new_names:
            print(f"\nNew test cases (since baseline):")
            for name in baseline_new_names:
                print(f"  + {name}")
        if baseline_removed_names:
            print(f"\nRemoved test cases (since baseline):")
            for name in baseline_removed_names:
                print(f"  - {name}")


if __name__ == '__main__':
    main()
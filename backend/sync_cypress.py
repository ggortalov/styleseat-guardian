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
import base64
import subprocess
from collections import defaultdict

from app import create_app, db
from app.models import Suite, Section, TestCase, Project
from app.suite_utils import determine_cypress_path, cypress_path_to_name

# Regex to extract TestRail ID prefix (e.g. "C5412853" from "C5412853 Validate Email...")
TESTRAIL_ID_RE = re.compile(r'^(C\d+)\s')

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


def get_file_content(path):
    """Fetch file content from GitHub."""
    result = subprocess.run(
        ['gh', 'api', f'repos/styleseat/cypress/contents/{path}', '--jq', '.content'],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        return base64.b64decode(result.stdout.strip()).decode('utf-8', errors='ignore')
    return None


def extract_title(match):
    """Extract and unescape a title from a regex match."""
    title = (match.group(1) or match.group(2) or match.group(3) or '')
    return title.replace("\\'", "'").replace('\\"', '"').strip()


def extract_tests(content):
    """Extract it() test titles from Cypress file content."""
    tests = [extract_title(m) for m in re.finditer(IT_PATTERN, content)]
    return [t for t in tests if len(t) > 3]


def extract_describe(content):
    """Extract first describe() block title for section naming."""
    match = re.search(DESCRIBE_PATTERN, content)
    if match:
        return extract_title(match)
    return None


def main():
    app = create_app()
    with app.app_context():
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
            suite_files[cp].append(f['path'])

        print(f"Suites detected: {len(suite_files)} (skipped {skipped} files from excluded paths)")

        total_tests = 0
        total_new = 0

        for cypress_path, file_paths in sorted(suite_files.items()):
            suite_name = cypress_path_to_name(cypress_path)
            print(f"\n=== {suite_name} ({len(file_paths)} files) ===")

            # Find or create suite
            suite = Suite.query.filter_by(project_id=project.id, cypress_path=cypress_path).first()
            if not suite:
                suite = Suite(project_id=project.id, name=suite_name, cypress_path=cypress_path,
                              description='Synced from Cypress repo')
                db.session.add(suite)
                db.session.flush()
                print(f"  Created suite: {suite_name} ({cypress_path})")

            # Cache existing sections and cases (index by title and TestRail ID)
            existing_sections = {s.name: s for s in Section.query.filter_by(suite_id=suite.id).all()}
            all_cases = TestCase.query.filter_by(suite_id=suite.id).all()
            existing_cases = {c.title.lower(): c for c in all_cases}
            existing_by_testrail_id = {}
            for c in all_cases:
                m = TESTRAIL_ID_RE.match(c.title)
                if m:
                    existing_by_testrail_id[m.group(1)] = c

            suite_tests = 0
            suite_new = 0

            for file_path in file_paths:
                content = get_file_content(file_path)
                if not content:
                    continue

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

                    # Match by exact title first, then fall back to TestRail ID
                    case = existing_cases.get(title_lower)
                    if not case:
                        m = TESTRAIL_ID_RE.match(title)
                        if m:
                            case = existing_by_testrail_id.get(m.group(1))

                    if case:
                        # Update existing case (title may have changed)
                        if case.title != title:
                            case.title = title
                        if case.preconditions != preconditions_text:
                            case.preconditions = preconditions_text
                        if case.section_id != section.id:
                            case.section_id = section.id
                    else:
                        case = TestCase(
                            suite_id=suite.id,
                            section_id=section.id,
                            title=title,
                            case_type='Regression',
                            priority='Medium',
                            preconditions=preconditions_text,
                            created_by=1
                        )
                        db.session.add(case)
                        existing_cases[title_lower] = case
                        testrail_m = TESTRAIL_ID_RE.match(title)
                        if testrail_m:
                            existing_by_testrail_id[testrail_m.group(1)] = case
                        suite_new += 1

            print(f"  Tests: {suite_tests}, New: {suite_new}")
            total_tests += suite_tests
            total_new += suite_new

        db.session.commit()

        print(f"\n{'=' * 50}")
        print(f"CYPRESS SYNC COMPLETE")
        print(f"{'=' * 50}")
        print(f"Total tests found:  {total_tests}")
        print(f"New cases created:  {total_new}")
        print(f"Suites processed:   {len(suite_files)}")


if __name__ == '__main__':
    main()
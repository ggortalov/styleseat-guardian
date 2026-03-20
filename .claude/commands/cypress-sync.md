# Cypress Repo Sync Skill

Sync test cases from the StyleSeat Cypress repository to Regression Guard. The Cypress repo is the source of truth for test definitions.

## Usage

```
/cypress-sync
```

Or sync a specific suite:
```
/cypress-sync p1_common
```

## Instructions

When the user invokes this skill, execute the following steps:

### Step 1: Fetch Test Files from Cypress Repo

Use the GitHub API to scan the `cypress/e2e` directory and extract all test files.

```bash
cd /Users/gennadyg/PycharmProjects/regression-guard/backend && source venv/bin/activate && python3 << 'EOF'
import subprocess
import json
import re
from collections import defaultdict
from app import create_app, db
from app.models import Suite, Section, TestCase, Project
from app.suite_utils import determine_cypress_path, cypress_path_to_name

def get_repo_tree():
    """Get all files from cypress/e2e directory."""
    result = subprocess.run(
        ['gh', 'api', 'repos/styleseat/cypress/git/trees/master?recursive=1'],
        capture_output=True, text=True
    )
    tree = json.loads(result.stdout)
    return [f for f in tree.get('tree', []) if f['path'].startswith('cypress/e2e/') and f['path'].endswith('.cy.js')]

def get_file_content(path):
    """Fetch file content from GitHub."""
    result = subprocess.run(
        ['gh', 'api', f'repos/styleseat/cypress/contents/{path}', '--jq', '.content'],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        import base64
        return base64.b64decode(result.stdout.strip()).decode('utf-8', errors='ignore')
    return None

def extract_tests(content, file_path):
    """Extract test titles from Cypress file content."""
    tests = []

    # Match it() and it.only() calls - handle various patterns
    # Pattern: it("title", ...) or it('title', ...) or it(`title`, ...)
    it_pattern = r'it(?:\.only|\.skip)?\s*\(\s*["\'\`]([^"\'\`]+)["\'\`]'

    for match in re.finditer(it_pattern, content):
        title = match.group(1).strip()
        if title and len(title) > 3:  # Skip very short titles
            tests.append(title)

    return tests

def extract_describe(content):
    """Extract describe block title."""
    # Match describe(), describeLC(), etc.
    pattern = r'(?:describe|describeLC)\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?["\'\`]([^"\'\`]+)["\'\`]'
    match = re.search(pattern, content)
    if match:
        return match.group(1).strip()
    return None

def determine_suite_path(file_path):
    """Determine which suite cypress_path a file belongs to."""
    return determine_cypress_path(file_path)

def get_section_path(file_path):
    """Extract section path from file path."""
    # Remove cypress/e2e/ prefix and .cy.js suffix
    path = file_path.replace('cypress/e2e/', '').replace('.cy.js', '')
    parts = path.split('/')

    # Skip the suite-level folder(s) and get remaining path
    if parts[0] in ['p0', 'prod', 'preprod', 'events', 'abtest', 'communications']:
        section_parts = parts[1:-1]  # Skip first (suite) and last (filename)
    elif parts[0] == 'p1' and len(parts) > 2:
        section_parts = parts[2:-1]  # Skip p1/subtype and filename
    elif parts[0] == 'p3':
        section_parts = parts[2:-1]
    elif parts[0] == 'devices':
        section_parts = parts[2:-1]
    else:
        section_parts = parts[1:-1]

    # Get the file name without extension as leaf section
    file_name = parts[-1]
    if section_parts:
        return '/'.join(section_parts) + '/' + file_name
    return file_name

app = create_app()
with app.app_context():
    project = Project.query.filter_by(name='Cypress Automation').first()
    if not project:
        print("ERROR: Cypress Automation project not found. Run start demo first.")
        exit(1)

    print("Fetching test files from Cypress repo...")
    files = get_repo_tree()
    print(f"Found {len(files)} test files")

    # Group files by cypress_path
    suite_files = defaultdict(list)
    for f in files:
        cp = determine_suite_path(f['path'])
        suite_files[cp].append(f['path'])

    print(f"\nSuites found: {list(suite_files.keys())}")

    total_tests = 0
    total_new = 0
    total_updated = 0

    for cypress_path, file_paths in suite_files.items():
        suite_name = cypress_path_to_name(cypress_path)
        print(f"\n=== {suite_name} ({len(file_paths)} files) ===")

        # Find or create suite by cypress_path
        suite = Suite.query.filter_by(project_id=project.id, cypress_path=cypress_path).first()
        if not suite:
            suite = Suite(project_id=project.id, name=suite_name, cypress_path=cypress_path,
                          description=f'Synced from Cypress repo')
            db.session.add(suite)
            db.session.flush()
            print(f"  Created suite: {suite_name} ({cypress_path})")

        # Cache existing sections and cases
        existing_sections = {s.name: s for s in Section.query.filter_by(suite_id=suite.id).all()}
        existing_cases = {c.title.lower(): c for c in TestCase.query.filter_by(suite_id=suite.id).all()}

        suite_tests = 0
        suite_new = 0

        for file_path in file_paths:
            content = get_file_content(file_path)
            if not content:
                continue

            tests = extract_tests(content, file_path)
            if not tests:
                continue

            # Determine section from file path
            section_path = get_section_path(file_path)
            section_name = section_path.split('/')[-1] if section_path else 'General'

            # Find or create section
            if section_name not in existing_sections:
                section = Section(suite_id=suite.id, name=section_name, display_order=len(existing_sections))
                db.session.add(section)
                db.session.flush()
                existing_sections[section_name] = section
            else:
                section = existing_sections[section_name]

            # Create/update test cases
            for title in tests:
                title_lower = title.lower()
                suite_tests += 1

                if title_lower not in existing_cases:
                    case = TestCase(
                        suite_id=suite.id,
                        section_id=section.id,
                        title=title,
                        case_type='Regression',
                        priority='Medium',
                        preconditions=f'File: {file_path}',
                        created_by=1
                    )
                    db.session.add(case)
                    existing_cases[title_lower] = case
                    suite_new += 1

        print(f"  Tests: {suite_tests}, New: {suite_new}")
        total_tests += suite_tests
        total_new += suite_new

    db.session.commit()

    print(f"\n{'='*50}")
    print(f"CYPRESS SYNC COMPLETE")
    print(f"{'='*50}")
    print(f"Total tests found: {total_tests}")
    print(f"New cases created: {total_new}")
    print(f"Suites processed: {len(suite_files)}")
EOF
```

### Step 2: Report Results

After the sync completes, summarize:
- Number of test files scanned
- Number of suites processed
- Number of new test cases created
- Any files that couldn't be parsed

### Step 3: Update CircleCI Import

After syncing, the `/circleci-import` command will automatically match results to these synced test cases. Any tests that exist in CircleCI but not in the Cypress repo will still be created in the "CircleCI Imports" section.

## Notes

- The Cypress repo structure maps to suites:
  - `cypress/e2e/p0/` → PO suite
  - `cypress/e2e/p1/common/` → P1 Common suite
  - `cypress/e2e/p1/client/` → P1 Client suite
  - etc.
- Section names are derived from subfolder names within each suite folder
- Test titles are extracted from `it()` and `it.only()` calls
- The `preconditions` field stores the source file path for reference
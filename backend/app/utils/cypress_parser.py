"""
Utility functions for parsing Cypress test files.
"""
import re
import base64
import subprocess


def extract_tests_from_content(content):
    """
    Extract test titles from Cypress file content, handling apostrophes correctly.

    Uses separate patterns for each quote type to avoid truncating titles
    that contain apostrophes (e.g., "Pro see's Smart Price Appointment").
    """
    tests = []

    # Pattern for each quote type - only exclude the matching quote
    # Use \b word boundary to avoid matching 'it' inside other words like 'validateWithDeposit'
    # Handle optional tag array before title: it([Tag.MOBILE], "title", ...)
    patterns = [
        r'\bit(?:\.only|\.skip)?\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?"([^"]+)"',     # double-quoted
        r"\bit(?:\.only|\.skip)?\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?'([^']+)'",     # single-quoted
        r'\bit(?:\.only|\.skip)?\s*\(\s*(?:\[[^\]]*\]\s*,\s*)?`([^`]+)`',     # backtick (template literal)
    ]

    for pattern in patterns:
        for m in re.finditer(pattern, content):
            title = m.group(1).strip()
            # Validate: must be > 10 chars, not just a value like "$10.00"
            if len(title) > 10 and not _is_false_positive(title):
                tests.append(title)

    return tests


def _is_false_positive(title):
    """Check if a title looks like a value rather than a test name."""
    # Pure numbers or money amounts
    if re.match(r'^[\$\d,.\s]+$', title):
        return True
    # Very short generic strings
    if len(title) < 15 and not any(kw in title.lower() for kw in ['verify', 'validate', 'test', 'check', 'pro ', 'client']):
        # Check if it starts with a test ID pattern
        if not re.match(r'^C\d+', title):
            return True
    return False


def extract_tests_from_file(file_path, repo='styleseat/cypress', branch='master'):
    """
    Fetch a Cypress file from GitHub and extract test titles.

    Args:
        file_path: Path to the file in the repo (e.g., 'cypress/e2e/p1/pro/booking/smartPrice.cy.js')
        repo: GitHub repo in 'owner/name' format
        branch: Branch to fetch from

    Returns:
        List of test titles, or empty list if file couldn't be fetched
    """
    result = subprocess.run(
        ['gh', 'api', f'repos/{repo}/contents/{file_path}?ref={branch}', '--jq', '.content'],
        capture_output=True, text=True
    )

    if result.returncode != 0 or not result.stdout.strip():
        return []

    try:
        content = base64.b64decode(result.stdout.strip()).decode('utf-8', errors='ignore')
        return extract_tests_from_content(content)
    except Exception:
        return []


def get_cypress_test_files(folder_path, repo='styleseat/cypress', branch='master'):
    """
    Get all .cy.js test files in a folder from GitHub.

    Args:
        folder_path: Path to folder (e.g., 'cypress/e2e/p1/pro/')
        repo: GitHub repo in 'owner/name' format
        branch: Branch to fetch from

    Returns:
        List of file paths
    """
    result = subprocess.run(
        ['gh', 'api', f'repos/{repo}/git/trees/{branch}?recursive=1'],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        return []

    import json
    try:
        tree = json.loads(result.stdout)
        return [
            f['path'] for f in tree.get('tree', [])
            if f['path'].startswith(folder_path) and f['path'].endswith('.cy.js')
        ]
    except Exception:
        return []


def clean_test_title(title):
    """
    Clean a test title for matching purposes.
    Removes TestRail case ID prefix (e.g., 'C1234567 ') and normalizes whitespace.
    """
    # Remove TestRail case ID prefix
    cleaned = re.sub(r'^(C\d+\s*|DP\d+-P\d+-\d+\s*)', '', title)
    # Normalize whitespace
    cleaned = ' '.join(cleaned.split())
    return cleaned.strip().lower()
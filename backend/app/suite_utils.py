"""Shared utilities for deriving suite names and cypress paths.

This module is the single source of truth for mapping between:
- Cypress repo folder paths  (e.g. ``cypress/e2e/p1/common/``)
- Suite display names        (e.g. ``P1 Common``)
- CircleCI workflow names    (e.g. ``p1_common``)
"""

# Special-case display names that can't be derived mechanically
_NAME_OVERRIDES = {
    'p0': 'P0',
    'p3': 'P3 - Admin',
    'events': 'Events Mobile',
    'preprod': 'Pre Prod',
    'abtest': 'AB Test',
    'prod': 'PROD',
    'communications': 'Communications',
}

# Workflow name → subfolder under cypress/e2e/ (only non-obvious mappings)
_WORKFLOW_PATH_OVERRIDES = {
    'p0_devices': 'devices/p0',
    'p1_devices': 'devices/p1',
    'events_mobile': 'events',
    'po': 'p0',
    'p3_admin': 'p3',
    # AB Test workflow jobs: ab_2/ab_6 strip to "ab"; ab_4a/ab_4b keep their suffix
    'ab': 'abTest',
    'ab_4a': 'abTest',
    'ab_4b': 'abTest',
}


def cypress_path_to_name(path: str) -> str:
    """Derive a human-readable suite name from a cypress path.

    >>> cypress_path_to_name('cypress/e2e/p1/common/')
    'P1 Common'
    >>> cypress_path_to_name('cypress/e2e/p0/')
    'PO'
    >>> cypress_path_to_name('cypress/e2e/devices/p0/')
    'P0 Devices'
    """
    # Strip prefix and trailing slash
    rel = path.replace('cypress/e2e/', '').strip('/')

    # devices/p0 → P0 Devices, devices/p1 → P1 Devices
    if rel.startswith('devices/'):
        suffix = rel.split('/')[1].upper()
        return f'{suffix} Devices'

    parts = rel.split('/')

    # Single-segment paths: check overrides first (case-insensitive)
    if len(parts) == 1:
        override = _NAME_OVERRIDES.get(parts[0].lower())
        if override:
            return override
        return parts[0].upper()

    # Multi-segment: p1/common → P1 Common, p1/api → P1 API
    first = parts[0].upper()
    rest = ' '.join(p.title() for p in parts[1:])
    # Special case: 'api' should stay uppercase
    rest = rest.replace('Api', 'API')
    return f'{first} {rest}'


def workflow_name_to_cypress_path(name: str) -> str:
    """Convert a CircleCI workflow/job name to a cypress path.

    >>> workflow_name_to_cypress_path('p1_common')
    'cypress/e2e/p1/common/'
    >>> workflow_name_to_cypress_path('p0_devices')
    'cypress/e2e/devices/p0/'
    >>> workflow_name_to_cypress_path('p0_mobile')
    'cypress/e2e/p0/'
    """
    import re
    key = name.lower().strip()

    # Check explicit overrides first
    if key in _WORKFLOW_PATH_OVERRIDES:
        folder = _WORKFLOW_PATH_OVERRIDES[key]
    else:
        # Strip runner variant suffixes — these are execution configs, not directories
        key = re.sub(r'[_](?:mobile|desktop|critical|rerun)$', '', key)
        # Convert underscores to slashes: p1_common → p1/common
        folder = key.replace('_', '/')

    return f'cypress/e2e/{folder}/'


def determine_cypress_path(file_path: str) -> str:
    """Determine the suite-level cypress path from a full file path.

    Returns the path prefix that identifies which suite a file belongs to.

    >>> determine_cypress_path('cypress/e2e/p1/common/auth/login.cy.js')
    'cypress/e2e/p1/common/'
    >>> determine_cypress_path('cypress/e2e/p0/smoke.cy.js')
    'cypress/e2e/p0/'
    >>> determine_cypress_path('cypress/e2e/devices/p0/mobile.cy.js')
    'cypress/e2e/devices/p0/'
    """
    # Strip the prefix to work with relative path
    rel = file_path.replace('cypress/e2e/', '')
    parts = rel.split('/')

    # devices/p0/... or devices/p1/...  → cypress/e2e/devices/pX/
    if parts[0] == 'devices' and len(parts) > 1:
        return f'cypress/e2e/devices/{parts[1]}/'

    # p1/subtype/... → cypress/e2e/p1/subtype/
    if parts[0] == 'p1' and len(parts) > 1:
        return f'cypress/e2e/p1/{parts[1]}/'

    # p3/... → cypress/e2e/p3/
    if parts[0] == 'p3':
        return f'cypress/e2e/p3/'

    # Everything else: single top-level folder
    # p0, prod, preprod, events, abtest, communications, etc.
    return f'cypress/e2e/{parts[0]}/'

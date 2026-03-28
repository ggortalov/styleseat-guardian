# Scheduled Jobs — Cypress Sync & Data Retention

Guardian runs two automated background jobs via APScheduler. Both start automatically when the backend server launches.

---

## 1. Cypress Sync (Midnight)

**Schedule:** Daily at 00:00 server time
**Job ID:** `cypress_sync`
**Source:** `backend/sync_cypress.py`
**Timeout:** 10 minutes

### What It Does

Pulls test case definitions from the `styleseat/cypress` GitHub repository and syncs them into the Guardian database. The Cypress repo is the **source of truth** for test definitions.

### Step-by-Step Flow

1. **Fetch file tree** — Calls `gh api repos/styleseat/cypress/git/trees/master?recursive=1` to get all `.cy.js` files under `cypress/e2e/`.

2. **Group by suite** — Files are grouped into suites by their `cypress_path` (e.g., `cypress/e2e/p1_client/` → "P1 Client"). Suite mapping is derived by `app/suite_utils.py`.

3. **Excluded paths** — The following directories are skipped:
   - `cypress/e2e/manual/`
   - `cypress/e2e/utility/`
   - `cypress/e2e/utility_lifecycle/`
   - `cypress/e2e/weekly/`

4. **For each file:**
   - Fetches content via the GitHub blob API (with 3 retries per file)
   - Extracts `it()` test titles (become test cases)
   - Extracts the first `describe()` title (becomes the section name; falls back to filename)
   - Sets `preconditions` to `File: {filename}\nDescribe: {title}`

5. **Case matching** (determines create vs. update):
   - **Primary:** Match by `(section_id, title)` — section-aware dedup
   - **Secondary:** Match by TestRail C-ID prefix (for migration from legacy IDs)
   - **No match:** Creates a new test case

6. **Orphan cleanup** — Removes cases that no longer exist in the Cypress repo.
   - **Safety guard:** Only runs if ≥50% of file fetches succeeded for that suite. This prevents API rate limits or network failures from accidentally wiping the database.
   - Also removes empty sections (sections with zero cases after cleanup).

7. **Baseline diffing** — After processing all suites:
   - Takes a snapshot of all current case IDs and titles
   - Compares against the previous baseline to compute net `+new` / `-removed` counts
   - Saves the new snapshot as the baseline for the next sync

8. **Sync log** — Writes a `SyncLog` record with:
   - `total_cases`: Current total in the project
   - `new_cases` / `removed_cases`: Based on baseline diff
   - `new_case_names`: JSON array of added case names (format: `"Suite > Section > Title"`)
   - `status`: `success`

### Prerequisites

- **GitHub CLI** (`gh`) must be installed and authenticated on the server (`gh auth login`)
- The `Automation Overview` project must exist in the database (created by `seed.py` / `npm run demo`)

### Manual Trigger

```bash
npm run sync
# or
cd backend && source venv/bin/activate && python sync_cypress.py
```

### Expected Output

```
Fetching test files from Cypress repo...
Found 312 test files
Suites detected: 12 (skipped 8 files from excluded paths)

=== P1 Client (45 files) ===
  Tests: 489, New: 0

=== P1 Search (18 files) ===
  Tests: 160, New: 0
...

--- Baseline diff (vs 2026-03-25 00:00) ---
  Previous baseline: 2498 cases
  Current snapshot:  2498 cases
  New since baseline:     +0
  Removed since baseline: -0

==================================================
CYPRESS SYNC COMPLETE
==================================================
Total tests found:  2498
New since baseline: +0
Removed since baseline: -0
Suites processed:   12
```

### What to Watch For

| Scenario | What Happens |
|----------|-------------|
| New test file added to Cypress repo | New section + cases created, counted as `+new` |
| Test removed from Cypress file | Case deleted on next sync, counted as `-removed` |
| `describe()` title changed | Section renamed; existing cases moved to new section |
| GitHub API rate limited | File fetch retries 3 times; if >50% fail, orphan cleanup is skipped for that suite |
| `gh` CLI not authenticated | Sync fails immediately with exit code 1 |

---

## 2. Data Retention Cleanup (2:00 AM)

**Schedule:** Daily at 02:00 server time
**Job ID:** `retention_cleanup`
**Source:** `backend/app/retention.py`

### What It Does

Purges old data to keep the database lean. Three cleanup tasks run in sequence.

### Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `RETENTION_DAYS` | `30` | Age threshold for run/history purge |

Set in `backend/.env` or as an environment variable.

### Task 1: Purge Expired Runs

- Deletes test runs where the effective date is older than `RETENTION_DAYS`
- **Effective date** = `run_date` if set, otherwise `created_at`
- **Cascade:** Deleting a `TestRun` automatically removes all its `TestResult` and `ResultHistory` records (via SQLAlchemy `cascade="all, delete-orphan"`)

### Task 2: Purge Expired Tokens

- Removes JWT tokens from the blocklist that are older than **7 days** (hardcoded)
- These tokens are already expired; this is housekeeping to prevent the table from growing indefinitely

### Task 3: Purge Orphaned History

- Removes `ResultHistory` entries older than `RETENTION_DAYS`
- Catches any history records that survived cascade (edge cases)

### Manual Trigger

```bash
# Via API (requires JWT auth)
curl -X POST http://localhost:5001/api/retention/cleanup \
  -H "Authorization: Bearer <token>"
```

### Check Retention Status

```bash
curl http://localhost:5001/api/retention/status \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "retention_days": 30,
  "cutoff_date": "2026-02-23T02:00:00+00:00",
  "expired_runs": 3,
  "total_runs": 15,
  "total_results": 4200
}
```

### Expected Log Output

```
Retention cleanup: removed 3 completed runs (1200 results) older than 30 days
Token cleanup: removed 12 expired blocklist entries
History cleanup: removed 45 orphaned/expired history entries
```

---

## Database Models

### SyncBaseline

Snapshot of case IDs/titles taken after each sync for diffing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `project_id` | Integer | FK → projects |
| `case_ids` | Text (JSON) | Array of case IDs at time of sync |
| `case_titles` | Text (JSON) | Dict mapping case ID → `"Suite > Section > Title"` |
| `case_count` | Integer | Total cases at time of sync |
| `created_at` | DateTime | When baseline was captured |

### SyncLog

Record of each sync or import operation. Displayed in the UI under **Sync Changes** on the project overview.

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `sync_type` | String | `cypress_sync` or `circleci_import` |
| `project_id` | Integer | FK → projects |
| `total_cases` | Integer | Current total after sync |
| `new_cases` | Integer | Added since previous baseline |
| `removed_cases` | Integer | Removed since previous baseline |
| `suites_processed` | Integer | Number of suites handled |
| `new_case_names` | Text (JSON) | Array of new case name strings |
| `status` | String | `success`, `partial`, or `error` |
| `error_message` | Text | Error details (if status is `error`) |
| `created_at` | DateTime | When the sync ran |

---

## Monitoring

Both jobs log to Python's standard logging:

| Logger | Job |
|--------|-----|
| `guardian.sync` | Cypress sync (start, completion, errors) |
| `app.retention` | Retention cleanup (counts per task) |

In production, ensure these loggers are captured by your log aggregation (CloudWatch, Datadog, etc.).

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| `gh` CLI auth expired | Sync fails, no data changed | Re-run `gh auth login` on server |
| GitHub API rate limit | Partial sync; orphan cleanup skipped for affected suites | Next sync will retry |
| Sync timeout (>10 min) | Process killed, partial commit possible (each suite is committed independently) | Next sync will reconcile |
| DB locked during retention | Cleanup retries via SQLite busy_timeout (60s) | Usually self-resolves |
| Retention deletes active run | Runs are purged by age regardless of completion status | Set `RETENTION_DAYS` appropriately |
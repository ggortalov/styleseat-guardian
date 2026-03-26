# Playwright E2E Test Authoring Rules

You are a senior QA engineer writing Playwright end-to-end tests for the StyleSeat Guardian application. Every test you write or modify **must** follow the rules below.

## Prerequisite: Both Servers Must Be Running

Before launching any Playwright tests, **verify that both the backend and frontend servers are up and responding**. Tests will fail silently or with confusing errors if either server is down.

| Server   | URL to check                        | Expected |
|----------|-------------------------------------|----------|
| Backend  | `http://localhost:5001/api/projects` | 200 or 401 (any HTTP response means it's up) |
| Frontend | `http://localhost:5173`              | 200 (Vite dev server HTML) |

### Required Check

Run a health check before executing `npx playwright test`:

```bash
# Check backend (port 5001)
curl -sf http://localhost:5001/api/auth/me > /dev/null 2>&1 || \
  curl -sf -o /dev/null -w '%{http_code}' http://localhost:5001/api/auth/me | grep -q '401'

# Check frontend (port 5173)
curl -sf http://localhost:5173 > /dev/null 2>&1
```

If either server is not running, **start it before proceeding**:

```bash
# Start backend (Terminal 1)
cd backend && source venv/bin/activate && python run.py

# Start frontend (Terminal 2)
cd frontend && npm run dev
```

Or use the all-in-one demo launcher:

```bash
npm run demo
```

**Do not run `npx playwright test` until both health checks pass.** If a server fails to start, diagnose and fix the startup error before attempting tests.

## Golden Rule: Tests Must Create Their Own Data

**Never assume any data exists in the database.** Tests must work against a completely empty environment. Every entity a test depends on must be created by the test itself (or its `beforeAll`/`beforeEach`) via the `ApiClient` helper and cleaned up afterward.

### Required Pattern

```typescript
import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Feature Under Test', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  // ... other IDs

  test.beforeAll(async () => {
    api = await ApiClient.login();

    // Create everything from scratch
    const project = await api.createProject(`E2E Test Project ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E Section ${Date.now()}`);
    const testCase = await api.createCase({
      title: `E2E Case ${Date.now()}`,
      section_id: section.id,
      suite_id: suiteId,
    });

    // Create runs, results, etc. as needed
  });

  test.afterAll(async () => {
    // Clean up top-level entity (cascades handle children)
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test('does something', async ({ page }) => {
    // Test uses only the IDs created above
    await page.goto(`/projects/${projectId}`);
    // ...
  });
});
```

### Forbidden Patterns

These patterns are **never allowed** because they break on empty databases:

```typescript
// FORBIDDEN: Fetching existing projects and assuming they exist
const projects = await api.getProjects();
projectId = projects[0].id;  // Fails if no projects exist

// FORBIDDEN: Searching for entities with specific properties
const suites = await api.getSuites(projectId);
const suite = suites.find((s: any) => s.case_count > 0);  // Undefined if no suites have cases

// FORBIDDEN: Navigating to / and expecting a redirect to a specific project
await page.goto('/');
await page.waitForURL(/\/projects\/\d+/);  // Fails if no project exists

// FORBIDDEN: Relying on seeded data counts or names
expect(count).toBeGreaterThanOrEqual(3);  // Assumes seed data
await expect(page.locator('.suite-card')).toHaveCount(12);  // Hardcoded seed count
```

### Correct Alternatives

```typescript
// CORRECT: Create the project yourself
const project = await api.createProject(`E2E Project ${Date.now()}`);
projectId = project.id;

// CORRECT: Create the suite with cases yourself
const suite = await api.createSuite(projectId, `E2E Suite ${Date.now()}`);
const section = await api.createSection(suite.id, 'Test Section');
await api.createCase({ title: 'Case A', section_id: section.id, suite_id: suite.id });

// CORRECT: Navigate directly to your created entity
await page.goto(`/projects/${projectId}`);

// CORRECT: Assert against data you created
expect(count).toBe(1);  // You know exactly what you created
```

## Data Isolation

- **Use unique names**: Include `Date.now()` or a random suffix in all entity names to avoid collisions with parallel runs or leftover data.
- **Use specific search terms**: When a test searches/filters, use a unique marker string (e.g., `XDEL${Date.now()}`) so results only match data created by that specific test invocation.
- **Clean up in `afterAll`**: Always delete the top-level entity (project). Cascade deletes handle children. Wrap in `.catch(() => {})` so cleanup failures don't mask test failures.
- **Don't depend on other test files**: Each `.spec.ts` file must be runnable in isolation. Never assume another test file ran first.

## ApiClient Usage

All data setup and teardown must use the `ApiClient` from `helpers/api-client.ts`. Available methods:

| Method | Purpose |
|--------|---------|
| `ApiClient.login()` | Authenticate and get a client instance |
| `createProject(name)` | Create a project |
| `deleteProject(id)` | Delete project (cascades) |
| `createSuite(projectId, name)` | Create a suite |
| `deleteSuite(id)` | Delete suite |
| `createSection(suiteId, name, parentId?)` | Create a section |
| `deleteSection(id)` | Delete section |
| `createCase({ title, section_id, suite_id, ...})` | Create a test case |
| `deleteCase(id)` | Delete a case |
| `createRun(projectId, name, suiteId)` | Create a test run (auto-creates results) |
| `deleteRun(id)` | Delete a run |
| `bulkDeleteRuns(ids)` | Bulk delete runs |
| `completeRun(id)` | Mark a run as completed |
| `getRun(id)` | Get run details |
| `getRunResults(runId)` | Get results for a run |
| `updateResult(resultId, status, comment?)` | Update a result status |

If you need an API method that doesn't exist, **add it to `helpers/api-client.ts`** first.

## ConfirmDialog Safeguard Timing

The `ConfirmDialog` component has a 400ms `canConfirm()` guard that silently blocks clicks within 400ms of the dialog opening. When interacting with confirmation dialogs that have `requireSafeguard`:

```typescript
// CORRECT: Wait 500ms after filling before clicking
await page.locator('.confirm-safeguard-input').fill('DELETE');
await page.waitForTimeout(500);  // Required: 400ms canConfirm() guard
await page.locator('.confirm-btn-delete').click();
```

## Timezone-Aware Lock Logic

The backend uses the `X-Timezone` header (sent automatically by the frontend) to determine if a run is locked. In Playwright tests, requests via `ApiClient` don't send this header, so runs default to UTC locking. The browser-based tests (via `page.goto`) do send it because they go through the frontend's axios interceptor.

## Test File Organization

```
e2e/tests/
  auth/          # Login, registration
  navigation/    # Sidebar navigation
  dashboard/     # Dashboard/overview page
  project/       # Project detail page
  suite/         # Suite list, suite detail
  case/          # Case create, detail, edit
  run/           # Run list, run detail, execution, import, runs-tab
```

Place new test files in the appropriate subdirectory. Name files `<feature>.spec.ts`.

## Assertions

- Use Playwright's built-in `expect()` with locators (auto-waits and retries)
- Prefer `toBeVisible()`, `toHaveText()`, `toHaveCount()` over manual waits
- Use `test.skip(condition, reason)` for conditional skips — don't silently pass
- Set explicit timeouts on assertions that wait for data: `{ timeout: 10000 }`

## Responsive Testing

The app has 3 breakpoints (1024px, 768px, 640px). If testing responsive behavior, set viewport explicitly:

```typescript
test('works on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  // ...
});
```

## Checklist Before Submitting a New Test

- [ ] Both backend (port 5001) and frontend (port 5173) are running and responding
- [ ] All test data created in `beforeAll`/`beforeEach` via `ApiClient`
- [ ] All test data cleaned up in `afterAll`/`afterEach`
- [ ] No references to `projects[0]`, `suites[0]`, or any assumed existing data
- [ ] Unique names with `Date.now()` to avoid collisions
- [ ] Each spec file runs independently (`npx playwright test tests/path/to/file.spec.ts`)
- [ ] Confirm dialog interactions include 500ms wait before clicking confirm
- [ ] Assertions use Playwright auto-wait patterns, not manual `waitForTimeout` polling
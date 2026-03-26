import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Runs Tab — Filters, Search, Selection & Bulk Delete', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Runs Tab Project ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E RT Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E RT Section ${Date.now()}`);
    await api.createCase({
      title: `E2E RT Case ${Date.now()}`,
      section_id: section.id,
      suite_id: suiteId,
    });

    // Create an active run and a completed run for filtering tests
    await api.createRun(projectId, `E2E Active Run ${Date.now()}`, suiteId);

    const completedRun = await api.createRun(projectId, `E2E Completed Run ${Date.now()}`, suiteId);
    await api.completeRun(completedRun.id);
  });

  test.afterAll(async () => {
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  /** Navigate to the project's Runs tab */
  async function gotoRunsTab(page: any) {
    await page.goto(`/projects/${projectId}?tab=runs`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.runs-filter-toolbar')).toBeVisible({ timeout: 15000 });
  }

  // ── Filter Pills ──

  test('displays filter pills with correct counts', async ({ page }) => {
    await gotoRunsTab(page);

    const pills = page.locator('.runs-filter-pill');
    await expect(pills).toHaveCount(3);

    // "All" pill should be active by default
    await expect(pills.filter({ hasText: 'All' })).toHaveClass(/runs-filter-pill--active/);

    // Each pill should show a count badge
    for (const label of ['All', 'Active', 'Completed']) {
      const pill = pills.filter({ hasText: label });
      const count = pill.locator('.runs-filter-pill-count');
      await expect(count).toBeVisible();
    }
  });

  test('filters runs by Active status', async ({ page }) => {
    await gotoRunsTab(page);

    const activePill = page.locator('.runs-filter-pill', { hasText: 'Active' });
    await activePill.click();

    // Active pill should become active
    await expect(activePill).toHaveClass(/runs-filter-pill--active/);

    // Active filter indicator should appear
    await expect(page.locator('.runs-active-filter')).toBeVisible();

    // All visible rows should have the "Active" badge, none should show "Passed" status
    const rows = page.locator('.data-table tbody tr');
    const rowCount = await rows.count();
    if (rowCount > 0) {
      for (let i = 0; i < rowCount; i++) {
        const badge = rows.nth(i).locator('.badge-active');
        await expect(badge).toBeVisible();
      }
    }
  });

  test('filters runs by Completed status', async ({ page }) => {
    await gotoRunsTab(page);

    const completedPill = page.locator('.runs-filter-pill', { hasText: 'Completed' });
    await completedPill.click();

    await expect(completedPill).toHaveClass(/runs-filter-pill--active/);
    await expect(page.locator('.runs-active-filter')).toBeVisible();

    // No "Active" badges should be visible in filtered rows
    const activeBadges = page.locator('.data-table tbody .badge-active');
    await expect(activeBadges).toHaveCount(0);
  });

  // ── Search ──

  test('filters runs by search query', async ({ page }) => {
    await gotoRunsTab(page);

    const searchInput = page.locator('.runs-search-input');
    await expect(searchInput).toBeVisible();

    // Search for our active run by the unique prefix
    await searchInput.fill('E2E Active Run');

    // Active filter indicator should appear
    await expect(page.locator('.runs-active-filter')).toBeVisible();

    // Table should show only matching runs
    const rows = page.locator('.data-table tbody tr');
    const count = await rows.count();
    expect(count).toBe(1); // We created exactly 1 active run

    // All visible rows should contain the search term
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).locator('.text-primary-bold')).toContainText('E2E Active Run');
    }
  });

  test('search clear button resets results', async ({ page }) => {
    await gotoRunsTab(page);

    const searchInput = page.locator('.runs-search-input');
    await searchInput.fill('E2E Active Run');
    await expect(page.locator('.runs-active-filter')).toBeVisible();

    // Count rows before clearing
    const filteredCount = await page.locator('.data-table tbody tr').count();

    // Click the clear button
    const clearBtn = page.locator('.runs-search-clear');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    // Input should be cleared
    await expect(searchInput).toHaveValue('');

    // Filter indicator should be gone (since filter is "All" and search is empty)
    await expect(page.locator('.runs-active-filter')).not.toBeVisible();

    // Row count should be >= filtered count (showing all again)
    const totalCount = await page.locator('.data-table tbody tr').count();
    expect(totalCount).toBeGreaterThanOrEqual(filteredCount);
  });

  test('shows "no match" message for impossible search', async ({ page }) => {
    await gotoRunsTab(page);

    await page.locator('.runs-search-input').fill('zzz_impossible_match_zzz');

    // Should show the "No runs match" message
    await expect(page.locator('.empty-message', { hasText: 'No runs match the current filters.' })).toBeVisible();
  });

  // ── Clear Filters ──

  test('"Clear filters" resets both pill and search', async ({ page }) => {
    await gotoRunsTab(page);

    // Activate a filter and type a search
    await page.locator('.runs-filter-pill', { hasText: 'Active' }).click();
    await page.locator('.runs-search-input').fill('E2E');

    // Click "Clear filters"
    await page.locator('.runs-clear-filters').click();

    // "All" pill should be active again
    await expect(page.locator('.runs-filter-pill', { hasText: 'All' })).toHaveClass(/runs-filter-pill--active/);

    // Search input should be empty
    await expect(page.locator('.runs-search-input')).toHaveValue('');

    // Filter indicator gone
    await expect(page.locator('.runs-active-filter')).not.toBeVisible();
  });

  // ── Checkbox Selection ──

  test('selects individual run via checkbox', async ({ page }) => {
    await gotoRunsTab(page);

    const firstCheckbox = page.locator('.data-table tbody .runs-checkbox-col input[type="checkbox"]').first();
    await expect(firstCheckbox).toBeVisible();
    await firstCheckbox.check();

    // Bulk action bar should appear
    const bulkBar = page.locator('.bulk-action-bar');
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar.locator('.bulk-action-count')).toContainText('1 run selected');
  });

  test('select-all checkbox toggles all visible runs', async ({ page }) => {
    await gotoRunsTab(page);

    const rowCount = await page.locator('.data-table tbody tr').count();

    // Click select-all in header
    const selectAll = page.locator('.data-table thead .runs-checkbox-col input[type="checkbox"]');
    await selectAll.check();

    // Bulk bar should show correct count
    const bulkBar = page.locator('.bulk-action-bar');
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar.locator('.bulk-action-count')).toContainText(`${rowCount} run`);

    // All row checkboxes should be checked
    const rowCheckboxes = page.locator('.data-table tbody .runs-checkbox-col input[type="checkbox"]');
    for (let i = 0; i < rowCount; i++) {
      await expect(rowCheckboxes.nth(i)).toBeChecked();
    }

    // Uncheck select-all
    await selectAll.uncheck();
    await expect(bulkBar).not.toBeVisible();
  });

  test('checkbox click does not navigate to run detail', async ({ page }) => {
    await gotoRunsTab(page);

    const firstCheckbox = page.locator('.data-table tbody .runs-checkbox-col input[type="checkbox"]').first();
    await firstCheckbox.check();

    // Should still be on the project page, not navigated to a run
    expect(page.url()).toContain(`/projects/${projectId}`);
  });

  test('selected rows get highlighted', async ({ page }) => {
    await gotoRunsTab(page);

    const firstCheckbox = page.locator('.data-table tbody .runs-checkbox-col input[type="checkbox"]').first();
    await firstCheckbox.check();

    const firstRow = page.locator('.data-table tbody tr').first();
    await expect(firstRow).toHaveClass(/runs-row--selected/);
  });

  test('Clear button in bulk bar deselects all', async ({ page }) => {
    await gotoRunsTab(page);

    // Select a run
    const firstCheckbox = page.locator('.data-table tbody .runs-checkbox-col input[type="checkbox"]').first();
    await firstCheckbox.check();

    const bulkBar = page.locator('.bulk-action-bar');
    await expect(bulkBar).toBeVisible();

    // Click Clear
    await bulkBar.getByRole('button', { name: 'Clear' }).click();

    await expect(bulkBar).not.toBeVisible();
    await expect(firstCheckbox).not.toBeChecked();
  });

  // ── Bulk Delete ──

  test('bulk deletes selected runs with confirmation', async ({ page }) => {
    // Use a unique marker so we only match runs from THIS test invocation
    const marker = `XDEL${Date.now()}`;
    const run1 = await api.createRun(projectId, `${marker} A`, suiteId);
    const run2 = await api.createRun(projectId, `${marker} B`, suiteId);

    await gotoRunsTab(page);

    // Search for our uniquely-named disposable runs
    const searchInput = page.locator('.runs-search-input');
    await searchInput.fill(marker);

    // Wait for exactly 2 filtered rows
    const rows = page.locator('.data-table tbody tr');
    await expect(rows).toHaveCount(2, { timeout: 10000 });

    // Select all filtered runs
    const selectAll = page.locator('.data-table thead .runs-checkbox-col input[type="checkbox"]');
    await selectAll.check();

    // Click Delete in bulk bar
    const bulkBar = page.locator('.bulk-action-bar');
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar.locator('.bulk-action-count')).toContainText('2 runs selected');
    await bulkBar.getByRole('button', { name: 'Delete' }).click();

    // Confirm dialog — fill safeguard and wait 500ms for the 400ms canConfirm() guard
    await page.locator('.confirm-safeguard-input').fill('DELETE');
    await page.waitForTimeout(500);
    await page.locator('.confirm-btn-delete').click();

    // Wait for the confirm dialog to close and data to refresh
    await expect(page.locator('.confirm-safeguard-input')).not.toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Bulk bar should be gone
    await expect(page.locator('.bulk-action-bar')).not.toBeVisible({ timeout: 5000 });

    // Search again for deleted runs — should show empty
    await searchInput.clear();
    await searchInput.fill(marker);
    await expect(page.locator('.empty-message', { hasText: 'No runs match' })).toBeVisible({ timeout: 10000 });

    // Cleanup: runs should already be deleted, but just in case
    await api.deleteRun(run1.id).catch(() => {});
    await api.deleteRun(run2.id).catch(() => {});
  });

  test('switching filter pills clears selection', async ({ page }) => {
    await gotoRunsTab(page);

    // Select a run
    const firstCheckbox = page.locator('.data-table tbody .runs-checkbox-col input[type="checkbox"]').first();
    await firstCheckbox.check();
    await expect(page.locator('.bulk-action-bar')).toBeVisible();

    // Switch to Completed filter
    await page.locator('.runs-filter-pill', { hasText: 'Completed' }).click();

    // Bulk bar should be gone (selection cleared on filter change)
    await expect(page.locator('.bulk-action-bar')).not.toBeVisible();
  });
});

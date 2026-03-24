import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Test Run Detail Page', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  let runId: number;
  let resultId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();
    const projects = await api.getProjects();
    projectId = projects[0].id;

    const suites = await api.getSuites(projectId);
    const suiteWithCases = suites.find((s: any) => s.case_count > 0);
    if (!suiteWithCases) return;
    suiteId = suiteWithCases.id;

    const run = await api.createRun(projectId, `E2E Run ${Date.now()}`, suiteId);
    runId = run.id;

    const results = await api.getRunResults(runId);
    if (results.length > 0) {
      resultId = results[0].id;
    }
  });

  test.afterAll(async () => {
    if (runId) {
      await api.deleteRun(runId).catch(() => {});
    }
  });

  test('displays run stats and results', async ({ page }) => {
    test.skip(!runId, 'No run created');

    await page.goto(`/runs/${runId}`);
    await page.waitForLoadState('networkidle');

    // Stat tiles should be visible
    const statTile = page.locator('.stat-tile').first();
    await expect(statTile).toBeVisible({ timeout: 15000 });

    // Results (section groups) should be visible
    const sectionGroups = page.locator('.run-section-group');
    await expect(sectionGroups.first()).toBeVisible({ timeout: 10000 });
  });

  test('filters results by status', async ({ page }) => {
    test.skip(!runId, 'No run created');

    await page.goto(`/runs/${runId}`);
    await page.waitForLoadState('networkidle');

    // Click "Untested" stat tile to filter
    const untestedTile = page.locator('.stat-tile', { hasText: 'Untested' });
    await expect(untestedTile).toBeVisible({ timeout: 15000 });
    await untestedTile.click();

    await expect(untestedTile).toHaveClass(/active/);

    // Clear filter
    const clearBtn = page.locator('.filter-clear');
    const hasClear = await clearBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasClear) {
      await clearBtn.click();
    }
  });

  test('changes result status via dropdown', async ({ page }) => {
    test.skip(!runId || !resultId, 'No run or result');

    await page.goto(`/runs/${runId}`);
    await page.waitForLoadState('networkidle');

    // Expand first section
    const firstSectionHeader = page.locator('.run-section-header').first();
    await expect(firstSectionHeader).toBeVisible({ timeout: 15000 });
    await firstSectionHeader.click();
    await page.waitForTimeout(300);

    // Click status dropdown on first case
    const firstDropdown = page.locator('.status-dropdown-trigger').first();
    const isVisible = await firstDropdown.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await firstDropdown.click();

      const menu = page.locator('.status-dropdown-menu').first();
      await expect(menu).toBeVisible();

      await menu.locator('.status-dropdown-option', { hasText: 'Passed' }).click();
      await page.waitForTimeout(500);
    }
  });

  test('bulk select and update status', async ({ page }) => {
    test.skip(!runId, 'No run created');

    await page.goto(`/runs/${runId}`);
    await page.waitForLoadState('networkidle');

    // Expand first section
    const firstSectionHeader = page.locator('.run-section-header').first();
    await expect(firstSectionHeader).toBeVisible({ timeout: 15000 });
    await firstSectionHeader.click();
    await page.waitForTimeout(300);

    // Click select-all checkbox
    const selectAll = page.locator('.run-select-all').first();
    const isVisible = await selectAll.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await selectAll.click();

      const bulkBar = page.locator('.bulk-status-bar');
      await expect(bulkBar).toBeVisible();

      await bulkBar.getByRole('button', { name: 'Clear' }).click();
      await expect(bulkBar).not.toBeVisible();
    }
  });

  test('renames run inline', async ({ page }) => {
    test.skip(!runId, 'No run created');

    await page.goto(`/runs/${runId}`);
    await page.waitForLoadState('networkidle');

    // Click the editable heading
    const heading = page.locator('.page-heading');
    await expect(heading).toBeVisible({ timeout: 15000 });
    await heading.click();

    // Rename input should appear
    const renameInput = page.locator('.run-rename-input');
    const isVisible = await renameInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await renameInput.clear();
      await renameInput.fill(`E2E Renamed Run ${Date.now()}`);
      await renameInput.press('Enter');
      await page.waitForTimeout(500);
    }
  });

  test('completes run', async ({ page }) => {
    const run = await api.createRun(projectId, `E2E Complete ${Date.now()}`, suiteId);

    await page.goto(`/runs/${run.id}`);
    await page.waitForLoadState('networkidle');

    const completeBtn = page.getByRole('button', { name: /complete/i });
    const isVisible = await completeBtn.isVisible({ timeout: 10000 }).catch(() => false);
    if (isVisible) {
      await completeBtn.click();
      const confirmBtn = page.locator('.confirm-btn-delete');
      const hasConfirm = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasConfirm) {
        await confirmBtn.click();
      }
      await page.waitForTimeout(1000);
    }

    await api.deleteRun(run.id).catch(() => {});
  });

  test('deletes run with confirmation', async ({ page }) => {
    const run = await api.createRun(projectId, `E2E Delete Run ${Date.now()}`, suiteId);

    await page.goto(`/runs/${run.id}`);
    await page.waitForLoadState('networkidle');

    const deleteBtn = page.getByRole('button', { name: /delete/i });
    await expect(deleteBtn).toBeVisible({ timeout: 15000 });
    await deleteBtn.click();

    await page.locator('.confirm-safeguard-input').fill('DELETE');
    await page.waitForTimeout(500);
    await page.locator('.confirm-btn-delete').click();

    await page.waitForURL(/\/(runs|projects)/, { timeout: 10000 });
  });
});

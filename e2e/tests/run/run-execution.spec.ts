import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Test Execution Page', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  let runId: number;
  let resultId: number;
  let resultIds: number[] = [];

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Execution Project ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E Exec Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E Exec Section ${Date.now()}`);
    // Create 3 cases so we can test position indicator
    for (let i = 1; i <= 3; i++) {
      await api.createCase({
        title: `E2E Exec Case ${i} ${Date.now()}`,
        section_id: section.id,
        suite_id: suiteId,
        steps: [{ action: `Step ${i}`, expected: `Result ${i}` }],
      });
    }

    const run = await api.createRun(projectId, `E2E Execution ${Date.now()}`, suiteId);
    runId = run.id;

    const results = await api.getRunResults(runId);
    resultIds = results.map((r: any) => r.id);
    if (results.length > 0) {
      resultId = results[0].id;
    }
  });

  test.afterAll(async () => {
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test('displays case details and steps', async ({ page }) => {
    await page.goto(`/runs/${runId}/execute/${resultId}`);
    await page.waitForLoadState('networkidle');

    // Case card should be visible
    const caseCard = page.locator('.exec-case');
    await expect(caseCard).toBeVisible({ timeout: 15000 });

    const meta = page.locator('.exec-meta');
    await expect(meta).toBeVisible();

    const panel = page.locator('.exec-panel');
    await expect(panel).toBeVisible();
  });

  test('changes status via dropdown', async ({ page }) => {
    await page.goto(`/runs/${runId}/execute/${resultId}`);
    await page.waitForLoadState('networkidle');

    const statusTrigger = page.locator('.exec-status-trigger');
    await expect(statusTrigger).toBeVisible({ timeout: 15000 });
    await statusTrigger.click();

    const menu = page.locator('.exec-status-menu');
    await expect(menu).toBeVisible();

    await menu.locator('.exec-status-option', { hasText: 'Passed' }).click();
    await page.waitForTimeout(500);

    await expect(statusTrigger).toContainText('Passed');
  });

  test('shows history after status change', async ({ page }) => {
    // Set a status via API so there's history
    await api.updateResult(resultId, 'Failed', 'E2E test comment');

    await page.goto(`/runs/${runId}/execute/${resultId}`);
    await page.waitForLoadState('networkidle');

    const historyEntries = page.locator('.history-entry');
    await expect(historyEntries.first()).toBeVisible({ timeout: 15000 });
  });

  test('shows position indicator', async ({ page }) => {
    test.skip(resultIds.length < 2, 'Need at least 2 results');

    await page.goto(`/runs/${runId}/execute/${resultIds[0]}`);
    await page.waitForLoadState('networkidle');

    // Position indicator should show "1 of N"
    const position = page.locator('.exec-position');
    await expect(position).toBeVisible({ timeout: 15000 });
    await expect(position).toContainText('1 of');

    // Navigate to a different result by URL to verify position updates
    await page.goto(`/runs/${runId}/execute/${resultIds[1]}`);
    await page.waitForLoadState('networkidle');
    await expect(position).toContainText('2 of');
  });

  test('back button returns to run detail', async ({ page }) => {
    // First navigate to the run detail so there's history to go back to
    await page.goto(`/runs/${runId}`);
    await page.waitForLoadState('networkidle');

    // Then navigate to execution page
    await page.goto(`/runs/${runId}/execute/${resultId}`);
    await page.waitForLoadState('networkidle');

    const backBtn = page.locator('button', { hasText: 'Back' });
    await expect(backBtn).toBeVisible({ timeout: 15000 });
    await backBtn.click();

    await page.waitForURL(/\/runs\/\d+$/, { timeout: 10000 });
  });
});

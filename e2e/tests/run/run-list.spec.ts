import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Test Runs Page', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  let runId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Run List Project ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E RL Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E RL Section ${Date.now()}`);
    await api.createCase({
      title: `E2E RL Case ${Date.now()}`,
      section_id: section.id,
      suite_id: suiteId,
    });

    const run = await api.createRun(projectId, `E2E RL Run ${Date.now()}`, suiteId);
    runId = run.id;
  });

  test.afterAll(async () => {
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test('displays run sections', async ({ page }) => {
    await page.goto(`/projects/${projectId}?tab=runs`);
    await page.waitForLoadState('networkidle');

    // Should show the runs table with our created run
    const table = page.locator('.data-table');
    await expect(table).toBeVisible({ timeout: 15000 });

    const rows = page.locator('.data-table tbody tr');
    const count = await rows.count();
    expect(count).toBe(1); // We created exactly 1 run
  });

  test('shows run data in table row', async ({ page }) => {
    await page.goto(`/projects/${projectId}?tab=runs`);
    await page.waitForLoadState('networkidle');

    // Run row should show the run name
    const runRow = page.locator('.data-table tbody tr').first();
    await expect(runRow).toBeVisible({ timeout: 10000 });
    await expect(runRow).toContainText('E2E RL Run');
  });

  test('navigates to run detail from row', async ({ page }) => {
    await page.goto(`/projects/${projectId}?tab=runs`);
    await page.waitForLoadState('networkidle');

    const firstRow = page.locator('.data-table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();
    await page.waitForURL(/\/runs\/\d+/);
  });
});

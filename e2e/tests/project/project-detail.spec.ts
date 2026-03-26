import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Project Detail Page', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  let runId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Project Detail ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E PD Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E PD Section ${Date.now()}`);
    await api.createCase({
      title: `E2E PD Case ${Date.now()}`,
      section_id: section.id,
      suite_id: suiteId,
    });

    const run = await api.createRun(projectId, `E2E PD Run ${Date.now()}`, suiteId);
    runId = run.id;
  });

  test.afterAll(async () => {
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
  });

  test('displays project name in header', async ({ page }) => {
    const heading = page.locator('.page-heading');
    await expect(heading).toBeVisible();
    await expect(heading).not.toBeEmpty();
  });

  test('shows suite cards in Suites tab with counts', async ({ page }) => {
    await page.locator('.tab', { hasText: 'Test Suites' }).click();

    const suiteCards = page.locator('.suite-card');
    await expect(suiteCards.first()).toBeVisible({ timeout: 10000 });

    // Each card should show a summary
    const summary = suiteCards.first().locator('.suite-card-summary');
    await expect(summary).toBeVisible();
  });

  test('navigates to suite detail from suite card', async ({ page }) => {
    await page.locator('.tab', { hasText: 'Test Suites' }).click();

    const firstSuiteLink = page.locator('.suite-card-name').first();
    await expect(firstSuiteLink).toBeVisible({ timeout: 10000 });
    await firstSuiteLink.click();

    await page.waitForURL(/\/projects\/\d+\/suites\/\d+/);
  });

  test('shows runs table in Runs tab', async ({ page }) => {
    await page.locator('.tab', { hasText: 'Test Runs' }).click();

    // We created a run, so the table should appear
    const table = page.locator('.data-table');
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  test('navigates to run detail from run row', async ({ page }) => {
    await page.locator('.tab', { hasText: 'Test Runs' }).click();

    const firstRow = page.locator('.data-table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();
    await page.waitForURL(/\/runs\/\d+/);
  });
});

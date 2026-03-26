import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Dashboard Page', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Dashboard Project ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E Dashboard Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E Dashboard Section ${Date.now()}`);
    await api.createCase({
      title: `E2E Dashboard Case ${Date.now()}`,
      section_id: section.id,
      suite_id: suiteId,
    });

    // Create a run so the Runs tab has data
    await api.createRun(projectId, `E2E Dashboard Run ${Date.now()}`, suiteId);
  });

  test.afterAll(async () => {
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test('navigates to project detail page', async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain(`/projects/${projectId}`);
  });

  test('shows stat tiles with counts', async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Overview tab should be active by default
    await expect(page.locator('.tab.active')).toContainText('Overview');

    // Stat tiles should be visible
    const tiles = page.locator('.ov-stat-tile');
    await expect(tiles.first()).toBeVisible({ timeout: 10000 });
    const count = await tiles.count();
    // We created 1 suite with 1 case, so at least the stat tiles should render
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('shows Suite Health grid', async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    const suiteCards = page.locator('.ov-suite-card');
    await expect(suiteCards.first()).toBeVisible({ timeout: 10000 });
    const count = await suiteCards.count();
    expect(count).toBe(1); // We created exactly 1 suite
  });

  test('switches between Overview, Suites, and Runs tabs', async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Click Suites tab
    const suitesTab = page.locator('.tab', { hasText: 'Test Suites' });
    await suitesTab.click();
    await expect(suitesTab).toHaveClass(/active/);

    // Click Runs tab
    const runsTab = page.locator('.tab', { hasText: 'Test Runs' });
    await runsTab.click();
    await expect(runsTab).toHaveClass(/active/);

    // Click back to Overview
    const overviewTab = page.locator('.tab', { hasText: 'Overview' });
    await overviewTab.click();
    await expect(overviewTab).toHaveClass(/active/);
  });

  test('lists suites in Suites tab', async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Switch to Suites tab
    await page.locator('.tab', { hasText: 'Test Suites' }).click();

    // Suite cards should appear
    const suiteCards = page.locator('.suite-card');
    await expect(suiteCards.first()).toBeVisible({ timeout: 10000 });
    const count = await suiteCards.count();
    expect(count).toBe(1); // We created exactly 1 suite
  });
});

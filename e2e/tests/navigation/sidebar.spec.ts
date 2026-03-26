import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Sidebar Navigation', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Sidebar Project ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E Sidebar Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E Sidebar Section ${Date.now()}`);
    await api.createCase({
      title: `E2E Sidebar Case ${Date.now()}`,
      section_id: section.id,
      suite_id: suiteId,
    });
  });

  test.afterAll(async () => {
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
  });

  test('displays brand logo and wordmark', async ({ page }) => {
    const logo = page.locator('.sidebar-logo-img');
    await expect(logo).toBeVisible();

    const sidebar = page.locator('.sidebar');
    const isCollapsed = await sidebar.evaluate(el => el.classList.contains('sidebar--collapsed'));
    if (!isCollapsed) {
      const wordmark = page.locator('.sidebar-logo-name');
      await expect(wordmark).toBeVisible();
    }
  });

  test('shows project/suite tree navigation', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    const isCollapsed = await sidebar.evaluate(el => el.classList.contains('sidebar--collapsed'));

    if (!isCollapsed) {
      // Test Suites section toggle should be visible
      const suitesToggle = page.locator('.sidebar-section-toggle', { hasText: /test suites/i });
      await expect(suitesToggle).toBeVisible();

      // Click to expand
      await suitesToggle.click();
      await page.waitForTimeout(300);

      // Suite items should be visible
      const suiteItems = page.locator('.sidebar-suite-item');
      await expect(suiteItems.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('collapses and expands sidebar', async ({ page }) => {
    const sidebar = page.locator('.sidebar');

    // Click the logo to toggle collapse
    const logo = page.locator('.sidebar-logo-img');
    await logo.click();
    await page.waitForTimeout(300);

    const isNowCollapsed = await sidebar.evaluate(el => el.classList.contains('sidebar--collapsed'));

    // Toggle back
    await logo.click();
    await page.waitForTimeout(300);

    const isNowExpanded = await sidebar.evaluate(el => el.classList.contains('sidebar--collapsed'));
    expect(isNowCollapsed).not.toBe(isNowExpanded);
  });

  test('shows username and logout', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    const isCollapsed = await sidebar.evaluate(el => el.classList.contains('sidebar--collapsed'));

    if (!isCollapsed) {
      const username = page.locator('.sidebar-username');
      await expect(username).toBeVisible();
      await expect(username).toContainText('demo');

      const logoutBtn = page.locator('.sidebar-logout');
      await expect(logoutBtn).toBeVisible();
    }
  });

  test('navigates between pages via sidebar links', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    const isCollapsed = await sidebar.evaluate(el => el.classList.contains('sidebar--collapsed'));

    if (isCollapsed) {
      await page.locator('.sidebar-logo-img').click();
      await page.waitForTimeout(300);
    }

    // Click Overview link — navigates to a project page
    const overviewLink = page.locator('.sidebar-link', { hasText: /overview/i });
    await expect(overviewLink).toBeVisible();
    await overviewLink.click();
    await page.waitForURL(/\/projects\/\d+/, { timeout: 15000 });

    // Expand suites section and click a suite
    const suitesToggle = page.locator('.sidebar-section-toggle', { hasText: /test suites/i });
    const chevron = suitesToggle.locator('.sidebar-chevron');
    const isOpen = await chevron.evaluate(el => el.classList.contains('open')).catch(() => false);
    if (!isOpen) {
      await suitesToggle.click();
      await page.waitForTimeout(300);
    }

    const firstSuiteItem = page.locator('.sidebar-suite-item').first();
    const suiteVisible = await firstSuiteItem.isVisible().catch(() => false);
    if (suiteVisible) {
      await firstSuiteItem.click();
      await page.waitForURL(/\/projects\/\d+\/suites\/\d+/);
    }
  });
});

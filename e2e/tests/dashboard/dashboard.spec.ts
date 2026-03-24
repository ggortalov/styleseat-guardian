import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test('redirects / to project detail page', async ({ page }) => {
    await page.goto('/');
    // ProjectRedirect navigates to /projects/:id
    await page.waitForURL(/\/projects\/\d+/, { timeout: 15000 });
  });

  test('shows stat tiles with counts', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/projects\/\d+/, { timeout: 15000 });

    // Overview tab should be active by default
    await expect(page.locator('.tab.active')).toContainText('Overview');

    // Stat tiles should be visible
    const tiles = page.locator('.ov-stat-tile');
    await expect(tiles.first()).toBeVisible({ timeout: 10000 });
    const count = await tiles.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('shows Suite Health grid', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/projects\/\d+/, { timeout: 15000 });

    const suiteCards = page.locator('.ov-suite-card');
    await expect(suiteCards.first()).toBeVisible({ timeout: 10000 });
    const count = await suiteCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('switches between Overview, Suites, and Runs tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/projects\/\d+/, { timeout: 15000 });

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
    await page.goto('/');
    await page.waitForURL(/\/projects\/\d+/, { timeout: 15000 });

    // Switch to Suites tab
    await page.locator('.tab', { hasText: 'Test Suites' }).click();

    // Suite cards should appear
    const suiteCards = page.locator('.suite-card');
    await expect(suiteCards.first()).toBeVisible({ timeout: 10000 });
    const count = await suiteCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

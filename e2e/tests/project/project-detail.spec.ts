import { test, expect } from '@playwright/test';

test.describe('Project Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/projects\/\d+/, { timeout: 15000 });
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

    // Either show runs table or "no runs" message
    const table = page.locator('.data-table');
    const empty = page.locator('.empty-message');
    await expect(table.or(empty)).toBeVisible({ timeout: 10000 });
  });

  test('navigates to run detail from run row', async ({ page }) => {
    await page.locator('.tab', { hasText: 'Test Runs' }).click();

    const firstRow = page.locator('.data-table tbody tr').first();
    const isVisible = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await firstRow.click();
      await page.waitForURL(/\/runs\/\d+/);
    }
  });
});

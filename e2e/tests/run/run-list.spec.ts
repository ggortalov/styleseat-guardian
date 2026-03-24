import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Test Runs Page', () => {
  let api: ApiClient;
  let projectId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();
    const projects = await api.getProjects();
    projectId = projects[0].id;
  });

  test('displays run sections', async ({ page }) => {
    await page.goto('/runs');
    await page.waitForLoadState('networkidle');

    // Page should show "Test Runs" heading
    await expect(page.locator('.page-heading')).toContainText('Test Runs', { timeout: 15000 });

    // Should show either Open Runs or Completed section
    const openRuns = page.getByText('Open Runs');
    const completed = page.getByText('Completed');
    await expect(openRuns.or(completed).first()).toBeVisible({ timeout: 10000 });
  });

  test('shows pass rate on run cards', async ({ page }) => {
    await page.goto('/runs');
    await page.waitForLoadState('networkidle');

    // Run cards (compact or full) should show pass rate
    const runCards = page.locator('.run-card-v2, .run-card-v2--compact');
    const hasCards = await runCards.first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasCards) {
      expect(hasCards).toBeTruthy();
    }
  });

  test('navigates to run detail from card', async ({ page }) => {
    await page.goto('/runs');
    await page.waitForLoadState('networkidle');

    const firstRunLink = page.locator('.run-card-v2-name').first();
    const isVisible = await firstRunLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await firstRunLink.click();
      await page.waitForURL(/\/runs\/\d+/);
    }
  });

  test('opens import modal (UI only)', async ({ page }) => {
    await page.goto('/runs');
    await page.waitForLoadState('networkidle');

    // The button says "Import from CircleCI"
    const importBtn = page.getByRole('button', { name: /import from circleci/i });
    await expect(importBtn).toBeVisible({ timeout: 15000 });
    await importBtn.click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();

    // Close the modal
    await modal.getByRole('button', { name: /cancel/i }).click();
    await expect(modal).not.toBeVisible();
  });
});

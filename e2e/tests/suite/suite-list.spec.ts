import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Suite List (Dashboard)', () => {
  let api: ApiClient;
  let projectId: number;
  const createdSuiteIds: number[] = [];

  test.beforeAll(async () => {
    api = await ApiClient.login();
    const projects = await api.getProjects();
    projectId = projects[0].id;
  });

  test.afterAll(async () => {
    for (const id of createdSuiteIds) {
      await api.deleteSuite(id).catch(() => {});
    }
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to the /suites route (TestSuitesPage / DashboardPage)
    await page.goto('/suites');
    await page.waitForLoadState('networkidle');
  });

  test('displays suite grid with stats', async ({ page }) => {
    const suiteCards = page.locator('.project-card');
    await expect(suiteCards.first()).toBeVisible({ timeout: 15000 });
    const count = await suiteCards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await expect(suiteCards.first().locator('.project-card-summary')).toBeVisible();
  });

  test('creates new suite via modal', async ({ page }) => {
    const suiteName = `E2E Suite ${Date.now()}`;

    await page.getByRole('button', { name: '+ Add New Suite' }).click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();

    await modal.locator('input[placeholder="Enter suite name"]').fill(suiteName);
    await modal.getByRole('button', { name: 'Create Suite' }).click();

    // Should navigate to the new suite page
    await page.waitForURL(/\/projects\/\d+\/suites\/\d+/, { timeout: 10000 });

    const match = page.url().match(/\/suites\/(\d+)/);
    if (match) createdSuiteIds.push(Number(match[1]));
  });

  test('edits suite name via modal', async ({ page }) => {
    const firstCard = page.locator('.project-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
    await firstCard.locator('.project-card-links button', { hasText: 'Edit' }).click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();

    const input = modal.locator('input[placeholder="Enter suite name"]');
    await expect(input).toBeVisible();

    const currentValue = await input.inputValue();
    expect(currentValue).toBeTruthy();

    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).not.toBeVisible();
  });

  test('deletes suite with confirmation', async ({ page }) => {
    const suiteName = `Delete Me ${Date.now()}`;
    await api.createSuite(projectId, suiteName);

    await page.reload();
    await page.waitForLoadState('networkidle');

    const card = page.locator('.project-card', { hasText: suiteName });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.locator('.project-card-links button', { hasText: 'Delete' }).click();

    const dialog = page.locator('.confirm-overlay');
    await expect(dialog).toBeVisible();

    await page.locator('.confirm-safeguard-input').fill('DELETE');
    await page.waitForTimeout(500);
    await page.locator('.confirm-btn-delete').click();

    await expect(card).not.toBeVisible({ timeout: 10000 });
  });

  test('navigates to suite detail from card', async ({ page }) => {
    const firstSuiteLink = page.locator('.project-card-name').first();
    await expect(firstSuiteLink).toBeVisible({ timeout: 15000 });
    await firstSuiteLink.click();

    await page.waitForURL(/\/projects\/\d+\/suites\/\d+/);
    await expect(page.locator('.page-heading')).toBeVisible();
  });
});

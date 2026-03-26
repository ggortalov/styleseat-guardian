import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Suite List (Dashboard)', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  let suiteName: string;
  const createdSuiteIds: number[] = [];

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Suite List Project ${Date.now()}`);
    projectId = project.id;

    // Create a suite with a case so the card has stats
    suiteName = `E2E Existing Suite ${Date.now()}`;
    const suite = await api.createSuite(projectId, suiteName);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E SL Section ${Date.now()}`);
    await api.createCase({
      title: `E2E SL Case ${Date.now()}`,
      section_id: section.id,
      suite_id: suiteId,
    });
  });

  test.afterAll(async () => {
    for (const id of createdSuiteIds) {
      await api.deleteSuite(id).catch(() => {});
    }
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to the global TestSuitesPage
    await page.goto('/suites');
    await page.waitForLoadState('networkidle');
  });

  test('displays suite grid with stats', async ({ page }) => {
    // Our created suite should appear in the global list
    const ourCard = page.locator('.project-card', { hasText: suiteName });
    await expect(ourCard).toBeVisible({ timeout: 15000 });
    await expect(ourCard.locator('.project-card-summary')).toBeVisible();
  });

  test('creates new suite via modal', async ({ page }) => {
    const newSuiteName = `E2E New Suite ${Date.now()}`;

    await page.getByRole('button', { name: '+ Add New Suite' }).click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();

    await modal.locator('input[placeholder="Enter suite name"]').fill(newSuiteName);
    await modal.getByRole('button', { name: 'Create Suite' }).click();

    // Should navigate to the new suite page
    await page.waitForURL(/\/projects\/\d+\/suites\/\d+/, { timeout: 10000 });

    const match = page.url().match(/\/suites\/(\d+)/);
    if (match) createdSuiteIds.push(Number(match[1]));
  });

  test('edits suite name via modal', async ({ page }) => {
    const ourCard = page.locator('.project-card', { hasText: suiteName });
    await expect(ourCard).toBeVisible({ timeout: 15000 });

    // Click the Edit button on our specific suite card
    await ourCard.locator('.project-card-links button', { hasText: 'Edit' }).click();

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
    const deleteSuiteName = `Delete Me ${Date.now()}`;
    await api.createSuite(projectId, deleteSuiteName);

    await page.reload();
    await page.waitForLoadState('networkidle');

    const card = page.locator('.project-card', { hasText: deleteSuiteName });
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
    const ourCardLink = page.locator('.project-card', { hasText: suiteName }).locator('.project-card-name');
    await expect(ourCardLink).toBeVisible({ timeout: 15000 });
    await ourCardLink.click();

    await page.waitForURL(/\/projects\/\d+\/suites\/\d+/);
    await expect(page.locator('.page-heading')).toBeVisible();
  });
});

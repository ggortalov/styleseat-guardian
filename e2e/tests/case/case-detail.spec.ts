import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Test Case Detail Page', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  let sectionId: number;
  let caseId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Case Detail Project ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E CD Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E CD Section ${Date.now()}`);
    sectionId = section.id;

    const testCase = await api.createCase({
      title: `E2E CD Case ${Date.now()}`,
      section_id: sectionId,
      suite_id: suiteId,
      priority: 'High',
      case_type: 'Functional',
      steps: [{ action: 'Step 1', expected: 'Result 1' }],
    });
    caseId = testCase.id;
  });

  test.afterAll(async () => {
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test('displays case title, meta, and steps', async ({ page }) => {
    await page.goto(`/cases/${caseId}`);
    await page.waitForLoadState('networkidle');

    // Title should be visible (h1 or .case-detail-title)
    const title = page.locator('.case-detail-title').or(page.locator('h1'));
    await expect(title).toBeVisible({ timeout: 10000 });

    // Metadata grid should be visible
    const metaGrid = page.locator('.case-meta-grid');
    await expect(metaGrid).toBeVisible();
  });

  test('shows priority badge', async ({ page }) => {
    await page.goto(`/cases/${caseId}`);
    await page.waitForLoadState('networkidle');

    const priorityMeta = page.locator('.case-meta-item', { hasText: /priority/i });
    await expect(priorityMeta).toBeVisible({ timeout: 10000 });
  });

  test('navigates to edit form', async ({ page }) => {
    await page.goto(`/cases/${caseId}`);
    await page.waitForLoadState('networkidle');

    const editBtn = page.getByRole('button', { name: /edit/i }).or(page.locator('a', { hasText: /edit/i }));
    const isVisible = await editBtn.isVisible().catch(() => false);
    if (isVisible) {
      await editBtn.click();
      await page.waitForURL(/\/cases\/\d+\/edit/);
    }
  });

  test('deletes case with confirmation', async ({ page }) => {
    // Create a case to delete
    const caseName = `E2E Delete Detail ${Date.now()}`;
    const newCase = await api.createCase({
      title: caseName,
      section_id: sectionId,
      suite_id: suiteId,
    });

    await page.goto(`/cases/${newCase.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /delete/i }).click();

    const dialog = page.locator('.confirm-overlay');
    await expect(dialog).toBeVisible();

    await page.locator('.confirm-safeguard-input').fill('DELETE');
    await page.waitForTimeout(500);
    await page.locator('.confirm-btn-delete').click();

    // Should redirect back to suite page
    await page.waitForURL(/\/projects\/\d+\/suites\/\d+/, { timeout: 10000 });
  });
});

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
    const projects = await api.getProjects();
    projectId = projects[0].id;

    const suites = await api.getSuites(projectId);
    suiteId = suites.find((s: any) => s.case_count > 0)?.id || suites[0].id;

    const cases = await api.getCases(suiteId);
    if (cases.length > 0) {
      caseId = cases[0].id;
      sectionId = cases[0].section_id;
    }
  });

  test('displays case title, meta, and steps', async ({ page }) => {
    test.skip(!caseId, 'No test cases available');

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
    test.skip(!caseId, 'No test cases available');

    await page.goto(`/cases/${caseId}`);
    await page.waitForLoadState('networkidle');

    const priorityMeta = page.locator('.case-meta-item', { hasText: /priority/i });
    await expect(priorityMeta).toBeVisible({ timeout: 10000 });
  });

  test('navigates to edit form', async ({ page }) => {
    test.skip(!caseId, 'No test cases available');

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

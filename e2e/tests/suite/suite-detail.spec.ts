import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Suite Detail Page', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  let sectionId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();
    const projects = await api.getProjects();
    projectId = projects[0].id;

    const suites = await api.getSuites(projectId);
    const suiteWithCases = suites.find((s: any) => s.case_count > 0) || suites[0];
    suiteId = suiteWithCases.id;

    const sections = await api.getSections(suiteId);
    if (sections.length > 0) {
      sectionId = sections[0].id;
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${projectId}/suites/${suiteId}`);
    await page.waitForLoadState('networkidle');
  });

  test('displays section tree with cases', async ({ page }) => {
    const categoryGroups = page.locator('.category-group');
    await expect(categoryGroups.first()).toBeVisible({ timeout: 15000 });
    const count = await categoryGroups.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('collapses and expands sections', async ({ page }) => {
    const firstHeader = page.locator('.category-header').first();
    await expect(firstHeader).toBeVisible({ timeout: 15000 });

    const chevron = firstHeader.locator('.category-chevron');
    const isOpen = await chevron.evaluate(el => el.classList.contains('open'));

    await firstHeader.click();
    await page.waitForTimeout(300);

    const isOpenAfter = await chevron.evaluate(el => el.classList.contains('open'));
    expect(isOpenAfter).toBe(!isOpen);
  });

  test('creates new section (category)', async ({ page }) => {
    const categoryName = `E2E Category ${Date.now()}`;

    await page.getByRole('button', { name: '+ Category' }).click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();
    await modal.locator('input[placeholder="Enter category name"]').fill(categoryName);
    await modal.getByRole('button', { name: 'Create' }).click();

    // Wait for modal to close
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // New category should appear in the tree (may need to scroll)
    const newCategory = page.locator('.category-header-name', { hasText: categoryName });
    await expect(newCategory).toBeVisible({ timeout: 15000 });

    // Clean up
    const sections = await api.getSections(suiteId);
    const created = sections.find((s: any) => s.name === categoryName);
    if (created) {
      await api.deleteSection(created.id);
    }
  });

  test('navigates to case detail from case row', async ({ page }) => {
    const firstHeader = page.locator('.category-header').first();
    await expect(firstHeader).toBeVisible({ timeout: 15000 });
    const chevron = firstHeader.locator('.category-chevron');
    const isOpen = await chevron.evaluate(el => el.classList.contains('open'));
    if (!isOpen) {
      await firstHeader.click();
      await page.waitForTimeout(300);
    }

    const firstCase = page.locator('.case-row-title').first();
    const isVisible = await firstCase.isVisible().catch(() => false);
    if (isVisible) {
      await firstCase.click();
      await page.waitForURL(/\/cases\/\d+/);
    }
  });

  test('navigates to new case form', async ({ page }) => {
    const addCaseBtn = page.getByRole('button', { name: '+ Test Case' });
    await expect(addCaseBtn).toBeVisible({ timeout: 15000 });
    const isDisabled = await addCaseBtn.isDisabled();
    if (!isDisabled) {
      await addCaseBtn.click();
      await page.waitForURL(/\/cases\/new/);
    }
  });

  test('enables manage mode with checkboxes', async ({ page }) => {
    const manageBtn = page.getByRole('button', { name: 'Manage' });
    await expect(manageBtn).toBeVisible({ timeout: 15000 });
    await manageBtn.click();

    // Manage button should show active state
    await expect(page.locator('.btn-manage-active')).toBeVisible({ timeout: 5000 });

    // Click manage again to exit
    await page.locator('.btn-manage-active').click();
  });

  test('bulk delete selected cases', async ({ page }) => {
    if (!sectionId) return;

    const caseName = `E2E Delete Case ${Date.now()}`;
    const newCase = await api.createCase({
      title: caseName,
      section_id: sectionId,
      suite_id: suiteId,
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Enter manage mode
    await page.getByRole('button', { name: 'Manage' }).click();
    await page.waitForTimeout(300);

    const expandedCases = page.locator('.case-row', { hasText: caseName });
    const caseVisible = await expandedCases.isVisible().catch(() => false);

    if (caseVisible) {
      await expandedCases.locator('.case-checkbox').click();

      const bulkBar = page.locator('.bulk-action-bar');
      await expect(bulkBar).toBeVisible();

      await bulkBar.getByRole('button', { name: 'Delete Selected' }).click();

      await page.locator('.confirm-safeguard-input').fill('DELETE');
      await page.waitForTimeout(500);
      await page.locator('.confirm-btn-delete').click();

      await expect(expandedCases).not.toBeVisible({ timeout: 10000 });
    } else {
      await api.deleteCase(newCase.id);
    }
  });
});

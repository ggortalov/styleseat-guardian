import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Test Case Create Page', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  let sectionId: number;

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Case Create Project ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E CC Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E CC Section ${Date.now()}`);
    sectionId = section.id;

    // Create a case so the suite has content
    await api.createCase({
      title: `E2E CC Existing Case ${Date.now()}`,
      section_id: sectionId,
      suite_id: suiteId,
    });
  });

  test.afterAll(async () => {
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${projectId}/suites/${suiteId}/cases/new`);
    await page.waitForLoadState('networkidle');
  });

  test('displays form with all fields', async ({ page }) => {
    await expect(page.locator('input[placeholder="Enter test case title"]')).toBeVisible({ timeout: 15000 });
    // Category select, Type select, Priority select should exist
    const selects = page.locator('select');
    const selectCount = await selects.count();
    expect(selectCount).toBeGreaterThanOrEqual(3);
    await expect(page.getByRole('button', { name: 'Create Test Case' })).toBeVisible();
  });

  test('adds and removes step rows', async ({ page }) => {
    const addStepBtn = page.getByRole('button', { name: '+ Add Step' });
    await expect(addStepBtn).toBeVisible();

    // Count initial steps
    const initialSteps = await page.locator('.step-row').count();

    // Add a step
    await addStepBtn.click();
    const afterAdd = await page.locator('.step-row').count();
    expect(afterAdd).toBe(initialSteps + 1);

    // Remove the last step (if there's more than 1)
    if (afterAdd > 1) {
      const removeButtons = page.locator('.step-row button');
      await removeButtons.last().click();
      const afterRemove = await page.locator('.step-row').count();
      expect(afterRemove).toBe(afterAdd - 1);
    }
  });

  test('creates case and redirects to suite', async ({ page }) => {
    const caseName = `E2E Test Case ${Date.now()}`;

    await page.locator('input[placeholder="Enter test case title"]').fill(caseName);

    // Select the first category option (if section select exists)
    const categorySelect = page.locator('select').first();
    const options = await categorySelect.locator('option').allTextContents();
    if (options.length > 1) {
      await categorySelect.selectOption({ index: 1 });
    }

    await page.getByRole('button', { name: 'Create Test Case' }).click();

    // Should redirect back to the suite page
    await page.waitForURL(/\/projects\/\d+\/suites\/\d+/, { timeout: 10000 });

    // Clean up: find and delete the created case
    const cases = await api.getCases(suiteId);
    const created = cases.find((c: any) => c.title === caseName);
    if (created) {
      await api.deleteCase(created.id);
    }
  });

  test('validation: empty title prevents submission', async ({ page }) => {
    // Leave title empty and try to submit
    await page.getByRole('button', { name: 'Create Test Case' }).click();

    // The required input should prevent form submission
    const titleInput = page.locator('input[placeholder="Enter test case title"]');
    await expect(titleInput).toHaveAttribute('required', '');
  });
});

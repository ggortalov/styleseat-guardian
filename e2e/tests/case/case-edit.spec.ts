import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

test.describe('Test Case Edit Page', () => {
  let api: ApiClient;
  let projectId: number;
  let suiteId: number;
  let sectionId: number;
  let caseId: number;
  let caseName: string;

  test.beforeAll(async () => {
    api = await ApiClient.login();

    const project = await api.createProject(`E2E Case Edit Project ${Date.now()}`);
    projectId = project.id;

    const suite = await api.createSuite(projectId, `E2E CE Suite ${Date.now()}`);
    suiteId = suite.id;

    const section = await api.createSection(suiteId, `E2E CE Section ${Date.now()}`);
    sectionId = section.id;

    // Create a dedicated case for edit tests
    caseName = `E2E Edit Case ${Date.now()}`;
    const created = await api.createCase({
      title: caseName,
      section_id: sectionId,
      suite_id: suiteId,
      priority: 'Medium',
      case_type: 'Functional',
      preconditions: 'Test precondition',
      steps: [{ action: 'Step 1', expected: 'Result 1' }],
      expected_result: 'Overall expected result',
    });
    caseId = created.id;
  });

  test.afterAll(async () => {
    if (projectId) await api.deleteProject(projectId).catch(() => {});
  });

  test('loads existing data into form', async ({ page }) => {
    await page.goto(`/projects/${projectId}/suites/${suiteId}/cases/${caseId}/edit`);
    await page.waitForLoadState('networkidle');

    const titleInput = page.locator('input[placeholder="Enter test case title"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await expect(titleInput).toHaveValue(caseName);

    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
  });

  test('updates title and saves', async ({ page }) => {
    const updatedName = `${caseName} Updated`;

    await page.goto(`/projects/${projectId}/suites/${suiteId}/cases/${caseId}/edit`);
    await page.waitForLoadState('networkidle');

    const titleInput = page.locator('input[placeholder="Enter test case title"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.clear();
    await titleInput.fill(updatedName);

    await page.getByRole('button', { name: 'Save Changes' }).click();

    await page.waitForURL(/\/projects\/\d+\/suites\/\d+/, { timeout: 10000 });
    caseName = updatedName;
  });

  test('cancel without saving', async ({ page }) => {
    await page.goto(`/projects/${projectId}/suites/${suiteId}/cases/${caseId}/edit`);
    await page.waitForLoadState('networkidle');

    const titleInput = page.locator('input[placeholder="Enter test case title"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.clear();
    await titleInput.fill('Should Not Be Saved');

    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.waitForURL(/\/projects\/\d+\/suites\/\d+/, { timeout: 10000 });
  });
});

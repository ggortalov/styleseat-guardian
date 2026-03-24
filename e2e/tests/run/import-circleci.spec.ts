import { test, expect } from '@playwright/test';
import { ApiClient } from '../../helpers/api-client';

/**
 * Regression test for CircleCI import workflow-to-suite mapping.
 *
 * The `cronschedule_smoke` workflow contains a `dr_mobile` job whose tests
 * live in `cypress/e2e/prod/`.  Before the fix, `dr_mobile` resolved to a
 * non-existent `cypress/e2e/dr/` path and was either skipped or mis-named
 * as "SMOKE".  After the fix it should resolve to the PROD suite.
 */

const WORKFLOW_URL =
  'https://app.circleci.com/pipelines/github/styleseat/cypress/61645/workflows/4a6e02e6-1c24-4446-b432-b29936f688ef';
const WORKFLOW_ID_PREFIX = '4a6e02e6';

test.describe('CircleCI Import — DR→PROD mapping', () => {
  let api: ApiClient;
  let projectId: number;
  let createdRunId: number | null = null;

  test.beforeAll(async () => {
    api = await ApiClient.login();
    const projects = await api.getProjects();
    projectId = projects[0].id;

    // Remove any previous import of this workflow so the test is idempotent
    const runs = await api.getRuns(projectId);
    for (const run of runs) {
      if (run.description?.includes(WORKFLOW_ID_PREFIX)) {
        await api.deleteRun(run.id).catch(() => {});
      }
    }
  });

  test.afterAll(async () => {
    // Clean up the run created by this test
    if (createdRunId) {
      await api.deleteRun(createdRunId).catch(() => {});
    }
  });

  test('imports dr_mobile workflow as PROD with results', async ({ page }) => {
    // Trigger import via API
    const importResp = await api.importCircleCI(WORKFLOW_URL);
    expect(importResp.status).toBe('started');

    // Poll until import finishes (timeout 120s for network I/O)
    let status: Awaited<ReturnType<ApiClient['getImportStatus']>>;
    const deadline = Date.now() + 120_000;
    do {
      await new Promise((r) => setTimeout(r, 2000));
      status = await api.getImportStatus();
    } while (status.running && Date.now() < deadline);

    expect(status.running).toBe(false);
    expect(status.success).toBe(true);

    // The output should mention PROD, not SMOKE or DR
    expect(status.output).toContain('PROD');
    expect(status.output).not.toMatch(/Suite: SMOKE/);
    expect(status.output).not.toMatch(/Suite: DR\b/);

    // Find the newly created run
    const runs = await api.getRuns(projectId);
    const prodRun = runs.find(
      (r: any) => r.description?.includes(WORKFLOW_ID_PREFIX) && r.name.includes('PROD')
    );
    expect(prodRun).toBeTruthy();
    createdRunId = prodRun.id;

    // Verify run name contains PROD (not SMOKE or DR)
    expect(prodRun.name).toContain('PROD');
    expect(prodRun.name).not.toContain('SMOKE');
    expect(prodRun.name).not.toContain(' DR ');

    // Verify results exist and all passed
    const results = await api.getRunResults(prodRun.id);
    expect(results.length).toBe(19);

    const passedCount = results.filter((r: any) => r.status === 'Passed').length;
    expect(passedCount).toBe(19);

    // Verify in the UI — navigate to run detail and check heading
    await page.goto(`/runs/${prodRun.id}`);
    await page.waitForLoadState('networkidle');

    const heading = page.locator('.page-heading');
    await expect(heading).toContainText('PROD', { timeout: 15000 });

    // Stat tiles should show 19 passed
    const passedTile = page.locator('.stat-tile', { hasText: 'Passed' });
    await expect(passedTile).toBeVisible({ timeout: 10000 });
    await expect(passedTile).toContainText('19');
  });
});
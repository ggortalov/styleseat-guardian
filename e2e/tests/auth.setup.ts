import { test as setup } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '..', 'auth-state', 'demo-user.json');

setup('authenticate as demo user', async ({ page }) => {
  // Login via the UI with "Remember me" checked so token goes to localStorage
  // (Playwright storageState captures localStorage but NOT sessionStorage)
  await page.goto('/login');
  await page.locator('#login-username').fill('demo');
  await page.locator('#login-password').fill('Demo1234');

  // Check "Remember me" so the token is stored in localStorage
  await page.getByText('Remember me').click();

  await page.getByRole('button', { name: 'Log In' }).click();

  // Wait for the sidebar to appear (indicates successful auth + page load)
  await page.locator('.sidebar').waitFor({ state: 'visible', timeout: 15000 });

  // Save storage state (includes localStorage with JWT token)
  await page.context().storageState({ path: AUTH_FILE });
});

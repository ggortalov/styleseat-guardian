import { test, expect } from '@playwright/test';

// Auth tests do NOT use saved storageState — they test login flow directly
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('displays login form with username and password fields', async ({ page }) => {
    await expect(page.locator('#login-username')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
  });

  test('logs in with valid credentials and redirects to app', async ({ page }) => {
    await page.locator('#login-username').fill('demo');
    await page.locator('#login-password').fill('Demo1234');
    await page.getByRole('button', { name: 'Log In' }).click();

    // Should load the app — sidebar appears
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 15000 });
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.locator('#login-username').fill('demo');
    await page.locator('#login-password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.locator('.auth-error')).toBeVisible();
  });

  test('shows error for empty fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Log In' }).click();

    // HTML5 required attribute prevents submission
    const usernameInput = page.locator('#login-username');
    await expect(usernameInput).toHaveAttribute('required', '');
  });

  test('has link to registration page', async ({ page }) => {
    const signUpLink = page.getByRole('link', { name: /sign up/i });
    await expect(signUpLink).toBeVisible();
    await signUpLink.click();
    await page.waitForURL('/register');
  });

  test('stores token after login with remember me', async ({ page }) => {
    await page.locator('#login-username').fill('demo');
    await page.locator('#login-password').fill('Demo1234');
    // Check "Remember me" to store in localStorage
    await page.getByText('Remember me').click();
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 15000 });

    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
  });
});

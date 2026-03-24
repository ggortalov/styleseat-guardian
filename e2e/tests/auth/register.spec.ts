import { test, expect } from '@playwright/test';

// Auth tests do NOT use saved storageState
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Register Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('displays registration form with all fields', async ({ page }) => {
    await expect(page.locator('#reg-username')).toBeVisible();
    await expect(page.locator('#reg-email')).toBeVisible();
    await expect(page.locator('#reg-password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
  });

  test('shows error for non-styleseat.com email', async ({ page }) => {
    await page.locator('#reg-username').fill('testuser');
    await page.locator('#reg-email').fill('testuser@gmail.com');
    await page.locator('#reg-password').fill('Test1234');
    await page.getByRole('button', { name: 'Sign Up' }).click();

    await expect(page.locator('.auth-error')).toBeVisible();
  });

  test('shows password requirement errors for weak password', async ({ page }) => {
    await page.locator('#reg-username').fill('testuser2');
    await page.locator('#reg-email').fill('testuser2@styleseat.com');
    await page.locator('#reg-password').fill('short');
    await page.getByRole('button', { name: 'Sign Up' }).click();

    // Should show password requirements list
    await expect(page.locator('.auth-error')).toBeVisible();
  });

  test('has link back to login page', async ({ page }) => {
    const loginLink = page.getByRole('link', { name: /log in/i });
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await page.waitForURL('/login');
  });
});

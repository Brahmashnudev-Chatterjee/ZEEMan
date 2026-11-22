const { test, expect } = require('@playwright/test');

const configured = () => Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test('session history never restores login after sign-in or a protected page after sign-out', async ({ page }) => {
  test.skip(!configured(), 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD for authenticated navigation checks.');

  await page.goto('/');
  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address').fill(process.env.E2E_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  await page.goBack();
  await expect(page).not.toHaveURL(/\/login$/);

  await page.goto('/admin/tasks');
  await expect(page.getByRole('heading', { name: 'Task management' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/login$/, { timeout: 5000 });
});

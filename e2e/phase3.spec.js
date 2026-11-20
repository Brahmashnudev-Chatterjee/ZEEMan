const { test, expect } = require('@playwright/test');

const uniqueAccount = (label) => ({
  name: `${label} Browser User`,
  email: `${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
  password: 'Phase3BrowserPassword_2026'
});

async function register(page, account) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(account.name);
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

async function finishOnboarding(page, account, prefix) {
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('Full name').fill(account.name);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('Project name').fill(`${prefix} onboarding project`);
  await page.getByLabel('Start date').first().fill('2026-01-01');
  await page.getByLabel('Due date').first().fill('2026-02-01');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('Task title').fill(`${prefix} onboarding task`);
  await page.getByLabel('Description').fill('Created through browser onboarding.');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your workspace is ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to dashboard' }).click();
  await expect(page).toHaveURL(/\/user\/dashboard$/);
}

test('public landing, login, registration, and protected routes render correctly', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /get started/i }).first()).toBeVisible();
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to ZeeMan' })).toBeVisible();
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible();
  await page.goto('/verify-email?token=invalid-token');
  await expect(page.locator('#verify-status')).toContainText('invalid, expired, or already used');
  await page.goto('/user/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('invalid login is rejected and public registration creates a user journey', async ({ page }) => {
  const account = uniqueAccount('Invalid Login');
  await page.goto('/login');
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password').fill('NotTheCorrectPassword_2026');
  await page.getByTestId('auth-submit').click();
  await expect(page.locator('#auth-status')).toContainText('Incorrect email or password.');
  await register(page, account);
});

test('resends verification, verifies an email, and completes onboarding', async ({ page }) => {
  const account = uniqueAccount('Verification');
  await register(page, account);
  await page.goto('/verify-email');
  await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeVisible();
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  const verification = page.getByRole('link', { name: 'Open local verification link' });
  await expect(verification).toBeVisible();
  await page.goto(await verification.getAttribute('href'));
  await expect(page.locator('#verify-status')).toContainText('Your email is verified');
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await finishOnboarding(page, account, 'Verification');
  await page.reload();
  await expect(page.getByText('Verification onboarding task')).toBeVisible();
});

test('creates project and task, persists Kanban movement, resets password, and logs out', async ({ page }) => {
  const account = uniqueAccount('Workspace'); const replacementPassword = 'Phase3ReplacementPassword_2026';
  await register(page, account);
  await finishOnboarding(page, account, 'Workspace');
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('button', { name: /new project/i }).click();
  await page.getByLabel('Project name').fill('Workspace dashboard project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Workspace dashboard project')).toBeVisible();
  await page.getByRole('button', { name: /new task/i }).click();
  await page.getByLabel('Task title').fill('Workspace Kanban task');
  await page.getByLabel('Description').fill('Move me with drag and drop.');
  await page.getByLabel('Project').selectOption({ label: 'Workspace dashboard project' });
  await page.getByRole('button', { name: 'Create task' }).click();
  await page.locator('[data-view="kanban"]').click();
  await page.locator('.kanban-card', { hasText: 'Workspace Kanban task' }).dragTo(page.locator('[data-status="in_progress"] .dropzone'));
  await expect(page.locator('[data-status="in_progress"]')).toContainText('Workspace Kanban task');
  await page.reload();
  await page.locator('[data-view="kanban"]').click();
  await expect(page.locator('[data-status="in_progress"]')).toContainText('Workspace Kanban task');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email address').fill(account.email);
  await page.getByRole('button', { name: 'Request reset link' }).click();
  const reset = page.getByRole('link', { name: 'Open local reset link' });
  await expect(reset).toBeVisible();
  await page.goto(await reset.getAttribute('href'));
  await page.getByLabel('New password').fill(replacementPassword);
  await page.getByLabel('Confirm password').fill(replacementPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 5_000 });
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password').fill(replacementPassword);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/\/user\/dashboard$/);
});

test('configured administrator redirects to the admin dashboard', async ({ page }) => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this existing-admin check.');
  await page.goto('/login');
  await page.getByLabel('Email address').fill(process.env.E2E_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

const { test, expect } = require('@playwright/test');

const account = (label) => ({
  name: `${label} Browser User`,
  email: `${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
  password: 'BrowserWorkflowPassword2026'
});

async function register(page, user) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(user.name);
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

async function finishAllocationOnboarding(page, user) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Full name').fill(user.name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Ready for allocated work' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to dashboard' }).click();
  await expect(page).toHaveURL(/\/user\/dashboard$/);
}

async function logout(page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function login(page, user, destination) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(destination);
}

test('public routes, authentication validation, verification, reset, and allocation onboarding work', async ({ page }) => {
  const user = account('Public Flow'); const nextPassword = 'ReplacementBrowserPassword2026';
  await page.goto('/');
  await expect(page.getByRole('link', { name: /get started/i }).first()).toHaveAttribute('href', '/register');
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password').fill('WrongPassword000');
  await page.getByTestId('auth-submit').click();
  await expect(page.locator('#auth-status')).toContainText('Incorrect email or password.');
  await register(page, user);
  await page.goto('/verify-email');
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  const verification = page.getByRole('link', { name: 'Open local verification link' });
  await expect(verification).toBeVisible();
  await page.goto(await verification.getAttribute('href'));
  await expect(page.locator('#verify-status')).toContainText('Your email is verified');
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await finishAllocationOnboarding(page, user);
  await logout(page);
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email address').fill(user.email);
  await page.getByRole('button', { name: 'Request reset link' }).click();
  const reset = page.getByRole('link', { name: 'Open local reset link' });
  await expect(reset).toBeVisible();
  await page.goto(await reset.getAttribute('href'));
  await page.getByLabel('New password').fill(nextPassword);
  await page.getByLabel('Confirm password').fill(nextPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, { ...user, password: nextPassword }, /\/user\/dashboard$/);
});

test('admin allocates a project and tasks; members can update only their own assignments', async ({ browser }) => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD for the Docker workflow journey.');
  const userA = account('Allocated A'); const userB = account('Allocated B'); const projectName = `Browser Project ${Date.now()}`; const taskA = `Browser Task A ${Date.now()}`; const taskB = `Browser Task B ${Date.now()}`;
  const pageA = await browser.newPage(); const pageB = await browser.newPage(); const adminPage = await browser.newPage();
  try {
    await register(pageA, userA); await finishAllocationOnboarding(pageA, userA); await logout(pageA);
    await register(pageB, userB); await finishAllocationOnboarding(pageB, userB); await logout(pageB);
    await login(adminPage, { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD }, /\/admin\/dashboard$/);
    await adminPage.goto('/admin/projects');
    await adminPage.locator('#create-project').click();
    await expect(adminPage.locator('#project-form')).toBeVisible();
    await adminPage.getByLabel('Project name').fill(projectName);
    await adminPage.locator('select[name="member_ids"]').selectOption([{ label: `${userA.name} — ${userA.email}` }, { label: `${userB.name} — ${userB.email}` }]);
    await adminPage.locator('#project-form').getByRole('button', { name: 'Create project' }).click();
    await expect(adminPage.getByText(projectName)).toBeVisible();
    await adminPage.locator('.category-card', { hasText: projectName }).getByRole('button', { name: 'Manage project' }).click();
    await expect(adminPage.getByRole('heading', { name: projectName })).toBeVisible();
    for (const [title, assignee] of [[taskA, userA], [taskB, userB]]) {
      await adminPage.getByRole('button', { name: 'Create task' }).click();
      await adminPage.getByLabel('Task title').fill(title);
      await adminPage.getByLabel('Assigned user').selectOption({ label: assignee.name });
      await adminPage.getByRole('button', { name: 'Create task' }).last().click();
      await expect(adminPage.locator('strong', { hasText: title }).first()).toBeVisible();
    }
    await login(pageA, userA, /\/user\/dashboard$/);
    await pageA.goto('/user/projects'); await pageA.getByRole('button', { name: 'View project' }).click();
    await expect(pageA.locator('strong', { hasText: taskA }).first()).toBeVisible(); await expect(pageA.locator('strong', { hasText: taskB }).first()).toBeVisible();
    await pageA.goto('/user/my-tasks'); await expect(pageA.locator('strong', { hasText: taskA }).first()).toBeVisible(); await expect(pageA.locator('strong', { hasText: taskB })).toHaveCount(0);
    await pageA.locator('[data-own-status]').selectOption('in_progress'); await expect(pageA.locator('[data-own-status]')).toHaveValue('in_progress');
    await login(pageB, userB, /\/user\/dashboard$/); await pageB.goto('/user/my-tasks'); await expect(pageB.locator('strong', { hasText: taskB }).first()).toBeVisible(); await expect(pageB.locator('strong', { hasText: taskA })).toHaveCount(0);
    await pageB.locator('[data-own-status]').selectOption('completed'); await expect(pageB.locator('[data-own-status]')).toHaveValue('completed');
    await adminPage.reload(); await expect(adminPage.getByText('50% complete')).toBeVisible();
  } finally { await pageA.close(); await pageB.close(); await adminPage.close(); }
});

const { test, expect } = require('@playwright/test');

const adminReady = () => Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);
const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function login(page, email, password, destination) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(destination);
}

async function call(page, path, method = 'GET', body) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(`/api${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }, { path, method, body });
}

test('employee task collaboration uses the shared Admin records and keeps employee permissions scoped', async ({ browser }) => {
  test.skip(!adminReady(), 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD for the isolated Docker collaboration fixture.');
  const suffix = unique();
  const employee = { name: `Collaboration Employee ${suffix}`, email: `employee-collab-${suffix}@example.test`, password: 'EmployeeCollaborationPassword2026' };
  const adminContext = await browser.newContext();
  const employeeContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const worker = await employeeContext.newPage();
  let employeeId; let projectId; let taskId; let adminAttachmentId;
  try {
    await login(admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD, /\/admin\/dashboard$/);
    let response = await call(admin, '/admin/users', 'POST', { name: employee.name, email: employee.email, password: employee.password, role: 'user', account_status: 'active' });
    expect(response.status).toBe(201); employeeId = response.body.user.id;
    response = await call(admin, '/projects', 'POST', { name: `Collaboration Project ${suffix}`, description: 'Isolated collaboration fixture', status: 'active', member_ids: [employeeId] });
    expect(response.status).toBe(201); projectId = response.body.project.id;
    response = await call(admin, '/tasks', 'POST', { project_id: projectId, user_id: employeeId, title: `Employee collaboration task ${suffix}`, description: 'Work through the attached brief.', priority: 'high', status: 'pending' });
    expect(response.status).toBe(201); taskId = response.body.task.id;
    response = await call(admin, `/tasks/${taskId}/comments`, 'POST', { body: 'Admin instruction for @employee.', mention_ids: [employeeId] });
    expect(response.status).toBe(201);
    response = await call(admin, `/tasks/${taskId}/attachments`, 'POST', { file: { name: 'admin-brief.txt', mime_type: 'text/plain', content_base64: Buffer.from('Private admin brief').toString('base64') } });
    expect(response.status).toBe(201); adminAttachmentId = response.body.attachment.id;
    response = await call(admin, `/tasks/${taskId}/subtasks`, 'POST', { title: 'Employee subtask', description: 'Complete this assigned subtask.', user_id: employeeId, status: 'pending' });
    expect(response.status).toBe(201);
    response = await call(admin, `/tasks/${taskId}/checklists`, 'POST', { title: 'Employee checklist item', user_id: employeeId });
    expect(response.status).toBe(201);

    await login(worker, employee.email, employee.password, /\/user\/dashboard$/);
    await worker.goto('/user/my-tasks');
    await expect(worker.getByText(`Employee collaboration task ${suffix}`, { exact: true })).toBeVisible();
    await expect(worker.getByRole('button', { name: 'View task' })).toBeVisible();
    await worker.goto(`/user/projects/${projectId}`);
    await expect(worker.getByText(`Employee collaboration task ${suffix}`, { exact: true })).toBeVisible();
    await worker.goto('/user/calendar');
    await expect(worker.getByRole('button', { name: 'View task' })).toBeVisible();
    await worker.goto('/user/kanban');
    await expect(worker.getByRole('button', { name: 'Open task' })).toBeVisible();
    await worker.getByRole('button', { name: 'Open task' }).click();
    await expect(worker).toHaveURL(new RegExp(`/user/tasks/${taskId}$`));
    await worker.goto('/user/notifications');
    await expect(worker.locator('[data-open]').first()).toBeVisible();
    await worker.goto(`/user/tasks/${taskId}`);
    for (const name of ['Comments', 'Attachments', 'Subtasks', 'Checklists', 'Activity timeline']) await expect(worker.getByRole('heading', { name })).toBeVisible();
    await expect(worker.getByText('Admin instruction for @employee.')).toBeVisible();
    await expect(worker.getByText('admin-brief.txt', { exact: true })).toBeVisible();
    await expect(worker.getByText('Employee subtask', { exact: true })).toBeVisible();
    await expect(worker.getByText('Employee checklist item', { exact: true })).toBeVisible();

    await worker.locator('#comment-form textarea').fill('Employee reply with the requested update.');
    await worker.getByRole('button', { name: 'Post comment' }).click();
    await expect(worker.getByText('Employee reply with the requested update.')).toBeVisible();
    await worker.getByRole('button', { name: 'Edit' }).click();
    await worker.getByLabel('Edit comment').fill('Employee edited update.');
    await worker.getByRole('button', { name: 'Save' }).click();
    await expect(worker.getByText('Employee edited update.')).toBeVisible();

    // Larger than Express's historical 100 KB JSON body limit; validates the
    // base64 upload path used by real employee image/document deliverables.
    await worker.locator('#attachment-file').setInputFiles({ name: 'employee-deliverable.txt', mimeType: 'text/plain', buffer: Buffer.alloc(130 * 1024, 'E') });
    await worker.getByRole('button', { name: 'Upload attachment' }).click();
    await expect(worker.getByText('employee-deliverable.txt', { exact: true })).toBeVisible();
    const download = worker.waitForEvent('download');
    await worker.getByRole('link', { name: 'Download' }).first().click();
    await expect(await download).toBeTruthy();

    await worker.getByLabel('Status for Employee subtask').selectOption('completed');
    await expect(worker.getByText('1/1').first()).toBeVisible();
    await worker.locator('[data-checklist-complete]').check();
    await expect(worker.locator('[data-checklist-complete]')).toBeChecked();
    await worker.locator('#parent-task-status').selectOption('in_progress');
    await expect(worker.locator('#parent-task-status')).toHaveValue('in_progress');

    response = await call(worker, `/tasks/${taskId}`, 'PATCH', { priority: 'low' });
    expect(response.status).toBe(403);
    response = await call(worker, `/attachments/${adminAttachmentId}`, 'DELETE');
    expect(response.status).toBe(403);
    response = await call(worker, '/notifications?limit=100');
    expect(response.status).toBe(200);
    expect(response.body.notifications.some(notification => notification.type === 'task_mention')).toBeTruthy();

    await admin.goto(`/admin/tasks/${taskId}`);
    await expect(admin.getByText('Employee edited update.')).toBeVisible();
    await expect(admin.getByText('employee-deliverable.txt', { exact: true })).toBeVisible();
    await expect(admin.getByText('1/1').first()).toBeVisible();
  } finally {
    if (projectId) await call(admin, `/projects/${projectId}`, 'DELETE').catch(() => {});
    if (employeeId) await call(admin, `/admin/users/${employeeId}`, 'DELETE').catch(() => {});
    await adminContext.close();
    await employeeContext.close();
  }
});

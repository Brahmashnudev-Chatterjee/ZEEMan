const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(os.tmpdir(), `zeeman-workflow-${process.pid}-${Date.now()}.db`);
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough';
process.env.APP_ORIGIN = 'http://localhost:3000';

const app = require('../src/app');
const { initializeDatabase, get, run } = require('../src/config/database');
const origin = 'http://localhost:3000';
const password = 'StrongPassword123';
const json = (agent, method, url, body) => agent[method](url).set('Origin', origin).send(body);
const unique = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

let admin;
let userA;
let userB;
let userC;
let ids = {};

test.before(async () => {
  await initializeDatabase();
  await run('INSERT INTO users (name, email, password_hash, role, onboarding_completed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)', ['Workflow Admin', unique('admin'), await bcrypt.hash(password, 10), 'admin']);
  const adminRow = await get("SELECT * FROM users WHERE role='admin' ORDER BY id DESC LIMIT 1");
  admin = request.agent(app);
  await json(admin, 'post', '/api/auth/login', { email: adminRow.email, password }).expect(200);

  async function register(name) {
    const agent = request.agent(app);
    const response = await json(agent, 'post', '/api/auth/register', { name, email: unique(name.toLowerCase().replaceAll(' ', '-')), password }).expect(201);
    return { agent, id: response.body.user.id };
  }
  userA = await register('Allocated User A');
  userB = await register('Allocated User B');
  userC = await register('Unallocated User C');
});

test('health, registration, login validation, logout, and CSRF origin guard remain functional', async () => {
  await request(app).get('/api/health').expect(200).expect(({ body }) => assert.equal(body.service, 'zeeman-api'));
  await json(request(app), 'post', '/api/auth/login', { email: 'no-account@example.test', password }).expect(401);
  await request(app).post('/api/auth/register').send({ name: 'Blocked Origin', email: unique('blocked'), password }).expect(403);
  const loggedIn = request.agent(app);
  const email = unique('logout');
  await json(loggedIn, 'post', '/api/auth/register', { name: 'Logout User', email, password }).expect(201);
  await json(loggedIn, 'post', '/api/auth/logout', {}).expect(204);
  await loggedIn.get('/api/auth/me').expect(401);
});

test('only an admin can create a project and allocate members', async () => {
  await json(userA.agent, 'post', '/api/projects', { name: 'Forbidden project' }).expect(403);
  const created = await json(admin, 'post', '/api/projects', {
    name: 'Project A', description: 'Admin-planned work', status: 'active',
    start_date: '2026-11-20', due_date: '2026-12-20', member_ids: [userA.id, userB.id]
  }).expect(201);
  ids.project = created.body.project.id;
  assert.equal(created.body.project.owner_user_id > 0, true);
  const members = await admin.get(`/api/projects/${ids.project}/members`).expect(200);
  assert.deepEqual(members.body.members.map((member) => member.id).sort((a, b) => a - b), [ids.project ? userA.id : 0, userB.id, members.body.members.find((m) => m.member_role === 'owner').id].sort((a, b) => a - b));
  assert.equal(members.body.members.filter((member) => member.member_role === 'member').length, 2);
});

test('admin creates project tasks only for project members', async () => {
  await json(userA.agent, 'post', '/api/tasks', { project_id: ids.project, user_id: userA.id, title: 'Forbidden task' }).expect(403);
  await json(admin, 'post', '/api/tasks', { project_id: ids.project, user_id: userC.id, title: 'Invalid member assignment', priority: 'high' }).expect(400);
  const taskA = await json(admin, 'post', '/api/tasks', {
    project_id: ids.project, user_id: userA.id, title: 'Task A', description: 'Assigned to A', priority: 'high', status: 'pending', start_date: '2026-11-20', due_date: '2026-12-01'
  }).expect(201);
  const taskB = await json(admin, 'post', '/api/tasks', {
    project_id: ids.project, user_id: userB.id, title: 'Task B', description: 'Assigned to B', priority: 'medium', status: 'pending', start_date: '2026-11-20', due_date: '2026-12-02'
  }).expect(201);
  ids.taskA = taskA.body.task.id;
  ids.taskB = taskB.body.task.id;
  assert.equal(taskA.body.task.project_id, ids.project);
  assert.equal(taskB.body.task.user_id, userB.id);
});

test('allocated users can read their project but only see own work in My Tasks', async () => {
  const visibleProject = await userA.agent.get(`/api/projects/${ids.project}`).expect(200);
  assert.equal(visibleProject.body.project.name, 'Project A');
  const projectTasks = await userA.agent.get(`/api/projects/${ids.project}/tasks`).expect(200);
  assert.deepEqual(projectTasks.body.tasks.map((task) => task.id).sort((a, b) => a - b), [ids.taskA, ids.taskB].sort((a, b) => a - b));
  await userA.agent.get(`/api/projects/${ids.project}/activity`).expect(403);
  const ownTasks = await userA.agent.get('/api/tasks?assigned_to_me=true').expect(200);
  assert.deepEqual(ownTasks.body.tasks.map((task) => task.id), [ids.taskA]);
  await userC.agent.get(`/api/projects/${ids.project}`).expect(404);
  await userC.agent.get(`/api/tasks/${ids.taskA}`).expect(404);
});

test('a user can update only the status of their assigned task', async () => {
  await json(userA.agent, 'patch', `/api/tasks/${ids.taskB}/status`, { status: 'in_progress' }).expect(403);
  await json(userA.agent, 'patch', `/api/tasks/${ids.taskA}/status`, { status: 'in_progress', priority: 'low' }).expect(400);
  const aUpdated = await json(userA.agent, 'patch', `/api/tasks/${ids.taskA}/status`, { status: 'in_progress' }).expect(200);
  assert.equal(aUpdated.body.task.status, 'in_progress');
  const bUpdated = await json(userB.agent, 'patch', `/api/tasks/${ids.taskB}/status`, { status: 'completed' }).expect(200);
  assert.equal(bUpdated.body.task.status, 'completed');
  assert.ok(bUpdated.body.task.completed_at);
  await json(userA.agent, 'patch', `/api/tasks/${ids.taskA}`, { priority: 'low' }).expect(403);
  await json(userA.agent, 'delete', `/api/tasks/${ids.taskA}`, {}).expect(403);
});

test('admin monitoring shows persisted assignments, progress, members, and activity', async () => {
  const project = await admin.get(`/api/projects/${ids.project}`).expect(200);
  assert.equal(project.body.project.progress, 50);
  const tasks = await admin.get(`/api/projects/${ids.project}/tasks`).expect(200);
  assert.deepEqual(tasks.body.tasks.map((task) => task.status).sort(), ['completed', 'in_progress']);
  const members = await admin.get(`/api/projects/${ids.project}/members`).expect(200);
  const memberA = members.body.members.find((member) => member.id === userA.id);
  const memberB = members.body.members.find((member) => member.id === userB.id);
  assert.equal(memberA.assigned_tasks, 1);
  assert.equal(memberB.completed_tasks, 1);
  const activity = await admin.get(`/api/projects/${ids.project}/activity`).expect(200);
  assert.ok(activity.body.activity.some((entry) => entry.action === 'TASK_COMPLETED'));
});

test('regular-user onboarding is allocation based and cannot create a project or task', async () => {
  const fresh = request.agent(app);
  await json(fresh, 'post', '/api/auth/register', { name: 'Waiting Allocation', email: unique('waiting'), password }).expect(201);
  await json(fresh, 'put', '/api/auth/onboarding/profile', { name: 'Waiting Allocation', bio: 'Awaiting a project' }).expect(200);
  await json(fresh, 'post', '/api/auth/onboarding/complete', {}).expect(200);
  const onboarding = await fresh.get('/api/auth/onboarding').expect(200);
  assert.ok(onboarding.body.onboarding.onboarding_completed_at);
  await json(fresh, 'post', '/api/auth/onboarding/project', { name: 'No longer allowed' }).expect(404);
  await fresh.get('/api/projects').expect(200).expect(({ body }) => assert.equal(body.projects.length, 0));
});

test.after(() => {
  try { fs.rmSync(process.env.DATABASE_PATH, { force: true }); } catch (_) { /* test cleanup */ }
});

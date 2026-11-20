const { get, run } = require('../config/database');
const { asyncHandler, logActivity } = require('../utils/http');

exports.status = asyncHandler(async (req, res) => {
  const user = await get(`SELECT u.id, u.name, u.email, u.bio, u.avatar_url, u.onboarding_step, u.onboarding_completed_at, u.onboarding_project_id, u.onboarding_task_id,
    p.name AS onboarding_project_name, p.description AS onboarding_project_description, p.start_date AS onboarding_project_start_date, p.due_date AS onboarding_project_due_date,
    t.title AS onboarding_task_title, t.description AS onboarding_task_description, t.priority AS onboarding_task_priority, t.start_date AS onboarding_task_start_date, t.due_date AS onboarding_task_due_date
    FROM users u LEFT JOIN projects p ON p.id=u.onboarding_project_id LEFT JOIN tasks t ON t.id=u.onboarding_task_id WHERE u.id=?`, [req.user.id]);
  res.json({ onboarding: user });
});
exports.profile = asyncHandler(async (req, res) => {
  const { name, bio = '', avatar_url = '' } = req.body;
  if (!name?.trim() || typeof bio !== 'string' || typeof avatar_url !== 'string') return res.status(400).json({ message: 'Provide a valid name and profile details.' });
  await run('UPDATE users SET name=?, bio=?, avatar_url=?, onboarding_step=MAX(onboarding_step, 2), updated_at=CURRENT_TIMESTAMP WHERE id=?', [name.trim(), bio.slice(0, 500), avatar_url.slice(0, 500), req.user.id]);
  res.json({ message: 'Profile saved.' });
});
exports.project = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Projects are allocated by an administrator.' });
  const { name, description = '', start_date = null, due_date = null, skip = false } = req.body;
  if (skip) { await run('UPDATE users SET onboarding_step=MAX(onboarding_step, 3) WHERE id=?', [req.user.id]); return res.json({ skipped: true }); }
  if (!name?.trim()) return res.status(400).json({ message: 'Project name is required.' });
  if ((start_date && Number.isNaN(Date.parse(start_date))) || (due_date && Number.isNaN(Date.parse(due_date))) || (start_date && due_date && new Date(start_date) > new Date(due_date))) return res.status(400).json({ message: 'Use valid project dates with a start date on or before the due date.' });
  const user = await get('SELECT onboarding_project_id FROM users WHERE id=?', [req.user.id]);
  let projectId = user.onboarding_project_id;
  if (projectId) await run('UPDATE projects SET name=?, description=?, start_date=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_user_id=?', [name.trim(), description.slice(0, 1000), start_date || null, due_date || null, projectId, req.user.id]);
  else { const created = await run("INSERT INTO projects (name, description, owner_user_id, status, start_date, due_date) VALUES (?, ?, ?, 'active', ?, ?)", [name.trim(), description.slice(0, 1000), req.user.id, start_date || null, due_date || null]); projectId = created.id; await run("INSERT INTO project_members (project_id, user_id, member_role) VALUES (?, ?, 'owner')", [projectId, req.user.id]); await run('UPDATE users SET onboarding_project_id=? WHERE id=?', [projectId, req.user.id]); }
  await run('UPDATE users SET onboarding_step=MAX(onboarding_step, 3) WHERE id=?', [req.user.id]);
  await logActivity({ run }, req.user.id, 'ONBOARDING_PROJECT', `Set up onboarding project: ${name.trim()}`);
  res.json({ project_id: projectId });
});
exports.task = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Tasks are allocated by an administrator.' });
  const { title, description = '', priority = 'medium', start_date = null, due_date = null, skip = false } = req.body;
  if (skip) { await run('UPDATE users SET onboarding_step=MAX(onboarding_step, 4) WHERE id=?', [req.user.id]); return res.json({ skipped: true }); }
  if (!title?.trim() || !['low', 'medium', 'high'].includes(priority)) return res.status(400).json({ message: 'Provide a task title and valid priority.' });
  if ((start_date && Number.isNaN(Date.parse(start_date))) || (due_date && Number.isNaN(Date.parse(due_date))) || (start_date && due_date && new Date(start_date) > new Date(due_date))) return res.status(400).json({ message: 'Use valid task dates with a start date on or before the due date.' });
  const user = await get('SELECT onboarding_project_id, onboarding_task_id FROM users WHERE id=?', [req.user.id]);
  if (!user.onboarding_project_id) return res.status(400).json({ message: 'Create or skip a project before adding a task.' });
  if (user.onboarding_task_id) await run('UPDATE tasks SET title=?, description=?, priority=?, start_date=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?', [title.trim(), description.slice(0, 1000), priority, start_date || null, due_date || null, user.onboarding_task_id, req.user.id]);
  else { const created = await run("INSERT INTO tasks (title, description, user_id, project_id, priority, status, start_date, due_date) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)", [title.trim(), description.slice(0, 1000), req.user.id, user.onboarding_project_id, priority, start_date || null, due_date || null]); await run('UPDATE users SET onboarding_task_id=? WHERE id=?', [created.id, req.user.id]); }
  await run('UPDATE users SET onboarding_step=MAX(onboarding_step, 4) WHERE id=?', [req.user.id]);
  res.json({ message: 'First task saved.' });
});
exports.complete = asyncHandler(async (req, res) => { await run('UPDATE users SET onboarding_step=5, onboarding_completed_at=COALESCE(onboarding_completed_at, CURRENT_TIMESTAMP) WHERE id=?', [req.user.id]); res.json({ message: 'Onboarding complete.' }); });

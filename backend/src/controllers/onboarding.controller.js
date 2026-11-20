const { get, run } = require('../config/database');
const { asyncHandler, logActivity } = require('../utils/http');

exports.status = asyncHandler(async (req, res) => {
  const user = await get('SELECT id, name, email, bio, avatar_url, onboarding_step, onboarding_completed_at, onboarding_project_id, onboarding_task_id FROM users WHERE id=?', [req.user.id]);
  res.json({ onboarding: user });
});
exports.profile = asyncHandler(async (req, res) => {
  const { name, bio = '', avatar_url = '' } = req.body;
  if (!name?.trim() || typeof bio !== 'string' || typeof avatar_url !== 'string') return res.status(400).json({ message: 'Provide a valid name and profile details.' });
  await run('UPDATE users SET name=?, bio=?, avatar_url=?, onboarding_step=MAX(onboarding_step, 2), updated_at=CURRENT_TIMESTAMP WHERE id=?', [name.trim(), bio.slice(0, 500), avatar_url.slice(0, 500), req.user.id]);
  res.json({ message: 'Profile saved.' });
});
exports.project = asyncHandler(async (req, res) => {
  const { name, description = '', start_date = null, due_date = null } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Project name is required.' });
  const user = await get('SELECT onboarding_project_id FROM users WHERE id=?', [req.user.id]);
  let projectId = user.onboarding_project_id;
  if (projectId) await run('UPDATE projects SET name=?, description=?, start_date=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_user_id=?', [name.trim(), description.slice(0, 1000), start_date || null, due_date || null, projectId, req.user.id]);
  else { const created = await run("INSERT INTO projects (name, description, owner_user_id, status, start_date, due_date) VALUES (?, ?, ?, 'active', ?, ?)", [name.trim(), description.slice(0, 1000), req.user.id, start_date || null, due_date || null]); projectId = created.id; await run("INSERT INTO project_members (project_id, user_id, member_role) VALUES (?, ?, 'owner')", [projectId, req.user.id]); await run('UPDATE users SET onboarding_project_id=? WHERE id=?', [projectId, req.user.id]); }
  await run('UPDATE users SET onboarding_step=MAX(onboarding_step, 3) WHERE id=?', [req.user.id]);
  await logActivity({ run }, req.user.id, 'ONBOARDING_PROJECT', `Set up onboarding project: ${name.trim()}`);
  res.json({ project_id: projectId });
});
exports.task = asyncHandler(async (req, res) => {
  const { title, priority = 'medium', due_date = null } = req.body;
  if (!title?.trim() || !['low', 'medium', 'high'].includes(priority)) return res.status(400).json({ message: 'Provide a task title and valid priority.' });
  const user = await get('SELECT onboarding_project_id, onboarding_task_id FROM users WHERE id=?', [req.user.id]);
  if (!user.onboarding_project_id) return res.status(400).json({ message: 'Create or skip a project before adding a task.' });
  if (user.onboarding_task_id) await run('UPDATE tasks SET title=?, priority=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?', [title.trim(), priority, due_date || null, user.onboarding_task_id, req.user.id]);
  else { const created = await run("INSERT INTO tasks (title, user_id, project_id, priority, status, due_date) VALUES (?, ?, ?, ?, 'pending', ?)", [title.trim(), req.user.id, user.onboarding_project_id, priority, due_date || null]); await run('UPDATE users SET onboarding_task_id=? WHERE id=?', [created.id, req.user.id]); }
  await run('UPDATE users SET onboarding_step=MAX(onboarding_step, 4) WHERE id=?', [req.user.id]);
  res.json({ message: 'First task saved.' });
});
exports.complete = asyncHandler(async (req, res) => { await run('UPDATE users SET onboarding_step=5, onboarding_completed_at=COALESCE(onboarding_completed_at, CURRENT_TIMESTAMP) WHERE id=?', [req.user.id]); res.json({ message: 'Onboarding complete.' }); });

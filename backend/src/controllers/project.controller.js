const { get, all, run } = require('../config/database');
const { asyncHandler, logActivity, createNotification } = require('../utils/http');

const statuses = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
// Both members and tasks are one-to-many relationships. Count completed task IDs
// distinctly so the members join never inflates project progress.
const select = `SELECT p.*, o.name AS owner_name, COUNT(DISTINCT pm.user_id) AS member_count, COUNT(DISTINCT t.id) AS task_count, COUNT(DISTINCT CASE WHEN t.status='completed' THEN t.id END) AS completed_tasks FROM projects p JOIN users o ON o.id=p.owner_user_id LEFT JOIN project_members pm ON pm.project_id=p.id LEFT JOIN tasks t ON t.project_id=p.id`;
const group = ' GROUP BY p.id';
const accessible = (req, id) => req.user.role === 'admin'
  ? get(`${select} WHERE p.id=?${group}`, [id])
  : get(`${select} WHERE p.id=? AND (p.owner_user_id=? OR EXISTS (SELECT 1 FROM project_members access_pm WHERE access_pm.project_id=p.id AND access_pm.user_id=?))${group}`, [id, req.user.id, req.user.id]);

const valid = (body) => {
  if (!body.name?.trim()) return 'Project name is required.';
  if (body.status && !statuses.includes(body.status)) return 'Invalid project status.';
  if (body.start_date && Number.isNaN(Date.parse(body.start_date))) return 'Start date is invalid.';
  if (body.due_date && Number.isNaN(Date.parse(body.due_date))) return 'Due date is invalid.';
  if (body.start_date && body.due_date && new Date(body.start_date) > new Date(body.due_date)) return 'Start date must be on or before the due date.';
  return null;
};
const canManage = (req, project) => req.user.role === 'admin' || project.owner_user_id === req.user.id;

exports.list = asyncHandler(async (req, res) => {
  const conditions = [], params = [];
  if (req.user.role !== 'admin') { conditions.push('(p.owner_user_id=? OR EXISTS (SELECT 1 FROM project_members access_pm WHERE access_pm.project_id=p.id AND access_pm.user_id=?))'); params.push(req.user.id, req.user.id); }
  if (req.query.status && statuses.includes(req.query.status)) { conditions.push('p.status=?'); params.push(req.query.status); }
  if (req.query.search) { conditions.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  const projects = await all(`${select}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''}${group} ORDER BY p.updated_at DESC`, params);
  res.json({ projects: projects.map((project) => ({ ...project, progress: project.task_count ? Math.round((project.completed_tasks / project.task_count) * 100) : 0 })) });
});

exports.getOne = asyncHandler(async (req, res) => { const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' }); res.json({ project: { ...project, progress: project.task_count ? Math.round((project.completed_tasks / project.task_count) * 100) : 0 } }); });

exports.create = asyncHandler(async (req, res) => {
  const error = valid(req.body); if (error) return res.status(400).json({ message: error });
  const ownerId = req.user.id;
  const result = await run('INSERT INTO projects (name, description, owner_user_id, status, start_date, due_date) VALUES (?, ?, ?, ?, ?, ?)', [req.body.name.trim(), (req.body.description || '').trim(), ownerId, req.body.status || 'active', req.body.start_date || null, req.body.due_date || null]);
  await run("INSERT INTO project_members (project_id, user_id, member_role) VALUES (?, ?, 'owner')", [result.id, ownerId]);
  const memberIds = [...new Set((Array.isArray(req.body.member_ids) ? req.body.member_ids : []).map(Number).filter((id) => id && id !== ownerId))];
  for (const memberId of memberIds) { const member = await get("SELECT id FROM users WHERE id=? AND account_status='active'", [memberId]); if (!member) return res.status(400).json({ message: 'Every selected project member must be active.' }); await run("INSERT INTO project_members (project_id, user_id, member_role) VALUES (?, ?, 'member')", [result.id, memberId]); await createNotification({ run }, { userId: memberId, type: 'project_member_added', message: `You were added to project: ${req.body.name.trim()}`, linkPath: `/user/projects/${result.id}`, entityType: 'project', entityId: result.id }); }
  await logActivity({ run }, req.user.id, 'PROJECT_CREATED', `Created project: ${req.body.name.trim()}`, { entityType: 'project', entityId: result.id, projectId: result.id });
  res.status(201).json({ project: await accessible(req, result.id) });
});

exports.update = asyncHandler(async (req, res) => {
  const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' });
  if (!canManage(req, project)) return res.status(403).json({ message: 'Only the project owner can update this project.' });
  const input = { ...project, ...req.body }; const error = valid(input); if (error) return res.status(400).json({ message: error });
  await run('UPDATE projects SET name=?, description=?, status=?, start_date=?, due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [input.name.trim(), input.description || '', input.status, input.start_date || null, input.due_date || null, project.id]);
  const members = await all('SELECT user_id FROM project_members WHERE project_id=? AND user_id!=?', [project.id, req.user.id]);
  for (const member of members) await createNotification({ run }, { userId: member.user_id, type: 'project_updated', message: `Project updated: ${input.name.trim()}`, linkPath: `/user/projects/${project.id}`, entityType: 'project', entityId: project.id });
  await logActivity({ run }, req.user.id, 'PROJECT_UPDATED', `Updated project: ${input.name.trim()}`, { entityType: 'project', entityId: project.id, projectId: project.id });
  res.json({ project: await accessible(req, project.id) });
});

exports.archive = asyncHandler(async (req, res) => { const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' }); await run("UPDATE projects SET status='cancelled', archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?", [project.id]); await logActivity({ run }, req.user.id, 'PROJECT_ARCHIVED', `Archived project: ${project.name}`, { entityType: 'project', entityId: project.id, projectId: project.id }); res.json({ project: await accessible(req, project.id) }); });
exports.restore = asyncHandler(async (req, res) => { const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' }); await run("UPDATE projects SET status='active', archived_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?", [project.id]); await logActivity({ run }, req.user.id, 'PROJECT_RESTORED', `Restored project: ${project.name}`, { entityType: 'project', entityId: project.id, projectId: project.id }); res.json({ project: await accessible(req, project.id) }); });

exports.remove = asyncHandler(async (req, res) => { const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' }); if (!canManage(req, project)) return res.status(403).json({ message: 'Only the project owner can delete this project.' }); await run('DELETE FROM tasks WHERE project_id=?', [project.id]); await run('DELETE FROM projects WHERE id=?', [project.id]); await logActivity({ run }, req.user.id, 'PROJECT_DELETED', `Deleted project and its tasks: ${project.name}`, { entityType: 'project', entityId: project.id, projectId: project.id }); res.status(204).end(); });

exports.members = asyncHandler(async (req, res) => { const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' }); const members = await all(`SELECT u.id, u.name, u.email, u.account_status, pm.member_role, pm.created_at, COUNT(t.id) AS assigned_tasks, SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) AS completed_tasks, SUM(CASE WHEN t.status='pending' THEN 1 ELSE 0 END) AS pending_tasks FROM project_members pm JOIN users u ON u.id=pm.user_id LEFT JOIN tasks t ON t.project_id=pm.project_id AND t.user_id=u.id WHERE pm.project_id=? GROUP BY u.id, pm.project_id ORDER BY pm.member_role DESC, u.name`, [project.id]); res.json({ members }); });
exports.addMember = asyncHandler(async (req, res) => { const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' }); if (!canManage(req, project)) return res.status(403).json({ message: 'Only the project owner can manage members.' }); const member = await get("SELECT id, name FROM users WHERE id=? AND account_status='active'", [req.body.user_id]); if (!member) return res.status(400).json({ message: 'Choose an active user.' }); if (member.id === project.owner_user_id) return res.status(409).json({ message: 'The project owner is already a member.' }); try { await run("INSERT INTO project_members (project_id, user_id, member_role) VALUES (?, ?, 'member')", [project.id, member.id]); } catch (error) { if (error.code === 'SQLITE_CONSTRAINT' || error.code === '23505') return res.status(409).json({ message: 'This user is already a project member.' }); throw error; } await createNotification({ run }, { userId: member.id, type: 'project_member_added', message: `You were added to project: ${project.name}`, linkPath: `/user/projects/${project.id}`, entityType: 'project', entityId: project.id }); await logActivity({ run }, req.user.id, 'PROJECT_MEMBER_ADDED', `Added ${member.name} to ${project.name}`, { entityType: 'project', entityId: project.id, projectId: project.id, metadata: { memberId: member.id } }); res.status(201).json({ members: await all('SELECT u.id, u.name, u.email, pm.member_role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=?', [project.id]) }); });
exports.removeMember = asyncHandler(async (req, res) => { const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' }); if (!canManage(req, project)) return res.status(403).json({ message: 'Only the project owner can manage members.' }); const memberId = Number(req.params.userId); if (memberId === project.owner_user_id) return res.status(400).json({ message: 'The project owner cannot be removed.' }); const activeTasks = await get("SELECT COUNT(*) AS count FROM tasks WHERE project_id=? AND user_id=? AND status NOT IN ('completed','cancelled')", [project.id, memberId]); if (activeTasks.count) return res.status(409).json({ message: 'Reassign or complete this member’s active tasks before removing them.' }); const result = await run("DELETE FROM project_members WHERE project_id=? AND user_id=? AND member_role='member'", [project.id, memberId]); if (!result.changes) return res.status(404).json({ message: 'Project member not found.' }); await createNotification({ run }, { userId: memberId, type: 'project_member_removed', message: `You were removed from project: ${project.name}`, entityType: 'project', entityId: project.id }); await logActivity({ run }, req.user.id, 'PROJECT_MEMBER_REMOVED', `Removed a member from ${project.name}`, { entityType: 'project', entityId: project.id, projectId: project.id, metadata: { memberId } }); res.status(204).end(); });

exports.tasks = asyncHandler(async (req, res) => { const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' }); const tasks = await all(`SELECT t.*, u.name AS user_name FROM tasks t JOIN users u ON u.id=t.user_id WHERE t.project_id=? ORDER BY t.due_date`, [project.id]); res.json({ tasks }); });
exports.activity = asyncHandler(async (req, res) => { const project = await accessible(req, req.params.id); if (!project) return res.status(404).json({ message: 'Project not found.' }); const activity = await all('SELECT l.*, u.name AS user_name FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id WHERE l.description LIKE ? ORDER BY l.created_at DESC LIMIT 40', [`%${project.name}%`]); res.json({ activity }); });

exports.accessible = accessible;

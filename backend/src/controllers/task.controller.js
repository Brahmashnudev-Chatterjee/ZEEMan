const { get, all, run } = require('../config/database');
const { asyncHandler, logActivity, createNotification } = require('../utils/http');
const validStatus = ['pending', 'in_progress', 'on_hold', 'completed', 'cancelled'];
const validPriority = ['low', 'medium', 'high', 'urgent'];
const taskSelect = `SELECT t.*, CASE WHEN t.is_urgent=1 THEN 'urgent' ELSE t.priority END AS priority, CASE WHEN t.is_on_hold=1 THEN 'on_hold' ELSE t.status END AS status, u.name AS user_name, c.name AS category_name, p.name AS project_name, p.owner_user_id AS project_owner_id FROM tasks t JOIN users u ON u.id=t.user_id LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN projects p ON p.id=t.project_id`;
const storagePriority = (priority) => ({ priority: priority === 'urgent' ? 'high' : priority, isUrgent: priority === 'urgent' ? 1 : 0 });
const storageStatus = (status) => ({ status: status === 'on_hold' ? 'cancelled' : status, isOnHold: status === 'on_hold' ? 1 : 0 });
// Regular users work only on projects to which an administrator allocated them.
// Legacy personal tasks remain in the database for a deliberate migration, but are
// intentionally not exposed through the allocation-based workspace.
const accessCondition = `(t.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=t.project_id AND pm.user_id=?))`;
const validate = (body) => { if (!body.title?.trim()) return 'Task title is required.'; if (body.status && !validStatus.includes(body.status)) return 'Invalid task status.'; if (body.priority && !validPriority.includes(body.priority)) return 'Invalid task priority.'; if (body.start_date && Number.isNaN(Date.parse(body.start_date))) return 'Start date is invalid.'; if (body.due_date && Number.isNaN(Date.parse(body.due_date))) return 'Due date is invalid.'; if (body.start_date && body.due_date && new Date(body.start_date) > new Date(body.due_date)) return 'Start date must be on or before the due date.'; return null; };
const scope = (req, id) => req.user.role === 'admin' ? get(`${taskSelect} WHERE t.id=?`, [id]) : get(`${taskSelect} WHERE t.id=? AND (${accessCondition})`, [id, req.user.id]);
const projectFor = (id) => id ? get('SELECT * FROM projects WHERE id=?', [id]) : null;
const isMember = (projectId, userId) => get('SELECT member_role FROM project_members WHERE project_id=? AND user_id=?', [projectId, userId]);

async function assertProjectAccess(req, projectId, assignee) {
  if (!projectId) return;
  const project = await projectFor(projectId); if (!project) { const error = new Error('Project does not exist.'); error.status = 400; throw error; }
  if (req.user.role !== 'admin' && !await isMember(projectId, req.user.id)) { const error = new Error('You are not a member of this project.'); error.status = 403; throw error; }
  const member = await isMember(projectId, assignee);
  if (!member) { const error = new Error('Assign project tasks only to project members.'); error.status = 400; throw error; }
  if (req.user.role !== 'admin' && project.owner_user_id !== req.user.id && assignee !== req.user.id) { const error = new Error('Only the project owner can assign work to other members.'); error.status = 403; throw error; }
}

exports.list = asyncHandler(async (req, res) => {
  const { search = '', status, priority, category_id, project_id, assigned_to_me, sort = 'due_date', order = 'asc' } = req.query;
  const conditions = [], params = [];
  if (req.user.role !== 'admin') { conditions.push(`(${accessCondition})`); params.push(req.user.id); }
  if (assigned_to_me === 'true') { conditions.push('t.user_id=?'); params.push(req.user.id); }
  if (search) { conditions.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (status && validStatus.includes(status)) { if (status === 'on_hold') conditions.push('t.is_on_hold=1'); else { conditions.push('t.status=? AND t.is_on_hold=0'); params.push(status); } }
  if (priority && validPriority.includes(priority)) { if (priority === 'urgent') conditions.push('t.is_urgent=1'); else { conditions.push('t.priority=? AND t.is_urgent=0'); params.push(priority); } }
  if (category_id) { conditions.push('t.category_id=?'); params.push(category_id); }
  if (project_id) { conditions.push('t.project_id=?'); params.push(project_id); }
  const sorts = { due_date: 't.due_date', created_at: 't.created_at', priority: "CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END", updated_at: 't.updated_at' };
  res.json({ tasks: await all(`${taskSelect}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ${sorts[sort] || sorts.due_date} ${order === 'desc' ? 'DESC' : 'ASC'}`, params) });
});
exports.getOne = asyncHandler(async (req, res) => { const task = await scope(req, req.params.id); if (!task) return res.status(404).json({ message: 'Task not found.' }); res.json({ task }); });
exports.create = asyncHandler(async (req, res) => {
  const error = validate(req.body); if (error) return res.status(400).json({ message: error });
  if (!req.body.project_id || !req.body.user_id) return res.status(400).json({ message: 'Project and assigned user are required.' });
  const userId = Number(req.body.user_id);
  const owner = await get("SELECT id, name FROM users WHERE id=? AND account_status='active'", [userId]); if (!owner) return res.status(400).json({ message: 'Choose an active user.' });
  const categoryId = req.body.category_id || null; if (categoryId && !await get('SELECT id FROM categories WHERE id=?', [categoryId])) return res.status(400).json({ message: 'Category does not exist.' });
  const projectId = Number(req.body.project_id);
  try { await assertProjectAccess(req, projectId, userId); } catch (projectError) { return res.status(projectError.status || 400).json({ message: projectError.message }); }
  const requestedStatus = req.body.status || 'pending'; const requestedPriority = req.body.priority || 'medium';
  const status = storageStatus(requestedStatus); const priority = storagePriority(requestedPriority);
  const result = await run('INSERT INTO tasks (title, description, user_id, category_id, project_id, priority, is_urgent, status, is_on_hold, start_date, due_date, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [req.body.title.trim(), (req.body.description || '').trim(), userId, categoryId, projectId, priority.priority, priority.isUrgent, status.status, status.isOnHold, req.body.start_date || null, req.body.due_date || null, requestedStatus === 'completed' ? new Date().toISOString() : null]);
  if (userId !== req.user.id) await createNotification({ run }, { userId, type: 'task_assigned', message: `You were assigned: ${req.body.title.trim()}`, linkPath: `/user/tasks/${result.id}`, entityType: 'task', entityId: result.id });
  const created = await get(`${taskSelect} WHERE t.id=?`, [result.id]);
  await logActivity({ run }, req.user.id, 'TASK_CREATED', `Created task: ${req.body.title.trim()} in ${created.project_name}`, { entityType: 'task', entityId: result.id, projectId, metadata: { assigneeId: userId } });
  res.status(201).json({ task: created });
});
exports.update = asyncHandler(async (req, res) => {
  const task = await scope(req, req.params.id); if (!task) return res.status(404).json({ message: 'Task not found.' });
  const input = { ...task, ...req.body }; const error = validate(input); if (error) return res.status(400).json({ message: error });
  const userId = req.user.role === 'admin' && req.body.user_id ? Number(req.body.user_id) : task.user_id;
  const projectId = req.user.role === 'admin' && Object.hasOwn(req.body, 'project_id') ? (req.body.project_id || null) : task.project_id;
  try { await assertProjectAccess(req, projectId, userId); } catch (projectError) { return res.status(projectError.status || 400).json({ message: projectError.message }); }
  const status = storageStatus(input.status); const priority = storagePriority(input.priority); const completedAt = input.status === 'completed' ? (task.completed_at || new Date().toISOString()) : null;
  await run('UPDATE tasks SET title=?, description=?, user_id=?, category_id=?, project_id=?, priority=?, is_urgent=?, status=?, is_on_hold=?, start_date=?, due_date=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [input.title.trim(), input.description || '', userId, input.category_id || null, projectId, priority.priority, priority.isUrgent, status.status, status.isOnHold, input.start_date || null, input.due_date || null, completedAt, task.id]);
  if (userId !== task.user_id) await createNotification({ run }, { userId, type: 'task_reassigned', message: `You were assigned: ${input.title.trim()}`, linkPath: `/user/tasks/${task.id}`, entityType: 'task', entityId: task.id });
  const updated = await get(`${taskSelect} WHERE t.id=?`, [task.id]);
  await logActivity({ run }, req.user.id, userId !== task.user_id ? 'TASK_REASSIGNED' : 'TASK_UPDATED', `Updated task: ${input.title.trim()} in ${updated.project_name}`, { entityType: 'task', entityId: task.id, projectId, metadata: { assigneeId: userId } });
  res.json({ task: updated });
});
exports.updateStatus = asyncHandler(async (req, res) => {
  const task = await scope(req, req.params.id); if (!task) return res.status(404).json({ message: 'Task not found.' });
  if (req.user.role !== 'admin' && task.user_id !== req.user.id) return res.status(403).json({ message: 'Only the assigned user can update this task status.' });
  const keys = Object.keys(req.body || {});
  if (keys.length !== 1 || keys[0] !== 'status') return res.status(400).json({ message: 'Only the status field may be updated here.' });
  if (!validStatus.includes(req.body.status)) return res.status(400).json({ message: 'Invalid task status.' });
  const next = storageStatus(req.body.status); const completedAt = req.body.status === 'completed' ? (task.completed_at || new Date().toISOString()) : null;
  await run('UPDATE tasks SET status=?, is_on_hold=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [next.status, next.isOnHold, completedAt, task.id]);
  const action = req.body.status === 'completed' ? 'TASK_COMPLETED' : (task.status === 'completed' ? 'TASK_REOPENED' : 'TASK_STATUS_UPDATED');
  await logActivity({ run }, req.user.id, action, `${req.user.name} updated task status: ${task.title} in ${task.project_name}`, { entityType: 'task', entityId: task.id, projectId: task.project_id, metadata: { from: task.status, to: req.body.status } });
  if (req.user.role !== 'admin' && ['completed', 'pending', 'in_progress', 'on_hold'].includes(req.body.status)) await createNotification({ run }, { userId: task.project_owner_id, type: req.body.status === 'completed' ? 'task_completed' : 'task_status_updated', message: `${req.user.name} updated ${task.title} to ${req.body.status}`, linkPath: `/admin/projects/${task.project_id}`, entityType: 'task', entityId: task.id });
  res.json({ task: await get(`${taskSelect} WHERE t.id=?`, [task.id]) });
});
exports.remove = asyncHandler(async (req, res) => { const task = await scope(req, req.params.id); if (!task) return res.status(404).json({ message: 'Task not found.' }); if (req.user.role !== 'admin' && task.project_id && task.project_owner_id !== req.user.id && task.user_id !== req.user.id) return res.status(403).json({ message: 'Only the project owner or assigned user can delete this task.' }); await run('DELETE FROM tasks WHERE id=?', [task.id]); await logActivity({ run }, req.user.id, 'TASK_DELETED', `Deleted task: ${task.title} in ${task.project_name || 'a project'}`); res.status(204).end(); });

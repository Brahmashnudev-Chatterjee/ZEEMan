const { get, all, run } = require('../config/database');
const { asyncHandler, logActivity } = require('../utils/http');
const validStatus = ['pending', 'in_progress', 'completed', 'cancelled'];
const validPriority = ['low', 'medium', 'high'];
const taskSelect = `SELECT t.*, u.name AS user_name, c.name AS category_name, p.name AS project_name, p.owner_user_id AS project_owner_id FROM tasks t JOIN users u ON u.id=t.user_id LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN projects p ON p.id=t.project_id`;
const accessCondition = `(t.project_id IS NULL AND t.user_id=?) OR (t.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=t.project_id AND pm.user_id=?))`;
const validate = (body) => { if (!body.title?.trim()) return 'Task title is required.'; if (body.status && !validStatus.includes(body.status)) return 'Invalid task status.'; if (body.priority && !validPriority.includes(body.priority)) return 'Invalid task priority.'; if (body.due_date && Number.isNaN(Date.parse(body.due_date))) return 'Due date is invalid.'; return null; };
const scope = (req, id) => req.user.role === 'admin' ? get(`${taskSelect} WHERE t.id=?`, [id]) : get(`${taskSelect} WHERE t.id=? AND (${accessCondition})`, [id, req.user.id, req.user.id]);
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
  const { search = '', status, priority, category_id, project_id, sort = 'due_date', order = 'asc' } = req.query;
  const conditions = [], params = [];
  if (req.user.role !== 'admin') { conditions.push(`(${accessCondition})`); params.push(req.user.id, req.user.id); }
  if (search) { conditions.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (status && validStatus.includes(status)) { conditions.push('t.status=?'); params.push(status); }
  if (priority && validPriority.includes(priority)) { conditions.push('t.priority=?'); params.push(priority); }
  if (category_id) { conditions.push('t.category_id=?'); params.push(category_id); }
  if (project_id) { conditions.push('t.project_id=?'); params.push(project_id); }
  const sorts = { due_date: 't.due_date', created_at: 't.created_at', priority: "CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END", updated_at: 't.updated_at' };
  res.json({ tasks: await all(`${taskSelect}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ${sorts[sort] || sorts.due_date} ${order === 'desc' ? 'DESC' : 'ASC'}`, params) });
});
exports.getOne = asyncHandler(async (req, res) => { const task = await scope(req, req.params.id); if (!task) return res.status(404).json({ message: 'Task not found.' }); res.json({ task }); });
exports.create = asyncHandler(async (req, res) => {
  const error = validate(req.body); if (error) return res.status(400).json({ message: error });
  const userId = req.user.role === 'admin' && req.body.user_id ? Number(req.body.user_id) : req.user.id;
  const owner = await get("SELECT id, name FROM users WHERE id=? AND account_status='active'", [userId]); if (!owner) return res.status(400).json({ message: 'Choose an active user.' });
  const categoryId = req.body.category_id || null; if (categoryId && !await get('SELECT id FROM categories WHERE id=?', [categoryId])) return res.status(400).json({ message: 'Category does not exist.' });
  const projectId = req.body.project_id || null;
  try { await assertProjectAccess(req, projectId, userId); } catch (projectError) { return res.status(projectError.status || 400).json({ message: projectError.message }); }
  const status = req.body.status || 'pending';
  const result = await run('INSERT INTO tasks (title, description, user_id, category_id, project_id, priority, status, due_date, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [req.body.title.trim(), (req.body.description || '').trim(), userId, categoryId, projectId, req.body.priority || 'medium', status, req.body.due_date || null, status === 'completed' ? new Date().toISOString() : null]);
  if (userId !== req.user.id) await run('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)', [userId, 'task_assigned', `You were assigned: ${req.body.title.trim()}`]);
  await logActivity({ run }, req.user.id, 'TASK_CREATED', `Created task: ${req.body.title.trim()}`);
  res.status(201).json({ task: await get(`${taskSelect} WHERE t.id=?`, [result.id]) });
});
exports.update = asyncHandler(async (req, res) => {
  const task = await scope(req, req.params.id); if (!task) return res.status(404).json({ message: 'Task not found.' });
  const input = { ...task, ...req.body }; const error = validate(input); if (error) return res.status(400).json({ message: error });
  const userId = req.user.role === 'admin' && req.body.user_id ? Number(req.body.user_id) : task.user_id;
  const projectId = req.user.role === 'admin' && Object.hasOwn(req.body, 'project_id') ? (req.body.project_id || null) : task.project_id;
  try { await assertProjectAccess(req, projectId, userId); } catch (projectError) { return res.status(projectError.status || 400).json({ message: projectError.message }); }
  const status = input.status; const completedAt = status === 'completed' ? (task.completed_at || new Date().toISOString()) : null;
  await run('UPDATE tasks SET title=?, description=?, user_id=?, category_id=?, project_id=?, priority=?, status=?, due_date=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [input.title.trim(), input.description || '', userId, input.category_id || null, projectId, input.priority, status, input.due_date || null, completedAt, task.id]);
  if (userId !== task.user_id) await run('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)', [userId, 'task_assigned', `You were assigned: ${input.title.trim()}`]);
  await logActivity({ run }, req.user.id, 'TASK_UPDATED', `Updated task: ${input.title.trim()}`);
  res.json({ task: await get(`${taskSelect} WHERE t.id=?`, [task.id]) });
});
exports.remove = asyncHandler(async (req, res) => { const task = await scope(req, req.params.id); if (!task) return res.status(404).json({ message: 'Task not found.' }); if (req.user.role !== 'admin' && task.project_id && task.project_owner_id !== req.user.id && task.user_id !== req.user.id) return res.status(403).json({ message: 'Only the project owner or assigned user can delete this task.' }); await run('DELETE FROM tasks WHERE id=?', [task.id]); await logActivity({ run }, req.user.id, 'TASK_DELETED', `Deleted task: ${task.title}`); res.status(204).end(); });

const { get, all, run } = require('../config/database');
const project = require('./project.controller');
const { asyncHandler, logActivity, createNotification } = require('../utils/http');

const statuses = ['not_started', 'in_progress', 'completed', 'on_hold'];
const today = () => new Date().toISOString().slice(0, 10);

const progressOf = (row) => {
  const total = Number(row.task_count || 0);
  const completed = Number(row.completed_tasks || 0);
  const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
  return {
    ...row,
    task_count: total,
    completed_tasks: completed,
    progress: total ? Math.min(100, Math.round((completed * 100) / total)) : 0,
    is_overdue: Boolean(!row.archived_at && row.status !== 'completed' && due && due < today()),
    days_remaining: due ? Math.ceil((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000) : null
  };
};

const milestoneSelect = `SELECT m.*, COUNT(t.id) AS task_count, COUNT(CASE WHEN t.status='completed' THEN t.id END) AS completed_tasks FROM milestones m LEFT JOIN tasks t ON t.milestone_id=m.id`;
const milestoneGroup = ' GROUP BY m.id';
const loadMilestone = (projectId, milestoneId, includeArchived = true) => get(`${milestoneSelect} WHERE m.project_id=? AND m.id=?${includeArchived ? '' : ' AND m.archived_at IS NULL'}${milestoneGroup}`, [projectId, milestoneId]);

async function requireProject(req, res) {
  const value = await project.accessible(req, req.params.projectId);
  if (!value) { res.status(404).json({ message: 'Project not found.' }); return null; }
  return value;
}

const validate = (input) => {
  if (!input.title || !String(input.title).trim()) return 'Milestone title is required.';
  if (input.status && !statuses.includes(input.status)) return 'Invalid milestone status.';
  if (input.start_date && Number.isNaN(Date.parse(input.start_date))) return 'Start date is invalid.';
  if (input.due_date && Number.isNaN(Date.parse(input.due_date))) return 'Due date is invalid.';
  if (input.start_date && input.due_date && new Date(input.start_date) > new Date(input.due_date)) return 'Start date must be on or before the due date.';
  return null;
};

async function notifyMembers(projectId, actorId, type, message, entityId) {
  const members = await all('SELECT user_id FROM project_members WHERE project_id=? AND user_id!=?', [projectId, actorId]);
  for (const member of members) await createNotification({ run }, {
    userId: member.user_id, type, message, linkPath: `/user/projects/${projectId}`, entityType: 'milestone', entityId
  });
}

exports.list = asyncHandler(async (req, res) => {
  const value = await requireProject(req, res); if (!value) return;
  const includeArchived = req.user.role === 'admin' && req.query.include_archived === 'true';
  const milestones = await all(`${milestoneSelect} WHERE m.project_id=?${includeArchived ? '' : ' AND m.archived_at IS NULL'}${milestoneGroup} ORDER BY CASE WHEN m.due_date IS NULL THEN 1 ELSE 0 END, m.due_date, m.id`, [value.id]);
  res.json({ milestones: milestones.map(progressOf) });
});

exports.getOne = asyncHandler(async (req, res) => {
  const value = await requireProject(req, res); if (!value) return;
  const milestone = await loadMilestone(value.id, req.params.milestoneId);
  if (!milestone) return res.status(404).json({ message: 'Milestone not found.' });
  const tasks = await all('SELECT t.*, u.name AS user_name FROM tasks t JOIN users u ON u.id=t.user_id WHERE t.project_id=? AND t.milestone_id=? ORDER BY t.due_date, t.id', [value.id, milestone.id]);
  res.json({ milestone: progressOf(milestone), tasks });
});

exports.create = asyncHandler(async (req, res) => {
  const value = await requireProject(req, res); if (!value) return;
  const error = validate(req.body || {}); if (error) return res.status(400).json({ message: error });
  const input = req.body;
  const status = input.status || 'not_started';
  const result = await run('INSERT INTO milestones (project_id, title, description, status, start_date, due_date, completed_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [value.id, input.title.trim(), String(input.description || '').trim(), status, input.start_date || null, input.due_date || null, status === 'completed' ? new Date().toISOString() : null, req.user.id]);
  const milestone = await loadMilestone(value.id, result.id);
  await logActivity({ run }, req.user.id, 'MILESTONE_CREATED', `Created milestone: ${milestone.title} in ${value.name}`, { entityType: 'milestone', entityId: milestone.id, projectId: value.id });
  await notifyMembers(value.id, req.user.id, 'milestone_created', `New milestone in ${value.name}: ${milestone.title}`, milestone.id);
  res.status(201).json({ milestone: progressOf(milestone) });
});

exports.update = asyncHandler(async (req, res) => {
  const value = await requireProject(req, res); if (!value) return;
  const milestone = await loadMilestone(value.id, req.params.milestoneId);
  if (!milestone) return res.status(404).json({ message: 'Milestone not found.' });
  const allowed = ['title', 'description', 'status', 'start_date', 'due_date'];
  if (Object.keys(req.body || {}).some((key) => !allowed.includes(key))) return res.status(400).json({ message: 'Only milestone details may be updated.' });
  const input = { ...milestone, ...req.body };
  const error = validate(input); if (error) return res.status(400).json({ message: error });
  const statusChanged = input.status !== milestone.status;
  const dueChanged = String(input.due_date || '') !== String(milestone.due_date || '');
  const completedAt = input.status === 'completed' ? (milestone.completed_at || new Date().toISOString()) : null;
  await run('UPDATE milestones SET title=?, description=?, status=?, start_date=?, due_date=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [input.title.trim(), String(input.description || '').trim(), input.status, input.start_date || null, input.due_date || null, completedAt, milestone.id]);
  const updated = await loadMilestone(value.id, milestone.id);
  const action = statusChanged && input.status === 'completed' ? 'MILESTONE_COMPLETED' : statusChanged && milestone.status === 'completed' ? 'MILESTONE_REOPENED' : 'MILESTONE_UPDATED';
  await logActivity({ run }, req.user.id, action, `Updated milestone: ${updated.title} in ${value.name}`, { entityType: 'milestone', entityId: updated.id, projectId: value.id, metadata: { status: updated.status } });
  await notifyMembers(value.id, req.user.id, dueChanged ? 'milestone_deadline_changed' : 'milestone_updated', `${dueChanged ? 'Deadline updated for' : 'Milestone updated:'} ${updated.title}`, updated.id);
  res.json({ milestone: progressOf(updated) });
});

exports.archive = asyncHandler(async (req, res) => {
  const value = await requireProject(req, res); if (!value) return;
  const milestone = await loadMilestone(value.id, req.params.milestoneId, false);
  if (!milestone) return res.status(404).json({ message: 'Active milestone not found.' });
  await run('UPDATE milestones SET archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?', [milestone.id]);
  await logActivity({ run }, req.user.id, 'MILESTONE_ARCHIVED', `Archived milestone: ${milestone.title} in ${value.name}`, { entityType: 'milestone', entityId: milestone.id, projectId: value.id });
  await notifyMembers(value.id, req.user.id, 'milestone_archived', `Milestone archived: ${milestone.title}`, milestone.id);
  res.status(204).end();
});

exports.linkTask = asyncHandler(async (req, res) => {
  const value = await requireProject(req, res); if (!value) return;
  const milestone = await loadMilestone(value.id, req.params.milestoneId, false);
  if (!milestone) return res.status(404).json({ message: 'Active milestone not found.' });
  const taskId = Number(req.body?.task_id);
  if (!Number.isInteger(taskId) || taskId < 1) return res.status(400).json({ message: 'Choose a project task to link.' });
  const task = await get('SELECT id, title, project_id, milestone_id FROM tasks WHERE id=?', [taskId]);
  if (!task || Number(task.project_id) !== Number(value.id)) return res.status(400).json({ message: 'Task must belong to this project.' });
  await run('UPDATE tasks SET milestone_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [milestone.id, task.id]);
  await logActivity({ run }, req.user.id, 'MILESTONE_TASK_LINKED', `Linked task ${task.title} to milestone ${milestone.title} in ${value.name}`, { entityType: 'milestone', entityId: milestone.id, projectId: value.id, metadata: { taskId: task.id } });
  await notifyMembers(value.id, req.user.id, 'milestone_task_linked', `Task linked to milestone ${milestone.title}: ${task.title}`, milestone.id);
  res.json({ milestone: progressOf(await loadMilestone(value.id, milestone.id)) });
});

exports.unlinkTask = asyncHandler(async (req, res) => {
  const value = await requireProject(req, res); if (!value) return;
  const milestone = await loadMilestone(value.id, req.params.milestoneId, false);
  if (!milestone) return res.status(404).json({ message: 'Active milestone not found.' });
  const task = await get('SELECT id, title FROM tasks WHERE id=? AND project_id=? AND milestone_id=?', [req.params.taskId, value.id, milestone.id]);
  if (!task) return res.status(404).json({ message: 'Linked task not found.' });
  await run('UPDATE tasks SET milestone_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?', [task.id]);
  await logActivity({ run }, req.user.id, 'MILESTONE_TASK_UNLINKED', `Unlinked task ${task.title} from milestone ${milestone.title} in ${value.name}`, { entityType: 'milestone', entityId: milestone.id, projectId: value.id, metadata: { taskId: task.id } });
  await notifyMembers(value.id, req.user.id, 'milestone_task_unlinked', `Task removed from milestone ${milestone.title}: ${task.title}`, milestone.id);
  res.status(204).end();
});

exports.progress = asyncHandler(async (req, res) => {
  const value = await requireProject(req, res); if (!value) return;
  // Keep the existing project endpoints' historical all-task calculation unchanged.
  // This endpoint explicitly reports active parent-task progress and milestone metrics.
  const taskTotals = await get("SELECT COUNT(*) AS total_tasks, COUNT(CASE WHEN status='completed' THEN 1 END) AS completed_tasks FROM tasks WHERE project_id=? AND (status!='cancelled' OR is_on_hold)", [value.id]);
  const rows = await all(`${milestoneSelect} WHERE m.project_id=? AND m.archived_at IS NULL${milestoneGroup}`, [value.id]);
  const milestones = rows.map(progressOf);
  const total = Number(taskTotals.total_tasks || 0);
  res.json({
    project_id: value.id,
    task_progress: { total_tasks: total, completed_tasks: Number(taskTotals.completed_tasks || 0), progress: total ? Math.round((Number(taskTotals.completed_tasks || 0) * 100) / total) : 0 },
    milestones: {
      total: milestones.length,
      completed: milestones.filter((item) => item.status === 'completed').length,
      active: milestones.filter((item) => !['completed', 'not_started'].includes(item.status)).length,
      overdue: milestones.filter((item) => item.is_overdue).length,
      average_task_progress: milestones.length ? Math.round(milestones.reduce((sum, item) => sum + item.progress, 0) / milestones.length) : 0
    }
  });
});

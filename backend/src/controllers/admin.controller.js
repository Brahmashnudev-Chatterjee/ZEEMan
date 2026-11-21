const bcrypt = require('bcryptjs');
const { get, all, run } = require('../config/database');
const { asyncHandler, safeUser, logActivity, validatePassword } = require('../utils/http');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const statuses = ['pending', 'in_progress', 'on_hold', 'completed', 'cancelled'];
const priorities = ['low', 'medium', 'high', 'urgent'];

const logicalStatus = "CASE WHEN t.is_on_hold=1 THEN 'on_hold' ELSE t.status END";
const logicalPriority = "CASE WHEN t.is_urgent=1 THEN 'urgent' ELSE t.priority END";
const dashboardOverview = async () => get(`SELECT
  (SELECT COUNT(*) FROM users) total_users,
  (SELECT COUNT(*) FROM users WHERE account_status='active') active_users,
  (SELECT COUNT(*) FROM users WHERE account_status='inactive') inactive_users,
  (SELECT COUNT(*) FROM projects WHERE archived_at IS NULL) total_projects,
  (SELECT COUNT(*) FROM projects WHERE status='active' AND archived_at IS NULL) active_projects,
  (SELECT COUNT(*) FROM projects WHERE status='completed') completed_projects,
  (SELECT COUNT(*) FROM tasks WHERE project_id IS NOT NULL) total_tasks,
  (SELECT COUNT(*) FROM tasks WHERE status='pending' AND is_on_hold=0) todo,
  (SELECT COUNT(*) FROM tasks WHERE status='in_progress') in_progress,
  (SELECT COUNT(*) FROM tasks WHERE is_on_hold=1) on_hold,
  (SELECT COUNT(*) FROM tasks WHERE status='completed') completed,
  (SELECT COUNT(*) FROM tasks WHERE due_date < date('now') AND status NOT IN ('completed','cancelled')) overdue`);
const withRate = (overview) => ({ ...overview, completion_rate: overview.total_tasks ? Math.round((overview.completed / overview.total_tasks) * 100) : 0 });
const parsePreferences = (value) => { try { return JSON.parse(value || '{}'); } catch (_) { return {}; } };

exports.listCategories = asyncHandler(async (_, res) => res.json({ categories: await all('SELECT c.*, COUNT(t.id) AS task_count FROM categories c LEFT JOIN tasks t ON t.category_id=c.id GROUP BY c.id ORDER BY c.name') }));
exports.createCategory = asyncHandler(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ message: 'Category name is required.' });
  try {
    const result = await run('INSERT INTO categories (name, description) VALUES (?, ?)', [req.body.name.trim(), (req.body.description || '').trim()]);
    await logActivity({ run }, req.user.id, 'CATEGORY_CREATED', `Created category: ${req.body.name.trim()}`, { entityType: 'category', entityId: result.id });
    res.status(201).json({ category: await get('SELECT * FROM categories WHERE id=?', [result.id]) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT' || error.code === '23505') return res.status(409).json({ message: 'Category already exists.' });
    throw error;
  }
});
exports.updateCategory = asyncHandler(async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ message: 'Category name is required.' });
  const result = await run('UPDATE categories SET name=?,description=? WHERE id=?', [req.body.name.trim(), (req.body.description || '').trim(), req.params.id]);
  if (!result.changes) return res.status(404).json({ message: 'Category not found.' });
  await logActivity({ run }, req.user.id, 'CATEGORY_UPDATED', `Updated category: ${req.body.name.trim()}`, { entityType: 'category', entityId: Number(req.params.id) });
  res.json({ category: await get('SELECT * FROM categories WHERE id=?', [req.params.id]) });
});
exports.deleteCategory = asyncHandler(async (req, res) => {
  const result = await run('DELETE FROM categories WHERE id=?', [req.params.id]);
  if (!result.changes) return res.status(404).json({ message: 'Category not found.' });
  await logActivity({ run }, req.user.id, 'CATEGORY_DELETED', `Deleted category #${req.params.id}`, { entityType: 'category', entityId: Number(req.params.id) });
  res.status(204).end();
});

exports.listUsers = asyncHandler(async (req, res) => {
  const clauses = []; const params = [];
  if (req.query.search) { clauses.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  if (req.query.status && ['active', 'inactive'].includes(req.query.status)) { clauses.push('u.account_status=?'); params.push(req.query.status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const users = await all(`SELECT u.id,u.name,u.email,u.role,u.account_status,u.email_verified_at,u.avatar_url,u.created_at,u.updated_at,u.last_login_at,
    COUNT(DISTINCT pm.project_id) allocated_projects,COUNT(DISTINCT t.id) assigned_tasks,
    COUNT(DISTINCT CASE WHEN t.status='completed' THEN t.id END) completed_tasks
    FROM users u LEFT JOIN project_members pm ON pm.user_id=u.id LEFT JOIN tasks t ON t.user_id=u.id AND t.project_id IS NOT NULL
    ${where} GROUP BY u.id ORDER BY u.created_at DESC`, params);
  res.json({ users });
});
exports.getUser = asyncHandler(async (req, res) => {
  const user = await get('SELECT id,name,email,role,account_status,bio,avatar_url,email_verified_at,notification_preferences,created_at,updated_at,last_login_at FROM users WHERE id=?', [req.params.id]);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  const projects = await all('SELECT p.id,p.name,p.status,p.due_date FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE pm.user_id=? ORDER BY p.updated_at DESC', [user.id]);
  const workload = await get(`SELECT COUNT(*) assigned_tasks, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed_tasks, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending_tasks, SUM(CASE WHEN due_date < date('now') AND status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) overdue_tasks FROM tasks WHERE user_id=? AND project_id IS NOT NULL`, [user.id]);
  const tasks = await all(`SELECT t.id,t.title,${logicalStatus} status,${logicalPriority} priority,t.due_date,p.name project_name FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.user_id=? ORDER BY t.due_date LIMIT 20`, [user.id]);
  res.json({ user: { ...user, notification_preferences: parsePreferences(user.notification_preferences) }, projects, workload, tasks });
});
exports.createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'user' } = req.body;
  if (!name?.trim() || !emailPattern.test(email || '') || !validatePassword(password) || !['admin', 'user'].includes(role)) return res.status(400).json({ message: 'Provide a name, valid email, role, and a strong password.' });
  if (await get('SELECT id FROM users WHERE email=?', [email.trim().toLowerCase()])) return res.status(409).json({ message: 'An account already uses this email.' });
  const result = await run('INSERT INTO users (name,email,password_hash,role,onboarding_completed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)', [name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 12), role]);
  await logActivity({ run }, req.user.id, 'USER_CREATED', `Created ${role}: ${email.trim().toLowerCase()}`, { entityType: 'user', entityId: result.id });
  res.status(201).json({ user: await get('SELECT id,name,email,role,account_status,created_at FROM users WHERE id=?', [result.id]) });
});
exports.updateUser = asyncHandler(async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id=?', [req.params.id]); if (!user) return res.status(404).json({ message: 'User not found.' });
  const { name = user.name, email = user.email, role = user.role, account_status = user.account_status } = req.body;
  if (!name?.trim() || !emailPattern.test(email) || !['admin', 'user'].includes(role) || !['active', 'inactive'].includes(account_status)) return res.status(400).json({ message: 'Invalid user details.' });
  if (req.user.id === user.id && (role !== 'admin' || account_status !== 'active')) return res.status(400).json({ message: 'You cannot remove your own administrator access.' });
  if (user.role === 'admin' && (role !== 'admin' || account_status !== 'active')) { const activeAdmins = await get("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND account_status='active'"); if (activeAdmins.count <= 1) return res.status(409).json({ message: 'At least one active administrator must remain.' }); }
  if (email.trim().toLowerCase() !== user.email && await get('SELECT id FROM users WHERE email=?', [email.trim().toLowerCase()])) return res.status(409).json({ message: 'An account already uses this email.' });
  await run('UPDATE users SET name=?,email=?,role=?,account_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [name.trim(), email.trim().toLowerCase(), role, account_status, user.id]);
  if (account_status === 'inactive' && user.account_status !== 'inactive') await run('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL', [user.id]);
  await logActivity({ run }, req.user.id, account_status === 'inactive' ? 'USER_DEACTIVATED' : (user.account_status === 'inactive' ? 'USER_ACTIVATED' : 'USER_UPDATED'), `Updated user: ${email.trim().toLowerCase()}`, { entityType: 'user', entityId: user.id });
  res.json({ user: await get('SELECT id,name,email,role,account_status,created_at,updated_at FROM users WHERE id=?', [user.id]) });
});
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id=?', [req.params.id]); if (!user) return res.status(404).json({ message: 'User not found.' });
  if (req.user.id === user.id) return res.status(400).json({ message: 'You cannot delete your own account.' });
  if (user.role === 'admin' && user.account_status === 'active') { const admins = await get("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND account_status='active'"); if (admins.count <= 1) return res.status(409).json({ message: 'At least one active administrator must remain.' }); }
  await run('DELETE FROM users WHERE id=?', [user.id]); await logActivity({ run }, req.user.id, 'USER_DELETED', `Deleted user: ${user.email}`, { entityType: 'user', entityId: user.id }); res.status(204).end();
});

exports.dashboard = asyncHandler(async (_, res) => {
  const overview = withRate(await dashboardOverview());
  const projects = await all(`SELECT p.id,p.name,p.status,p.due_date,COUNT(DISTINCT t.id) total_tasks,COUNT(DISTINCT CASE WHEN t.status='completed' THEN t.id END) completed_tasks FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.archived_at IS NULL GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 8`);
  const recentTasks = await all(`SELECT t.id,t.title,${logicalStatus} status,${logicalPriority} priority,t.due_date,u.name user_name,p.name project_name FROM tasks t JOIN users u ON u.id=t.user_id JOIN projects p ON p.id=t.project_id ORDER BY t.updated_at DESC LIMIT 8`);
  const upcoming = await all(`SELECT t.id,t.title,t.due_date,${logicalPriority} priority,u.name user_name,p.name project_name FROM tasks t JOIN users u ON u.id=t.user_id JOIN projects p ON p.id=t.project_id WHERE t.due_date BETWEEN date('now') AND date('now','+7 days') AND t.status NOT IN ('completed','cancelled') ORDER BY t.due_date LIMIT 8`);
  const overdue = await all(`SELECT t.id,t.title,t.due_date,${logicalPriority} priority,u.name user_name,p.name project_name FROM tasks t JOIN users u ON u.id=t.user_id JOIN projects p ON p.id=t.project_id WHERE t.due_date < date('now') AND t.status NOT IN ('completed','cancelled') ORDER BY t.due_date LIMIT 8`);
  const activity = await all('SELECT l.*,u.name user_name FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 10');
  const taskStatus = await all(`SELECT ${logicalStatus} label,COUNT(*) value FROM tasks t WHERE t.project_id IS NOT NULL GROUP BY ${logicalStatus}`);
  const projectStatus = await all("SELECT CASE WHEN archived_at IS NOT NULL THEN 'archived' ELSE status END label,COUNT(*) value FROM projects GROUP BY CASE WHEN archived_at IS NOT NULL THEN 'archived' ELSE status END");
  const workload = await all(`SELECT u.id,u.name,COUNT(t.id) value FROM users u LEFT JOIN tasks t ON t.user_id=u.id AND t.project_id IS NOT NULL GROUP BY u.id HAVING value>0 ORDER BY value DESC LIMIT 8`);
  res.json({ overview, projects: projects.map((project) => ({ ...project, progress: project.total_tasks ? Math.round((project.completed_tasks / project.total_tasks) * 100) : 0 })), recentTasks, upcoming, overdue, activity, charts: { taskStatus, projectStatus, workload } });
});
exports.analytics = asyncHandler(async (_, res) => {
  const overview = withRate(await dashboardOverview());
  const byPriority = await all(`SELECT ${logicalPriority} label,COUNT(*) value FROM tasks t WHERE t.project_id IS NOT NULL GROUP BY ${logicalPriority}`);
  const users = await all(`SELECT u.id,u.name,COUNT(t.id) tasks,SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) completed FROM users u LEFT JOIN tasks t ON t.user_id=u.id GROUP BY u.id ORDER BY tasks DESC LIMIT 8`);
  const activity = await all('SELECT l.*,u.name AS user_name FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 10');
  res.json({ overview, byPriority, users, activity });
});
exports.userAnalytics = asyncHandler(async (req, res) => {
  const overview = await get(`SELECT COUNT(*) total_tasks,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='pending' AND is_on_hold=0 THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) in_progress,SUM(CASE WHEN due_date < date('now') AND status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) overdue FROM tasks WHERE user_id=? AND project_id IS NOT NULL`, [req.user.id]);
  const allocated = await get('SELECT COUNT(*) AS allocated_projects FROM project_members WHERE user_id=?', [req.user.id]);
  const upcoming = await all(`SELECT t.*,c.name category_name,p.name project_name FROM tasks t LEFT JOIN categories c ON c.id=t.category_id JOIN projects p ON p.id=t.project_id WHERE t.user_id=? AND t.due_date>=date('now') AND t.status NOT IN ('completed','cancelled') ORDER BY t.due_date LIMIT 5`, [req.user.id]);
  res.json({ overview: { ...overview, allocated_projects: allocated.allocated_projects }, upcoming, productivity: overview.total_tasks ? Math.round((overview.completed / overview.total_tasks) * 100) : 0 });
});
exports.userReport = asyncHandler(async (req, res) => {
  const filters = ['t.user_id=?', 't.project_id IS NOT NULL']; const params = [req.user.id];
  if (req.query.project_id) { filters.push('t.project_id=?'); params.push(req.query.project_id); }
  if (req.query.status && statuses.includes(req.query.status)) { if (req.query.status === 'on_hold') filters.push('t.is_on_hold=1'); else { filters.push('t.status=? AND t.is_on_hold=0'); params.push(req.query.status); } }
  if (req.query.priority && priorities.includes(req.query.priority)) { if (req.query.priority === 'urgent') filters.push('t.is_urgent=1'); else { filters.push('t.priority=? AND t.is_urgent=0'); params.push(req.query.priority); } }
  if (req.query.from) { filters.push('date(t.due_date)>=date(?)'); params.push(req.query.from); } if (req.query.to) { filters.push('date(t.due_date)<=date(?)'); params.push(req.query.to); }
  const where = `WHERE ${filters.join(' AND ')}`;
  const tasks = await all(`SELECT t.id,t.title,${logicalStatus} status,${logicalPriority} priority,t.due_date,t.completed_at,p.name project_name,t.project_id FROM tasks t JOIN projects p ON p.id=t.project_id ${where} ORDER BY t.due_date`, params);
  const summary = { total: tasks.length, completed: tasks.filter(t => t.status === 'completed').length, pending: tasks.filter(t => t.status === 'pending').length, in_progress: tasks.filter(t => t.status === 'in_progress').length, on_hold: tasks.filter(t => t.status === 'on_hold').length, overdue: tasks.filter(t => t.due_date && t.due_date < new Date().toISOString().slice(0, 10) && !['completed', 'on_hold'].includes(t.status)).length };
  summary.completion_rate = summary.total ? Math.round(summary.completed * 100 / summary.total) : 0;
  const byStatus = ['pending','in_progress','on_hold','completed'].map(label => ({ label, value: tasks.filter(t => t.status === label).length }));
  const byPriority = priorities.map(label => ({ label, value: tasks.filter(t => t.priority === label).length }));
  const projects = await all(`SELECT p.id,p.name,COUNT(t.id) assigned_tasks,SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) completed_tasks FROM projects p JOIN tasks t ON t.project_id=p.id ${where.replaceAll('t.project_id IS NOT NULL AND ','')} GROUP BY p.id`, params);
  res.json({ summary, tasks, byStatus, byPriority, projects: projects.map(p => ({ ...p, progress: p.assigned_tasks ? Math.round((p.completed_tasks || 0) * 100 / p.assigned_tasks) : 0 })) });
});

exports.reports = asyncHandler(async (req, res) => {
  const filters = []; const params = [];
  if (req.query.project_id) { filters.push('t.project_id=?'); params.push(req.query.project_id); }
  if (req.query.user_id) { filters.push('t.user_id=?'); params.push(req.query.user_id); }
  if (req.query.status && statuses.includes(req.query.status)) { if (req.query.status === 'on_hold') filters.push('t.is_on_hold=1'); else { filters.push('t.status=? AND t.is_on_hold=0'); params.push(req.query.status); } }
  if (req.query.priority && priorities.includes(req.query.priority)) { if (req.query.priority === 'urgent') filters.push('t.is_urgent=1'); else { filters.push('t.priority=? AND t.is_urgent=0'); params.push(req.query.priority); } }
  if (req.query.from) { filters.push('date(t.created_at)>=date(?)'); params.push(req.query.from); } if (req.query.to) { filters.push('date(t.created_at)<=date(?)'); params.push(req.query.to); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const tasks = await all(`SELECT t.id,t.title,${logicalStatus} status,${logicalPriority} priority,t.start_date,t.due_date,t.created_at,u.name user_name,p.name project_name FROM tasks t JOIN users u ON u.id=t.user_id JOIN projects p ON p.id=t.project_id ${where} ORDER BY t.due_date`, params);
  const summary = { total_tasks: tasks.length, completed: tasks.filter((task) => task.status === 'completed').length, pending: tasks.filter((task) => task.status === 'pending').length, in_progress: tasks.filter((task) => task.status === 'in_progress').length, on_hold: tasks.filter((task) => task.status === 'on_hold').length, overdue: tasks.filter((task) => task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && !['completed', 'cancelled'].includes(task.status)).length };
  summary.completion_rate = summary.total_tasks ? Math.round((summary.completed / summary.total_tasks) * 100) : 0;
  const workload = await all(`SELECT u.id,u.name,COUNT(t.id) assigned_tasks,SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) completed_tasks,SUM(CASE WHEN t.status='pending' AND t.is_on_hold=0 THEN 1 ELSE 0 END) pending_tasks,SUM(CASE WHEN t.due_date<date('now') AND t.status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) overdue_tasks,COUNT(DISTINCT pm.project_id) allocated_projects FROM users u LEFT JOIN tasks t ON t.user_id=u.id LEFT JOIN project_members pm ON pm.user_id=u.id GROUP BY u.id ORDER BY assigned_tasks DESC`);
  const projectProgress = await all(`SELECT p.id,p.name,p.status,COUNT(t.id) total_tasks,SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) completed_tasks FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.archived_at IS NULL GROUP BY p.id ORDER BY p.name`);
  const trend = await all("SELECT substr(completed_at,1,7) label,COUNT(*) value FROM tasks WHERE completed_at IS NOT NULL GROUP BY substr(completed_at,1,7) ORDER BY label");
  res.json({ summary, tasks, workload, projectProgress: projectProgress.map((project) => ({ ...project, progress: project.total_tasks ? Math.round((project.completed_tasks / project.total_tasks) * 100) : 0 })), trend });
});
exports.exportReports = asyncHandler(async (req, res) => {
  const filters = []; const params = [];
  if (req.query.project_id) { filters.push('t.project_id=?'); params.push(req.query.project_id); }
  if (req.query.user_id) { filters.push('t.user_id=?'); params.push(req.query.user_id); }
  if (req.query.status && statuses.includes(req.query.status)) { if (req.query.status === 'on_hold') filters.push('t.is_on_hold=1'); else { filters.push('t.status=? AND t.is_on_hold=0'); params.push(req.query.status); } }
  if (req.query.priority && priorities.includes(req.query.priority)) { if (req.query.priority === 'urgent') filters.push('t.is_urgent=1'); else { filters.push('t.priority=? AND t.is_urgent=0'); params.push(req.query.priority); } }
  if (req.query.from) { filters.push('date(t.created_at)>=date(?)'); params.push(req.query.from); } if (req.query.to) { filters.push('date(t.created_at)<=date(?)'); params.push(req.query.to); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const tasks = await all(`SELECT t.id,t.title,p.name project_name,u.name user_name,${logicalPriority} priority,${logicalStatus} status,t.start_date,t.due_date,t.created_at FROM tasks t JOIN users u ON u.id=t.user_id JOIN projects p ON p.id=t.project_id ${where} ORDER BY t.created_at DESC`, params);
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [['Task ID','Title','Project','Assigned user','Priority','Status','Start date','Due date','Created date'], ...tasks.map((task) => [task.id,task.title,task.project_name,task.user_name,task.priority,task.status,task.start_date,task.due_date,task.created_at])].map((row) => row.map(quote).join(',')).join('\n');
  res.type('text/csv').attachment('zeeman-task-report.csv').send(csv);
});

exports.listNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100); const offset = Math.max(Number(req.query.offset) || 0, 0);
  const notifications = await all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?', [req.user.id, limit, offset]);
  const unread = await get('SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL', [req.user.id]);
  res.json({ notifications, unread: unread.count, limit, offset });
});
exports.updateNotification = asyncHandler(async (req, res) => {
  if (typeof req.body.read !== 'boolean') return res.status(400).json({ message: 'Provide a read boolean.' });
  const result = await run('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?', [req.body.read ? new Date().toISOString() : null, req.params.id, req.user.id]);
  if (!result.changes) return res.status(404).json({ message: 'Notification not found.' }); res.status(204).end();
});
exports.readAllNotifications = asyncHandler(async (req, res) => { await run('UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL', [req.user.id]); res.status(204).end(); });

exports.listActivity = asyncHandler(async (req, res) => {
  const filters = []; const params = [];
  if (req.query.user_id) { filters.push('l.user_id=?'); params.push(req.query.user_id); } if (req.query.project_id) { filters.push('l.project_id=?'); params.push(req.query.project_id); }
  if (req.query.action) { filters.push('l.action=?'); params.push(req.query.action); } if (req.query.search) { filters.push('l.description LIKE ?'); params.push(`%${req.query.search}%`); }
  if (req.query.from) { filters.push('date(l.created_at)>=date(?)'); params.push(req.query.from); } if (req.query.to) { filters.push('date(l.created_at)<=date(?)'); params.push(req.query.to); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const activity = await all(`SELECT l.*,u.name user_name,p.name project_name FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN projects p ON p.id=l.project_id ${where} ORDER BY l.created_at DESC LIMIT 200`, params);
  res.json({ activity });
});
exports.getActivity = asyncHandler(async (req, res) => { const activity = await get('SELECT l.*,u.name user_name,p.name project_name FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN projects p ON p.id=l.project_id WHERE l.id=?', [req.params.id]); if (!activity) return res.status(404).json({ message: 'Activity record not found.' }); res.json({ activity: { ...activity, metadata: parsePreferences(activity.metadata) } }); });

const defaultSettings = { default_task_priority: 'medium', default_task_status: 'pending', date_format: 'YYYY-MM-DD', timezone: 'UTC', default_project_status: 'active', display_density: 'comfortable' };
exports.getSettings = asyncHandler(async (_, res) => { const rows = await all('SELECT setting_key,setting_value FROM app_settings'); const settings = { ...defaultSettings }; rows.forEach((row) => { settings[row.setting_key] = row.setting_value; }); res.json({ settings }); });
exports.updateSettings = asyncHandler(async (req, res) => {
  const input = req.body || {}; const allowed = Object.keys(defaultSettings); const settings = {};
  for (const key of allowed) if (Object.hasOwn(input, key)) settings[key] = String(input[key]);
  if (settings.default_task_priority && !priorities.includes(settings.default_task_priority)) return res.status(400).json({ message: 'Invalid default task priority.' });
  if (settings.default_task_status && !statuses.includes(settings.default_task_status)) return res.status(400).json({ message: 'Invalid default task status.' });
  for (const [key, value] of Object.entries(settings)) await run('INSERT INTO app_settings (setting_key,setting_value,updated_by,updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP', [key, value, req.user.id]);
  await logActivity({ run }, req.user.id, 'SETTINGS_UPDATED', 'Updated application settings', { entityType: 'settings' }); res.json({ settings: { ...(await exports._settings()), ...settings } });
});
exports._settings = async () => { const rows = await all('SELECT setting_key,setting_value FROM app_settings'); const settings = { ...defaultSettings }; rows.forEach((row) => { settings[row.setting_key] = row.setting_value; }); return settings; };
exports.logoutOtherSessions = asyncHandler(async (req, res) => { await run('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND id!=? AND revoked_at IS NULL', [req.user.id, req.sessionId]); res.status(204).end(); });
exports.updateOwnProfile = asyncHandler(async (req, res) => { const { name, bio = '', avatar_url = '', notification_preferences = {} } = req.body; if (!name?.trim() || typeof bio !== 'string' || typeof avatar_url !== 'string' || typeof notification_preferences !== 'object') return res.status(400).json({ message: 'Provide valid profile details.' }); await run('UPDATE users SET name=?,bio=?,avatar_url=?,notification_preferences=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [name.trim(), bio.slice(0, 500), avatar_url.slice(0, 500), JSON.stringify(notification_preferences), req.user.id]); res.json({ user: safeUser(await get('SELECT id,name,email,role,account_status,bio,avatar_url,notification_preferences,email_verified_at FROM users WHERE id=?', [req.user.id])) }); });

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const env = require('./env');

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
const db = new sqlite3.Database(env.dbPath);
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(error) { if (error) reject(error); else resolve({ id: this.lastID, changes: this.changes }); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));

async function initializeDatabase() {
  await run('PRAGMA foreign_keys = ON');
  await run('PRAGMA journal_mode = WAL');
  await run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')), account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','inactive')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '', user_id INTEGER NOT NULL, category_id INTEGER, priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')), due_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', owner_user_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('planning','active','on_hold','completed','cancelled')), start_date TEXT, due_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS project_members (project_id INTEGER NOT NULL, user_id INTEGER NOT NULL, member_role TEXT NOT NULL DEFAULT 'member' CHECK(member_role IN ('owner','member')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(project_id, user_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, user_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS subtasks (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, title TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS task_dependencies (task_id INTEGER NOT NULL, depends_on_task_id INTEGER NOT NULL, PRIMARY KEY(task_id, depends_on_task_id), CHECK(task_id != depends_on_task_id), FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE, FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS activity_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, description TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  const columns = await all('PRAGMA table_info(users)');
  if (!columns.some((column) => column.name === 'bio')) await run("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
  if (!columns.some((column) => column.name === 'notification_preferences')) await run("ALTER TABLE users ADD COLUMN notification_preferences TEXT NOT NULL DEFAULT '{\"reminders\":true}'");
  const taskColumns = await all('PRAGMA table_info(tasks)');
  if (!taskColumns.some((column) => column.name === 'project_id')) await run('ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL');
  await run('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at)');
  for (const category of [['Work', 'Professional work and career tasks'], ['Personal', 'Personal goals and errands'], ['Study', 'Learning and coursework'], ['Other', 'Everything else']]) await run('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)', category);
  const admin = await get('SELECT id FROM users WHERE email = ?', [env.admin.email]);
  if (!admin && env.admin.password) await run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [env.admin.name, env.admin.email, await bcrypt.hash(env.admin.password, 12), 'admin']);
  if (!admin && !env.admin.password) console.warn('No initial administrator was seeded. Set ADMIN_PASSWORD before starting a fresh database.');
}

module.exports = { db, run, get, all, initializeDatabase };

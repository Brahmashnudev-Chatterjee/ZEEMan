const bcrypt = require('bcryptjs');
const env = require('./config/env');
const { get, run, initializeDatabase } = require('./config/database');
const { validatePassword } = require('./utils/http');

async function seedAdmin() {
  if (!env.admin.password) throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD before seeding an administrator.');
  if (!validatePassword(env.admin.password)) throw new Error('ADMIN_PASSWORD must be at least 12 characters and include uppercase, lowercase, and a number.');
  await initializeDatabase();
  const existing = await get('SELECT id FROM users WHERE email = ?', [env.admin.email]);
  if (existing) return { created: false, email: env.admin.email };
  await run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [env.admin.name, env.admin.email, await bcrypt.hash(env.admin.password, 12), 'admin']);
  return { created: true, email: env.admin.email };
}

if (require.main === module) seedAdmin().then((result) => console.log(result.created ? `Administrator created: ${result.email}` : `Administrator already exists: ${result.email}`)).catch((error) => { console.error(error.message); process.exit(1); });
module.exports = { seedAdmin };

const path = require('path');
const fs = require('fs');
require('dotenv').config();

const valueFromSecret = (key) => {
  if (process.env[key]) return process.env[key];
  const file = process.env[`${key}_FILE`];
  return file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : undefined;
};
const jwtSecret = valueFromSecret('JWT_SECRET');
const adminPassword = valueFromSecret('ADMIN_PASSWORD');
const adminName = valueFromSecret('ADMIN_NAME');
const adminEmail = valueFromSecret('ADMIN_EMAIL');

const requiredInProduction = ['JWT_SECRET', 'ADMIN_PASSWORD'];
if (process.env.NODE_ENV === 'production') {
  requiredInProduction.forEach((key) => {
    const value = valueFromSecret(key) || '';
    if (!value || value.includes('replace-with') || value.includes('CHANGE_ME')) throw new Error(`${key} must be configured with a non-placeholder value`);
  });
  if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters');
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DATABASE_PATH || path.join(__dirname, '../../../data/tasks.db'),
  jwtSecret: jwtSecret || 'development-only-change-this-secret-before-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  appOrigin: process.env.APP_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:3000',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  admin: {
    name: adminName || 'ZeeMan Administrator',
    email: (adminEmail || 'admin@zeeman.local').toLowerCase(),
    password: adminPassword || null
  },
  mail: {
    transport: process.env.EMAIL_TRANSPORT || 'console',
    developmentMode: process.env.DEVELOPMENT_EMAIL_TRANSPORT === 'true',
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'no-reply@zeeman.local'
  }
};

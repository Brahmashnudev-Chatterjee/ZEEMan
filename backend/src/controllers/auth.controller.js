const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../config/database');
const env = require('../config/env');
const { asyncHandler, safeUser, logActivity, validatePassword } = require('../utils/http');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cookieName = 'zeeman_session';
const cookieOptions = () => ({ httpOnly: true, sameSite: 'strict', secure: env.cookieSecure, maxAge: 8 * 60 * 60 * 1000, path: '/' });
const expiresAt = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

async function issueSession(res, user) {
  const id = crypto.randomUUID();
  const expiry = expiresAt();
  await run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [id, user.id, expiry]);
  const token = jwt.sign({ sub: user.id, sid: id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  res.cookie(cookieName, token, cookieOptions());
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !emailPattern.test(email || '') || !validatePassword(password)) return res.status(400).json({ message: 'Provide a name, valid email, and a 12+ character password with uppercase, lowercase, and a number.' });
  if (await get('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()])) return res.status(409).json({ message: 'An account already uses this email.' });
  const result = await run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 12), 'user']);
  const user = await get('SELECT id, name, email, role, account_status, bio, notification_preferences, created_at FROM users WHERE id = ?', [result.id]);
  await logActivity({ run }, user.id, 'REGISTERED', 'Created a new account');
  await issueSession(res, user);
  res.status(201).json({ user });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await get('SELECT * FROM users WHERE email = ?', [(email || '').trim().toLowerCase()]);
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) return res.status(401).json({ message: 'Incorrect email or password.' });
  if (user.account_status !== 'active') return res.status(403).json({ message: 'This account has been deactivated.' });
  await logActivity({ run }, user.id, 'LOGGED_IN', 'Signed in to ZeeMan');
  await issueSession(res, user);
  res.json({ user: safeUser(user) });
});

exports.me = asyncHandler(async (req, res) => res.json({ user: req.user }));
exports.logout = asyncHandler(async (req, res) => { await run('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?', [req.sessionId]); await logActivity({ run }, req.user.id, 'LOGGED_OUT', 'Signed out of ZeeMan'); res.clearCookie(cookieName, cookieOptions()); res.status(204).end(); });
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, bio = '', notification_preferences = {} } = req.body;
  if (!name?.trim() || typeof bio !== 'string') return res.status(400).json({ message: 'Provide a valid name and bio.' });
  await run('UPDATE users SET name=?, bio=?, notification_preferences=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [name.trim(), bio.slice(0, 500), JSON.stringify(notification_preferences), req.user.id]);
  const user = await get('SELECT id, name, email, role, account_status, bio, notification_preferences, created_at, updated_at FROM users WHERE id=?', [req.user.id]);
  await logActivity({ run }, req.user.id, 'PROFILE_UPDATED', 'Updated profile settings');
  res.json({ user });
});
exports.updatePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  const user = await get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!await bcrypt.compare(current_password || '', user.password_hash)) return res.status(400).json({ message: 'Current password is incorrect.' });
  if (!validatePassword(new_password)) return res.status(400).json({ message: 'New password must be 12+ characters and include uppercase, lowercase, and a number.' });
  await run('UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [await bcrypt.hash(new_password, 12), user.id]);
  await run('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND id != ?', [user.id, req.sessionId]);
  await logActivity({ run }, user.id, 'PASSWORD_CHANGED', 'Changed password');
  res.status(204).end();
});

module.exports = { ...exports, cookieName, cookieOptions };

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../config/database');
const env = require('../config/env');
const { asyncHandler, safeUser, logActivity, validatePassword } = require('../utils/http');
const { deliver } = require('../services/email.service');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cookieName = 'zeeman_session';
const cookieOptions = () => ({ httpOnly: true, sameSite: 'strict', secure: env.cookieSecure, maxAge: 8 * 60 * 60 * 1000, path: '/' });
const clearCookieOptions = () => ({ httpOnly: true, sameSite: 'strict', secure: env.cookieSecure, path: '/' });
const expiresAt = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const createToken = () => crypto.randomBytes(32).toString('hex');
const tokenExpiry = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const appLink = (path, token) => `${env.appOrigin}${path}?token=${encodeURIComponent(token)}`;

async function issueEmailToken(user) {
  const token = createToken();
  await run('DELETE FROM email_verification_tokens WHERE user_id=? AND used_at IS NULL', [user.id]);
  await run('INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [user.id, tokenHash(token), tokenExpiry()]);
  const link = appLink('/verify-email', token);
  const delivery = await deliver(user.email, 'Verify your ZeeMan email', `Verify your ZeeMan account: ${link}\nThis link expires in one hour.`);
  return { link, delivery };
}

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
  const user = await get('SELECT id, name, email, role, account_status, bio, avatar_url, email_verified_at, onboarding_step, onboarding_completed_at, notification_preferences, created_at FROM users WHERE id = ?', [result.id]);
  await logActivity({ run }, user.id, 'REGISTERED', 'Created a new account');
  try { await issueEmailToken(user); } catch (error) { console.error('Verification email delivery failed:', error.message); }
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
exports.logout = asyncHandler(async (req, res) => { await run('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?', [req.sessionId]); await logActivity({ run }, req.user.id, 'LOGGED_OUT', 'Signed out of ZeeMan'); res.clearCookie(cookieName, clearCookieOptions()); res.status(204).end(); });
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
  await run('DELETE FROM password_reset_tokens WHERE user_id=?', [user.id]);
  await logActivity({ run }, user.id, 'PASSWORD_CHANGED', 'Changed password');
  res.status(204).end();
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const generic = { message: 'If an eligible account exists, reset instructions will be delivered according to the configured email service.' };
  if (!emailPattern.test(email)) return res.status(202).json(generic);
  const user = await get('SELECT id, email FROM users WHERE email=? AND account_status=?', [email, 'active']);
  if (!user) return res.status(202).json(generic);
  const token = createToken();
  await run('DELETE FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL', [user.id]);
  await run('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [user.id, tokenHash(token), tokenExpiry()]);
  try {
    const link = appLink('/reset-password', token);
    const delivery = await deliver(user.email, 'Reset your ZeeMan password', `Reset your ZeeMan password: ${link}\nThis link expires in one hour.`);
    return res.status(202).json(delivery.development ? { ...generic, development_url: link, development_notice: 'Development-only console email transport is active.' } : generic);
  } catch (error) { console.error('Password reset email delivery failed:', error.message); return res.status(202).json(generic); }
});
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password, password_confirmation: confirmation } = req.body;
  if (!token || password !== confirmation || !validatePassword(password)) return res.status(400).json({ message: 'Use matching passwords with 12+ characters, uppercase, lowercase, and a number.' });
  const record = await get("SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at > datetime('now')", [tokenHash(token)]);
  if (!record) return res.status(400).json({ message: 'This reset link is invalid, expired, or already used.' });
  await run('UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [await bcrypt.hash(password, 12), record.user_id]);
  await run('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?', [record.id]);
  await run('DELETE FROM password_reset_tokens WHERE user_id=? AND id != ?', [record.user_id, record.id]);
  await run('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?', [record.user_id]);
  await logActivity({ run }, record.user_id, 'PASSWORD_RESET', 'Reset password using a one-time link');
  res.status(204).end();
});
exports.verifyEmail = asyncHandler(async (req, res) => {
  const record = await get("SELECT * FROM email_verification_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at > datetime('now')", [tokenHash(req.body.token || '')]);
  if (!record) return res.status(400).json({ message: 'This verification link is invalid, expired, or already used.' });
  await run('UPDATE users SET email_verified_at=CURRENT_TIMESTAMP WHERE id=?', [record.user_id]);
  await run('UPDATE email_verification_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?', [record.id]);
  await logActivity({ run }, record.user_id, 'EMAIL_VERIFIED', 'Verified account email address');
  res.json({ message: 'Email verified.' });
});
exports.resendVerification = asyncHandler(async (req, res) => {
  if (req.user.email_verified_at) return res.status(200).json({ message: 'Your email is already verified.' });
  try {
    const delivery = await issueEmailToken(req.user);
    res.status(202).json(delivery.delivery.development ? { message: 'Development verification link created. Check the local server console.', development_url: delivery.link, development_notice: 'Development-only console email transport is active.' } : { message: 'Verification instructions were accepted by the email provider.' });
  } catch (error) {
    console.error('Verification email delivery failed:', error.message);
    res.status(502).json({ message: 'We could not send verification instructions. Please try again shortly.' });
  }
});

module.exports = { ...exports, cookieName, cookieOptions };

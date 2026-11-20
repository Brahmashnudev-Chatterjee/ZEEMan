const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { get } = require('../config/database');
const { asyncHandler } = require('../utils/http');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = req.cookies?.zeeman_session || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return res.status(401).json({ message: 'Authentication is required.' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const session = await get("SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at > datetime('now')", [payload.sid, payload.sub]);
    if (!session) return res.status(401).json({ message: 'Your session is unavailable.' });
    const user = await get('SELECT id, name, email, role, account_status, bio, notification_preferences FROM users WHERE id = ?', [payload.sub]);
    if (!user || user.account_status !== 'active') return res.status(401).json({ message: 'Your account is unavailable.' });
    req.user = user;
    req.sessionId = payload.sid;
    next();
  } catch (_) { return res.status(401).json({ message: 'Your session is invalid or has expired.' }); }
});

const authorize = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission to perform this action.' });
module.exports = { authenticate, authorize };

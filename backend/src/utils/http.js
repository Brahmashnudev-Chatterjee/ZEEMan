const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const safeUser = ({ password_hash, ...user }) => user;
const logActivity = async (database, userId, action, description, details = {}) => database.run(
  'INSERT INTO activity_logs (user_id, action, description, entity_type, entity_id, project_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
  [userId || null, action, description, details.entityType || '', details.entityId || null, details.projectId || null, JSON.stringify(details.metadata || {})]
);
const createNotification = async (database, { userId, type, message, linkPath = '', entityType = '', entityId = null }) => database.run(
  'INSERT INTO notifications (user_id, type, message, link_path, entity_type, entity_id) SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id=? AND type=? AND entity_type=? AND COALESCE(entity_id, -1)=COALESCE(?, -1) AND message=? AND read_at IS NULL)',
  [userId, type, message, linkPath, entityType, entityId, userId, type, entityType, entityId, message]
);
const validatePassword = (password) => typeof password === 'string' && password.length >= 12 && Buffer.byteLength(password, 'utf8') <= 72 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
module.exports = { asyncHandler, safeUser, logActivity, createNotification, validatePassword };

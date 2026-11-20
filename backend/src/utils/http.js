const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const safeUser = ({ password_hash, ...user }) => user;
const logActivity = async (database, userId, action, description) => database.run('INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)', [userId || null, action, description]);
const validatePassword = (password) => typeof password === 'string' && password.length >= 12 && Buffer.byteLength(password, 'utf8') <= 72 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
module.exports = { asyncHandler, safeUser, logActivity, validatePassword };

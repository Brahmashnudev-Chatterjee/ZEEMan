const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const env = require('./config/env');
const routes = require('./routes');
const app = express();
// Docker/Nginx is the single reverse proxy in front of the API.  This lets
// rate limiting identify browser clients without trusting arbitrary proxy chains.
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: env.appOrigin, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
// Attachments are sent as base64 JSON. A 5 MB binary file expands to roughly
// 6.7 MB, so the parser must accept that transport overhead while the upload
// controller remains the authoritative 5 MB binary-file limit.
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin !== env.appOrigin) return res.status(403).json({ message: 'Request origin is not permitted.' });
  next();
});
app.use('/api', routes);
const frontend = path.join(__dirname, '../../frontend');
app.use(express.static(frontend));
app.get('/login', (_, res) => res.sendFile(path.join(frontend, 'login.html')));
app.get('/register', (_, res) => res.sendFile(path.join(frontend, 'login.html')));
app.get(['/forgot-password', '/reset-password', '/verify-email', '/onboarding'], (_, res) => res.sendFile(path.join(frontend, 'login.html')));
app.get(['/admin/dashboard', '/admin/projects', '/admin/projects/:id', '/admin/tasks', '/admin/tasks/:id', '/admin/users', '/admin/users/:id', '/admin/kanban', '/admin/calendar', '/admin/reports', '/admin/notifications', '/admin/activity-logs', '/admin/settings', '/admin/profile'], (_, res) => res.sendFile(path.join(frontend, 'admin/dashboard.html')));
app.get(['/user/dashboard', '/user/projects', '/user/projects/:id', '/user/my-tasks', '/user/tasks/:id', '/user/kanban', '/user/calendar', '/user/reports', '/user/notifications', '/user/profile', '/user/settings'], (_, res) => res.sendFile(path.join(frontend, 'user/dashboard.html')));
app.get(['/features', '/how-it-works', '/about', '/contact', '/privacy', '/terms', '/404'], (_, res) => res.sendFile(path.join(frontend, 'index.html')));
app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use((error, req, res, next) => { console.error(error); const status = error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500; const messages = { 400: 'Malformed JSON payload.', 413: 'Request is too large. Attachments must be 5 MB or smaller.', 500: 'An unexpected error occurred.' }; res.status(status).json({ message: messages[status] }); });
module.exports = app;

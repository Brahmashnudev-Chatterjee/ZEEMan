const app = require('./app');
const env = require('./config/env');
const { initializeDatabase } = require('./config/database');
initializeDatabase().then(() => app.listen(env.port, () => console.log(`ZeeMan listening on port ${env.port}`))).catch((error) => { console.error('Database initialization failed', error); process.exit(1); });

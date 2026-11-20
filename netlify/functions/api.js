process.env.ZEEMAN_NETLIFY = 'true';
const serverless = require('serverless-http');

let ready;
let application;
let initializeDatabase;

const loadApplication = () => {
  if (!application) {
    application = require('../../backend/src/app');
    ({ initializeDatabase } = require('../../backend/src/config/database'));
  }
  return application;
};

const initialize = () => {
  if (!ready) ready = initializeDatabase().catch((error) => { ready = null; throw error; });
  return ready;
};

const handler = async (event, context) => {
  try {
    loadApplication();
    await initialize();
  } catch (_) {
    // Do not leak database configuration or credentials in an HTTP response.
    console.error('ZeeMan database initialization failed.');
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Service temporarily unavailable. Complete the database configuration and retry.' })
    };
  }
  const prefix = '/.netlify/functions/api';
  const path = event.path || '/';
  const apiPath = path.startsWith(prefix) ? `/api${path.slice(prefix.length) || '/'}` : (path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`);
  return serverless(application)({ ...event, path: apiPath }, context);
};

module.exports = { handler };

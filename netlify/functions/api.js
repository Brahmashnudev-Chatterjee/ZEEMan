const serverless = require('serverless-http');
const app = require('../../backend/src/app');
const { initializeDatabase } = require('../../backend/src/config/database');

let ready;
const handler = async (event, context) => {
  ready ||= initializeDatabase();
  await ready;
  const prefix = '/.netlify/functions/api';
  const path = event.path || '/';
  const apiPath = path.startsWith(prefix) ? `/api${path.slice(prefix.length) || '/'}` : (path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`);
  return serverless(app)({ ...event, path: apiPath }, context);
};

module.exports = { handler };

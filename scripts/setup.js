const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');
const configOnly = process.argv.includes('--config-only');
const parse = (text) => Object.fromEntries(text.split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const serialize = (values) => Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
const hiddenQuestion = (prompt) => new Promise((resolve) => {
  output.write(prompt);
  let value = '';
  const wasRaw = input.isRaw;
  input.setRawMode(true); input.resume(); input.setEncoding('utf8');
  const onData = (character) => {
    if (character === '\r' || character === '\n') { input.removeListener('data', onData); input.setRawMode(Boolean(wasRaw)); output.write('\n'); resolve(value); return; }
    if (character === '\u0003') process.exit(130);
    if (character === '\u0008' || character === '\u007f') { value = value.slice(0, -1); return; }
    value += character;
  };
  input.on('data', onData);
});

async function main() {
  const values = fs.existsSync(envPath) ? parse(fs.readFileSync(envPath, 'utf8')) : parse(fs.readFileSync(examplePath, 'utf8'));
  values.PORT ||= '3000';
  values.DATABASE_PATH ||= './data/tasks.db';
  values.APP_ORIGIN ||= `http://localhost:${values.PORT}`;
  values.COOKIE_SECURE ||= 'false';
  if (!values.JWT_SECRET || values.JWT_SECRET.includes('CHANGE_ME') || values.JWT_SECRET.includes('replace-with')) values.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  if (configOnly) { fs.writeFileSync(envPath, serialize(values), { mode: 0o600 }); console.log('Configuration initialized.'); return; }
  const rl = readline.createInterface({ input, output });
  const name = (await rl.question('Administrator name: ')).trim();
  const email = (await rl.question('Administrator email: ')).trim().toLowerCase();
  const password = (await hiddenQuestion('Administrator password: ')).trim();
  rl.close();
  if (!name || !email || !password) throw new Error('Administrator name, email, and password are required.');
  values.ADMIN_NAME = name; values.ADMIN_EMAIL = email; values.ADMIN_PASSWORD = password;
  fs.writeFileSync(envPath, serialize(values), { mode: 0o600 });
  const { seedAdmin } = require('../backend/src/seed');
  const result = await seedAdmin();
  console.log(result.created ? `Administrator created for ${result.email}.` : `Administrator already exists for ${result.email}; no password was changed.`);
}
main().catch((error) => { console.error(`Setup failed: ${error.message}`); process.exit(1); });

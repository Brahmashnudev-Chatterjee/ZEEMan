const nodemailer = require('nodemailer');
const env = require('../config/env');

const message = (to, subject, text) => ({ from: env.mail.from, to, subject, text });

async function deliver(to, subject, text) {
  if (env.mail.transport === 'console') {
    if (!env.mail.developmentMode && env.nodeEnv === 'production') throw new Error('Console email transport is not permitted in production.');
    console.info(`[ZeeMan development email]\nTo: ${to}\nSubject: ${subject}\n${text}`);
    return { delivered: false, development: true };
  }
  const transporter = nodemailer.createTransport({ host: env.mail.host, port: env.mail.port, secure: env.mail.secure, auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined });
  const result = await transporter.sendMail(message(to, subject, text));
  if (!result.accepted?.length) throw new Error('The email provider did not accept the message.');
  return { delivered: true, development: false };
}

module.exports = { deliver };

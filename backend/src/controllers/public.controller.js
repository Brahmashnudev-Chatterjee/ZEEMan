const { run } = require('../config/database');
const { asyncHandler } = require('../utils/http');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.contact = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name?.trim() || !emailPattern.test(email || '') || !subject?.trim() || !message?.trim()) return res.status(400).json({ message: 'Complete every contact field with a valid email address.' });
  if (name.length > 120 || email.length > 254 || subject.length > 160 || message.length > 2000) return res.status(400).json({ message: 'One or more contact fields exceed the allowed length.' });
  await run('INSERT INTO contact_submissions (name, email, subject, message) VALUES (?, ?, ?, ?)', [name.trim(), email.trim().toLowerCase(), subject.trim(), message.trim()]);
  res.status(201).json({ message: 'Your message was received.' });
});

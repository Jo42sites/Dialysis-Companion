const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { login, requireAdmin } = require('./auth');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '32kb' }));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const token = await login(req.body?.username, req.body?.password);
  if (!token) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  return res.json({ token });
});

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  res.json({
    users: [
      { id: 'admin-1', username: 'admin', role: 'admin' }
    ]
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

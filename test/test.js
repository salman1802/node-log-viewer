const express = require('express');
const logViewer = require('../src/index');

const app = express();

// 1. Enable request tracking (optional — tracks HTTP requests with headers, status, duration)
app.use(logViewer.requestLogger());

// 2. Mount log viewer dashboard
app.use('/_logs', logViewer());

// Sample routes
app.get('/', (req, res) => {
  console.log('Home page visited');
  console.debug('User-Agent:', req.headers['user-agent']);
  res.send('<h1>Hello!</h1><p>Open <a href="/_logs">/_logs</a> to see the log viewer dashboard.</p><p>Try visiting <a href="/api/users">/api/users</a> and <a href="/api/error">/api/error</a> too.</p>');
});

app.get('/api/users', (req, res) => {
  console.log('Fetching users list');
  console.info('Query params:', req.query);
  const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
  console.debug('Found users:', users);
  res.json(users);
});

app.get('/api/error', (req, res) => {
  console.warn('About to hit an error endpoint');
  console.error('Database connection failed', { host: 'db.local', port: 5432, error: 'ETIMEDOUT' });
  res.status(500).json({ error: 'Internal Server Error' });
});

app.post('/api/data', express.json(), (req, res) => {
  console.log('Received POST data:', req.body);
  console.info('Processing request from', req.ip);
  res.json({ ok: true });
});

app.listen(3000, () => {
  console.log('App running at http://localhost:3000');
  console.info('Log viewer at http://localhost:3000/_logs');
  console.warn('This is a demo — request logging is enabled');

  // Simulate some background logs
  let i = 0;
  setInterval(() => {
    i++;
    const levels = ['log', 'info', 'warn', 'error', 'debug'];
    console[levels[i % levels.length]](`[Background tick ${i}] Periodic task running`);
  }, 5000);
});

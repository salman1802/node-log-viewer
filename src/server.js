const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

function createMiddleware(interceptor, options = {}) {
  const { path: basePath = '/_logs' } = options;

  const router = express.Router();

  // Serve the dashboard UI
  router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Serve static assets
  router.use(express.static(path.join(__dirname, 'public')));

  // API: get logs
  router.get('/api/logs', (req, res) => {
    const { level, search, limit, offset } = req.query;
    const result = interceptor.getLogs({
      level,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    res.json(result);
  });

  // API: get requests
  router.get('/api/requests', (req, res) => {
    const { limit } = req.query;
    const requests = interceptor.getRequests({
      limit: limit ? parseInt(limit) : undefined,
    });
    res.json(requests);
  });

  // API: clear logs
  router.post('/api/clear', (req, res) => {
    interceptor.clear();
    res.json({ ok: true });
  });

  return { router, basePath };
}

function attachWebSocket(server, interceptor, options = {}) {
  const { path: basePath = '/_logs' } = options;

  const wss = new WebSocketServer({
    server,
    path: `${basePath}/ws`,
  });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
      type: 'init',
      logs: interceptor.logs,
      requests: interceptor.requests,
    }));

    const onLog = (entry) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'log', log: entry }));
      }
    };

    const onRequest = (reqData) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'request', request: reqData }));
      }
    };

    const onClear = () => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'clear' }));
      }
    };

    interceptor.on('log', onLog);
    interceptor.on('request', onRequest);
    interceptor.on('clear', onClear);

    ws.on('close', () => {
      interceptor.removeListener('log', onLog);
      interceptor.removeListener('request', onRequest);
      interceptor.removeListener('clear', onClear);
    });
  });

  return wss;
}

module.exports = { createMiddleware, attachWebSocket };

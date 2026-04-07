# Log Viewer

Drop-in graphical log viewer for Node.js. Intercepts `console.log`, `console.warn`, `console.error`, `console.info`, and `console.debug` — displays them in a real-time filterable web dashboard mounted on your existing app.

## Install

```bash
npm install console-log-viewer
```

## Quick Start

**CommonJS (require)**

```js
const express = require('express');
const logViewer = require('console-log-viewer');

const app = express();

// (Optional) Track HTTP requests — see which route produced which logs
app.use(logViewer.requestLogger());

// Mount log viewer dashboard
app.use('/_logs', logViewer());

app.listen(3000);
// Your app      → http://localhost:3000
// Log dashboard → http://localhost:3000/_logs
```

**ES Modules (import)**

```js
import express from 'express';
import logViewer from 'console-log-viewer';

const app = express();

app.use(logViewer.requestLogger());
app.use('/_logs', logViewer());

app.listen(3000);
```

That's it. No separate server, no extra port. The dashboard runs as a route inside your own application.

## Request Logging

When you enable `logViewer.requestLogger()`, every HTTP request is tracked and linked to the console logs it produced. In the dashboard you get a **Requests** tab showing:

- **Method & URL** — GET /api/users, POST /auth/login, etc.
- **Status code** — color-coded (2xx green, 4xx yellow, 5xx red)
- **Duration** — how long the request took (highlighted if slow)
- **Request headers** — user-agent, content-type, accept, etc.
- **Query params** — parsed and displayed
- **Associated logs** — every `console.log/warn/error` that ran during that request

Click any request to open the detail panel and see everything at a glance.

```js
const logViewer = require('console-log-viewer');

// Must be added BEFORE your routes
app.use(logViewer.requestLogger());

app.use('/_logs', logViewer());

app.get('/api/users', (req, res) => {
  console.log('Fetching users');        // linked to this request
  console.debug('Query:', req.query);   // linked to this request
  res.json(users);
});
```

> **Note:** `requestLogger()` is optional. Without it, the Logs tab works as usual — you just won't see the Requests tab or request-log linking.

## Usage

```js
app.use('/_logs', logViewer());

// Or with a custom path
app.use('/admin/logs', logViewer({ path: '/admin/logs' }));

// All console calls are now captured
console.log('Server started');
console.warn('Disk space low');
console.error('Connection failed', { host: 'db.local' });
console.debug('Query took 42ms');
```

## Features

- **Same server** — mounts as Express middleware, no extra port needed
- **Real-time streaming** — logs appear instantly via WebSocket
- **Filter by level** — color-coded pill filters (All, Info, Warn, Error, Debug)
- **Search** — full-text search with highlighted matches (press `/` to focus)
- **Request tracking** — see which HTTP request produced which logs, with method, headers, status, and duration
- **Request detail panel** — click any request to inspect headers, query params, and associated logs
- **Source tracking** — shows file and line number where each log originated
- **Collapsible JSON** — objects auto-detected and rendered as syntax-highlighted, expandable trees
- **Pause/Resume** — pause the live stream without losing logs
- **Export** — download filtered logs as a `.log` file
- **Copy** — click timestamps or hover to copy log messages
- **Keyboard shortcuts** — full keyboard navigation (press `?` to see all)
- **Auto-scroll** — follows new logs, toggle on/off
- **Uncaught errors** — captures uncaught exceptions and unhandled rejections
- **Non-invasive** — logs still appear in your terminal as usual
- **Dark / Light theme** — toggle with `T` key, persists across sessions
- **Method filters** — filter requests by GET, POST, PUT, PATCH, DELETE
- **Polling fallback** — auto-switches to HTTP polling every 5s if WebSocket disconnects (proxy, firewall, etc.)
- **Production safe** — disable entirely with an environment variable

## Disable in Production

Set the `LOG_VIEWER_DISABLED` environment variable to disable the log viewer completely. When disabled, both `logViewer()` and `requestLogger()` become no-op pass-through middleware — zero overhead, no interception, no dashboard.

```bash
# .env or your deployment config
LOG_VIEWER_DISABLED=true
```

Your code stays the same — no need to wrap in `if` blocks:

```js
// These become no-ops when LOG_VIEWER_DISABLED=true
app.use(logViewer.requestLogger());
app.use('/_logs', logViewer());
```

Common patterns:

```bash
# Disable in production
NODE_ENV=production LOG_VIEWER_DISABLED=true node app.js

# Enable in development (default)
node app.js
```

You can also set it per environment in your `.env` files:

```bash
# .env.production
LOG_VIEWER_DISABLED=true

# .env.development
LOG_VIEWER_DISABLED=false
```

## Works with any Node.js app

Express, EJS, Pug, Handlebars, NestJS, Fastify (with express adapter) — anything that uses Express-compatible middleware.

```js
// Express + EJS
app.set('view engine', 'ejs');
app.use('/_logs', logViewer());

// Express + Pug
app.set('view engine', 'pug');
app.use('/_logs', logViewer());
```

## Proxy Configuration

If your app runs behind a reverse proxy (Nginx, Apache, Caddy, etc.), you **must** configure WebSocket proxying for the `/_logs/ws` path. Without this, the dashboard will connect via HTTP but real-time streaming won't work.

### Nginx

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }

    # Required: WebSocket proxy for log viewer
    location /_logs/ws {
        proxy_pass http://localhost:3000/_logs/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Apache

Enable `mod_proxy`, `mod_proxy_http`, and `mod_proxy_wstunnel`, then:

```apache
<VirtualHost *:80>
    ProxyPreserveHost On

    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    # Required: WebSocket proxy for log viewer
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/_logs/ws$ ws://localhost:3000/_logs/ws [P,L]
</VirtualHost>
```

### Caddy

```
example.com {
    reverse_proxy localhost:3000
}
```

> Caddy handles WebSocket upgrades automatically — no extra config needed.

### Custom path

If you mounted the log viewer on a custom path (e.g., `/admin/logs`), update the proxy rules accordingly:

```nginx
location /admin/logs/ws {
    proxy_pass http://localhost:3000/admin/logs/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## API

### `logViewer(options?) → Express middleware`

Returns middleware to mount on your app. Options:

| Option | Default | Description |
|--------|---------|-------------|
| `path` | `/_logs` | Route path for the dashboard |

### `logViewer.requestLogger() → Express middleware`

Returns middleware that tracks HTTP requests. Add it **before** your routes. Each request captures: method, URL, headers, query params, status code, duration, and links all `console.*` calls made during that request.

### `logViewer.stop()`

Stops intercepting and restores original console methods.

### `logViewer.interceptor`

The underlying `LogInterceptor` instance for advanced usage.

## License

MIT

const LogInterceptor = require('./interceptor');
const { createMiddleware, attachWebSocket } = require('./server');

const interceptor = new LogInterceptor();
let attached = false;

/**
 * Returns an Express middleware that mounts the log viewer dashboard.
 * Also intercepts all console.log/warn/error/info/debug calls.
 *
 * @param {object} [options]
 * @param {string} [options.path='/_logs'] - Route path to mount the dashboard
 * @returns {Function} Express middleware — use with app.use()
 *
 * @example
 *   const app = express();
 *   app.use(require('@salman/log-viewer')());
 *   // Dashboard at http://localhost:3000/_logs
 */
function isDisabled() {
  return process.env.LOG_VIEWER_DISABLED === 'true'
    || process.env.LOG_VIEWER_DISABLED === '1';
}

function logViewer(options = {}) {
  const { path: basePath = '/_logs' } = options;

  // Skip entirely in production or when disabled via env
  if (isDisabled()) {
    return (req, res, next) => next();
  }

  // Start intercepting console methods
  interceptor.start();

  const { router } = createMiddleware(interceptor, { path: basePath });

  // Wrap in a middleware that attaches WebSocket on first request
  const middleware = (req, res, next) => {
    if (!attached) {
      attached = true;
      const server = req.socket.server || req.connection.server;
      if (server) {
        attachWebSocket(server, interceptor, { path: basePath });
      }
      const original = interceptor._originals.log || console.log;
      original(`\n  Log Viewer available at ${basePath}\n`);
    }
    router(req, res, next);
  };

  return middleware;
}

/**
 * Stop intercepting and restore original console methods.
 */
function stop() {
  interceptor.stop();
  attached = false;
}

/**
 * Returns Express middleware that tracks HTTP requests.
 * Logs made during a request are automatically linked to it.
 * Shows route, method, headers, status, and duration in the dashboard.
 *
 * @returns {Function} Express middleware
 *
 * @example
 *   app.use(logViewer.requestLogger());
 */
function requestLogger() {
  if (isDisabled()) {
    return (req, res, next) => next();
  }
  return interceptor.requestLogger();
}

module.exports = logViewer;
module.exports.logViewer = logViewer;
module.exports.stop = stop;
module.exports.requestLogger = requestLogger;
module.exports.interceptor = interceptor;
module.exports.LogInterceptor = LogInterceptor;

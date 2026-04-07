const EventEmitter = require('events');
const { AsyncLocalStorage } = require('async_hooks');

class LogInterceptor extends EventEmitter {
  constructor() {
    super();
    this.logs = [];
    this.requests = [];
    this.maxLogs = 10000;
    this.maxRequests = 2000;
    this._originals = {};
    this._active = false;
    this._idCounter = 0;
    this._reqIdCounter = 0;
    this._asyncStorage = new AsyncLocalStorage();
  }

  start() {
    if (this._active) return;
    this._active = true;

    const methods = ['log', 'warn', 'error', 'info', 'debug'];

    for (const method of methods) {
      this._originals[method] = console[method];

      console[method] = (...args) => {
        const reqCtx = this._asyncStorage.getStore();

        const entry = {
          id: ++this._idCounter,
          level: method === 'log' ? 'info' : method,
          message: args.map(a => {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a, null, 2); }
            catch { return String(a); }
          }).join(' '),
          timestamp: Date.now(),
          stack: this._getCallSite(),
          requestId: reqCtx ? reqCtx.id : null,
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
          this.logs.shift();
        }

        // Also attach log to the request
        if (reqCtx) {
          reqCtx.logs.push(entry.id);
        }

        this.emit('log', entry);

        // Still output to original console
        this._originals[method].apply(console, args);
      };
    }

    // Capture uncaught exceptions and unhandled rejections
    this._uncaughtHandler = (err) => {
      const entry = {
        id: ++this._idCounter,
        level: 'error',
        message: `Uncaught Exception: ${err.stack || err.message || String(err)}`,
        timestamp: Date.now(),
        stack: err.stack || '',
        requestId: null,
      };
      this.logs.push(entry);
      this.emit('log', entry);
    };

    this._rejectionHandler = (reason) => {
      const entry = {
        id: ++this._idCounter,
        level: 'error',
        message: `Unhandled Rejection: ${reason?.stack || reason?.message || String(reason)}`,
        timestamp: Date.now(),
        stack: reason?.stack || '',
        requestId: null,
      };
      this.logs.push(entry);
      this.emit('log', entry);
    };

    process.on('uncaughtException', this._uncaughtHandler);
    process.on('unhandledRejection', this._rejectionHandler);
  }

  /**
   * Express middleware that tracks HTTP requests.
   * Each request gets a unique ID, and all console logs made
   * during that request are tagged with that ID.
   */
  requestLogger() {
    return (req, res, next) => {
      const reqData = {
        id: ++this._reqIdCounter,
        method: req.method,
        url: req.originalUrl || req.url,
        path: req.path,
        headers: { ...req.headers },
        query: { ...req.query },
        ip: req.ip || req.socket.remoteAddress,
        startTime: Date.now(),
        statusCode: null,
        duration: null,
        logs: [],
      };

      // Capture response
      const originalEnd = res.end;
      res.end = (...args) => {
        reqData.statusCode = res.statusCode;
        reqData.duration = Date.now() - reqData.startTime;
        reqData.responseHeaders = res.getHeaders ? { ...res.getHeaders() } : {};

        this.requests.push(reqData);
        if (this.requests.length > this.maxRequests) {
          this.requests.shift();
        }

        this.emit('request', reqData);
        originalEnd.apply(res, args);
      };

      // Run all downstream handlers inside async context
      this._asyncStorage.run(reqData, () => {
        next();
      });
    };
  }

  stop() {
    if (!this._active) return;
    this._active = false;

    for (const [method, original] of Object.entries(this._originals)) {
      console[method] = original;
    }
    this._originals = {};

    process.removeListener('uncaughtException', this._uncaughtHandler);
    process.removeListener('unhandledRejection', this._rejectionHandler);
  }

  clear() {
    this.logs = [];
    this.requests = [];
    this.emit('clear');
  }

  getLogs({ level, search, since, limit = 500, offset = 0 } = {}) {
    let filtered = this.logs;

    if (level && level !== 'all') {
      filtered = filtered.filter(l => l.level === level);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(l => l.message.toLowerCase().includes(q));
    }
    if (since) {
      filtered = filtered.filter(l => l.timestamp >= since);
    }

    const total = filtered.length;
    const items = filtered.slice(-(offset + limit)).slice(-limit);

    return { total, items };
  }

  getRequests({ limit = 100 } = {}) {
    return this.requests.slice(-limit);
  }

  _getCallSite() {
    const orig = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
    const err = new Error();
    const stack = err.stack;
    Error.prepareStackTrace = orig;

    // Skip frames: Error, this method, console[method] wrapper, -> caller
    const frame = stack[3];
    if (!frame) return '';
    return `${frame.getFileName()}:${frame.getLineNumber()}:${frame.getColumnNumber()}`;
  }
}

module.exports = LogInterceptor;

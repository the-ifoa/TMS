// Central logging: tees every console.* call to <repo>/logs/backend.log and
// exposes an Express request logger. Loaded once from server.js (require it
// before anything else so early startup logs are captured too).
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }

const backendStream = fs.createWriteStream(path.join(LOG_DIR, 'backend.log'), { flags: 'a' });

function safeStringify(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function format(args) {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack || a.message;
      return safeStringify(a);
    })
    .join(' ');
}

function writeLine(level, args) {
  try {
    backendStream.write(`[${new Date().toISOString()}] [${level}] ${format(args)}\n`);
  } catch { /* never let logging crash the app */ }
}

// Tee console methods — keep the original terminal output, add the file line.
['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    writeLine(level.toUpperCase(), args);
  };
});

// One line per finished HTTP request.
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    writeLine('HTTP', [`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`]);
  });
  next();
}

module.exports = { LOG_DIR, requestLogger, writeLine };

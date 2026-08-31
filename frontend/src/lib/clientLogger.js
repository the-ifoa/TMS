// Ships browser-side errors (window.onerror, unhandled promise rejections and
// console.error calls) to the backend, which appends them to logs/frontend.log.
// Entries are batched and flushed on a short timer / page unload. Best-effort:
// any failure to send is swallowed so logging never breaks the app.
import { API_BASE } from '../api';

const ENDPOINT = `${API_BASE}/client-logs`;
const MAX_BATCH = 20;
const FLUSH_MS = 4000;

const buffer = [];
let timer = null;

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!buffer.length) return;
  const entries = buffer.splice(0, buffer.length);
  const body = JSON.stringify({ entries });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* ignore */ }
}

function queue(level, message, extra = {}) {
  buffer.push({
    level,
    message: String(message).slice(0, 4000),
    url: typeof location !== 'undefined' ? location.href : '',
    at: new Date().toISOString(),
    ...extra,
  });
  if (buffer.length >= MAX_BATCH) flush();
  else if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

let installed = false;

export function initClientLogger() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => {
    queue('error', e.message || 'Uncaught error', {
      stack: e.error && e.error.stack,
      src: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    queue('error', `Unhandled promise rejection: ${(reason && reason.message) || reason}`, {
      stack: reason && reason.stack,
    });
  });

  const originalError = console.error.bind(console);
  console.error = (...args) => {
    originalError(...args);
    const errArg = args.find((a) => a instanceof Error);
    queue('error', args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : safeString(a))).join(' '), {
      stack: errArg && errArg.stack,
    });
  };

  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

function safeString(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

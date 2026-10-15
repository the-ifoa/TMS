// ─────────────────────────────────────────────────────────────────────────────
//  Request sanitizer — runs on every request before the routes.
//
//  Strips keys that start with `$` (MongoDB query operators) and prototype keys
//  (`__proto__`, `constructor`, `prototype`) from req.body, req.query and
//  req.params. Without this, a body like { "token": { "$ne": null } } reaches
//  a Mongoose filter as an operator and matches documents it should not.
//  The frontend never sends such keys, so legitimate requests are unaffected.
// ─────────────────────────────────────────────────────────────────────────────
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function clean(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value) || value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = clean(value[i], depth + 1);
    return value;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || BLOCKED_KEYS.has(key)) delete value[key];
    else value[key] = clean(value[key], depth + 1);
  }
  return value;
}

function sanitizeRequest(req, _res, next) {
  if (req.body) clean(req.body);
  if (req.query) clean(req.query);
  if (req.params) clean(req.params);
  next();
}

module.exports = { sanitizeRequest, clean };

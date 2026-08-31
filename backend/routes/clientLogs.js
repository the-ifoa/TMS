// Receives batched browser-side log entries from the frontend client logger
// and appends them to <repo>/logs/frontend.log. Unauthenticated on purpose —
// it only ever writes to a local file and accepts no HTML/markup rendering.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('../utils/logger');

const router = express.Router();
const frontendStream = fs.createWriteStream(path.join(LOG_DIR, 'frontend.log'), { flags: 'a' });

router.post('/', (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [req.body].filter(Boolean);
  entries.slice(0, 50).forEach((e) => {
    if (!e || typeof e !== 'object') return;
    const level = String(e.level || 'log').toUpperCase().slice(0, 8);
    const msg = String(e.message || '').slice(0, 4000);
    const where = e.url ? ` (${String(e.url).slice(0, 300)})` : '';
    const src = e.src ? ` @ ${String(e.src).slice(0, 200)}` : '';
    const stack = e.stack ? `\n${String(e.stack).slice(0, 4000)}` : '';
    frontendStream.write(`[${new Date().toISOString()}] [${level}] ${msg}${src}${where}${stack}\n`);
  });
  res.json({ ok: true });
});

module.exports = router;

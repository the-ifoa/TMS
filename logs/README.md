# Logs

Runtime logs. Everything here except this file is git-ignored.

| File | What | Written by |
|------|------|-----------|
| `backend.log` | Every `console.*` line from the Node server + one line per HTTP request (`METHOD path → status (ms)`) | `backend/utils/logger.js`, loaded first in `backend/server.js` |
| `frontend.log` | Browser errors — uncaught exceptions, unhandled promise rejections, `console.error` calls — shipped from each user's browser | `frontend/src/lib/clientLogger.js` → `POST /api/client-logs` → `backend/routes/clientLogs.js` |

Both files are appended to (never truncated). Rotate/delete them yourself if they grow large:

```bash
: > logs/backend.log
: > logs/frontend.log
```

Tail them live:

```bash
tail -f logs/backend.log
tail -f logs/frontend.log
```

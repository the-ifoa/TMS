// ─────────────────────────────────────────────────────────────────────────────
//  Public URLs — single source of truth
//
//  Every outbound link the backend builds (exam-invite emails, password-reset
//  emails, …) must resolve against FRONTEND_URL from the environment. There is
//  NO hard-coded production or localhost value anywhere else in the codebase —
//  set FRONTEND_URL per deployment (see backend/.env for the local dev value).
// ─────────────────────────────────────────────────────────────────────────────

// Trailing slashes stripped so `${FRONTEND_URL}/exam/x` never doubles up.
const FRONTEND_URL = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');

if (!FRONTEND_URL) {
  console.warn(
    '[config] FRONTEND_URL is not set — links in outbound emails will be broken. ' +
    'Set FRONTEND_URL in the environment.',
  );
}

// Build an absolute frontend link. `path` should begin with "/".
function frontendLink(path = '/') {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${FRONTEND_URL}${p}`;
}

module.exports = { FRONTEND_URL, frontendLink };

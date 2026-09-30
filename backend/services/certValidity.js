// When an issued IFOA certificate stops being valid. The certificate is dated
// on the training end date (or start date for one-day courses) — same rule as
// certificateGenerator.js — and `cert_validity` is months, or 'Unlimited'.
// Mirrored on the frontend in src/utils/certValidity.js.

const DAY_MS = 24 * 60 * 60 * 1000;

function parseYmd(str) {
  if (!str) return null;
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

// null when there is nothing to expire (not issued, unlimited, no date).
function certExpiry(p, now = new Date()) {
  if (!p || !p.cert_released) return null;
  const months = Number(p.cert_validity || '36');
  if (!months) return null; // 'Unlimited'
  const issued = parseYmd((p.end_date && String(p.end_date).trim()) ? p.end_date : p.training_date);
  if (!issued) return null;
  const expires = new Date(issued);
  expires.setUTCMonth(expires.getUTCMonth() + months);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    expiresOn: expires.toISOString().slice(0, 10),
    daysLeft: Math.round((expires.getTime() - today) / DAY_MS),
  };
}

module.exports = { certExpiry };

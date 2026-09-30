// When an issued IFOA certificate stops being valid. Dated on the training end
// date (start date for one-day courses) + `cert_validity` months. Mirrors
// backend/services/certValidity.js.

const DAY_MS = 24 * 60 * 60 * 1000;

function parseYmd(str) {
  if (!str) return null;
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function statusFor(daysLeft) {
  return daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'critical' : daysLeft <= 90 ? 'warning' : 'valid';
}

// Validity from a fixed expiry date ('YYYY-MM-DD' or ISO timestamp).
export function expiryFromDate(value, now = new Date()) {
  const expires = parseYmd(value);
  if (!expires) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((expires.getTime() - today) / DAY_MS);
  return { expiresOn: expires.toISOString().slice(0, 10), daysLeft, status: statusFor(daysLeft) };
}

// Airline-uploaded internal certificate: explicit unlimited, a date, or unset (null).
export function internalCertExpiry(c, now = new Date()) {
  if (!c) return null;
  if (c.no_expiry) return { unlimited: true };
  return expiryFromDate(c.expires_on, now);
}

// Of several validities, the one needing attention first (soonest expiry,
// else unlimited, else null).
export function soonestExpiry(list) {
  const dated = list.filter((e) => e && e.expiresOn).sort((a, b) => a.daysLeft - b.daysLeft);
  if (dated.length) return dated[0];
  return list.find((e) => e && e.unlimited) || null;
}

// { unlimited: true } | { expiresOn, daysLeft, status } | null (not issued / no date)
// status: 'expired' | 'critical' (≤30d) | 'warning' (≤90d) | 'valid'
export function certExpiry(p, now = new Date()) {
  if (!p || !p.cert_released) return null;
  const months = Number(p.cert_validity || '36');
  if (!months) return { unlimited: true };
  const issued = parseYmd(p.end_date && String(p.end_date).trim() ? p.end_date : p.training_date);
  if (!issued) return null;
  const expires = new Date(issued);
  expires.setUTCMonth(expires.getUTCMonth() + months);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((expires.getTime() - today) / DAY_MS);
  return { expiresOn: expires.toISOString().slice(0, 10), daysLeft, status: statusFor(daysLeft) };
}

// "2y 3m left", "45 days left", "Expired 12 days ago"
export function timeLeftLabel(daysLeft) {
  if (daysLeft === 0) return 'Expires today';
  const abs = Math.abs(daysLeft);
  let span;
  if (abs < 60) span = `${abs} day${abs === 1 ? '' : 's'}`;
  else {
    const months = Math.floor(abs / 30.44);
    const y = Math.floor(months / 12);
    const m = months % 12;
    span = y ? `${y}y${m ? ` ${m}m` : ''}` : `${m} months`;
  }
  return daysLeft < 0 ? `Expired ${span} ago` : `${span} left`;
}

export function fmtExpiry(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

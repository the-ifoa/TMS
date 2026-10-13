// Small shared helpers for the dashboards.

// Each course keeps one colour everywhere, in the palette's validated order.
export const COURSE_COLORS = {
  FDI: '#2a78d6', FDR: '#eb6834', FDA: '#1baf7a', FTL: '#eda100',
  NDG: '#e87ba4', HF: '#008300', GD: '#6250d6', TCD: '#e34948',
};
export const COURSE_FALLBACK = '#94a3b8';

export function initials(name = '') {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Count by a key, biggest first; anything past `keep` folds into "Other".
export function tally(list, keyOf, keep = 6) {
  const map = new Map();
  list.forEach((x) => { const k = keyOf(x) || 'Not set'; map.set(k, (map.get(k) || 0) + 1); });
  const rows = [...map.entries()].map(([label, value]) => ({ key: label, label, value })).sort((a, b) => b.value - a.value);
  if (rows.length <= keep) return rows;
  const rest = rows.slice(keep - 1).reduce((t, r) => t + r.value, 0);
  return [...rows.slice(0, keep - 1), { key: '__other', label: 'Other', value: rest }];
}

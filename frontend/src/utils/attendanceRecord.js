// ─── Training Attendance Record: shared rules ────────────────────────────────
// Used by the attendance editor and the PDF so both always agree.
//
// Each trainee has a status per course day:
//   P present · A absent · L late arrival / early departure · E excused absence
// Everyone is Present unless marked otherwise.
//
// Hours attended are typed by staff; when left blank they're worked out from
// the days present (P and L count as a full day, A and E as none) times the
// hours per day (scheduled hours ÷ course days). Attendance % = hours
// attended ÷ scheduled hours — or days present ÷ course days when no
// scheduled hours are set.

export const STATUS = {
  P: { label: 'Present', short: 'P' },
  A: { label: 'Absent', short: 'A' },
  L: { label: 'Late / left early', short: 'L' },
  E: { label: 'Excused', short: 'E' },
};
export const STATUS_ORDER = ['P', 'L', 'E', 'A'];
const DAY_CREDIT = { P: 1, L: 1, E: 0, A: 0 };

export const DEFAULT_FORM_REF = 'IFOA-FRM-ATT-01 · Rev. 1.0';
export const DEFAULT_TAGLINE = 'International Flight Operations Academy';
export const DELIVERY_MODES = ['Classroom', 'Virtual (live online)', 'Blended', 'On the job'];

// Every calendar day from start to end (YYYY-MM-DD), capped at a year.
export function courseDays(startDate, endDate) {
  const out = [];
  if (!startDate) return out;
  const start = new Date(`${startDate}T12:00:00`);
  const end = endDate ? new Date(`${endDate}T12:00:00`) : new Date(start);
  const cur = new Date(start);
  while (cur <= end && out.length < 366) {
    out.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export const nameKey = (p) => `${(p.first_name || '').trim()}|${(p.last_name || '').trim()}`.toLowerCase();

// date → [code per participant]. New sheets store `statuses`; older ones only
// have `records` (who was present on a marked day): those days become P/A and
// unmarked days default to P.
export function statusMatrix(sheet, count, days) {
  const stored = new Map((sheet?.statuses || []).map((s) => [s.date, s.codes || []]));
  const legacy = new Map((sheet?.records || []).map((r) => [r.date, new Set(r.present || [])]));
  const useStored = (sheet?.statuses || []).length > 0;
  const out = {};
  days.forEach((d) => {
    out[d] = Array.from({ length: count }, (_, i) => {
      if (useStored) { const c = (stored.get(d) || [])[i]; return STATUS[c] ? c : 'P'; }
      if (legacy.has(d)) return legacy.get(d).has(i) ? 'P' : 'A';
      return 'P';
    });
  });
  return out;
}

export function defaultDetails({ company, trainingLabel, endDate } = {}) {
  return {
    course_title: trainingLabel || '',
    client: company || '',
    delivery_mode: 'Classroom',
    venue: '',
    scheduled_hours: null,
    min_attendance: 80,
    instructor_name: '',
    instructor_title: '',
    certified_on: endDate || '',
    tagline: DEFAULT_TAGLINE,
    form_ref: DEFAULT_FORM_REF,
  };
}

// Stored details over the defaults (blank stored values keep the default).
export function mergeDetails(stored, defaults) {
  const out = { ...defaults };
  Object.entries(stored || {}).forEach(([k, v]) => {
    if (v !== '' && v != null) out[k] = v;
  });
  return out;
}

const round1 = (n) => Math.round(n * 10) / 10;

// Per-trainee and overall figures for the record.
export function summarise({ participants, matrix, days, details }) {
  const scheduled = Number(details?.scheduled_hours) > 0 ? Number(details.scheduled_hours) : null;
  const perDay = scheduled && days.length ? scheduled / days.length : null;
  const rawMin = details?.min_attendance;
  const minPct = rawMin !== '' && rawMin != null && Number.isFinite(Number(rawMin)) ? Number(rawMin) : 80;

  const rows = participants.map((p, i) => {
    const counts = { P: 0, A: 0, L: 0, E: 0 };
    days.forEach((d) => { counts[(matrix[d] || [])[i] || 'P'] += 1; });
    const creditDays = days.reduce((t, d) => t + DAY_CREDIT[(matrix[d] || [])[i] || 'P'], 0);
    const autoHours = perDay != null ? round1(creditDays * perDay) : null;
    const manual = p.hours != null && p.hours !== '' && Number.isFinite(Number(p.hours)) ? Number(p.hours) : null;
    const hours = manual ?? autoHours;
    let pct = null;
    if (scheduled) pct = hours != null ? Math.min(100, Math.round((hours / scheduled) * 100)) : null;
    else if (days.length) pct = Math.round((creditDays / days.length) * 100);
    return { counts, creditDays, autoHours, hours, manualHours: manual != null, pct, met: pct != null && pct >= minPct };
  });

  const scored = rows.filter((r) => r.pct != null);
  return {
    rows,
    scheduled,
    perDay,
    minPct,
    enrolled: participants.length,
    met: rows.filter((r) => r.met).length,
    below: rows.filter((r) => r.pct != null && !r.met).length,
    average: scored.length ? Math.round(scored.reduce((t, r) => t + r.pct, 0) / scored.length) : null,
  };
}

// Payload pieces the API stores: statuses (codes per day) and the legacy
// `records` (P and L count as present) so older screens keep working.
export function toStorage(matrix, days) {
  const statuses = days.map((date) => ({ date, codes: matrix[date] || [] }));
  const records = days
    .map((date) => ({ date, present: (matrix[date] || []).reduce((acc, c, i) => { if (c === 'P' || c === 'L') acc.push(i); return acc; }, []) }))
    .filter((r) => r.present.length > 0);
  return { statuses, records };
}

// "ATT-2026-0417"-style reference for a saved sheet.
export function recordNumber(sheet) {
  const id = String(sheet?._id || sheet?.id || '');
  const year = (sheet?.created_at ? new Date(sheet.created_at) : new Date()).getFullYear();
  return id ? `ATT-${year}-${id.slice(-4).toUpperCase()}` : `ATT-${year}-DRAFT`;
}



export const TRAINING_LABELS = {
  FDI: 'Flight Dispatch Initial',
  FDR: 'Flight Dispatch Recurrent',
  FDA: 'Flight Dispatch Advanced',
  FTL: 'Flight Time Limitations',
  NDG: 'Dangerous Goods No-Carry',
  HF:  'Human Factors for OCC',
  GD:  'Ground Operations',
  TCD: 'Training Competencies Dev.',
};

export const TRAINING_TYPES = Object.entries(TRAINING_LABELS).map(([v, l]) => ({ value: v, label: `${v} - ${l}` }));

// ── Return-to-candidate (Edit → Save / Cancel → back here) ───────────────────
// Clicking a candidate's Edit records which row and view the admin was on, so
// coming back reopens that airline's list scrolled to the same candidate
// instead of the collapsed airline list.
export const RETURN_KEY = 'airlines_return';
export const VIEW_KEY   = 'airlines_view';
export const RETURN_TTL = 30 * 60 * 1000;

export function rememberReturn(pid, aKey) {
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ pid: String(pid), aKey, at: Date.now() })); } catch { /* ignore */ }
}

// { pid, aKey, view } when the admin is coming back from an edit, else null.
export function readReturn() {
  try {
    const ret = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null');
    if (!ret || Date.now() - ret.at > RETURN_TTL) return null;
    return { ...ret, view: JSON.parse(sessionStorage.getItem(VIEW_KEY) || '{}') };
  } catch { return null; }
}

// Order of candidates inside each airline card.
export const CANDIDATE_SORTS = {
  training_desc: 'Training: newest',
  training_asc:  'Training: oldest',
  added_desc:    'Added: newest',
  added_asc:     'Added: oldest',
  name_asc:      'Name: A → Z',
};

export function candidateComparator(key) {
  const time = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; };
  // Undated rows always go last, whichever direction.
  const byDate = (get, dir) => (a, b) => {
    const x = get(a), y = get(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (x - y) * dir;
  };
  const added = (p) => time(p.created_at);
  const training = (p) => time(p.training_date);
  switch (key) {
    case 'training_asc':  return (a, b) => byDate(training, 1)(a, b)  || byDate(added, 1)(a, b);
    case 'added_desc':    return byDate(added, -1);
    case 'added_asc':     return byDate(added, 1);
    case 'name_asc':      return (a, b) => (a.participant_name || '').localeCompare(b.participant_name || '');
    default:              return (a, b) => byDate(training, -1)(a, b) || byDate(added, -1)(a, b);
  }
}

export function badgeStyle() {
  return { background: '#eff6ff', color: '#0000ff', border: '1px solid #bfdbfe' };
}
export function mkInitials(name = '') {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
}
export function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spin({ cls = 'w-3.5 h-3.5 border-2 border-white/30 border-t-white' }) {
  return <div className={`${cls} rounded-full animate-spin`} />;
}

// ─── DHL FORM ST-001 extra certificate — DHL Bahrain / DHL Air (Bahrain), FDR only ──
export const DHL_BAHRAIN_NAMES = ['dhl bahrain', 'dhl air (bahrain)'];
export const isDhlBahrainAirline = (name) => DHL_BAHRAIN_NAMES.includes(String(name || '').trim().toLowerCase());
export const eligibleForDhlExtra = (p) => p.training_type === 'FDR' && isDhlBahrainAirline(p.airline_name);

export const airlineKey = (airline) => {
  if (!airline) return null;
  const id = airline.id || airline._id;
  if (!id) return null;
  return String(id);
};

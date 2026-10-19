// ─── Rating pieces shared by the feedback dialog and the feedback dashboard ────
// Ratings are on the form's 1–5 scale (Poor … Excellent), a diverging job: rose
// for the poor side, grey at the neutral midpoint, the site's blue for the good
// side, equal steps per arm. Colour sits only on marks (swatches, bar
// segments); every number and label stays in ink, and the pale middle steps
// always come with a visible number or a hover title.

export const SCALE_FILL = { 1: '#e11d48', 2: '#fda4af', 3: '#cbd5e1', 4: '#93c5fd', 5: '#2563eb' };

// Average → nearest scale point (4.5 and up reads as Excellent, and so on).
export const bandOf = (avg) => Math.min(5, Math.max(1, Math.round(avg)));
export const fmtAvg = (avg) => (avg == null ? '—' : Number(avg).toFixed(1));
export const scaleLabel = (scale, value) => scale.find((x) => x.value === value)?.label || '';

export function Swatch({ value, className = '' }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-[3px] flex-shrink-0 ${className}`} style={{ background: SCALE_FILL[value] }} />;
}

// Scale label chip, e.g. "■ Excellent". Fixed width so columns line up.
export function BandChip({ avg, scale, className = '' }) {
  if (avg == null) return <span className={`text-[11px] text-slate-300 ${className}`}>No ratings</span>;
  const band = bandOf(avg);
  return (
    <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-[10px] font-medium text-slate-600 whitespace-nowrap ${className}`}>
      <Swatch value={band} className="!w-2 !h-2" /> {scaleLabel(scale, band)}
    </span>
  );
}

// Average score + its scale label, e.g. "4.6  ■ Excellent".
export function ScoreBadge({ avg, scale, size = 'sm' }) {
  if (avg == null) return <span className="text-xs text-slate-400">No ratings</span>;
  return (
    <span className="inline-flex items-center gap-2 flex-shrink-0">
      <span className={`tabular-nums ${size === 'lg' ? 'text-base font-bold text-slate-900' : 'text-[13px] font-bold text-slate-700'}`}>{fmtAvg(avg)}</span>
      <BandChip avg={avg} scale={scale} />
    </span>
  );
}

// How the answers split across 1–5: one thin stacked bar, 2px surface gaps
// between segments, rounded ends. Hover a segment for its count.
export function DistBar({ distribution, scale, className = '' }) {
  const total = distribution.reduce((a, b) => a + b, 0);
  if (!total) return <span className={`block h-2 rounded-full bg-slate-100 ${className}`} />;
  return (
    <span className={`flex h-2 gap-[2px] ${className}`} role="img"
      aria-label={scale.map((sc, i) => `${sc.label}: ${distribution[i]}`).join(', ')}>
      {distribution.map((count, i) => (count ? (
        <span key={i} title={`${scale[i]?.label}: ${count} (${Math.round((count / total) * 100)}%)`}
          className="h-full first:rounded-l-full last:rounded-r-full min-w-[3px]"
          style={{ width: `${(count / total) * 100}%`, background: SCALE_FILL[i + 1] }} />
      ) : null))}
    </span>
  );
}

// The 1–5 legend.
export function ScaleLegend({ scale }) {
  return (
    <ul className="flex items-center gap-x-3.5 gap-y-1 flex-wrap">
      {scale.map((sc) => (
        <li key={sc.value} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
          <Swatch value={sc.value} /> <span className="text-slate-400 tabular-nums">{sc.value}</span> {sc.label}
        </li>
      ))}
    </ul>
  );
}

// Mean over every individual rating (not a mean of means), so each answer counts once.
export function weightedAverage(statements) {
  let sum = 0; let n = 0;
  statements.forEach((s) => { s.distribution.forEach((c, i) => { sum += c * (i + 1); n += c; }); });
  return n ? Math.round((sum / n) * 100) / 100 : null;
}

// Element-wise sum of several 1–5 distributions.
export const sumDistributions = (list) => list.reduce((acc, d) => acc.map((v, i) => v + (d[i] || 0)), [0, 0, 0, 0, 0]);

export const sectionTitle = (t) => t.replace(/:$/, '').replace(/\.\.\.$/, '');

// One aligned row: statement · spread · score · label. Every list of ratings
// uses this grid so the numbers sit in the same columns everywhere.
export const RATING_ROW = 'sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_2.25rem_7rem] sm:items-center sm:gap-4';

export function RatingRow({ text, average, distribution, scale, strong }) {
  return (
    <div className={`${RATING_ROW} px-4 py-2.5`}>
      <p className={`text-[13px] leading-snug ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{text}</p>
      <div className="mt-2 sm:mt-0 flex items-center gap-3 sm:contents">
        <DistBar distribution={distribution} scale={scale} className="w-28 sm:w-full" />
        <span className="text-[13px] font-bold text-slate-900 tabular-nums sm:text-right">{fmtAvg(average)}</span>
        <BandChip avg={average} scale={scale} className="sm:justify-self-start" />
      </div>
    </div>
  );
}

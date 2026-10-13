import { useState } from 'react';

// Small chart kit for the dashboards — plain HTML/SVG, no chart library.
// Colour is assigned by job, from the validated reference palette:
//   single series → one blue; ordered states → lighter step of the same blue;
//   good / warning / critical are reserved for real status and always ship
//   with a label. Text stays in ink colours; only the marks carry colour.
export const VIZ = {
  series: '#2a78d6',      // categorical slot 1 (blue)
  seriesDark: '#3987e5',  // the same slot stepped for a dark surface
  seriesSoft: '#86b6ef',  // same ramp, lighter step (ordinal "in progress")
  track: '#e2e8f0',       // unfilled / not started
  meterTrack: '#cde2fb',  // meter track: lighter step of the fill's own ramp
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  neutral: '#cbd5e1',
  grid: '#eef2f6',
  axis: '#cbd5e1',
};

// ── Hover / focus tooltip, one per chart ────────────────────────────────────
// `show(event, value, label)` positions it over the hovered mark, relative to
// the nearest [data-chart] ancestor. Values lead, labels follow.
export function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, value, label) => {
    const host = e.currentTarget.closest('[data-chart]');
    if (!host) return;
    const mark = e.currentTarget.querySelector('[data-mark]') || e.currentTarget;
    const h = host.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    setTip({ x: m.left - h.left + m.width / 2, y: m.top - h.top, value, label });
  };
  const hide = () => setTip(null);
  return { tip, show, hide };
}

export function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-lg bg-slate-900 text-white shadow-lg whitespace-nowrap"
      style={{ left: tip.x, top: tip.y - 8 }}>
      <p className="text-xs font-bold leading-tight">{tip.value}</p>
      <p className="text-[10px] text-slate-300 leading-tight">{tip.label}</p>
    </div>
  );
}

// Props every interactive mark shares: hover + keyboard focus show the same tip.
const markProps = (tipApi, value, label) => ({
  tabIndex: 0,
  'aria-label': `${label}: ${value}`,
  onPointerEnter: (e) => tipApi.show(e, value, label),
  onPointerLeave: tipApi.hide,
  onFocus: (e) => tipApi.show(e, value, label),
  onBlur: tipApi.hide,
});

// ── Card shell ──────────────────────────────────────────────────────────────
export function ChartCard({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-18px_rgba(15,23,42,0.25)] p-5 sm:p-6 flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h2>
          {subtitle && <p className="text-[13px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }) {
  return <div className="flex-1 min-h-[7rem] flex items-center justify-center text-[13px] text-slate-400 text-center px-4">{children}</div>;
}

// Screen-reader twin of a chart: the same numbers as a plain table.
export function DataTable({ caption, head, rows }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ── Compact stat tile: one row — dark icon, label + value, optional ring ────
// For pages where the numbers are a summary strip above the real content.
export function StatTileCompact({ label, value, suffix, sub, ring, icon: Icon }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs px-4 py-3 flex items-center gap-3">
      {Icon && (
        <span className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
          <Icon className="w-4.5 h-4.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-slate-900 tracking-tight leading-none">
          {value}{suffix && <span className="text-sm font-medium text-slate-400 ml-0.5">{suffix}</span>}
        </p>
        {sub && <p className="mt-1 text-[11px] text-slate-500 truncate" title={sub}>{sub}</p>}
      </div>
      {ring != null && <Ring value={ring} label={label} size={40} />}
    </div>
  );
}

// ── Stat tile: label · value · context, with an optional meter or sparkline ──
// `dark` = sits on the dark hero band (uses the palette's dark-surface blue).
export function StatTile({ label, value, suffix, sub, meter, ring, spark, icon: Icon, dark = false }) {
  const fill = dark ? VIZ.seriesDark : VIZ.series;
  return (
    <div className={dark
      ? 'rounded-2xl bg-white/[0.06] border border-white/10 p-4 sm:p-5'
      : 'bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 sm:p-5'}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${dark ? 'bg-white/10 text-white' : 'bg-blue-50 text-blue-600'}`}>
            <Icon className="w-4.5 h-4.5" />
          </span>
        )}
        <p className={`text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{label}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={`text-[2.25rem] font-bold tracking-tight leading-none ${dark ? 'text-white' : 'text-slate-900'}`}>
          {value}{suffix && <span className={`text-xl font-medium ml-0.5 ${dark ? 'text-slate-400' : 'text-slate-400'}`}>{suffix}</span>}
        </p>
        {spark && <Sparkline values={spark} dark={dark} />}
        {ring != null && <Ring value={ring} dark={dark} label={label} />}
      </div>
      {meter != null && (
        <div className="mt-3.5 h-1.5 rounded-full overflow-hidden" style={{ background: dark ? 'rgba(57,135,229,0.25)' : VIZ.meterTrack }}
          role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter)} aria-label={label}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, meter))}%`, background: fill }} />
        </div>
      )}
      <p className={`mt-3 text-[13px] min-h-[1.1rem] ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{sub}</p>
    </div>
  );
}

// Ring gauge for a 0–100 share. Track is a lighter step of the fill's own hue.
function Ring({ value, dark, label, size = 60 }) {
  const r = 24, c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const fill = dark ? VIZ.seriesDark : VIZ.series;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" className="flex-shrink-0 -rotate-90"
      role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <circle cx="30" cy="30" r={r} fill="none" strokeWidth="7" stroke={dark ? 'rgba(57,135,229,0.25)' : VIZ.meterTrack} />
      <circle cx="30" cy="30" r={r} fill="none" strokeWidth="7" stroke={fill} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: 'stroke-dashoffset 900ms ease' }} />
    </svg>
  );
}

// Trend line in the de-emphasis grey; only the latest point takes the accent.
function Sparkline({ values, dark = false }) {
  const w = 84, h = 30, pad = 4;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0" aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={dark ? '#64748b' : '#94a3b8'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="4" fill={dark ? VIZ.seriesDark : VIZ.series} stroke={dark ? '#0f172a' : '#fff'} strokeWidth="2" />}
    </svg>
  );
}

// Round an axis maximum up to a clean number.
function niceMax(n) {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((m) => m >= n) || n;
}

// ── Column chart: one series over ordered buckets (e.g. months) ─────────────
// data: [{ key, label, value, note? }]. Only the tallest column is labelled;
// the axis and the tooltip carry the rest.
export function ColumnChart({ data, unit = '', height = 190, caption }) {
  const tipApi = useTip();
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const peak = Math.max(...data.map((d) => d.value));
  const ticks = [max, max / 2, 0];
  return (
    <div data-chart className="relative">
      <div className="flex">
        <div className="w-8 flex-shrink-0 flex flex-col justify-between text-xs text-slate-500 tabular-nums text-right pr-2 -my-2" style={{ height }}>
          {ticks.map((t) => <span key={t}>{t}</span>)}
        </div>
        <div className="relative flex-1 min-w-0" style={{ height }}>
          {[0, 50].map((p) => <div key={p} className="absolute inset-x-0 border-t" style={{ top: `${p}%`, borderColor: VIZ.grid }} />)}
          <div className="absolute inset-x-0 bottom-0 border-t" style={{ borderColor: VIZ.axis }} />
          <div className="absolute inset-0 flex items-end">
            {data.map((d) => (
              <div key={d.key} className="group flex-1 h-full flex flex-col items-center justify-end outline-none px-0.5"
                {...markProps(tipApi, `${d.value}${unit ? ` ${unit}` : ''}`, d.note || d.label)}>
                {d.value > 0 && (data.length <= 8 || d.value === peak) && <span className="text-xs font-semibold text-slate-700 mb-1 tabular-nums">{d.value}</span>}
                <div data-mark className="w-full max-w-[24px] rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0, background: VIZ.series }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex pl-8 mt-2">
        {data.map((d) => (
          <span key={d.key} className={`flex-1 text-center text-xs truncate ${d.current ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{d.label}</span>
        ))}
      </div>
      <Tip tip={tipApi.tip} />
      {caption && <DataTable caption={caption} head={['Period', 'Count']} rows={data.map((d) => [d.note || d.label, d.value])} />}
    </div>
  );
}

// ── Horizontal bar list: magnitude across named categories ──────────────────
// rows: [{ key, label, value, hint? }]. One series, so one colour for every bar.
export function BarList({ rows, max, format = (v) => v, caption, valueHead = 'Value', track = false }) {
  const tipApi = useTip();
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div data-chart className="relative space-y-4">
      {rows.map((r) => (
        <div key={r.key} className="group grid grid-cols-[minmax(0,38%)_1fr] items-center gap-3 outline-none"
          {...markProps(tipApi, format(r.value), r.hint ? `${r.label} · ${r.hint}` : r.label)}>
          <span className="text-sm text-slate-700 truncate" title={r.label}>{r.label}</span>
          {track ? (
            <div className="flex items-center min-w-0">
              <div className="flex-1 h-3 rounded-[4px] overflow-hidden" style={{ background: VIZ.meterTrack }}>
                <div data-mark className="h-full rounded-r-[4px] transition-all duration-700 group-hover:opacity-80 group-focus-visible:opacity-80"
                  style={{ width: `${(Math.max(0, r.value) / top) * 100}%`, minWidth: r.value > 0 ? 2 : 0, background: VIZ.series }} />
              </div>
              <span className="ml-3 w-12 text-right text-sm font-semibold text-slate-900 whitespace-nowrap">{format(r.value)}</span>
            </div>
          ) : (
            <div className="flex items-center min-w-0">
              <div data-mark className="h-3 rounded-r-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                style={{ width: `calc((100% - 3.5rem) * ${Math.max(0, r.value) / top})`, minWidth: r.value > 0 ? 2 : 0, background: VIZ.series }} />
              <span className="ml-2.5 text-sm font-semibold text-slate-900 whitespace-nowrap">{format(r.value)}</span>
            </div>
          )}
        </div>
      ))}
      <Tip tip={tipApi.tip} />
      {caption && <DataTable caption={caption} head={['Category', valueHead]} rows={rows.map((r) => [r.label, format(r.value)])} />}
    </div>
  );
}

// ── Stacked bar: parts of one whole ─────────────────────────────────────────
// segments: [{ key, label, value, color, icon? }]. A 2px gap separates segments;
// the legend (always shown) carries label + count so colour is never alone.
export function StackedBar({ segments, caption, height = 12, legend = true }) {
  const tipApi = useTip();
  const total = segments.reduce((t, s) => t + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div data-chart className="relative">
      <div className="flex gap-[2px] w-full" style={{ height }}>
        {total === 0 && <div className="flex-1 rounded-[4px]" style={{ background: VIZ.track }} />}
        {shown.map((s, i) => (
          <div key={s.key} data-mark className="outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80 min-w-[4px]"
            style={{
              flex: s.value, background: s.color,
              borderTopLeftRadius: i === 0 ? 4 : 0, borderBottomLeftRadius: i === 0 ? 4 : 0,
              borderTopRightRadius: i === shown.length - 1 ? 4 : 0, borderBottomRightRadius: i === shown.length - 1 ? 4 : 0,
            }}
            {...markProps(tipApi, `${s.value} (${Math.round((s.value / total) * 100)}%)`, s.label)} />
        ))}
      </div>
      {legend && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5 text-[13px] text-slate-600">
              <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: s.color }} />
              {s.icon && <s.icon className="w-3.5 h-3.5 text-slate-400" />}
              {s.label}
              <span className="font-semibold text-slate-800 tabular-nums">{s.value}</span>
            </li>
          ))}
        </ul>
      )}
      <Tip tip={tipApi.tip} />
      {caption && <DataTable caption={caption} head={['Part', 'Count']} rows={segments.map((s) => [s.label, s.value])} />}
    </div>
  );
}

// Legend row for charts that draw several stacked bars with shared segments.
export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((s) => (
        <li key={s.label} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: s.color }} /> {s.label}
        </li>
      ))}
    </ul>
  );
}

// ── Area chart: one series over time ────────────────────────────────────────
// data: [{ key, label, value, note?, current? }]. A 2px line over a soft wash of
// the same hue; a ringed dot on every point; hovering a column reads its value.
export function AreaChart({ data, unit = '', height = 210, caption }) {
  const tipApi = useTip();
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const n = data.length;
  const x = (i) => ((i + 0.5) / n) * 100;
  const y = (v) => 100 - (v / max) * 100;
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const area = `${x(0)},100 ${line} ${x(n - 1)},100`;
  const ticks = [max, max / 2, 0];
  return (
    <div data-chart className="relative">
      <div className="flex">
        <div className="w-8 flex-shrink-0 flex flex-col justify-between text-xs text-slate-500 text-right pr-2 -my-2" style={{ height }}>
          {ticks.map((t) => <span key={t}>{t}</span>)}
        </div>
        <div className="relative flex-1 min-w-0" style={{ height }}>
          {[0, 50].map((p) => <div key={p} className="absolute inset-x-0 border-t" style={{ top: `${p}%`, borderColor: VIZ.grid }} />)}
          <div className="absolute inset-x-0 bottom-0 border-t" style={{ borderColor: VIZ.axis }} />
          <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="areaWash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={VIZ.series} stopOpacity="0.22" />
                <stop offset="100%" stopColor={VIZ.series} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polygon points={area} fill="url(#areaWash)" />
            <polyline points={line} fill="none" stroke={VIZ.series} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* Hover slices: aim at a month, not at the 2px line */}
          <div className="absolute inset-0 flex">
            {data.map((d, i) => (
              <div key={d.key} className="group relative flex-1 h-full outline-none"
                {...markProps(tipApi, `${d.value}${unit ? ` ${unit}` : ''}`, d.note || d.label)}>
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-200 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
                <div data-mark className="absolute left-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow-sm transition-transform group-hover:scale-125 group-focus-visible:scale-125"
                  style={{ top: `${y(d.value)}%`, background: VIZ.series }} />
                {d.value > 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold text-slate-800" style={{ top: `calc(${y(d.value)}% - 1.6rem)` }}>{d.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex pl-8 mt-2.5">
        {data.map((d) => (
          <span key={d.key} className={`flex-1 text-center text-[13px] truncate ${d.current ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{d.label}</span>
        ))}
      </div>
      <Tip tip={tipApi.tip} />
      {caption && <DataTable caption={caption} head={['Period', 'Count']} rows={data.map((d) => [d.note || d.label, d.value])} />}
    </div>
  );
}

// ── Donut: a few parts of one whole, with the total in the middle ───────────
// segments: [{ key, label, value, color, icon? }]. Pair it with a legend that
// shows label + count, so colour is never the only cue.
export function Donut({ segments, centerValue, centerLabel, size = 168, caption }) {
  const tipApi = useTip();
  const total = segments.reduce((t, s) => t + s.value, 0);
  const r = 40, c = 2 * Math.PI * r, gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 1.6 : 0;
  let offset = 0;
  return (
    <div data-chart className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={VIZ.track} strokeWidth="13" />
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={s.key} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="13"
              strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`} strokeDashoffset={-offset}
              className="outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80" style={{ pointerEvents: 'stroke' }}
              {...markProps(tipApi, `${s.value} (${Math.round((s.value / total) * 100)}%)`, s.label)} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-bold text-slate-900 leading-none">{centerValue}</span>
        <span className="mt-1 text-xs text-slate-500">{centerLabel}</span>
      </div>
      <Tip tip={tipApi.tip} />
      {caption && <DataTable caption={caption} head={['Part', 'Count']} rows={segments.map((s) => [s.label, s.value])} />}
    </div>
  );
}

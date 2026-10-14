import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useHistoryState, useBack } from '@/hooks/use-history-state';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
  Plane,
  Layers,
  CalendarDays,
  CircleCheck,
  Clock,
  Timer,
  Trophy,
  ShieldCheck,
  TriangleAlert,
  TrendingUp,
  GraduationCap,
  FileText,
  ListChecks,
  ChartBarDecreasing,
  ChartPie,
  Hourglass,
} from 'lucide-react';
import { getParticipantExamPerformance } from '../api';
import { useAuth } from '../context/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const GOOD = '#059669';
const INFO = '#2563eb';
const WARNING = '#d97706';
const CRITICAL = '#e11d48';
const NEUTRAL = '#94a3b8';
const ACCENT = '#4f46e5';

const ALL_EXAMS = 'all';

const CARD = 'bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtShortDate(v) {
  if (!v) return '';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtDuration(sec) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

function toISOKey(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function statusColor(passed) {
  if (passed === true) return GOOD;
  if (passed === false) return CRITICAL;
  return NEUTRAL;
}

function fmtStatus(a) {
  return a.passed === true ? 'Passed' : a.passed === false ? 'Failed' : (a.status || '').replace(/_/g, ' ');
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function getGradeLetter(avgPct) {
  if (avgPct == null) return { letter: '—', label: 'No graded attempts', color: NEUTRAL };
  if (avgPct >= 90) return { letter: 'A+', label: 'Outstanding', color: GOOD };
  if (avgPct >= 80) return { letter: 'A', label: 'Very good', color: INFO };
  if (avgPct >= 70) return { letter: 'B', label: 'Meets expectations', color: '#6366f1' };
  if (avgPct >= 60) return { letter: 'C', label: 'Needs review', color: WARNING };
  return { letter: 'F', label: 'Below standard', color: CRITICAL };
}

function accuracyTone(p) {
  if (p >= 80) return { color: GOOD, label: 'Strong' };
  if (p >= 60) return { color: WARNING, label: 'Moderate' };
  return { color: CRITICAL, label: 'Needs practice' };
}

// Summary numbers for any set of attempts — the whole history or one exam.
function summarise(attempts) {
  const scored = attempts.filter((a) => a.percentage != null);
  const passed = attempts.filter((a) => a.passed === true).length;
  const failed = attempts.filter((a) => a.passed === false).length;
  const avg = scored.length ? round1(scored.reduce((s, a) => s + a.percentage, 0) / scored.length) : null;
  const best = scored.length ? Math.max(...scored.map((a) => a.percentage)) : null;
  return {
    total: attempts.length,
    passed,
    failed,
    pending: attempts.length - passed - failed,
    avg,
    best,
    passRate: attempts.length ? Math.round((passed / attempts.length) * 100) : 0,
  };
}

// Merge each attempt's per-section tally into one accuracy row per section.
function sectionRows(attempts) {
  const by = {};
  attempts.forEach((a) => (a.sections || []).forEach((s) => {
    if (!by[s.section]) by[s.section] = { section: s.section, total: 0, correct: 0 };
    by[s.section].total += s.total;
    by[s.section].correct += s.correct;
  }));
  return Object.values(by)
    .filter((s) => s.total > 0)
    .map((s) => ({ ...s, pct: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => a.pct - b.pct);
}

function getCandidateCondition(stats) {
  if (stats.total === 0) {
    return { key: 'none', label: 'Awaiting assessment', icon: Hourglass, color: NEUTRAL, desc: 'No exam attempts have been submitted yet.' };
  }
  if (stats.passRate >= 80 && (stats.avg == null || stats.avg >= 80)) {
    return { key: 'good', label: 'High proficiency', icon: ShieldCheck, color: GOOD, desc: 'Consistently meets and exceeds the required standard.' };
  }
  if (stats.passRate >= 50 || (stats.avg != null && stats.avg >= 60)) {
    return { key: 'mid', label: 'Progressing', icon: TrendingUp, color: WARNING, desc: 'Meets the minimum threshold but would benefit from targeted review.' };
  }
  return { key: 'bad', label: 'Needs attention', icon: TriangleAlert, color: CRITICAL, desc: 'Falling short on assessments. Supplementary training is recommended.' };
}

// ─── Building blocks ──────────────────────────────────────────────────────────
function ScoreRing({ value, size = 120, stroke = 10, color = ACCENT, track = '#eef2f6', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

function IconChip({ icon: Icon, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
    </div>
  );
}

function CardHeader({ icon, tone, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <IconChip icon={icon} tone={tone} />}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="py-10 flex flex-col items-center justify-center text-center">
      <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-400 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <p className="text-xs text-slate-500">{text}</p>
    </div>
  );
}

function StatusPill({ passed, status, className = '' }) {
  const color = statusColor(passed);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md capitalize flex-shrink-0 ${className}`}
      style={{ color, backgroundColor: `${color}14` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {fmtStatus({ passed, status })}
    </span>
  );
}

// Width of an element in CSS pixels, so SVG charts draw at true size instead
// of scaling their text up with the container.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// ─── Score trend ──────────────────────────────────────────────────────────────
function TrendChart({ attempts, passMark, selectedId, onSelect }) {
  const [ref, W] = useWidth();
  const scored = attempts.filter((a) => a.percentage != null);

  if (!scored.length) {
    return <EmptyState icon={TrendingUp} text="No graded attempts to plot yet." />;
  }

  const H = 220, padL = 36, padR = 12, padT = 20, padB = 28;
  const plotW = Math.max(0, W - padL - padR);
  const plotH = H - padT - padB;
  const x = (i) => padL + (scored.length === 1 ? plotW / 2 : (i / (scored.length - 1)) * plotW);
  const y = (v) => padT + plotH - (v / 100) * plotH;
  const pts = scored.map((a, i) => ({ x: x(i), y: y(a.percentage), a }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1].x} ${padT + plotH} L ${pts[0].x} ${padT + plotH} Z`;
  const labelEvery = Math.max(1, Math.ceil(scored.length / Math.max(1, Math.floor(plotW / 70))));

  return (
    <div ref={ref} className="w-full" style={{ height: H }}>
      {W > 0 && (
        <svg width={W} height={H} className="block overflow-visible">
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.14" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 25, 50, 75, 100].map((g) => (
            <g key={g}>
              <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="#f1f5f9" />
              <text x={padL - 8} y={y(g)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#94a3b8">{g}</text>
            </g>
          ))}

          {passMark != null && (
            <g>
              <line x1={padL} x2={W - padR} y1={y(passMark)} y2={y(passMark)} stroke={GOOD} strokeOpacity="0.6" strokeDasharray="4 4" />
              <text x={W - padR} y={y(passMark) - 6} textAnchor="end" fontSize="10.5" fontWeight="500" fill={GOOD}>
                Pass {passMark}%
              </text>
            </g>
          )}

          {scored.length > 1 && <path d={area} fill="url(#trendFill)" />}
          {scored.length > 1 && (
            <path d={line} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          )}

          {pts.map((p, i) => {
            const sel = p.a.id === selectedId;
            const color = statusColor(p.a.passed);
            return (
              <g key={p.a.id} className="cursor-pointer group" onClick={() => onSelect(p.a.id)}>
                <title>{`${p.a.exam_title || 'Exam'} · Attempt #${p.a.attempt_number} · ${p.a.percentage}% · ${fmtDate(p.a.submitted_at)}`}</title>
                <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
                <circle cx={p.x} cy={p.y} r={sel ? 9 : 7} fill={color} fillOpacity="0.15" />
                <circle cx={p.x} cy={p.y} r="4" fill={color} stroke="white" strokeWidth="1.5" />
                <text x={p.x} y={p.y - 13} textAnchor="middle" fontSize="11" fontWeight="600" fill="#334155">{p.a.percentage}%</text>
                {i % labelEvery === 0 && (
                  <text x={p.x} y={H - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">{fmtShortDate(p.a.submitted_at)}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ─── Outcomes ─────────────────────────────────────────────────────────────────
function OutcomeCard({ attempts, stats }) {
  const slices = [
    { label: 'Passed', value: stats.passed, color: GOOD },
    { label: 'Failed', value: stats.failed, color: CRITICAL },
    { label: 'Pending', value: stats.pending, color: '#cbd5e1' },
  ];
  const size = 104, stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const active = slices.filter((s) => s.value > 0);
  const gap = active.length > 1 ? 3 : 0;
  let offset = 0;

  const scored = attempts.filter((a) => a.percentage != null);
  const bands = [
    { label: '90–100', color: GOOD, test: (v) => v >= 90 },
    { label: '80–89', color: INFO, test: (v) => v >= 80 && v < 90 },
    { label: '70–79', color: WARNING, test: (v) => v >= 70 && v < 80 },
    { label: '< 70', color: CRITICAL, test: (v) => v < 70 },
  ].map((b) => ({ ...b, count: scored.filter((a) => b.test(a.percentage)).length }));

  return (
    <div className={`${CARD} p-5 h-full`}>
      <CardHeader icon={ChartPie} tone="violet" title="Outcomes" subtitle="Pass / fail split and score bands" />

      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
            {stats.total > 0 && active.map((s) => {
              const len = (s.value / stats.total) * c;
              const el = (
                <circle
                  key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
                  stroke={s.color} strokeWidth={stroke}
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold text-slate-900 leading-none tabular-nums">{stats.passRate}%</span>
            <span className="text-[10px] text-slate-500 mt-1">pass rate</span>
          </div>
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          {slices.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-slate-900 tabular-nums">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-medium text-slate-600">Score bands</p>
          <p className="text-[11px] text-slate-400">{scored.length} graded</p>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 gap-0.5">
          {scored.length > 0 && bands.filter((b) => b.count).map((b) => (
            <div key={b.label} className="h-full transition-all duration-700" style={{ width: `${(b.count / scored.length) * 100}%`, backgroundColor: b.color }} />
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2 mt-3">
          {bands.map((b) => (
            <div key={b.label} className={`rounded-lg px-2 py-1.5 text-center ${b.count ? 'bg-slate-50' : ''}`}>
              <p className={`text-sm font-semibold tabular-nums ${b.count ? 'text-slate-900' : 'text-slate-300'}`}>{b.count}</p>
              <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.color }} />
                {b.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section accuracy ─────────────────────────────────────────────────────────
function SectionAccuracy({ rows, subtitle }) {
  const correct = rows.reduce((s, r) => s + r.correct, 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const overall = total ? Math.round((correct / total) * 100) : null;
  const overallTone = overall != null ? accuracyTone(overall) : null;

  return (
    <div className={`${CARD} p-5 sm:p-6 h-full`}>
      <CardHeader icon={ChartBarDecreasing} tone="sky" title="Accuracy by section" subtitle={subtitle} />
      {rows.length === 0 ? (
        <EmptyState icon={ChartBarDecreasing} text="No auto-graded answers to break down yet." />
      ) : (
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex sm:flex-col items-center gap-4 sm:gap-2 sm:w-36 flex-shrink-0 sm:border-r sm:border-slate-100 sm:pr-6">
            <ScoreRing value={overall} size={96} stroke={9} color={overallTone.color}>
              <span className="text-xl font-semibold text-slate-900 tabular-nums leading-none">{overall}%</span>
            </ScoreRing>
            <div className="sm:text-center">
              <p className="text-xs font-medium text-slate-700">Overall accuracy</p>
              <p className="text-[11px] text-slate-500 tabular-nums">{correct} of {total} correct</p>
            </div>
          </div>

          <div className="flex-1 min-w-0 divide-y divide-slate-100">
            {rows.map((s) => {
              const tone = accuracyTone(s.pct);
              return (
                <div key={s.section || '_'} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate" title={s.section || 'Ungrouped'}>
                        {s.section || 'Ungrouped'}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">{s.correct} of {s.total} correct · {tone.label}</p>
                    </div>
                    <span
                      className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md flex-shrink-0"
                      style={{ color: tone.color, backgroundColor: `${tone.color}14` }}
                    >
                      {s.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2">
                    <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${s.pct}%`, backgroundColor: tone.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lists with a "view all" pop-up ───────────────────────────────────────────
// Cards show the first few rows so paired cards stay level; the full list
// opens in a dialog.
const PREVIEW_ROWS = 3;

function ListCard({ icon, tone, title, subtitle, right, items, renderRow, empty, dialogTitle, dialogSubtitle }) {
  const [open, setOpen] = useState(false);
  const rest = items.length - PREVIEW_ROWS;
  return (
    <div className={`${CARD} p-5 sm:p-6 h-full flex flex-col`}>
      <CardHeader icon={icon} tone={tone} title={title} subtitle={subtitle} right={right} />
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">{empty}</div>
      ) : (
        <div className="flex-1 -mx-2 space-y-0.5">
          {items.slice(0, PREVIEW_ROWS).map((it) => renderRow(it, () => {}))}
        </div>
      )}
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 w-full h-9 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5 transition"
        >
          View all {items.length}
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            {dialogSubtitle && <DialogDescription>{dialogSubtitle}</DialogDescription>}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {items.map((it) => renderRow(it, () => setOpen(false)))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExamList({ exams, selectedExamId, onSelect }) {
  return (
    <ListCard
      icon={Layers}
      tone="indigo"
      title="Exams taken"
      subtitle="Best score per exam · click to focus"
      items={exams}
      dialogTitle="Exams taken"
      dialogSubtitle={`${exams.length} exams · best score per exam`}
      empty={<EmptyState icon={Layers} text="No exams taken yet." />}
      renderRow={(e, close) => {
        const active = e.id === selectedExamId;
        const color = e.passed ? GOOD : e.best == null ? NEUTRAL : CRITICAL;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => { onSelect(active ? ALL_EXAMS : e.id); close(); }}
            className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left transition-colors ${active ? 'bg-indigo-50/70 ring-1 ring-indigo-200/80' : 'hover:bg-slate-50'}`}
          >
            <ScoreRing value={e.best} size={42} stroke={3.5} color={color}>
              <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{e.best != null ? Math.round(e.best) : '—'}</span>
            </ScoreRing>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{e.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {e.attempts.length} attempt{e.attempts.length === 1 ? '' : 's'} · {fmtShortDate(e.latest)}
              </p>
            </div>
            <StatusPill passed={e.passed ? true : e.best == null ? null : false} status="pending" />
          </button>
        );
      }}
    />
  );
}

// ─── Verdict ──────────────────────────────────────────────────────────────────
function VerdictCard({ condition, weakest, strongest }) {
  const Icon = condition.icon;
  const areas = [
    strongest && { label: 'Strongest', color: GOOD, s: strongest },
    weakest && { label: 'Focus area', color: CRITICAL, s: weakest },
  ].filter(Boolean);

  return (
    <div className={`${CARD} p-5 h-full`}>
      <CardHeader icon={GraduationCap} tone="slate" title="Assessment verdict" />
      <div className="flex items-start gap-3 p-3.5 rounded-xl border" style={{ backgroundColor: `${condition.color}0d`, borderColor: `${condition.color}33` }}>
        <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: condition.color }} strokeWidth={2} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{condition.label}</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{condition.desc}</p>
        </div>
      </div>

      {areas.length > 0 && (
        <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200/80">
          {areas.map(({ label, color, s }) => (
            <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</p>
                <p className="text-sm font-medium text-slate-900 truncate" title={s.section || 'Ungrouped'}>{s.section || 'Ungrouped'}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums" style={{ color }}>{s.pct}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Calendar (opens from the top bar) ─────────────────────────────────────────────────────────────────
function CalendarWidget({ attempts, selectedDateKey, onSelectDate }) {
  const latest = attempts[0]?.submitted_at ? new Date(attempts[0].submitted_at) : new Date();
  const [viewDate, setViewDate] = useState(
    isNaN(latest.getTime()) ? new Date() : new Date(latest.getFullYear(), latest.getMonth(), 1)
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDate = useMemo(() => {
    const map = {};
    attempts.forEach((a) => {
      const key = toISOKey(a.submitted_at);
      if (key) (map[key] = map[key] || []).push(a);
    });
    return map;
  }, [attempts]);

  const cells = [];
  for (let i = 0; i < firstDayIndex; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="w-[300px] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{monthName}</p>
          <p className="text-[11px] text-slate-500">Pick a day with attempts</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
            <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-slate-400 uppercase mb-1">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 text-center text-xs gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isSelected = selectedDateKey === key;
          const dayAttempts = byDate[key] || [];
          const has = dayAttempts.length > 0;
          const anyPass = dayAttempts.some((a) => a.passed === true);
          return (
            <div key={i} className="flex justify-center">
              <button
                type="button"
                disabled={!has && !isSelected}
                onClick={() => onSelectDate(isSelected ? null : key)}
                title={has ? `${dayAttempts.length} attempt(s)` : undefined}
                className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors tabular-nums ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-semibold'
                    : has
                    ? 'text-slate-900 font-semibold ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
                    : 'text-slate-400 cursor-default'
                }`}
              >
                {d}
                {has && !isSelected && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full" style={{ backgroundColor: anyPass ? GOOD : CRITICAL }} />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Attempt history ──────────────────────────────────────────────────────────
function AttemptHistory({ attempts, selectedId, onSelect, title, onClearDate, totalCount }) {
  return (
    <ListCard
      icon={ListChecks}
      tone="emerald"
      title={title}
      subtitle="Select an attempt to see its breakdown"
      items={attempts}
      dialogTitle={title}
      dialogSubtitle={`${attempts.length} attempts · newest first`}
      empty={<EmptyState icon={ListChecks} text="No attempts match this filter." />}
      right={onClearDate && (
        <button
          type="button"
          onClick={onClearDate}
          className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" /> Show all ({totalCount})
        </button>
      )}
      renderRow={(a, close) => {
        const color = statusColor(a.passed);
        const sel = a.id === selectedId;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => { onSelect(sel ? null : a.id); close(); }}
            className={`group w-full flex items-center gap-4 px-2 py-2.5 text-left rounded-xl transition-colors ${sel ? 'bg-indigo-50/70 ring-1 ring-indigo-200/80' : 'hover:bg-slate-50'}`}
          >
            <ScoreRing value={a.percentage} size={42} stroke={3.5} color={color}>
              <span className="text-[11px] font-semibold text-slate-800 tabular-nums">{a.percentage != null ? Math.round(a.percentage) : '—'}</span>
            </ScoreRing>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{a.exam_title || 'Exam'}</p>
              <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3">
                <span>Attempt #{a.attempt_number}</span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />{fmtDate(a.submitted_at)}</span>
                {a.time_taken_seconds != null && (
                  <span className="inline-flex items-center gap-1"><Timer className="w-3 h-3" />{fmtDuration(a.time_taken_seconds)}</span>
                )}
              </p>
            </div>
            <StatusPill passed={a.passed} status={a.status} />
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
          </button>
        );
      }}
    />
  );
}

// ─── Single attempt summary (replaces the trend while an attempt is open) ────
function AttemptSummary({ attempt, onBack, resultLink }) {
  const color = statusColor(attempt.passed);
  const rows = sectionRows([attempt]);
  const correct = rows.reduce((s, r) => s + r.correct, 0);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className={`${CARD} p-5 sm:p-6 h-full flex flex-col`}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to overview
        </button>
        {resultLink && (
          <Link to={resultLink} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800">
            <FileText className="w-4 h-4" strokeWidth={1.75} /> Full answer sheet
          </Link>
        )}
      </div>
      <div className="flex-1 flex flex-col sm:flex-row items-center gap-6">
        <ScoreRing value={attempt.percentage} size={120} stroke={10} color={color}>
          <span className="text-2xl font-semibold text-slate-900 leading-none tabular-nums">{attempt.percentage != null ? `${Math.round(attempt.percentage)}%` : '—'}</span>
          <span className="text-[11px] font-medium mt-1 capitalize" style={{ color }}>{fmtStatus(attempt)}</span>
        </ScoreRing>
        <div className="flex-1 min-w-0 w-full text-center sm:text-left">
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{attempt.exam_title || 'Exam'}</h2>
          <p className="text-sm text-slate-500 mt-0.5">Attempt #{attempt.attempt_number} · {fmtDate(attempt.submitted_at)}</p>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <MiniStat icon={CircleCheck} label="Correct" value={total ? `${correct}/${total}` : '—'} />
            <MiniStat icon={Timer} label="Time taken" value={fmtDuration(attempt.time_taken_seconds)} />
            <MiniStat icon={ShieldCheck} label="Pass mark" value={attempt.pass_percentage != null ? `${attempt.pass_percentage}%` : '—'} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-3 py-2.5 text-left">
      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} /> {label}
      </p>
      <p className="text-base font-semibold text-slate-900 mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, hint, accent = '#a5b4fc' }) {
  return (
    <div className="rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/10 p-4">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}26`, color: accent }}>
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </span>
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-white mt-3 tabular-nums leading-none">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-1.5 truncate">{hint}</p>}
    </div>
  );
}

// Lighter tints of the status colours, readable on the dark hero.
const HERO_TINT = { good: '#6ee7b7', mid: '#fcd34d', bad: '#fda4af', none: '#cbd5e1' };

function Row({ left, right }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 min-w-0">{left}</div>
      <div className="lg:col-span-4 min-w-0">{right}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ParticipantExamPerformance() {
  const { participantId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const goBack = useBack(isAdmin ? '/admin/participants' : '/airline/participants');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useHistoryState('selectedExamId', ALL_EXAMS);
  const [selectedDateKey, setSelectedDateKey] = useHistoryState('selectedDateKey', null);
  const [selectedAttemptId, setSelectedAttemptId] = useHistoryState('selectedAttemptId', null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    getParticipantExamPerformance(participantId)
      .then((res) => setData(res.data))
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load report.'))
      .finally(() => setLoading(false));
  }, [participantId]);

  // The API returns attempts oldest first; the trend reads left-to-right in
  // that order while lists show the newest first.
  const chrono = data?.attempts || [];
  const exams = useMemo(() => {
    const by = new Map();
    chrono.forEach((a) => {
      const key = a.exam_id || a.exam_title;
      if (!by.has(key)) by.set(key, { id: key, title: a.exam_title || 'Exam', attempts: [], pass_percentage: a.pass_percentage });
      by.get(key).attempts.push(a);
    });
    return [...by.values()]
      .map((e) => {
        const scored = e.attempts.filter((a) => a.percentage != null);
        return {
          ...e,
          best: scored.length ? Math.max(...scored.map((a) => a.percentage)) : null,
          passed: e.attempts.some((a) => a.passed === true),
          latest: e.attempts[e.attempts.length - 1].submitted_at,
        };
      })
      .sort((a, b) => new Date(b.latest) - new Date(a.latest));
  }, [chrono]);

  const activeExam = exams.find((e) => e.id === selectedExamId) || null;
  const scoped = activeExam ? activeExam.attempts : chrono;
  const recent = useMemo(() => [...scoped].reverse(), [scoped]);

  const selectExam = (id) => {
    setSelectedExamId(id);
    setSelectedAttemptId(null);
    setSelectedDateKey(null);
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-3xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="h-80 lg:col-span-8 rounded-2xl" />
          <Skeleton className="h-80 lg:col-span-4 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center">
        <p className="text-sm font-medium text-slate-500">Could not load candidate information.</p>
        <button onClick={() => goBack()} className="mt-4 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl">
          Back to list
        </button>
      </div>
    );
  }

  const { participant } = data;
  const stats = summarise(scoped);
  const grade = getGradeLetter(stats.avg);
  const condition = getCandidateCondition(stats);
  const sections = sectionRows(scoped);
  const weakest = sections.length && sections[0].pct < 60 ? sections[0] : null;
  const strongest = sections.length > 1 ? sections[sections.length - 1] : null;
  const initials = (participant.name || 'C A').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const scopeLabel = activeExam ? activeExam.title : 'All exams';

  const passMarks = [...new Set(scoped.map((a) => a.pass_percentage).filter((v) => v != null))];
  const passMark = passMarks.length === 1 ? passMarks[0] : null;

  const filtered = selectedDateKey ? recent.filter((a) => toISOKey(a.submitted_at) === selectedDateKey) : recent;
  const selectedAttempt = scoped.find((a) => a.id === selectedAttemptId) || null;
  const resultLink = selectedAttempt && !isAdmin && selectedAttempt.exam_id
    ? `/airline/exams/${selectedAttempt.exam_id}/result/${selectedAttempt.id}`
    : null;

  return (
    <div className="min-h-full bg-slate-50 text-slate-800 pb-16">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200/80 px-4 sm:px-6 py-3 sticky top-0 z-30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => goBack()}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-4 h-4 text-slate-500" />
              Back
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-slate-900 leading-tight">Candidate performance</h1>
              <p className="text-xs text-slate-500 truncate">{participant.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <div className={`flex items-center h-9 rounded-xl border transition ${selectedDateKey ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                <PopoverTrigger asChild>
                  <button type="button" className="h-full flex items-center gap-2 pl-3 pr-3 text-xs font-medium">
                    <CalendarDays className={`w-4 h-4 ${selectedDateKey ? 'text-indigo-500' : 'text-slate-400'}`} strokeWidth={1.75} />
                    {selectedDateKey ? fmtDate(selectedDateKey) : 'Calendar'}
                  </button>
                </PopoverTrigger>
                {selectedDateKey && (
                  <button
                    type="button"
                    onClick={() => setSelectedDateKey(null)}
                    className="h-full pr-2.5 pl-0.5 text-indigo-400 hover:text-indigo-700"
                    aria-label="Clear date filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <PopoverContent align="end" alignOffset={0}>
                <CalendarWidget
                  key={activeExam?.id || ALL_EXAMS}
                  attempts={recent}
                  selectedDateKey={selectedDateKey}
                  onSelectDate={(k) => { setSelectedDateKey(k); setSelectedAttemptId(null); setCalendarOpen(false); }}
                />
              </PopoverContent>
            </Popover>
            {isAdmin && participant.company && (
              <span className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-700">
                <Plane className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                {participant.company}
              </span>
            )}
            <Select value={activeExam ? activeExam.id : ALL_EXAMS} onValueChange={selectExam} disabled={exams.length === 0}>
              <SelectTrigger className="h-9 w-[240px] bg-white">
                <span className="flex items-center gap-2 min-w-0">
                  <Layers className="w-4 h-4 text-slate-400 flex-shrink-0" strokeWidth={1.75} />
                  <SelectValue placeholder="All exams" />
                </span>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={ALL_EXAMS}>All exams ({chrono.length} attempts)</SelectItem>
                {exams.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title} ({e.attempts.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 pt-6 space-y-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 sm:p-7">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-semibold text-lg flex items-center justify-center flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight truncate">{participant.name}</h2>
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                    style={{ color: HERO_TINT[condition.key], backgroundColor: `${condition.color}2e` }}
                  >
                    <condition.icon className="w-3.5 h-3.5" strokeWidth={2} />
                    {condition.label}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1 truncate">
                  {isAdmin && participant.company ? `${participant.company} · ` : ''}
                  Showing <span className="text-slate-200 font-medium">{scopeLabel}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/10 px-5 py-4 flex-shrink-0">
              <ScoreRing value={stats.avg} size={80} stroke={7} color={grade.color} track="rgba(255,255,255,0.08)">
                <span className="text-lg font-semibold leading-none">{grade.letter}</span>
              </ScoreRing>
              <div>
                <p className="text-xs text-slate-400">Average score</p>
                <p className="text-3xl font-semibold tabular-nums leading-tight">{stats.avg != null ? `${stats.avg}%` : '—'}</p>
                <p className="text-xs text-slate-300">{grade.label}</p>
              </div>
            </div>
          </div>

          <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <HeroStat icon={ListChecks} accent="#a5b4fc" label="Attempts" value={stats.total} hint={activeExam ? 'On this exam' : `Across ${exams.length} exam${exams.length === 1 ? '' : 's'}`} />
            <HeroStat icon={CircleCheck} accent="#6ee7b7" label="Passed" value={`${stats.passed}/${stats.total}`} hint={`${stats.passRate}% pass rate`} />
            <HeroStat icon={Trophy} accent="#fcd34d" label="Best score" value={stats.best != null ? `${stats.best}%` : '—'} hint={passMark != null ? `Pass mark ${passMark}%` : 'Highest graded attempt'} />
            <HeroStat icon={Clock} accent="#7dd3fc" label="Last attempt" value={recent[0] ? fmtShortDate(recent[0].submitted_at) : '—'} hint={recent[0] ? recent[0].exam_title : 'No attempts yet'} />
          </div>
        </section>

        {/* Paired rows: each left card shares its row (and height) with the
            card beside it. */}
        <Row
          left={selectedAttempt ? (
            <AttemptSummary attempt={selectedAttempt} onBack={() => setSelectedAttemptId(null)} resultLink={resultLink} />
          ) : (
            <div className={`${CARD} p-5 sm:p-6 h-full flex flex-col`}>
              <CardHeader
                icon={TrendingUp}
                tone="indigo"
                title="Score trend"
                subtitle={`${scopeLabel} · oldest to newest`}
                right={(
                  <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500 flex-shrink-0">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: GOOD }} />Passed</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: CRITICAL }} />Failed</span>
                    {passMark != null && (
                      <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed" style={{ borderColor: GOOD }} />Pass mark</span>
                    )}
                  </div>
                )}
              />
              <div className="flex-1 flex items-center">
                <TrendChart attempts={scoped} passMark={passMark} selectedId={selectedAttemptId} onSelect={setSelectedAttemptId} />
              </div>
            </div>
          )}
          right={<VerdictCard condition={condition} weakest={weakest} strongest={strongest} />}
        />

        <Row
          left={selectedAttempt
            ? <SectionAccuracy rows={sectionRows([selectedAttempt])} subtitle="Auto-graded answers in this attempt" />
            : <SectionAccuracy rows={sections} subtitle={`${scopeLabel} · weakest first`} />}
          right={<OutcomeCard attempts={scoped} stats={stats} />}
        />

        <Row
          left={(
            <AttemptHistory
              attempts={filtered}
              selectedId={selectedAttemptId}
              onSelect={setSelectedAttemptId}
              title={selectedDateKey ? `Attempts on ${fmtDate(selectedDateKey)}` : 'Attempt history'}
              onClearDate={selectedDateKey ? () => setSelectedDateKey(null) : null}
              totalCount={recent.length}
            />
          )}
          right={<ExamList exams={exams} selectedExamId={activeExam?.id} onSelect={selectExam} />}
        />
      </main>
    </div>
  );
}

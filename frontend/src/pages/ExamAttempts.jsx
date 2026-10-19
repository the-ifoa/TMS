import { useEffect, useRef, useState } from 'react';
import { useHistoryState, useBack } from '@/hooks/use-history-state';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineUser,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineExclamationCircle,
  HiOutlineSearch,
  HiOutlineX,
  HiOutlineDownload,
  HiOutlineUpload,
} from 'react-icons/hi';
import { ChartSpline, CalendarDays, Clock, ShieldAlert, ChevronDown, ChevronUp, PenLine, Trash2, MonitorX, FileText, Mail, Upload, Hourglass, CircleX, ListChecks, Trophy, RotateCcw, Minimize2, ArrowLeftRight, CodeXml, CircleCheck, Gauge, ChartBarDecreasing, ClipboardCheck, CircleHelp, ChartPie } from 'lucide-react';
import { listExamAttempts, getExamSummary, getExamAttemptResult, gradeExamAttempt, getExamAnalytics, exportExamAttempts, deleteExamAttempt, bulkDeleteExamAttempts, uploadAttemptCertificate, getAttemptCertificate, deleteAttemptCertificate, sendAttemptCertificate, reassignExamInvites } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfirm } from '@/hooks/use-confirm';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

function responseText(q, response) {
  if (response == null || response === '') return '(no answer)';

  if (['mcq', 'true_false', 'select_list'].includes(q.type)) {
    return (q.options || []).find((o) => String(o._id) === String(response))?.text || String(response);
  }

  if (q.type === 'multi_response') {
    const ids = Array.isArray(response) ? response.map(String) : [];
    const matched = (q.options || []).filter((o) => ids.includes(String(o._id))).map((o) => o.text);
    return matched.length > 0 ? matched.join(', ') : '(no answer)';
  }

  if (q.type === 'drag_drop') {
    if (Array.isArray(response)) {
      const items = response.map((item) => {
        if (typeof item === 'object' && item !== null) {
          const label = item.item_label || item.label || '';
          const targetIdx = item.target_Index ?? item.target_index;
          const target = item.target_label || (q.dragdrop_targets?.[targetIdx]?.label) || `Zone ${targetIdx !== undefined ? targetIdx + 1 : ''}`;
          return `${label} → ${target}`;
        }
        return String(item);
      });
      return items.join('; ');
    }
  }

  if (q.type === 'matching') {
    if (Array.isArray(response)) {
      const pairs = q.matching_pairs || [];
      return response
        .map((p, idx) => {
          if (typeof p === 'object' && p !== null) return `${p.left || ''} ↔ ${p.right || ''}`;
          const left = pairs[idx]?.left || `#${idx + 1}`;
          return p ? `${left} ↔ ${p}` : null;
        })
        .filter(Boolean)
        .join('; ') || '(no answer)';
    }
  }

  if (q.type === 'sequence') {
    if (Array.isArray(response)) {
      const items = q.sequence_items || [];
      return response
        .map((item) => {
          if (typeof item === 'object' && item !== null) return item.text || item.label || String(item);
          return items[Number(item)]?.text ?? String(item);
        })
        .join(' → ');
    }
  }

  if (q.type === 'fill_blank' || q.type === 'drag_words') {
    if (Array.isArray(response)) {
      return response.join(', ');
    }
  }

  if (typeof response === 'object' && response !== null) {
    try {
      if (Array.isArray(response)) {
        return response.map((r) => (typeof r === 'object' ? JSON.stringify(r) : String(r))).join(', ');
      }
      return Object.entries(response)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    } catch {
      return JSON.stringify(response);
    }
  }

  return String(response);
}

function correctAnswerText(q) {
  switch (q.type) {
    case 'short_answer':
      return (q.correct_text || []).join(' / ') || null;
    case 'numeric':
      return q.numeric_answer != null ? String(q.numeric_answer) : null;
    case 'sequence':
      return (q.sequence_items || []).map((s) => s.text).join(' → ') || null;
    case 'matching':
      return (q.matching_pairs || []).map((p) => `${p.left} ↔ ${p.right}`).join('; ') || null;
    case 'fill_blank':
      return (q.blanks_answers || []).map((a) => (a || [])[0]).join(', ') || null;
    case 'drag_words':
      return (q.drag_words_answers || []).join(', ') || null;
    case 'drag_drop':
      return (q.dragdrop_items || [])
        .map((i) => {
          const targetName = q.dragdrop_targets?.[i.correct_target_index]?.label || `Zone ${(i.correct_target_index ?? 0) + 1}`;
          return `${i.label} → ${targetName}`;
        })
        .join('; ') || null;
    default:
      return null;
  }
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const CHOICE_TYPES = ['mcq', 'multi_response', 'true_false', 'select_list'];

function isOptionSelected(q, response, optionId) {
  if (q.type === 'multi_response') {
    const ids = Array.isArray(response) ? response.map(String) : [];
    return ids.includes(String(optionId));
  }
  return String(response) === String(optionId);
}

const STATUS_VARIANT = {
  in_progress: 'amber',
  submitted: 'emerald',
  pending_review: 'blue',
  graded: 'emerald',
};

// Row status pill for each attempt state.
const ATTEMPT_STATUS = {
  in_progress:    { label: 'In progress',    cls: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  pending_review: { label: 'Pending review', cls: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  submitted:      { label: 'Submitted',      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  graded:         { label: 'Graded',         cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
};

const VIOLATION_ICONS = {
  fullscreen_exit: Minimize2,
  tab_switch: ArrowLeftRight,
  devtools_suspected: CodeXml,
};

const VIOLATION_TONES = {
  fullscreen_exit:    { icon: 'bg-amber-50 text-amber-600',   chip: 'bg-amber-50 text-amber-700' },
  tab_switch:         { icon: 'bg-rose-50 text-rose-600',     chip: 'bg-rose-50 text-rose-700' },
  devtools_suspected: { icon: 'bg-violet-50 text-violet-600', chip: 'bg-violet-50 text-violet-700' },
  default:            { icon: 'bg-slate-100 text-slate-600',  chip: 'bg-slate-100 text-slate-700' },
};

const VIOLATION_LABELS = {
  fullscreen_exit: 'Exited fullscreen',
  tab_switch: 'Switched tab/window',
  devtools_suspected: 'Suspicious activity detected',
};

function AttemptImageGallery({ gallery }) {
  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  const targetScroll = useRef(0);
  const animFrame = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    targetScroll.current = el.scrollLeft;

    const smoothLoop = () => {
      if (!el) return;
      const diff = targetScroll.current - el.scrollLeft;
      if (Math.abs(diff) > 0.4) {
        el.scrollLeft += diff * 0.18;
        animFrame.current = requestAnimationFrame(smoothLoop);
      } else {
        el.scrollLeft = targetScroll.current;
        animFrame.current = null;
      }
    };

    const onWheel = (e) => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 2) {
        // Single image or no horizontal overflow -> allow normal vertical page scroll!
        return;
      }

      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (delta !== 0) {
        const atStart = el.scrollLeft <= 0.5 && delta < 0;
        const atEnd = el.scrollLeft >= maxScroll - 0.5 && delta > 0;
        if (atStart || atEnd) {
          // At gallery boundary -> allow outer vertical page scroll
          return;
        }

        e.preventDefault();
        const currentBase = animFrame.current ? targetScroll.current : el.scrollLeft;
        targetScroll.current = Math.max(0, Math.min(maxScroll, currentBase + delta * 2.2));

        if (!animFrame.current) {
          animFrame.current = requestAnimationFrame(smoothLoop);
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, []);

  const handleMouseDown = (e) => {
    if (!scrollRef.current) return;
    if (animFrame.current) cancelAnimationFrame(animFrame.current);
    animFrame.current = null;
    isDragging.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftStart.current = scrollRef.current.scrollLeft;
    targetScroll.current = scrollRef.current.scrollLeft;
  };

  const handleMouseLeaveOrUp = () => {
    isDragging.current = false;
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current || !scrollRef.current) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    const newPos = scrollLeftStart.current - walk;
    scrollRef.current.scrollLeft = newPos;
    targetScroll.current = newPos;
  };

  const multi = gallery.length > 1;
  return (
    <div
      ref={scrollRef}
      onMouseDown={multi ? handleMouseDown : undefined}
      onMouseLeave={multi ? handleMouseLeaveOrUp : undefined}
      onMouseUp={multi ? handleMouseLeaveOrUp : undefined}
      onMouseMove={multi ? handleMouseMove : undefined}
      className={
        multi
          ? 'flex gap-3 overflow-x-auto pb-2.5 -mx-1 px-1 scrollbar-thin select-none cursor-grab active:cursor-grabbing'
          : 'flex'
      }
    >
      {gallery.map((img, gi) => (
        <div key={gi} className={`relative rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-50 p-3 ${multi ? 'flex-shrink-0' : 'mx-auto'}`}>
          {multi && (
            <span className="absolute top-2 left-2 z-10 w-5 h-5 rounded-full bg-slate-900/80 text-white text-[10px] font-extrabold flex items-center justify-center">
              {gi + 1}
            </span>
          )}
          <img
            src={img.url}
            alt="Question asset"
            draggable={false}
            className={multi ? 'h-56 w-auto max-w-xs rounded-xl object-contain pointer-events-none' : 'max-h-72 rounded-xl object-contain mx-auto'}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Analytics panel ──────────────────────────────────────────────────────────
// Same look as the candidate performance page: dark summary hero, then white
// cards with tinted icon chips.
const A_GOOD = '#059669';
const A_BAD = '#e11d48';
const A_WARN = '#d97706';
const A_CARD = 'bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
const BAR_AREA = 150;

const A_TONES = {
  indigo: 'bg-indigo-50 text-indigo-600',
  sky: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
};

function ARing({ value, color, size = 80, stroke = 7, track = 'rgba(255,255,255,0.08)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {pct > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} className="transition-[stroke-dasharray] duration-700" />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

function AHeroStat({ icon: Icon, label, value, hint, accent }) {
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

function ACardHeader({ icon: Icon, tone, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${A_TONES[tone]}`}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function shortDay(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function AnalyticsPanel({ analytics, examTitle, passMark, inProgress }) {
  const [qFilter, setQFilter] = useState('all');
  const o = analytics.overall;
  const passRate = o.finished_attempts ? Math.round((o.passed / o.finished_attempts) * 100) : null;
  const avg = o.avg_percentage != null ? Math.round(o.avg_percentage * 10) / 10 : null;
  const avgColor = avg == null ? '#94a3b8' : passMark != null ? (avg >= passMark ? A_GOOD : A_BAD) : '#6366f1';

  const scoredQs = analytics.per_question.filter((q) => q.miss_rate != null);
  const avgMiss = scoredQs.length ? Math.round(scoredQs.reduce((s, q) => s + q.miss_rate, 0) / scoredQs.length) : null;
  const tiers = {
    hard: scoredQs.filter((q) => q.miss_rate > 50).length,
    medium: scoredQs.filter((q) => q.miss_rate > 20 && q.miss_rate <= 50).length,
    easy: scoredQs.filter((q) => q.miss_rate <= 20).length,
  };

  const sessions = analytics.pass_rate_over_time;
  const maxTotal = Math.max(1, ...sessions.map((d) => d.total));

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 sm:p-7">
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center flex-shrink-0">
              <ChartSpline className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight truncate">Performance analytics</h2>
              <p className="text-sm text-slate-400 mt-1 truncate">
                {examTitle ? <><span className="text-slate-200 font-medium">{examTitle}</span> · </> : ''}
                How candidates are doing on this exam
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/10 px-5 py-4 flex-shrink-0">
            <ARing value={avg} color={avgColor}>
              <Gauge className="w-7 h-7" style={{ color: avgColor }} strokeWidth={1.5} />
            </ARing>
            <div>
              <p className="text-xs text-slate-400">Average score</p>
              <p className="text-3xl font-semibold tabular-nums leading-tight">{avg != null ? `${avg}%` : '—'}</p>
              <p className="text-xs text-slate-300">{passMark != null ? `Pass mark ${passMark}%` : 'Across graded attempts'}</p>
            </div>
          </div>
        </div>

        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <AHeroStat icon={CircleCheck} accent="#6ee7b7" label="Pass rate" value={passRate != null ? `${passRate}%` : '—'} hint={`${o.passed} of ${o.finished_attempts} passed`} />
          <AHeroStat icon={ClipboardCheck} accent="#a5b4fc" label="Finished" value={o.finished_attempts} hint="Submitted attempts" />
          <AHeroStat icon={Hourglass} accent="#fcd34d" label="In progress" value={inProgress} hint={inProgress ? 'Still taking the exam' : 'Nobody mid-exam'} />
          <AHeroStat icon={CircleHelp} accent="#fda4af" label="Avg. miss rate" value={avgMiss != null ? `${avgMiss}%` : '—'} hint={`${analytics.per_question.length} questions · ${tiers.hard} hard`} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sessions — stacked passed / failed columns */}
        <section className={`${A_CARD} p-5 sm:p-6 flex flex-col lg:col-span-7`}>
          <ACardHeader
            icon={CalendarDays}
            tone="indigo"
            title="Results by session"
            subtitle="Attempts per exam day, split by outcome"
            right={(
              <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500 flex-shrink-0">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: A_GOOD }} />Passed</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: A_BAD }} />Failed</span>
              </div>
            )}
          />
          {sessions.length === 0 ? (
            <p className="flex-1 flex items-center justify-center text-xs text-slate-500 py-10">No submitted attempts yet.</p>
          ) : (
            <>
              <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="relative flex items-end gap-4 min-w-full" style={{ minWidth: sessions.length * 48, height: BAR_AREA + 44 }}>
                  {[0, 0.5, 1].map((g) => (
                    <div key={g} className="absolute left-0 right-0 border-t border-slate-100" style={{ bottom: 22 + g * BAR_AREA }} />
                  ))}
                  {sessions.map((d) => {
                    const failed = d.total - d.passed;
                    const h = Math.max(8, Math.round((d.total / maxTotal) * BAR_AREA));
                    return (
                      <div key={d.date} className="relative flex-1 min-w-[32px] h-full flex flex-col items-center justify-end group"
                        title={`${shortDay(d.date)}: ${d.passed} passed, ${failed} failed (${Math.round(d.pass_rate)}% pass rate)`}>
                        <span className="text-[11px] font-semibold text-slate-700 tabular-nums mb-1">{d.total}</span>
                        <div className="w-full max-w-[34px] flex flex-col gap-px rounded-lg overflow-hidden group-hover:opacity-85 transition" style={{ height: h }}>
                          {failed > 0 && <div style={{ flex: failed, backgroundColor: A_BAD }} />}
                          {d.passed > 0 && <div style={{ flex: d.passed, backgroundColor: A_GOOD }} />}
                        </div>
                        <span className="h-[22px] pt-1.5 text-[11px] text-slate-500 whitespace-nowrap">{shortDay(d.date)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3 text-center">
                {[
                  ['Sessions', sessions.length],
                  ['Busiest day', `${maxTotal} attempts`],
                  ['Best day', `${Math.round(Math.max(...sessions.map((d) => d.pass_rate)))}% pass`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">{v}</p>
                    <p className="text-[11px] text-slate-500">{k}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Outcome split */}
        <section className={`${A_CARD} p-5 sm:p-6 lg:col-span-5 flex flex-col`}>
          <ACardHeader icon={ChartPie} tone="violet" title="Outcomes" subtitle="How submitted attempts ended" />
          <div className="flex-1 flex items-center gap-6">
            <ARing value={passRate} color={A_GOOD} size={128} stroke={12} track="#fee2e2">
              <span className="text-2xl font-semibold text-slate-900 tabular-nums leading-none">{passRate != null ? `${passRate}%` : '—'}</span>
              <span className="text-[11px] text-slate-500 mt-1">pass rate</span>
            </ARing>
            <div className="flex-1 space-y-3 min-w-0">
              {[
                ['Passed', o.passed, A_GOOD],
                ['Failed', o.finished_attempts - o.passed, A_BAD],
                ['In progress', inProgress, '#cbd5e1'],
              ].map(([label, n, c]) => (
                <div key={label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />{label}
                    </span>
                    <span className="font-semibold text-slate-900 tabular-nums">{n}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(n / Math.max(1, o.finished_attempts + inProgress)) * 100}%`, backgroundColor: c }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Question difficulty */}
      {analytics.per_question.length > 0 && (() => {
        const rows = analytics.per_question.map((q, idx) => ({
          ...q,
          no: idx + 1,
          tier: q.miss_rate == null ? 'none' : q.miss_rate > 50 ? 'hard' : q.miss_rate > 20 ? 'medium' : 'easy',
        }));
        const shown = qFilter === 'all' ? rows : rows.filter((r) => r.tier === qFilter);
        const TIER = {
          hard:   { label: 'Hard',   dot: 'bg-rose-400',    text: 'text-rose-600' },
          medium: { label: 'Medium', dot: 'bg-amber-400',   text: 'text-amber-600' },
          easy:   { label: 'Easy',   dot: 'bg-emerald-400', text: 'text-emerald-600' },
          none:   { label: 'No data', dot: 'bg-slate-300',  text: 'text-slate-400' },
        };
        return (
          <section className={`${A_CARD} overflow-hidden`}>
            <div className="p-5 sm:p-6 pb-4">
              <ACardHeader
                icon={ChartBarDecreasing}
                tone="sky"
                title="Question difficulty"
                subtitle="How often each question was answered wrong · hardest first"
              />
              {/* Filter tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit max-w-full overflow-x-auto [scrollbar-width:none] -mt-1">
                {[
                  ['all', 'All', rows.length],
                  ['hard', 'Hard', tiers.hard],
                  ['medium', 'Medium', tiers.medium],
                  ['easy', 'Easy', tiers.easy],
                ].map(([k, label, n]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setQFilter(k)}
                    className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs whitespace-nowrap transition cursor-pointer ${
                      qFilter === k ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                  >
                    {k !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${TIER[k].dot}`} />}
                    {label}
                    <span className="text-[10px] text-slate-400 tabular-nums">{n}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Table head (desktop) */}
            <div className="hidden md:grid grid-cols-[2.5rem_1fr_6rem_11rem_4.5rem] gap-4 px-6 py-2 bg-slate-50 border-y border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <span>#</span>
              <span>Question</span>
              <span>Difficulty</span>
              <span>Correct / missed</span>
              <span className="text-right">Missed</span>
            </div>

            <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100">
              {shown.length === 0 && (
                <p className="px-6 py-10 text-center text-xs text-slate-500">No questions in this group.</p>
              )}
              {shown.map((q) => {
                const t = TIER[q.tier];
                return (
                  <div key={q.question_id || q.no} className="grid grid-cols-[2.5rem_1fr_4.5rem] md:grid-cols-[2.5rem_1fr_6rem_11rem_4.5rem] items-center gap-x-4 gap-y-2 px-5 sm:px-6 py-3 hover:bg-slate-50/70 transition-colors">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-semibold flex items-center justify-center tabular-nums">
                      {q.no}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 truncate" title={q.prompt}>{q.prompt || '(untitled question)'}</p>
                      {(q.section || q.pending > 0) && (
                        <p className="text-[11px] text-slate-400 truncate">
                          {q.section}
                          {q.section && q.pending > 0 ? ' · ' : ''}
                          {q.pending > 0 ? `${q.pending} awaiting grading` : ''}
                        </p>
                      )}
                    </div>
                    <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />{t.label}
                    </span>
                    <div className="hidden md:block">
                      {q.total > 0 ? (
                        <>
                          <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 gap-px">
                            {q.correct > 0 && <div className="bg-emerald-400" style={{ flex: q.correct }} />}
                            {q.incorrect > 0 && <div className="bg-rose-300" style={{ flex: q.incorrect }} />}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 tabular-nums">{q.correct} correct · {q.incorrect} missed</p>
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-400">Not answered yet</p>
                      )}
                    </div>
                    <span className={`text-right text-sm font-semibold tabular-nums ${t.text}`}>
                      {q.miss_rate != null ? `${Math.round(q.miss_rate)}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}
    </div>
  );
}

function GradeModal({ attemptId, onClose, onGraded }) {
  const [attempt, setAttempt] = useState(null);
  const [scores, setScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all'); // all | manual | correct | incorrect
  const [totalOverride, setTotalOverride] = useState(null); // manual override of the final total, null = auto-computed

  useEffect(() => {
    getExamAttemptResult(attemptId)
      .then((res) => {
        setAttempt(res.data);
        // Seed every answer's score so the admin can override any question.
        const initial = {};
        (res.data.answers || []).forEach((a) => { initial[a.question_id] = a.points_awarded ?? 0; });
        setScores(initial);
      })
      .catch(() => toast.error('Failed to load attempt.'));
  }, [attemptId]);

  const questionById = Object.fromEntries(
    (attempt?.questions_snapshot || []).map((q) => [String(q._id), q])
  );

  // Any per-question edit invalidates a standing total override — the two
  // shouldn't silently disagree.
  const setQuestionScore = (questionId, value) => {
    setTotalOverride(null);
    setScores((prev) => ({ ...prev, [questionId]: value }));
  };

  const awardMax = (questionId, maxPoints) => setQuestionScore(questionId, maxPoints);

  const awardMaxToAllPending = () => {
    if (!attempt) return;
    setTotalOverride(null);
    setScores((prev) => {
      const next = { ...prev };
      attempt.answers.forEach((a) => {
        if (a.needs_manual_grading) {
          const q = questionById[String(a.question_id)];
          next[a.question_id] = q ? q.points : 0;
        }
      });
      return next;
    });
  };

  const pendingCount = attempt ? attempt.answers.filter((a) => a.needs_manual_grading).length : 0;

  // Live running total from every question's current (possibly edited) points —
  // updates as the admin adjusts ANY question, not just manual-review ones.
  const summedTotal = attempt
    ? attempt.answers.reduce((sum, a) => {
        const q = questionById[String(a.question_id)];
        const cap = q ? q.points : Infinity;
        const val = scores[a.question_id] ?? a.points_awarded ?? 0;
        return sum + Math.min(cap, Math.max(0, Number(val)));
      }, 0)
    : 0;
  const maxTotal = attempt
    ? (attempt.max_score ?? attempt.answers.reduce((sum, a) => {
        const q = questionById[String(a.question_id)];
        return sum + (q ? q.points : 0);
      }, 0))
    : 0;
  // The header total is directly editable — if the admin has typed an
  // override, that wins over the per-question sum until they reset it.
  const liveTotal = totalOverride != null ? totalOverride : summedTotal;
  const livePct = maxTotal > 0 ? Math.round((liveTotal / maxTotal) * 1000) / 10 : 0;

  const submit = async () => {
    // Send every answer so the admin can override auto-graded points too.
    const answers = attempt.answers.map((a) => ({
      question_id: a.question_id,
      points_awarded: scores[a.question_id] ?? a.points_awarded ?? 0,
      feedback: '',
    }));
    setSaving(true);
    try {
      await gradeExamAttempt(attemptId, { answers, total_override: totalOverride });
      toast.success('Attempt graded successfully.');
      onGraded();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save grading.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
        {!attempt ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-4 w-96 rounded-lg" />
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-36 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Sticky Modern Clean Modal Header */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-b border-slate-200/80 bg-white sticky top-0 z-10 space-y-2.5">
              {/* Row 1: Candidate Profile & Clean Score Card */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="w-9 h-9 border border-slate-200 shadow-2xs flex-shrink-0">
                    <AvatarFallback className="bg-slate-900 text-white text-xs font-bold">
                      {attempt.participant_name ? attempt.participant_name.charAt(0).toUpperCase() : 'S'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <DialogTitle className="text-base font-extrabold text-slate-900 tracking-tight leading-snug truncate">
                      {attempt.participant_name}
                    </DialogTitle>
                    <p className="text-xs text-slate-500 font-medium truncate">
                      {attempt.exam_title_snapshot} · <span className="text-slate-400">Attempt #{attempt.attempt_number}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-shrink-0">
                  {/* Refined Modern Score Badge (Light/Slate theme) */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Score</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min="0" max={maxTotal}
                        value={liveTotal}
                        onChange={(e) => setTotalOverride(Math.max(0, Math.min(maxTotal, Number(e.target.value))))}
                        title="Directly edit final score"
                        className="w-9 py-0.5 text-xs font-extrabold text-slate-900 bg-white border border-slate-200 rounded-md text-center outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all"
                      />
                      <span className="text-xs font-bold text-slate-600">/ {maxTotal}</span>
                    </div>
                    <span className="ml-1 px-1.5 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-extrabold shadow-2xs">
                      {livePct}%
                    </span>
                    {totalOverride != null && (
                      <button type="button" onClick={() => setTotalOverride(null)} title="Reset to auto-calculated score"
                        className="ml-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 underline">
                        reset
                      </button>
                    )}
                  </div>

                  {/* Refined Status Pill Badge */}
                  <span
                    className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold border capitalize shadow-2xs ${
                      attempt.status === 'graded' || attempt.status === 'submitted'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                        : attempt.status === 'pending_review'
                        ? 'bg-blue-50 text-blue-700 border-blue-200/80'
                        : 'bg-amber-50 text-amber-700 border-amber-200/80'
                    }`}
                  >
                    {attempt.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Row 2: Filter Tabs & Bulk Action */}
              {(() => {
                const correctCount = attempt.answers.filter((a) => a.is_correct === true).length;
                const incorrectCount = attempt.answers.filter((a) => a.is_correct === false).length;
                const tabs = [
                  { id: 'all', label: 'All', count: attempt.answers.length },
                  { id: 'manual', label: 'Needs Grading', count: pendingCount, highlight: pendingCount > 0 },
                  { id: 'correct', label: 'Correct', count: correctCount },
                  { id: 'incorrect', label: 'Incorrect', count: incorrectCount },
                ];
                return (
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 flex-wrap sm:flex-nowrap">
                    {/* Clean Minimal Segmented Tabs */}
                    <div className="inline-flex items-center p-1 rounded-xl bg-slate-100/90 border border-slate-200/70 text-xs overflow-x-auto">
                      {tabs.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setFilter(t.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
                            filter === t.id
                              ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80 font-bold'
                              : 'text-slate-500 hover:text-slate-900 font-semibold hover:bg-slate-200/50'
                          }`}
                        >
                          <span>{t.label}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                              filter === t.id
                                ? 'bg-slate-100 text-slate-800'
                                : t.highlight
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200/80 text-slate-600'
                            }`}
                          >
                            {t.count}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Bulk Award Action */}
                    {pendingCount > 0 && (
                      <button
                        type="button"
                        onClick={awardMaxToAllPending}
                        className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white text-xs font-bold shadow-2xs transition-all whitespace-nowrap ml-auto cursor-pointer"
                      >
                        <HiOutlineCheckCircle className="w-4 h-4" />
                        <span>Award Max to All Pending ({pendingCount})</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Scrollable Questions Body */}
            <div className="flex-1 overflow-y-auto min-h-0 p-6 bg-slate-50/60 space-y-4">
              {attempt.answers.filter((a) => {
                if (filter === 'manual') return a.needs_manual_grading;
                if (filter === 'correct') return a.is_correct === true;
                if (filter === 'incorrect') return a.is_correct === false;
                return true;
              }).map((a) => {
                const q = questionById[String(a.question_id)];
                if (!q) return null;

                // Real position in the full attempt (stable regardless of filter).
                const realIdx = attempt.answers.findIndex((x) => String(x.question_id) === String(a.question_id));
                const isCorrect = a.is_correct;
                const isManual = a.needs_manual_grading;

                return (
                  <div
                    key={a.question_id}
                    className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4"
                  >
                    {/* Question Header & Prompt */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Question {realIdx + 1}
                        </span>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700">
                          {q.points} pt{q.points !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                        {q.prompt}
                      </p>
                    </div>

                    {/* Question Image(s) if present */}
                    {(() => {
                      const gallery = q.images && q.images.length > 0 ? q.images : (q.image_url ? [{ url: q.image_url }] : []);
                      if (gallery.length === 0) return null;
                      return <AttemptImageGallery gallery={gallery} />;
                    })()}

                    {/* Grading reference note — authored by the admin when the question
                        was created; otherwise only ever surfaced to the student after
                        grading, never to the grader themself. */}
                    {q.explanation && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                          Grading Reference (from question author)
                        </p>
                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200/70 text-xs font-medium text-blue-900 whitespace-pre-wrap leading-relaxed">
                          {q.explanation}
                        </div>
                      </div>
                    )}

                    {/* Candidate Answer Options or Response */}
                    {CHOICE_TYPES.includes(q.type) ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Options Review
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                          {(q.options || []).map((opt, oi) => {
                            const selected = isOptionSelected(q, a.response, opt._id);
                            const correct = opt.is_correct;
                            return (
                              <div
                                key={opt._id || oi}
                                className={`flex items-center gap-3 p-3 rounded-2xl border text-xs font-semibold transition-all ${
                                  selected && correct
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs'
                                    : selected && !correct
                                    ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-2xs'
                                    : correct
                                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
                                    : 'bg-white border-slate-200/80 text-slate-700'
                                }`}
                              >
                                <span
                                  className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                                    selected
                                      ? correct
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-rose-600 text-white'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {OPTION_LETTERS[oi] || oi + 1}
                                </span>
                                {opt.image_url && (
                                  <img src={opt.image_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                                )}
                                <span className="flex-1 leading-relaxed">{opt.text}</span>
                                {selected && (
                                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-slate-900 text-white flex-shrink-0">
                                    Selected
                                  </span>
                                )}
                                {correct && (
                                  <HiOutlineCheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                                )}
                              </div>
                            );
                          })}
                          {(a.response == null || a.response === '' || (Array.isArray(a.response) && a.response.length === 0)) && (
                            <p className="text-xs text-rose-500 font-semibold italic px-1">No answer submitted</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            Candidate Answer
                          </p>
                          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {responseText(q, a.response)}
                          </div>
                        </div>
                        {correctAnswerText(q) && (
                          <div className="space-y-1">
                            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
                              Correct Answer Reference
                            </p>
                            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 text-xs font-bold text-emerald-900 whitespace-pre-wrap leading-relaxed">
                              {correctAnswerText(q)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Score / Grading Bar — points editable on EVERY question */}
                    <div className={`pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isManual ? '' : ''}`}>
                      {/* Status indicator */}
                      <div className="flex items-center gap-2">
                        {isManual ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                            <HiOutlineExclamationCircle className="w-4 h-4 text-amber-600" /> Manual Review
                          </span>
                        ) : isCorrect ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                            <HiOutlineCheckCircle className="w-4 h-4 text-emerald-600" /> Correct
                          </span>
                        ) : isCorrect === false ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                            <HiOutlineXCircle className="w-4 h-4 text-rose-600" /> Incorrect
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">Not Scored</span>
                        )}
                      </div>

                      {/* Points editor — assign or deduct on any question */}
                      <div className="flex items-center gap-2.5 flex-shrink-0 self-end sm:self-auto">
                        <span className="text-xs font-bold text-slate-800">Points:</span>
                        <input
                          type="number" min="0" max={q.points}
                          value={scores[a.question_id] ?? ''}
                          onChange={(e) => setQuestionScore(a.question_id, Number(e.target.value))}
                          className="w-20 px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
                          placeholder={`0 - ${q.points}`}
                        />
                        <span className="text-xs font-semibold text-slate-400">/ {q.points}</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => awardMax(a.question_id, q.points)}
                          className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold px-3 py-1.5 h-auto">
                          Max
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => awardMax(a.question_id, 0)}
                          className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold px-3 py-1.5 h-auto">
                          Zero
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sticky Bottom Footer */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200/80 bg-white sticky bottom-0 z-10 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-xl border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Close
              </Button>
              {attempt.status !== 'in_progress' && (
                <Button
                  type="button"
                  onClick={submit}
                  disabled={saving}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs px-6 py-2.5"
                >
                  {saving ? 'Saving…' : attempt.status === 'pending_review' ? 'Submit Grades' : 'Save Grades'}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ExamAttempts() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, can } = useAuth();
  const backToExams = isAdmin ? '/admin/exams' : '/airline/exams/manage';
  const goBack = useBack(backToExams);
  const [exam, setExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradingId, setGradingId] = useState(null);
  const [search, setSearch] = useHistoryState('search', '');
  const [statusFilter, setStatusFilter] = useHistoryState('statusFilter', 'all');
  const [analytics, setAnalytics] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [expandedViolations, setExpandedViolations] = useState(() => new Set());
  // Candidate cards start collapsed; this holds the ones the user opened.
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const toggleGroup = (key) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const { confirm, ConfirmDialog } = useConfirm();
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // IFOA admins manage results of IFOA-owned exams; airlines manage their own
  // exams. The server enforces this too — this only hides buttons that would 403.
  const canDelete = exam ? (isAdmin ? !exam.owner_airline : true) : false;
  // What this account may do here — anything it can't is simply not shown.
  const canGrade         = can('exams.grade');
  const canDeleteResults = canDelete && can('exams.author');
  const canManageCerts   = canDelete && (canGrade || can('exams.author'));
  const canSelect        = canDeleteResults || canManageCerts;
  const canReassign      = canDelete && can('exams.assign') && !exam?.deleted_at;
  const [reassigningPid, setReassigningPid] = useState(null);

  // Give a candidate who finished — passed or failed — a fresh attempt and email
  // them a new link. Earlier attempts stay in the results.
  const handleReassign = async (attempt) => {
    const name = attempt.participant_name || 'this candidate';
    const ok = await confirm(
      `${attempt.passed === true ? `${name} has already passed.` : `Let ${name} take the exam again?`} Reassign emails them a fresh exam link (the old one stops working) and gives them a new attempt. Their earlier results are kept.`,
      { title: 'Reassign exam', confirmLabel: 'Reassign' },
    );
    if (!ok) return;
    setReassigningPid(String(attempt.participant_id));
    try {
      const res = await reassignExamInvites(id, [attempt.participant_id]);
      const { sent = [], skipped = [] } = res.data || {};
      if (sent.length) toast.success(`${name} reassigned — a fresh exam link was emailed.`);
      else toast.error(`Reassign failed (${skipped[0]?.reason || 'unknown'}).`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reassign.');
    } finally {
      setReassigningPid(null);
    }
  };

  const toggleSelected = (attemptId) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(attemptId) ? next.delete(attemptId) : next.add(attemptId);
    return next;
  });

  const handleExport = async (format) => {
    setShowExport(false);
    setExporting(true);
    try {
      const res = await exportExamAttempts(format, { exam_id: id });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exam-results-${(exam?.title || 'exam').replace(/[^\w-]+/g, '_')}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error('Failed to export results.');
    } finally {
      setExporting(false);
    }
  };

  // ── Certificates: the airline uploads its own file per passed candidate, then emails it ──
  const [certBusy, setCertBusy] = useState(null); // `${attemptId}:${action}` while a request runs
  const setAttemptCertificate = (attemptId, certificate) =>
    setAttempts((prev) => prev.map((x) => (x.id === attemptId ? { ...x, certificate } : x)));

  const handleCertUpload = async (a, file) => {
    if (!file) return;
    setCertBusy(`${a.id}:upload`);
    try {
      const res = await uploadAttemptCertificate(a.id, file);
      setAttemptCertificate(a.id, res.data.certificate);
      toast.success('Certificate uploaded.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not upload the certificate.');
    } finally {
      setCertBusy(null);
    }
  };

  const handleCertView = async (a) => {
    try {
      const res = await getAttemptCertificate(a.id);
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('Could not open the certificate.');
    }
  };

  const handleCertSend = async (a) => {
    if (a.certificate?.emailed_at) {
      const ok = await confirm(`Send the certificate to ${a.participant_email} again?`, { title: 'Resend certificate', confirmLabel: 'Send again' });
      if (!ok) return;
    }
    setCertBusy(`${a.id}:send`);
    try {
      const res = await sendAttemptCertificate(a.id);
      setAttemptCertificate(a.id, res.data.certificate);
      toast.success(`Certificate emailed to ${res.data.certificate.emailed_to}.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send the certificate.');
    } finally {
      setCertBusy(null);
    }
  };

  // ── Bulk email: the selected candidates, or (nothing selected) everyone not emailed yet ──
  const [bulkSending, setBulkSending] = useState(null); // { done, total } while running
  const bulkEmailTargets = () => {
    const withCert = attempts.filter((x) => x.certificate && x.participant_email);
    return selectedIds.size > 0
      ? withCert.filter((x) => selectedIds.has(x.id))
      : withCert.filter((x) => !x.certificate.emailed_at);
  };

  const handleBulkEmail = async () => {
    const targets = bulkEmailTargets();
    if (!targets.length) {
      toast.error(selectedIds.size > 0
        ? 'None of the selected candidates has an uploaded certificate and an email address.'
        : 'No uploaded certificates are waiting to be emailed.');
      return;
    }
    const ok = await confirm(
      `Email ${targets.length} certificate${targets.length === 1 ? '' : 's'} to the candidate${targets.length === 1 ? '' : 's'} now?`,
      { title: 'Email certificates', confirmLabel: 'Send' },
    );
    if (!ok) return;
    let sent = 0; const failed = [];
    setBulkSending({ done: 0, total: targets.length });
    for (const t of targets) {
      try {
        const res = await sendAttemptCertificate(t.id);
        setAttemptCertificate(t.id, res.data.certificate);
        sent += 1;
      } catch (err) {
        failed.push(`${t.participant_name || 'Candidate'}: ${err.response?.data?.error || 'failed'}`);
      }
      setBulkSending({ done: sent + failed.length, total: targets.length });
    }
    setBulkSending(null);
    if (sent) toast.success(`${sent} certificate${sent === 1 ? '' : 's'} emailed.`);
    if (failed.length) toast.error(`${failed.length} could not be sent. ${failed[0]}`);
  };

  // ── Bulk upload: pick many files, match each to a passed candidate, upload all ──
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState([]);       // File[]
  const [bulkMap, setBulkMap] = useState({});           // attemptId → index into bulkFiles ('' = none)
  const [bulkUploading, setBulkUploading] = useState(null); // { done, total }
  const passedAttempts = attempts.filter((x) => x.passed === true);

  const normalizeName = (v) => String(v || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const pickBulkFiles = (fileList) => {
    const files = [...fileList];
    setBulkFiles(files);
    // Auto-match: a file belongs to a candidate when its name contains every word of theirs.
    const used = new Set();
    const map = {};
    passedAttempts.forEach((a) => {
      const words = normalizeName(a.participant_name).split(' ').filter(Boolean);
      if (!words.length) return;
      const idx = files.findIndex((f, i) => !used.has(i) && words.every((w) => normalizeName(f.name).split(' ').includes(w)));
      if (idx !== -1) { map[a.id] = idx; used.add(idx); }
    });
    setBulkMap(map);
  };
  const closeBulkUpload = () => { if (!bulkUploading) { setBulkUploadOpen(false); setBulkFiles([]); setBulkMap({}); } };

  const handleBulkUpload = async () => {
    const jobs = passedAttempts.filter((a) => bulkMap[a.id] !== undefined && bulkMap[a.id] !== '');
    if (!jobs.length) { toast.error('Match at least one file to a candidate.'); return; }
    let done = 0; const failed = [];
    setBulkUploading({ done: 0, total: jobs.length });
    for (const a of jobs) {
      try {
        const res = await uploadAttemptCertificate(a.id, bulkFiles[bulkMap[a.id]]);
        setAttemptCertificate(a.id, res.data.certificate);
        done += 1;
      } catch (err) {
        failed.push(`${a.participant_name || 'Candidate'}: ${err.response?.data?.error || 'failed'}`);
      }
      setBulkUploading({ done: done + failed.length, total: jobs.length });
    }
    setBulkUploading(null);
    if (done) toast.success(`${done} certificate${done === 1 ? '' : 's'} uploaded.`);
    if (failed.length) toast.error(`${failed.length} could not be uploaded. ${failed[0]}`);
    if (!failed.length) { setBulkUploadOpen(false); setBulkFiles([]); setBulkMap({}); }
  };

  const handleCertRemove = async (a) => {
    const ok = await confirm(`Remove the certificate uploaded for ${a.participant_name || 'this candidate'}?`, { title: 'Remove certificate', confirmLabel: 'Remove' });
    if (!ok) return;
    setCertBusy(`${a.id}:remove`);
    try {
      await deleteAttemptCertificate(a.id);
      setAttemptCertificate(a.id, null);
      toast.success('Certificate removed.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove the certificate.');
    } finally {
      setCertBusy(null);
    }
  };

  const handleDelete = async (a) => {
    const ok = await confirm(
      `Delete the result for ${a.participant_name || 'this candidate'} (attempt ${a.attempt_number})? This cannot be undone. The candidate's link will work again, and this attempt no longer counts toward their limit.`,
      { title: 'Delete result', confirmLabel: 'Delete' },
    );
    if (!ok) return;
    try {
      await deleteExamAttempt(a.id);
      toast.success('Result deleted.');
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(a.id); return n; });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete result.');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    const ok = await confirm(
      `Delete ${ids.length} selected result${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      { title: 'Delete results', confirmLabel: 'Delete' },
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await bulkDeleteExamAttempts(ids);
      toast.success(`${res.data.deleted} result${res.data.deleted === 1 ? '' : 's'} deleted.`);
      if (res.data.skipped) toast.error(`${res.data.skipped} could not be deleted.`);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete results.');
    } finally {
      setDeleting(false);
    }
  };

  const toggleViolations = (attemptId) => {
    setExpandedViolations((prev) => {
      const next = new Set(prev);
      next.has(attemptId) ? next.delete(attemptId) : next.add(attemptId);
      return next;
    });
  };

  const load = () => {
    Promise.all([getExamSummary(id), listExamAttempts({ exam_id: id })])
      .then(([examRes, attemptsRes]) => {
        setExam(examRes.data);
        setAttempts(attemptsRes.data);
      })
      .catch(() => toast.error('Failed to load results.'))
      .finally(() => setLoading(false));
    // Analytics is a secondary panel — a failure here must not blank the page.
    getExamAnalytics(id)
      .then((res) => setAnalytics(res.data))
      .catch(() => setAnalytics(null));
  };

  useEffect(() => {
    load();
  }, [id]);

  const searchQ = search.trim().toLowerCase();
  const filteredAttempts = attempts.filter((a) => {
    const matchesSearch = !searchQ || (a.participant_name && a.participant_name.toLowerCase().includes(searchQ));
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // One card per candidate, holding every attempt they made (newest first,
  // in the order the list already arrives in).
  const attemptGroups = [];
  {
    const byKey = new Map();
    filteredAttempts.forEach((a) => {
      const key = a.participant_id || a.participant_name || a.id;
      if (!byKey.has(key)) {
        byKey.set(key, { key, attempts: [] });
        attemptGroups.push(byKey.get(key));
      }
      byKey.get(key).attempts.push(a);
    });
  }

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* Sticky header: title & actions · search & filters · list toolbar · column titles */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-3 pb-3 space-y-3">
          {/* Row 1 — back, title, page actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={goBack}
                title="Back"
                className="h-9 w-9 sm:w-auto sm:px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 inline-flex items-center justify-center gap-1.5 flex-shrink-0 transition cursor-pointer"
              >
                <HiOutlineArrowLeft className="w-4 h-4 text-slate-500" />
                <span className="hidden sm:inline">Back</span>
              </button>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-semibold text-slate-900 tracking-tight truncate" title={exam?.title}>
                  {exam?.title || 'Exam'}
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                  {exam?.deleted_at && <span className="font-semibold text-rose-600">Deleted exam · </span>}
                  Results · {attempts.length} attempt{attempts.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {analytics && (
                <button
                  type="button"
                  title="Analytics"
                  onClick={() => {
                    const opening = !showAnalytics;
                    setShowAnalytics(opening);
                    // The panel sits at the top of the page — bring it into view.
                    if (opening) {
                      const scroller = document.querySelector('main');
                      (scroller || window).scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className={`h-9 w-9 sm:w-auto sm:px-3 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    showAnalytics
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {showAnalytics ? <HiOutlineX className="w-4 h-4" /> : <ChartSpline className="w-4 h-4" strokeWidth={1.75} />}
                  <span className="hidden sm:inline">{showAnalytics ? 'Close analytics' : 'Analytics'}</span>
                </button>
              )}
              {attempts.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    title="Export"
                    disabled={exporting}
                    onClick={() => setShowExport((v) => !v)}
                    className="h-9 w-9 sm:w-auto sm:px-3 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer disabled:opacity-60"
                  >
                    <HiOutlineDownload className="w-4 h-4" />
                    <span className="hidden sm:inline">{exporting ? 'Exporting…' : 'Export'}</span>
                  </button>
                  {showExport && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowExport(false)} />
                      <div className="absolute right-0 mt-1.5 w-44 z-40 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden py-1">
                        {[['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV (.csv)'], ['pdf', 'PDF report (.pdf)'], ['xml', 'XML (.xml)']].map(([f, label]) => (
                          <button key={f} type="button" onClick={() => handleExport(f)}
                            className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row 2 — search & status filter */}
          {!showAnalytics && !loading && attempts.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center gap-2.5">
              <div className="relative flex-1 min-w-0">
                <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search candidate by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-10 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto [scrollbar-width:none] flex-shrink-0">
                {[
                  { id: 'all', label: 'All', count: attempts.length },
                  { id: 'pending_review', label: 'Pending review', count: attempts.filter((a) => a.status === 'pending_review').length },
                  { id: 'graded', label: 'Graded', count: attempts.filter((a) => a.status === 'graded' || a.status === 'submitted').length },
                  { id: 'in_progress', label: 'In progress', count: attempts.filter((a) => a.status === 'in_progress').length },
                ].map((tab) => {
                  const active = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 h-7 px-2.5 rounded-lg text-xs transition cursor-pointer whitespace-nowrap ${
                        active ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900 font-medium'
                      }`}
                    >
                      {tab.label}
                      <span className={`text-[10px] font-semibold px-1.5 rounded-md tabular-nums ${active ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Row 3 — list toolbar (selection, counts, bulk actions) */}
        {!showAnalytics && !loading && filteredAttempts.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/80">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex items-center gap-3 min-w-0">
                {canSelect && (
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 cursor-pointer"
                      checked={filteredAttempts.length > 0 && filteredAttempts.every((x) => selectedIds.has(x.id))}
                      onChange={(e) => setSelectedIds(e.target.checked ? new Set(filteredAttempts.map((x) => x.id)) : new Set())}
                    />
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                  </label>
                )}
                <span className="hidden sm:inline h-4 w-px bg-slate-200" />
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  <span className="font-semibold text-slate-700 tabular-nums">{attemptGroups.length}</span> candidate{attemptGroups.length === 1 ? '' : 's'}
                  <span className="text-slate-300 mx-1.5">·</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{filteredAttempts.length}</span> attempt{filteredAttempts.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenGroups(
                    attemptGroups.every((g) => openGroups.has(g.key)) ? new Set() : new Set(attemptGroups.map((g) => g.key))
                  )}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer whitespace-nowrap"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${attemptGroups.every((g) => openGroups.has(g.key)) ? 'rotate-180' : ''}`} strokeWidth={2} />
                  {attemptGroups.every((g) => openGroups.has(g.key)) ? 'Collapse all' : 'Expand all'}
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {canManageCerts && passedAttempts.length > 0 && (
                  <>
                    <button type="button" onClick={() => setBulkUploadOpen(true)} title="Bulk upload certificates"
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer">
                      <Upload className="w-3.5 h-3.5" strokeWidth={2} />
                      <span className="hidden sm:inline">Bulk upload certificates</span>
                      <span className="sm:hidden">Upload</span>
                    </button>
                    <button type="button" onClick={handleBulkEmail} disabled={!!bulkSending}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer disabled:opacity-60">
                      <Mail className="w-3.5 h-3.5" strokeWidth={2} />
                      {bulkSending
                        ? `Sending ${bulkSending.done}/${bulkSending.total}…`
                        : selectedIds.size > 0
                          ? `Email selected (${bulkEmailTargets().length})`
                          : `Email pending (${bulkEmailTargets().length})`}
                    </button>
                  </>
                )}
                {canDeleteResults && selectedIds.size > 0 && (
                  <button type="button" onClick={handleBulkDelete} disabled={deleting}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer disabled:opacity-60">
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                    {deleting ? 'Deleting…' : `Delete (${selectedIds.size})`}
                  </button>
                )}
              </div>
            </div>

            {/* Column titles (desktop) — widths match the card cells below */}
            <div className="hidden md:block border-t border-slate-100">
              <div className="w-full px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-4 px-5 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <span className={`flex-1 ${canSelect ? 'pl-[5.5rem]' : 'pl-[3.625rem]'}`}>Candidate</span>
                  <div className="flex items-center gap-3">
                    <span className="w-[5.5rem]">Score</span>
                    <span className="w-[5.5rem]">Attempts</span>
                    <span className="w-[7.5rem]">Status</span>
                    <span className="w-[6.5rem] text-right">Flags</span>
                    <span className="w-[12rem] text-right">Actions</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4 flex-1">

        {/* Analytics Panel */}
        {showAnalytics && analytics && (
          <AnalyticsPanel
            analytics={analytics}
            examTitle={exam?.title}
            passMark={exam?.pass_percentage ?? null}
            inProgress={attempts.filter((a) => a.status === 'in_progress').length}
          />
        )}

        {/* Attempts Card List */}
        {showAnalytics ? null : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : filteredAttempts.length === 0 ? (
          <Card className="p-12 text-center text-sm font-medium text-slate-400 rounded-2xl border border-slate-200/80">
            {attempts.length === 0 ? 'No candidates have attempted this exam yet.' : 'No attempt matches your search filter.'}
          </Card>
        ) : (
          <div className="space-y-3">
            {/* Cards — the page itself scrolls; no inner scrollbar */}
            <div className="space-y-2.5">
            {attemptGroups.map((g) => {
              const first = g.attempts[0];
              const groupIds = g.attempts.map((x) => x.id);
              const groupSelected = groupIds.every((id) => selectedIds.has(id));
              const groupPartial = !groupSelected && groupIds.some((id) => selectedIds.has(id));
              const initials = first.participant_name
                ? first.participant_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : 'CA';
              const scored = g.attempts.filter((x) => x.percentage != null);
              const best = scored.length ? Math.max(...scored.map((x) => Number(x.percentage))) : null;
              const everPassed = g.attempts.some((x) => x.passed === true);
              const fmtPct = (v) => (Number.isInteger(v) ? v : Number(v.toFixed(1)));
              const isOpen = openGroups.has(g.key);
              const latestStatus = ATTEMPT_STATUS[first.status] || ATTEMPT_STATUS.submitted;
              const flagged = g.attempts.reduce((n, x) => n + (x.violation_count || 0), 0);

              return (
                <div
                  key={g.key}
                  className={`rounded-2xl bg-white border overflow-hidden transition-all duration-200 ${
                    groupSelected || groupPartial
                      ? 'border-indigo-300 ring-2 ring-indigo-100'
                      : 'border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)] hover:border-slate-300'
                  }`}
                >
                  {/* Candidate header — its cells sit in the same columns as the attempt rows */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(g.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(g.key); } }}
                    className={`flex flex-col md:flex-row md:items-center gap-3 md:gap-4 px-4 sm:px-5 py-3.5 cursor-pointer select-none transition-colors hover:bg-slate-50 ${isOpen ? 'bg-slate-50/60 border-b border-slate-100' : ''}`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {canSelect && (
                        <input
                          type="checkbox"
                          title="Select all attempts by this candidate"
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-slate-300 cursor-pointer flex-shrink-0"
                          checked={groupSelected}
                          ref={(el) => { if (el) el.indeterminate = groupPartial; }}
                          onChange={() => setSelectedIds((prev) => {
                            const next = new Set(prev);
                            groupIds.forEach((id) => (groupSelected ? next.delete(id) : next.add(id)));
                            return next;
                          })}
                        />
                      )}
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center font-semibold text-xs tracking-wide flex-shrink-0 shadow-[0_4px_10px_-4px_rgba(15,23,42,0.5)]">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            disabled={!first.participant_id}
                            onClick={(e) => { e.stopPropagation(); navigate(`/${isAdmin ? 'admin' : 'airline'}/participants/${first.participant_id}/performance`); }}
                            title={first.participant_id ? 'Open candidate dashboard' : undefined}
                            className="text-[15px] font-semibold text-slate-900 truncate text-left enabled:hover:text-indigo-600 enabled:cursor-pointer disabled:cursor-default transition-colors"
                          >
                            {first.participant_name || 'Anonymous Candidate'}
                          </button>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md flex-shrink-0 tabular-nums">
                            <ListChecks className="w-3 h-3" strokeWidth={2} />
                            {g.attempts.length} attempt{g.attempts.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Latest {new Date(first.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>

                    {/* Summary cells: best score · latest status · total flags · toggle */}
                    <div className="flex items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap flex-shrink-0">
                      <div className="md:w-[5.5rem]">
                        {best != null ? (
                          <span
                            title="Best score across attempts"
                            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold tabular-nums ring-1 ring-inset ${
                              everPassed ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-white text-slate-700 ring-slate-200'
                            }`}
                          >
                            <Trophy className="w-3.5 h-3.5" strokeWidth={2} />
                            {fmtPct(best)}%
                          </span>
                        ) : (
                          <span className="hidden md:inline text-sm text-slate-300">—</span>
                        )}
                      </div>
                      <div className="md:w-[5.5rem]">
                        {(() => {
                          // Every attempt counts toward Max attempts; a reassign can add extra.
                          if (exam?.max_attempts == null) return <span className="hidden md:inline text-sm text-slate-300">—</span>;
                          const allowed = exam.max_attempts + (exam.extra_attempts?.[String(first.participant_id)] || 0);
                          const used = g.attempts.length;
                          const none = used >= allowed && !g.attempts.some((x) => x.status === 'in_progress');
                          return (
                            <span
                              title={none ? 'All attempts used — Reassign to give a new attempt' : `${allowed - used} attempt${allowed - used === 1 ? '' : 's'} left`}
                              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold tabular-nums ring-1 ring-inset ${none ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : 'bg-white text-slate-700 ring-slate-200'}`}
                            >
                              <ListChecks className="w-3.5 h-3.5" strokeWidth={2} />
                              {used}/{allowed}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="md:w-[7.5rem]">
                        <span title="Latest attempt" className={`inline-flex items-center h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${latestStatus.cls}`}>
                          {latestStatus.label}
                        </span>
                      </div>
                      <div className="flex items-center md:w-[6.5rem] md:justify-end">
                        {flagged > 0 && (
                          <span title="Security violations across all attempts" className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 tabular-nums">
                            <ShieldAlert className="w-3.5 h-3.5" strokeWidth={2} />{flagged}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-2 ml-auto md:ml-0 md:w-[12rem]">
                        {canReassign && first.participant_id && first.participant_email && first.status !== 'in_progress' && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleReassign(first); }}
                            disabled={reassigningPid === String(first.participant_id)}
                            title={everPassed ? 'Passed — email a fresh link so they can take the exam again' : 'Email a fresh link and give a new attempt'}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 transition cursor-pointer"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${reassigningPid === String(first.participant_id) ? 'animate-spin' : ''}`} strokeWidth={2} />
                            Reassign
                          </button>
                        )}
                        <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 bg-white">
                          {isOpen ? 'Hide' : 'View'} attempts
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Attempts — shown when the card is open */}
                  <AnimatePresence initial={false}>
                  {isOpen && (
                  <motion.div
                    key="attempts"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden divide-y divide-slate-100"
                  >
                  {g.attempts.map((a, ai) => {
              const isPending = a.status === 'pending_review';
              const isInProgress = a.status === 'in_progress';
              const hasViolations = a.violation_count > 0;
              const isViolationExpanded = expandedViolations.has(a.id);
              const status = ATTEMPT_STATUS[a.status] || ATTEMPT_STATUS.submitted;
              const pct = a.percentage != null
                ? (Number.isInteger(Number(a.percentage)) ? Number(a.percentage) : Number(Number(a.percentage).toFixed(1)))
                : null;
              const selected = selectedIds.has(a.id);

              return (
                <div key={a.id} className={`transition-colors ${selected ? 'bg-indigo-50/40' : 'hover:bg-slate-50/50'}`}>
                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 px-4 sm:px-5 py-3">
                    {/* Attempt identity */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {canSelect && (
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 cursor-pointer flex-shrink-0"
                          checked={selected}
                          onChange={() => toggleSelected(a.id)}
                        />
                      )}
                      <div className="w-11 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold tabular-nums flex-shrink-0">
                        #{a.attempt_number}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">Attempt {a.attempt_number}</span>
                          {ai === 0 && g.attempts.length > 1 && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Latest</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                            {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          {a.submitted_at && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
                              Completed at {new Date(a.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Chips & actions */}
                    <div className="flex items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap flex-shrink-0">
                      <div className="md:w-[5.5rem]">
                      {pct != null ? (
                        <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold tabular-nums ring-1 ring-inset ${
                          a.passed ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-rose-50 text-rose-700 ring-rose-600/20'
                        }`}>
                          {a.passed
                            ? <CircleCheck className="w-3.5 h-3.5" strokeWidth={2} />
                            : <CircleX className="w-3.5 h-3.5" strokeWidth={2} />}
                          {pct}%
                        </span>
                      ) : (
                        <span className="hidden md:inline text-sm text-slate-300">—</span>
                      )}
                      </div>

                      <div className="md:w-[7.5rem]">
                        <span className={`inline-flex items-center h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${status.cls}`}>
                          {status.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 md:w-[6.5rem] md:justify-end">

                      {/* Times the candidate closed the exam window and came back */}
                      {a.window_close_count > 0 && (
                        <span
                          title={`Closed the exam window and came back ${a.window_close_count} time${a.window_close_count === 1 ? '' : 's'}${a.auto_submit_reason === 'window_closed' ? ' · auto-submitted' : ''}: ${(a.window_closes || []).map((w) => new Date(w.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })).join(', ')}`}
                          className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold ring-1 ring-inset ${
                            a.auto_submit_reason === 'window_closed' ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20'
                          }`}
                        >
                          <MonitorX className="w-3.5 h-3.5" strokeWidth={2} />
                          {a.window_close_count}
                        </span>
                      )}
                      {hasViolations && (
                        <button
                          type="button"
                          onClick={() => toggleViolations(a.id)}
                          title="View security violations"
                          className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold ring-1 ring-inset transition-colors cursor-pointer ${
                            isViolationExpanded ? 'bg-rose-600 text-white ring-rose-600' : 'bg-rose-50 text-rose-700 ring-rose-600/20 hover:bg-rose-100'
                          }`}
                        >
                          <ShieldAlert className="w-3.5 h-3.5" strokeWidth={2} />
                          {a.violation_count}
                          {isViolationExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      </div>

                      <div className="flex items-center justify-end gap-2 ml-auto md:ml-0 md:w-[12rem]">
                      {canGrade && !isInProgress && (
                        <button
                          type="button"
                          onClick={() => setGradingId(a.id)}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer active:scale-[0.98] ${
                            isPending
                              ? 'bg-slate-900 hover:bg-slate-800 text-white'
                              : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:ring-slate-300'
                          }`}
                        >
                          <PenLine className="w-3.5 h-3.5" strokeWidth={2} />
                          {isPending ? 'Grade' : 'Edit grade'}
                        </button>
                      )}
                      {canDeleteResults && (
                        <button
                          type="button"
                          onClick={() => handleDelete(a)}
                          title="Delete this result"
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg ring-1 ring-inset ring-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:ring-rose-200 hover:bg-rose-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                        </button>
                      )}
                      </div>
                    </div>
                  </div>

                  {/* Certificate bar — passed candidates only */}
                  {canManageCerts && a.passed === true && (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-2.5 border-t border-slate-100 bg-slate-50/60">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${a.certificate ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-slate-200 text-slate-400'}`}>
                          <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </div>
                        {a.certificate ? (
                          <div className="min-w-0">
                            <button type="button" onClick={() => handleCertView(a)}
                              className="block max-w-full truncate text-xs font-medium text-slate-800 hover:text-indigo-600 hover:underline cursor-pointer text-left"
                              title="Open the uploaded certificate">
                              {a.certificate.original_name || 'Certificate'}
                            </button>
                            <p className="text-[11px] text-slate-500 truncate">
                              {a.certificate.emailed_at
                                ? `Emailed to ${a.certificate.emailed_to} on ${new Date(a.certificate.emailed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                : 'Uploaded, not emailed yet'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No certificate uploaded</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {a.certificate && (
                          <button type="button" onClick={() => handleCertSend(a)}
                            disabled={!a.participant_email || certBusy === `${a.id}:send`}
                            title={a.participant_email ? `Email to ${a.participant_email}` : 'This candidate has no email address on file'}
                            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                            <Mail className="w-3.5 h-3.5" strokeWidth={1.75} />
                            {certBusy === `${a.id}:send` ? 'Sending…' : a.certificate.emailed_at ? 'Resend' : 'Email'}
                          </button>
                        )}
                        <label className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer ${certBusy === `${a.id}:upload` ? 'opacity-60 pointer-events-none' : ''}`}>
                          <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                          {certBusy === `${a.id}:upload` ? 'Uploading…' : a.certificate ? 'Replace' : 'Upload certificate'}
                          <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleCertUpload(a, f); }} />
                        </label>
                        {a.certificate && (
                          <button type="button" onClick={() => handleCertRemove(a)} disabled={certBusy === `${a.id}:remove`}
                            title="Remove the uploaded certificate"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Violation log — expands under the row */}
                  <AnimatePresence initial={false}>
                  {isViolationExpanded && hasViolations && (() => {
                    const list = a.violations || [];
                    const counts = list.reduce((m, v) => ({ ...m, [v.type]: (m[v.type] || 0) + 1 }), {});
                    const first = list.length ? new Date(list[0].at).getTime() : 0;
                    return (
                      <motion.div
                        key="violations"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                      <div className="mx-4 sm:mx-5 mb-4 rounded-xl bg-slate-50 border border-slate-200/70 p-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-rose-100 text-rose-600 flex items-center justify-center">
                              <ShieldAlert className="w-3.5 h-3.5" strokeWidth={2} />
                            </span>
                            <span className="text-xs font-semibold text-slate-800">Security log</span>
                            <span className="text-xs text-slate-400">· {list.length || a.violation_count} events</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {Object.entries(counts).map(([type, n]) => {
                              const tone = VIOLATION_TONES[type] || VIOLATION_TONES.default;
                              return (
                                <span key={type} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${tone.chip}`}>
                                  {VIOLATION_LABELS[type] || type}
                                  <span className="tabular-nums opacity-70">×{n}</span>
                                </span>
                              );
                            })}
                            {a.auto_submitted && (
                              <span className="text-[11px] font-medium text-white bg-rose-600 px-2 py-0.5 rounded-md">Auto-submitted</span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-200/70 divide-y divide-slate-100">
                          {list.map((v, vi) => {
                            const V = VIOLATION_ICONS[v.type] || ShieldAlert;
                            const tone = VIOLATION_TONES[v.type] || VIOLATION_TONES.default;
                            const at = new Date(v.at);
                            const offsetMin = Math.round((at.getTime() - first) / 60000);
                            return (
                              <div key={vi} className="flex items-center gap-3 px-3 py-2">
                                <span className="text-[11px] text-slate-400 tabular-nums w-5 text-right">{vi + 1}</span>
                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${tone.icon}`}>
                                  <V className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </span>
                                <span className="text-xs font-medium text-slate-800 flex-1">{VIOLATION_LABELS[v.type] || v.type}</span>
                                {vi > 0 && (
                                  <span className="hidden sm:inline text-[11px] text-slate-400 tabular-nums">+{offsetMin} min</span>
                                )}
                                <span className="text-xs text-slate-600 tabular-nums w-[7.5rem] text-right">
                                  {at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className="hidden sm:inline text-xs text-slate-400 tabular-nums w-14 text-right">
                                  {at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      </motion.div>
                    );
                  })()}
                  </AnimatePresence>
                </div>
              );
                  })}
                  </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {ConfirmDialog}

        {/* Bulk certificate upload: choose many files, match each to a passed candidate */}
        {bulkUploadOpen && (
          <Dialog open onOpenChange={(open) => !open && closeBulkUpload()}>
            <DialogContent className="max-w-2xl w-full max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
              <div className="px-6 pt-5 pb-4 border-b border-slate-100">
                <DialogTitle className="text-base font-semibold text-slate-900">Bulk upload certificates</DialogTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Choose all the certificate files at once. A file is matched to a candidate when its name contains the candidate's name
                  (for example "john-smith.pdf"). Check the matches below and fix any that are wrong.
                </p>
              </div>

              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-2xs cursor-pointer">
                  <HiOutlineUpload className="w-3.5 h-3.5" />
                  {bulkFiles.length ? 'Choose different files' : 'Choose files'}
                  <input type="file" multiple accept="application/pdf,image/png,image/jpeg" className="hidden"
                    onChange={(e) => { pickBulkFiles(e.target.files || []); e.target.value = ''; }} />
                </label>
                <span className="text-xs text-slate-500">
                  {bulkFiles.length
                    ? `${bulkFiles.length} file${bulkFiles.length === 1 ? '' : 's'} chosen, ${Object.values(bulkMap).filter((v) => v !== '' && v !== undefined).length} matched`
                    : 'PDF, PNG or JPG, up to 10 MB each'}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {passedAttempts.map((a) => (
                  <div key={a.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_260px] items-center gap-2 sm:gap-4 px-6 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{a.participant_name || 'Candidate'} <span className="text-xs font-medium text-slate-400">· Attempt #{a.attempt_number}</span></p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {a.certificate ? `Already has: ${a.certificate.original_name} (will be replaced)` : 'No certificate yet'}
                      </p>
                    </div>
                    <select
                      value={bulkMap[a.id] ?? ''}
                      disabled={!bulkFiles.length || !!bulkUploading}
                      onChange={(e) => setBulkMap((prev) => ({ ...prev, [a.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                      className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">No file</option>
                      {bulkFiles.map((f, i) => <option key={i} value={i}>{f.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={closeBulkUpload} disabled={!!bulkUploading} className="rounded-xl px-4 text-xs font-semibold">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleBulkUpload}
                  disabled={!!bulkUploading || !Object.values(bulkMap).some((v) => v !== '' && v !== undefined)}
                  className="rounded-xl px-5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs">
                  {bulkUploading
                    ? `Uploading ${bulkUploading.done}/${bulkUploading.total}…`
                    : `Upload ${Object.values(bulkMap).filter((v) => v !== '' && v !== undefined).length} certificate(s)`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {gradingId && (
          <GradeModal
            attemptId={gradingId}
            onClose={() => setGradingId(null)}
            onGraded={() => {
              setGradingId(null);
              load();
            }}
          />
        )}
      </div>
    </div>
  );
}

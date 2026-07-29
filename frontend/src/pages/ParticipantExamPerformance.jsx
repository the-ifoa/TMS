import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineAcademicCap,
  HiOutlineTrendingUp,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineExclamationCircle,
  HiOutlineChartBar,
  HiOutlineChartPie,
  HiOutlineOfficeBuilding,
  HiOutlineCalendar,
  HiOutlineX,
  HiOutlineBadgeCheck,
} from 'react-icons/hi';
import { getParticipantExamPerformance, getExamAttemptResult } from '../api';
import { Skeleton } from '@/components/ui/skeleton';

const BLUE_HERO = '#3b41e3';
const GOOD = '#10b981';
const WARNING = '#f59e0b';
const CRITICAL = '#f43f5e';
const NEUTRAL = '#94a3b8';

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtShortDate(v) {
  if (!v) return '';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
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

function getGradeLetter(avgPct) {
  if (avgPct == null) return { letter: 'N/A', label: 'No Data', color: NEUTRAL };
  if (avgPct >= 90) return { letter: 'A+', label: 'Outstanding Performance', color: '#10b981' };
  if (avgPct >= 80) return { letter: 'A', label: 'Very Good Performance', color: '#3b82f6' };
  if (avgPct >= 70) return { letter: 'B', label: 'Good - Meets Expectations', color: '#6366f1' };
  if (avgPct >= 60) return { letter: 'C', label: 'Satisfactory - Needs Review', color: '#f59e0b' };
  return { letter: 'F', label: 'Needs Immediate Attention', color: '#f43f5e' };
}

// ─── Graph 1: Performance Line Chart (Left Graph) ─────────────────────────────
function PerformanceLineChart({ attempts, onSelectAttempt }) {
  const scored = attempts.filter(a => a.percentage != null);

  if (!scored.length) {
    return (
      <div className="py-16 text-center text-xs text-slate-400 font-medium">
        No graded exam attempts recorded yet.
      </div>
    );
  }

  const W = 500;
  const H = 220;
  const padL = 40;
  const padR = 30;
  const padT = 30;
  const padB = 40;
  
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const x = i => padL + (scored.length === 1 ? plotW / 2 : (i / (scored.length - 1)) * plotW);
  const y = v => padT + plotH - (v / 100) * plotH;

  const points = scored.map((a, i) => ({
    x: x(i),
    y: y(a.percentage),
    val: a.percentage,
    dateStr: fmtShortDate(a.submitted_at),
    attempt: a,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${x(scored.length - 1)} ${padT + plotH} L ${x(0)} ${padT + plotH} Z`;

  return (
    <div className="w-full relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible block">
        <defs>
          <linearGradient id="perfOverviewGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid lines */}
        {[0, 25, 50, 75, 100].map(g => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="#f1f5f9" strokeWidth="1.5" />
            <text x={padL - 8} y={y(g)} textAnchor="end" dominantBaseline="middle" fontSize="10" fontWeight="600" fill="#94a3b8">
              {g}
            </text>
          </g>
        ))}

        {/* Blue Gradient Area */}
        <path d={areaPath} fill="url(#perfOverviewGrad)" />

        {/* Solid Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data Points */}
        {points.map((p, i) => (
          <g
            key={i}
            className="cursor-pointer group"
            onClick={() => onSelectAttempt && onSelectAttempt(p.attempt.id)}
          >
            <circle cx={p.x} cy={p.y} r="6" fill="white" stroke="#3b82f6" strokeWidth="2.5" />
            <circle cx={p.x} cy={p.y} r="2.5" fill="#3b82f6" />

            <text x={p.x} y={H - 12} textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748b">
              {p.dateStr}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Graph 2: Score Distribution Donut Chart (Right Graph) ────────────────────
function ScoreDistributionDonut({ attempts }) {
  const scored = attempts.filter(a => a.percentage != null);

  const brackets = [
    { label: '90 – 100%', min: 90, max: 100, color: '#10b981', count: 0 },
    { label: '80 – 89%',  min: 80, max: 89.9, color: '#3b82f6', count: 0 },
    { label: '70 – 79%',  min: 70, max: 79.9, color: '#f59e0b', count: 0 },
    { label: 'Below 70%', min: 0,  max: 69.9, color: '#f43f5e', count: 0 },
  ];

  scored.forEach(a => {
    const val = a.percentage;
    if (val >= 90) brackets[0].count++;
    else if (val >= 80) brackets[1].count++;
    else if (val >= 70) brackets[2].count++;
    else brackets[3].count++;
  });

  const total = scored.length;

  // Calculate SVG Donut Slices
  let cumulativeAngle = 0;
  const radius = 64;
  const strokeWidth = 18;
  const cx = 80;
  const cy = 80;
  const circumference = 2 * Math.PI * radius;

  const slices = brackets.map(b => {
    const pct = total > 0 ? (b.count / total) * 100 : 0;
    const strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((cumulativeAngle / 100) * circumference);
    cumulativeAngle += pct;
    return { ...b, pct: Math.round(pct), strokeDasharray, strokeDashoffset };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 py-2">
      {/* SVG Donut Ring */}
      <div className="relative flex-shrink-0 w-40 h-40 flex items-center justify-center">
        <svg width="160" height="160" viewBox="0 0 160 160" className="transform -rotate-90">
          <circle cx={cx} cy={cy} r={radius} stroke="#f1f5f9" strokeWidth={strokeWidth} fill="transparent" />
          {total > 0 && slices.map((s, i) => (
            s.count > 0 && (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={radius}
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={s.strokeDasharray}
                strokeDashoffset={s.strokeDashoffset}
                fill="transparent"
                className="transition-all duration-700 ease-out"
              />
            )
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-black text-slate-900 leading-none">{total}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Exams</span>
        </div>
      </div>

      {/* Sleek Legend List */}
      <div className="flex-1 space-y-2.5 w-full">
        {brackets.map((b, i) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                <span className="font-bold text-slate-700">{b.label}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500 font-semibold text-[11px]">
                <span>{b.count}</span>
                <span className="text-slate-400">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bottom Banner: Overall Grade Evaluation ──────────────────────────────────
function OverallGradeBanner({ overall }) {
  const avg = overall.avg_percentage;
  const grade = getGradeLetter(avg);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/70 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-5">
        {/* Large Grade Circle */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black shadow-inner flex-shrink-0"
          style={{ color: grade.color, backgroundColor: `${grade.color}15`, border: `2px solid ${grade.color}30` }}
        >
          {grade.letter}
        </div>

        <div className="space-y-0.5">
          <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Overall Grade</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{avg != null ? `${avg}%` : '—'}</span>
            <span className="text-xs font-bold" style={{ color: grade.color }}>
              {grade.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Based on {overall.total_exams_taken} total exam attempt(s) recorded.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2.5 rounded-xl border border-indigo-100/80">
        <HiOutlineBadgeCheck className="w-5 h-5 text-indigo-600 flex-shrink-0" />
        <span className="text-xs font-bold text-indigo-900">
          Pass Rate: {overall.total_exams_taken > 0 ? Math.round((overall.passed_count / overall.total_exams_taken) * 100) : 0}%
        </span>
      </div>
    </div>
  );
}

// ─── Interactive Calendar Widget ───────────────────────────────────────────────
function CalendarWidget({ attempts, selectedDateKey, onSelectDate }) {
  const latestAttemptDate = attempts[0]?.submitted_at ? new Date(attempts[0].submitted_at) : new Date();
  const [viewDate, setViewDate] = useState(
    isNaN(latestAttemptDate.getTime()) ? new Date() : new Date(latestAttemptDate.getFullYear(), latestAttemptDate.getMonth(), 1)
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const attemptDatesMap = useMemo(() => {
    const map = {};
    attempts.forEach(a => {
      const key = toISOKey(a.submitted_at);
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(a);
      }
    });
    return map;
  }, [attempts]);

  const gridCells = [];
  for (let i = 0; i < firstDayIndex; i++) gridCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) gridCells.push(d);

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        >
          <HiOutlineChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
          {monthName}
        </h3>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        >
          <HiOutlineChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400">
        {daysOfWeek.map((d, i) => <div key={i} className="py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-semibold gap-y-1">
        {gridCells.map((d, i) => {
          if (!d) return <div key={i} />;

          const monthStr = String(month + 1).padStart(2, '0');
          const dayStr = String(d).padStart(2, '0');
          const dateKey = `${year}-${monthStr}-${dayStr}`;

          const isSelected = selectedDateKey === dateKey;
          const dayAttempts = attemptDatesMap[dateKey] || [];
          const hasAttempts = dayAttempts.length > 0;
          const hasPassed = dayAttempts.some(a => a.passed === true);
          const hasFailed = dayAttempts.some(a => a.passed === false);

          return (
            <div key={i} className="flex flex-col items-center justify-center py-0.5">
              <button
                type="button"
                onClick={() => onSelectDate(isSelected ? null : dateKey)}
                className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-all ${
                  isSelected
                    ? 'bg-[#3b41e3] text-white font-bold shadow-xs'
                    : hasAttempts
                    ? 'bg-indigo-50 text-[#3b41e3] font-bold hover:bg-indigo-100'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {d}
              </button>
              {hasAttempts && !isSelected && (
                <span
                  className="w-1.5 h-1.5 rounded-full mt-0.5"
                  style={{ background: hasPassed ? GOOD : hasFailed ? CRITICAL : BLUE_HERO }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Single Attempt Detail Inspection View ────────────────────────────────────
function computeAttemptBreakdown(full) {
  const bySection = {};
  const byType = {};
  (full.answers || []).forEach((ans) => {
    if (ans.needs_manual_grading || ans.is_correct == null) return;
    const q = (full.questions_snapshot || []).find((qq) => String(qq._id) === String(ans.question_id));
    const sectionName = q ? (q.section || '') : '';

    if (!bySection[sectionName]) bySection[sectionName] = { section: sectionName, total: 0, correct: 0 };
    bySection[sectionName].total += 1;
    if (ans.is_correct) bySection[sectionName].correct += 1;

    if (!byType[ans.type]) byType[ans.type] = { type: ans.type, total: 0, correct: 0 };
    byType[ans.type].total += 1;
    if (ans.is_correct) byType[ans.type].correct += 1;
  });
  const withAccuracy = (obj) => Object.values(obj)
    .map((s) => ({ ...s, accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 10000) / 100 : null }))
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));
  return { section_breakdown: withAccuracy(bySection), type_breakdown: withAccuracy(byType) };
}

function SingleAttemptDetail({ attemptId, onBack }) {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFull(null);
    setLoading(true);
    getExamAttemptResult(attemptId)
      .then((res) => setFull(res.data))
      .catch(() => toast.error('Failed to load attempt details.'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (!full) return null;

  const clr = statusColor(full.passed);

  return (
    <div className="space-y-6">
      <div className="bg-[#3b41e3] rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md">
        <div className="space-y-2 text-center sm:text-left">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-100 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-xl transition"
          >
            <HiOutlineArrowLeft className="w-3.5 h-3.5" /> Back to Performance Overview
          </button>
          <h2 className="text-2xl font-black tracking-tight mt-1">{full.exam_title_snapshot || 'Exam'}</h2>
          <div className="flex items-center justify-center sm:justify-start gap-4 text-xs text-indigo-100 font-medium">
            <span>Attempt #{full.attempt_number}</span>
            <span>·</span>
            <span>{fmtDate(full.submitted_at)}</span>
          </div>
        </div>

        <div className="flex-shrink-0 text-center bg-white/15 px-6 py-3.5 rounded-2xl backdrop-blur-xs border border-white/20">
          <p className="text-3xl font-black">{full.percentage != null ? `${full.percentage}%` : '—'}</p>
          <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-white/20">
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: clr }} />
            {fmtStatus(full)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Participant Performance View ──────────────────────────────────────────
export default function ParticipantExamPerformance() {
  const { participantId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);

  useEffect(() => {
    getParticipantExamPerformance(participantId)
      .then(res => setData(res.data))
      .catch(err => toast.error(err.response?.data?.error || 'Failed to load report.'))
      .finally(() => setLoading(false));
  }, [participantId]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 col-span-2 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center">
        <p className="text-sm font-semibold text-slate-500">Could not load candidate information.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 px-4 py-2 bg-[#3b41e3] text-white text-xs font-bold rounded-xl"
        >
          Back to List
        </button>
      </div>
    );
  }

  const { participant, overall, attempts, section_breakdown } = data;
  const weakest = section_breakdown.filter(s => s.total > 0)[0];

  const filteredAttempts = selectedDateKey
    ? attempts.filter(a => toISOKey(a.submitted_at) === selectedDateKey)
    : attempts;

  const selectedDateFormatted = selectedDateKey ? fmtDate(selectedDateKey) : null;

  return (
    <div className="min-h-screen bg-[#f4f5f9] text-slate-800 pb-16">
      
      {/* Top Navbar Header */}
      <header className="bg-white border-b border-slate-200/80 px-6 py-3.5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="h-8 px-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition"
            >
              <HiOutlineArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <h1 className="text-sm font-black text-slate-900 tracking-tight leading-tight">
                Exam Performance Report
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">Administrator View</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700">
              <HiOutlineOfficeBuilding className="w-4 h-4 text-indigo-500" />
              <span>{participant.company || 'Airline / Organization'}</span>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-slate-900 text-white font-bold text-[11px] flex items-center justify-center">
                AD
              </div>
              <span className="text-xs font-bold text-slate-700 hidden sm:inline">Admin Manager</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="max-w-7xl mx-auto px-6 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Main Column (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">

            {selectedAttemptId ? (
              <SingleAttemptDetail
                attemptId={selectedAttemptId}
                onBack={() => setSelectedAttemptId(null)}
              />
            ) : (
            <>
            {/* Streamlined Executive Profile Banner */}
            <div className="bg-[#3b41e3] rounded-3xl p-6 text-white shadow-md flex items-center justify-between gap-6">
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white uppercase tracking-wider">
                  Participant Overview
                </span>
                <h2 className="text-2xl font-black tracking-tight text-white mt-1">{participant.name}</h2>
                <p className="text-xs text-indigo-100 font-medium">
                  {participant.company || 'Airline'} · {overall.total_exams_taken} Total Exam Attempt(s)
                </p>
              </div>

              <div className="flex items-center gap-3">
                <img
                  src="/hero-impozitions.png"
                  alt="Candidate Dashboard"
                  className="h-20 w-auto object-contain rounded-xl border border-white/20 bg-white/10 p-1"
                />
              </div>
            </div>

            {/* ─── TWO GRAPHS SIDE BY SIDE ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Graph: Performance Overview */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/70 shadow-xs space-y-4 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Performance Overview</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Score progression curve over time</p>
                  </div>
                  <span className="text-[10px] font-bold text-[#3b41e3] bg-indigo-50 px-2.5 py-1 rounded-xl">
                    Score (%)
                  </span>
                </div>
                <PerformanceLineChart attempts={attempts} onSelectAttempt={setSelectedAttemptId} />
              </div>

              {/* Right Graph: Score Distribution Donut */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/70 shadow-xs space-y-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Score Distribution</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Attempt percentage brackets</p>
                </div>
                <ScoreDistributionDonut attempts={attempts} />
              </div>
            </div>

            {/* Bottom Overall Grade Evaluation Banner */}
            <OverallGradeBanner overall={overall} />
            </>
            )}

            {/* Complete Attempt Log Table */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/70 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    {selectedDateKey ? `Attempts on ${selectedDateFormatted}` : 'Complete Attempt Log'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">Click any row to inspect attempt</p>
                </div>

                {selectedDateKey && (
                  <button
                    onClick={() => setSelectedDateKey(null)}
                    className="text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-xl flex items-center gap-1 transition"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" /> Clear Filter ({attempts.length})
                  </button>
                )}
              </div>

              {filteredAttempts.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  {selectedDateKey ? `No exam attempts recorded on ${selectedDateFormatted}.` : 'No exam attempts recorded.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <th className="pb-3 pr-4">Exam Title</th>
                        <th className="pb-3 pr-4">Attempt #</th>
                        <th className="pb-3 pr-4">Submitted Date</th>
                        <th className="pb-3 pr-4">Score</th>
                        <th className="pb-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAttempts.map(a => {
                        const clr = statusColor(a.passed);
                        const isSelected = selectedAttemptId === a.id;
                        return (
                          <tr
                            key={a.id}
                            onClick={() => setSelectedAttemptId(isSelected ? null : a.id)}
                            className={`cursor-pointer transition ${isSelected ? 'bg-indigo-50/80 font-bold' : 'hover:bg-slate-50/80'}`}
                          >
                            <td className="py-3.5 pr-4 font-bold text-slate-900 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                              {a.exam_title || 'Exam'}
                            </td>
                            <td className="py-3.5 pr-4 text-slate-500 font-medium">
                              #{a.attempt_number}
                            </td>
                            <td className="py-3.5 pr-4 text-slate-500 font-medium">
                              {fmtDate(a.submitted_at)}
                            </td>
                            <td className="py-3.5 pr-4 font-black text-slate-900">
                              {a.percentage != null ? `${a.percentage}%` : '—'}
                            </td>
                            <td className="py-3.5">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <span className="w-2 h-2 rounded-full" style={{ background: clr }} />
                                {fmtStatus(a)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Right Sidebar Column */}
          <div className="lg:sticky lg:top-20 space-y-6">

            {weakest && weakest.accuracy != null && weakest.accuracy < 60 && (
              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-2xs">
                <HiOutlineExclamationCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-amber-900">Recommended Focus Area</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Weakest performance in <strong>{weakest.section || 'Ungrouped'}</strong> ({weakest.accuracy}% accuracy).
                  </p>
                </div>
              </div>
            )}

            {/* Interactive Calendar Date Filter */}
            <CalendarWidget
              attempts={attempts}
              selectedDateKey={selectedDateKey}
              onSelectDate={setSelectedDateKey}
            />

            {/* Date Filter Status Box */}
            {selectedDateKey && (
              <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900">Filtered Date</span>
                  <button
                    onClick={() => setSelectedDateKey(null)}
                    className="text-[10px] font-bold text-indigo-600 hover:underline"
                  >
                    Clear Filter
                  </button>
                </div>
                <p className="text-xs text-indigo-700">
                  Showing <strong>{filteredAttempts.length} attempt(s)</strong> submitted on {selectedDateFormatted}.
                </p>
              </div>
            )}

          </div>

        </div>
      </main>
    </div>
  );
}

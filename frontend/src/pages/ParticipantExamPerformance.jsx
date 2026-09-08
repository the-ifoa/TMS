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
  HiOutlineCalendar,
  HiOutlineX,
  HiOutlineBadgeCheck,
} from 'react-icons/hi';
import { FaPlaneDeparture } from 'react-icons/fa';
import { getParticipantExamPerformance, getExamAttemptResult } from '../api';
import { useAuth } from '../context/AuthContext';
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

  const W = 600;
  const H = 340;
  const padL = 60;
  const padR = 25;
  const padT = 12;
  const padB = 38;
  
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
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid lines */}
        {[0, 25, 50, 75, 100].map(g => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth="1.5" />
            {/* Y-Axis Label: Large High Contrast Dark Slate */}
            <text x={padL - 10} y={y(g)} textAnchor="end" dominantBaseline="middle" fontSize="13" fontWeight="900" fill="#020617">
              {g}%
            </text>
          </g>
        ))}

        {/* Indigo Gradient Area */}
        <path d={areaPath} fill="url(#perfOverviewGrad)" />

        {/* Solid Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#4f46e5"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data Points & Score Badges */}
        {points.map((p, i) => (
          <g
            key={i}
            className="cursor-pointer group"
            onClick={() => onSelectAttempt && onSelectAttempt(p.attempt.id)}
          >
            {/* Large Score Label Above Point */}
            <text
              x={p.x}
              y={p.y - 14}
              textAnchor="middle"
              fontSize="13"
              fontWeight="900"
              fill="#4f46e5"
            >
              {p.val != null ? `${p.val}%` : ''}
            </text>

            <circle cx={p.x} cy={p.y} r="8" fill="white" stroke="#4f46e5" strokeWidth="3.5" className="transition-transform group-hover:scale-125" />
            <circle cx={p.x} cy={p.y} r="3" fill="#4f46e5" />

            {/* X-Axis Date Label: Large High Contrast Dark Slate */}
            <text x={p.x} y={H - 8} textAnchor="middle" fontSize="13" fontWeight="900" fill="#020617">
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

      {/* Sleek Dot-Free Legend List */}
      <div className="flex-1 space-y-2.5 w-full">
        {brackets.map((b, i) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return (
            <div key={i} className="flex items-center justify-between text-xs border-l-2 pl-2.5" style={{ borderColor: b.color }}>
              <span className="font-extrabold text-slate-800">{b.label}</span>
              <div className="flex items-center gap-2 text-slate-500 font-semibold text-[11px]">
                <span className="font-black text-slate-900">{b.count}</span>
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

// ─── Dot-Free Interactive Calendar Widget ──────────────────────────────────────
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
    <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        >
          <HiOutlineChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
          {monthName}
        </h3>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        >
          <HiOutlineChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">
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

          return (
            <div key={i} className="flex flex-col items-center justify-center py-0.5">
              <button
                type="button"
                onClick={() => onSelectDate(isSelected ? null : dateKey)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-all ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-extrabold shadow-2xs'
                    : hasAttempts
                    ? 'bg-indigo-50 text-indigo-700 font-black border border-indigo-200/80 hover:bg-indigo-100'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {d}
              </button>
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
      <div className="bg-slate-900 rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md border border-slate-800">
        <div className="space-y-2 text-center sm:text-left">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-xl transition"
          >
            <HiOutlineArrowLeft className="w-3.5 h-3.5" /> Back to Performance Overview
          </button>
          <h2 className="text-2xl font-black tracking-tight mt-1">{full.exam_title_snapshot || 'Exam'}</h2>
          <div className="flex items-center justify-center sm:justify-start gap-4 text-xs text-slate-300 font-medium">
            <span>Attempt #{full.attempt_number}</span>
            <span>·</span>
            <span>{fmtDate(full.submitted_at)}</span>
          </div>
        </div>

        <div className="flex-shrink-0 text-center bg-white/10 px-6 py-3.5 rounded-2xl backdrop-blur-xs border border-white/15">
          <p className="text-3xl font-black">{full.percentage != null ? `${full.percentage}%` : '—'}</p>
          <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-white/15 uppercase">
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
  const { isAdmin } = useAuth();
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
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-72 col-span-2 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
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
          className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-xs"
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
  const avgPct = overall.avg_percentage;
  const grade = getGradeLetter(avgPct);
  const passRate = overall.total_exams_taken > 0 ? Math.round((overall.passed_count / overall.total_exams_taken) * 100) : 0;

  // Condition Status Determination for Airline Administrative View (Dot-Free)
  const getCandidateCondition = () => {
    if (overall.total_exams_taken === 0) {
      return { label: 'Awaiting Assessment', bg: 'bg-slate-100 text-slate-700 border-slate-200', desc: 'Candidate has not submitted any exam attempts yet.' };
    }
    if (passRate >= 80 && (avgPct == null || avgPct >= 80)) {
      return { label: 'High Proficiency', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', desc: 'Candidate consistently meets and exceeds operational standards.' };
    }
    if (passRate >= 50 || (avgPct != null && avgPct >= 60)) {
      return { label: 'Progressing — Moderate Risk', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30', desc: 'Candidate meets minimum threshold but requires targeted review.' };
    }
    return { label: 'Requires Immediate Attention', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40', desc: 'Candidate is failing multiple assessments. Supplementary training required.' };
  };

  const condition = getCandidateCondition();
  const initials = (participant.name || 'C A').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 pb-20">
      
      {/* Executive Top Navbar Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-all shadow-2xs"
            >
              <HiOutlineArrowLeft className="w-4 h-4 text-slate-500" />
              <span>Back</span>
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <h1 className="text-sm font-black text-slate-900 tracking-tight leading-tight">
                Candidate Performance Analytics
              </h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Operational Assessment Report</p>
            </div>
          </div>

          {isAdmin && participant.company && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-indigo-50/80 border border-indigo-100/80 px-3.5 py-1.5 rounded-xl text-xs font-extrabold text-indigo-900">
                <FaPlaneDeparture className="w-4 h-4 text-indigo-600" />
                <span>{participant.company}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Layout Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        
        {/* ── 1. EXECUTIVE DARK HERO BANNER ── */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-slate-800 relative overflow-hidden space-y-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            
            {/* Candidate Identity Details */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md flex-shrink-0">
                {initials}
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-2xl font-black text-white tracking-tight leading-none">
                    {participant.name}
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${condition.bg}`}>
                    {condition.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  {isAdmin && participant.company ? `${participant.company} · ` : ''}
                  <span className="text-slate-300">Total Attempts: <strong>{overall.total_exams_taken} Exams</strong></span>
                </p>
              </div>
            </div>

            {/* Quick Overview Grade Badge */}
            <div className="flex items-center gap-3.5 bg-slate-800/80 backdrop-blur-md px-4 py-3 rounded-2xl border border-slate-700/80 flex-shrink-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl font-black shadow-inner flex-shrink-0"
                style={{ color: grade.color, backgroundColor: `${grade.color}20`, border: `1px solid ${grade.color}40` }}
              >
                {grade.letter}
              </div>
              <div className="text-left space-y-0.5">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Average Grade</span>
                <div className="text-lg font-black text-white leading-none">{avgPct != null ? `${avgPct}%` : '—'}</div>
              </div>
            </div>

          </div>

          {/* KPI Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-slate-800 text-xs">
            <div className="bg-slate-800/50 border border-slate-800 p-3 rounded-2xl space-y-0.5">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Total Attempts</span>
              <div className="text-xl font-black text-white">{overall.total_exams_taken}</div>
              <p className="text-[10px] text-slate-400">Recorded assessments</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-800 p-3 rounded-2xl space-y-0.5">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Passed Exams</span>
              <div className="text-xl font-black text-emerald-400">{overall.passed_count || 0}</div>
              <p className="text-[10px] text-slate-400">Out of {overall.total_exams_taken}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-800 p-3 rounded-2xl space-y-0.5">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Pass Rate</span>
              <div className="text-xl font-black text-indigo-300">{passRate}%</div>
              <p className="text-[10px] text-slate-400">Overall success ratio</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-800 p-3 rounded-2xl space-y-0.5">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Latest Activity</span>
              <div className="text-xl font-black text-white">{attempts[0] ? fmtShortDate(attempts[0].submitted_at) : '—'}</div>
              <p className="text-[10px] text-slate-400">Most recent submission</p>
            </div>
          </div>
        </div>

        {/* ── 2. TWO-COLUMN MAIN ANALYTICAL DASHBOARD ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* MAIN COLUMN (Left lg:col-span-8) */}
          <div className="lg:col-span-8 space-y-6">

            {selectedAttemptId ? (
              <SingleAttemptDetail
                attemptId={selectedAttemptId}
                onBack={() => setSelectedAttemptId(null)}
              />
            ) : (
            <>
            {/* TWO CHARTS SIDE BY SIDE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Left Chart: Score Progression */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Score Progression</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Trajectory curve across attempts</p>
                  </div>
                  <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-xl">
                    Score (%)
                  </span>
                </div>
                <PerformanceLineChart attempts={attempts} onSelectAttempt={setSelectedAttemptId} />
              </div>

              {/* Right Chart: Score Distribution Donut */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs space-y-4 flex flex-col justify-between">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Score Brackets</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Distribution across performance tiers</p>
                </div>
                <ScoreDistributionDonut attempts={attempts} />
              </div>

            </div>

            {/* Per-Section Performance (across all graded attempts) */}
            {(() => {
              const rows = (section_breakdown || [])
                .filter((s) => (s.section || '').trim() && s.total > 0)
                .map((s) => ({ ...s, pct: s.accuracy == null ? 0 : Math.round(s.accuracy) }))
                .sort((a, b) => a.pct - b.pct);
              if (rows.length === 0) return null;
              const tier = (p) => p >= 80
                ? { bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' }
                : p >= 60
                ? { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-500' }
                : { bg: 'bg-rose-100', text: 'text-rose-700', bar: 'bg-rose-500' };
              const strong = rows[rows.length - 1];
              const weak = rows[0];
              return (
                <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Accuracy Breakdown by Section</h3>
                      <p className="text-[11px] text-slate-400 font-medium">Aggregated across every graded attempt</p>
                    </div>
                    {rows.length > 1 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-xl">
                          Strongest: {strong.section} ({strong.pct}%)
                        </span>
                        {weak.pct < 50 && (
                          <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 border border-rose-200/80 px-2.5 py-1 rounded-xl">
                            Focus: {weak.section} ({weak.pct}%)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {rows.map((s) => {
                      const c = tier(s.pct);
                      return (
                        <div key={s.section} className="space-y-2 bg-slate-50/70 border border-slate-200/70 p-3.5 rounded-2xl">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-extrabold text-slate-800 truncate">{s.section}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-[10px] font-bold text-slate-400">{s.correct}/{s.total}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${c.bg} ${c.text}`}>{s.pct}%</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200/80 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ease-out ${c.bar}`} style={{ width: `${s.pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Complete Attempt Log Table */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    {selectedDateKey ? `Attempts on ${selectedDateFormatted}` : 'Complete Attempt History'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Click any row to inspect full attempt report</p>
                </div>

                {selectedDateKey && (
                  <button
                    onClick={() => setSelectedDateKey(null)}
                    className="text-xs font-extrabold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" /> Clear Filter ({attempts.length})
                  </button>
                )}
              </div>

              {filteredAttempts.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center font-medium">
                  {selectedDateKey ? `No exam attempts recorded on ${selectedDateFormatted}.` : 'No exam attempts recorded.'}
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto overflow-x-auto pr-1">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 pr-4 bg-white">Exam Title</th>
                        <th className="py-2.5 pr-4 bg-white">Attempt #</th>
                        <th className="py-2.5 pr-4 bg-white">Submitted Date</th>
                        <th className="py-2.5 pr-4 bg-white">Score</th>
                        <th className="py-2.5 bg-white">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAttempts.map(a => {
                        const isSelected = selectedAttemptId === a.id;
                        return (
                          <tr
                            key={a.id}
                            onClick={() => setSelectedAttemptId(isSelected ? null : a.id)}
                            className={`cursor-pointer transition-all ${isSelected ? 'bg-indigo-50/80 font-bold' : 'hover:bg-slate-50/80'}`}
                          >
                            <td className="py-3.5 pr-4 font-extrabold text-slate-900">
                              {a.exam_title || 'Exam'}
                            </td>
                            <td className="py-3.5 pr-4">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px]">
                                #{a.attempt_number}
                              </span>
                            </td>
                            <td className="py-3.5 pr-4 text-slate-600 font-semibold">
                              {fmtDate(a.submitted_at)}
                            </td>
                            <td className="py-3.5 pr-4 font-black text-slate-900 text-sm">
                              {a.percentage != null ? `${a.percentage}%` : '—'}
                            </td>
                            <td className="py-3.5">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                a.passed === true
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                  : a.passed === false
                                  ? 'bg-rose-50 text-rose-700 border-rose-200/80'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
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
            </>
            )}

          </div>

          {/* SECONDARY SIDEBAR COLUMN (Right lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">

            {/* Airline Administrative Assessment Verdict Card */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100/80">
                    <HiOutlineAcademicCap className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black uppercase text-slate-900 tracking-wider">Airline Assessment Verdict</span>
                </div>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Candidate Condition</span>
                  <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/90 space-y-1">
                    <span className="font-black text-slate-900 block">{condition.label}</span>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{condition.desc}</p>
                  </div>
                </div>

                {weakest && weakest.accuracy != null && weakest.accuracy < 60 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider block">Weakest Assessment Area</span>
                    <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/80 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-rose-900">{weakest.section || 'Ungrouped'}</span>
                        <span className="bg-rose-100 text-rose-800 border border-rose-200/80 px-2 py-0.5 rounded-md font-black text-[10px]">{weakest.accuracy}% Accuracy</span>
                      </div>
                      <p className="text-[11px] text-rose-700 leading-relaxed font-medium">
                        Candidate requires focused retraining in <strong className="text-rose-900">{weakest.section || 'this topic'}</strong> prior to re-assessment.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive Calendar Date Filter Widget */}
            <CalendarWidget
              attempts={attempts}
              selectedDateKey={selectedDateKey}
              onSelectDate={setSelectedDateKey}
            />

            {/* Date Filter Active Banner */}
            {selectedDateKey && (
              <div className="bg-indigo-50/90 border border-indigo-100 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-indigo-900">Date Filter Active</span>
                  <button
                    onClick={() => setSelectedDateKey(null)}
                    className="text-[10px] font-extrabold text-indigo-600 hover:underline"
                  >
                    Clear Filter
                  </button>
                </div>
                <p className="text-xs text-indigo-800 font-medium">
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

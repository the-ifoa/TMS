import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlinePrinter,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineAcademicCap,
  HiOutlineClipboardList,
  HiOutlineCalendar,
  HiOutlineExclamationCircle,
  HiOutlineInformationCircle,
  HiOutlineDownload,
  HiOutlineTrendingUp,
  HiOutlineTrendingDown,
  HiOutlineChartBar,
  HiOutlineTag,
} from 'react-icons/hi';
import { getExamAttemptResult } from '../api';
import logoImg from '../assets/logo.png';

function correctAnswerText(q) {
  switch (q.type) {
    case 'mcq':
    case 'true_false':
    case 'select_list':
      return (q.options || []).filter((o) => o.is_correct).map((o) => o.text).join(', ') || '—';
    case 'multi_response':
      return (q.options || []).filter((o) => o.is_correct).map((o) => o.text).join(', ') || '—';
    case 'numeric':
      return q.numeric_answer != null ? String(q.numeric_answer) : '—';
    case 'sequence':
      return (q.sequence_items || []).map((s) => s.text).join(' → ');
    case 'matching':
      return (q.matching_pairs || []).map((p) => `${p.left} ↔ ${p.right}`).join('; ');
    case 'fill_blank':
      return (q.blanks_answers || []).map((a) => (a || [])[0]).join(', ');
    case 'drag_words':
      return (q.drag_words_answers || []).join(', ');
    case 'drag_drop':
      return (q.dragdrop_items || [])
        .map((i) => {
          const targetName =
            q.dragdrop_targets?.[i.correct_target_index]?.label ||
            `Zone ${(i.correct_target_index ?? 0) + 1}`;
          return `${i.label} → ${targetName}`;
        })
        .join('; ');
    default:
      return null;
  }
}

const TYPE_LABELS = {
  mcq: 'Multiple Choice', multi_response: 'Multi-Select', true_false: 'True / False',
  short_answer: 'Short Answer', numeric: 'Numeric', sequence: 'Sequencing',
  matching: 'Matching', fill_blank: 'Fill in the Blank', select_list: 'Select List',
  drag_words: 'Drag Words', hotspot: 'Hotspot', drag_drop: 'Drag & Drop', essay: 'Essay',
};

function accuracyStatusColor(pct) {
  if (pct >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' };
  if (pct >= 50) return { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' };
  return { bar: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' };
}

function responseText(q, response) {
  if (response == null || response === '') return null;

  if (['mcq', 'true_false', 'select_list'].includes(q.type)) {
    return (q.options || []).find((o) => String(o._id) === String(response))?.text || String(response);
  }

  if (q.type === 'multi_response') {
    const ids = Array.isArray(response) ? response.map(String) : [];
    const matched = (q.options || []).filter((o) => ids.includes(String(o._id))).map((o) => o.text);
    return matched.length > 0 ? matched.join(', ') : null;
  }

  if (q.type === 'drag_drop') {
    if (Array.isArray(response)) {
      const items = response.map((item) => {
        if (typeof item === 'object' && item !== null) {
          const label = item.item_label || item.label || '';
          const targetIdx = item.target_Index ?? item.target_index;
          const target =
            item.target_label ||
            q.dragdrop_targets?.[targetIdx]?.label ||
            `Zone ${targetIdx !== undefined ? targetIdx + 1 : ''}`;
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
        .join('; ') || null;
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

export default function ExamResultView() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'correct' | 'incorrect'

  useEffect(() => {
    getExamAttemptResult(attemptId)
      .then((res) => setAttempt(res.data))
      .catch(() => toast.error('Failed to load result.'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-slate-400">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
        <span className="text-sm font-semibold">Loading analytics dashboard…</span>
      </div>
    );
  }

  if (!attempt) return null;

  const questionById = Object.fromEntries(
    (attempt.questions_snapshot || []).map((q) => [String(q._id), q])
  );

  const isPending = attempt.status === 'pending_review';

  // Stats calculations
  const totalQuestions = attempt.answers?.length || 0;
  const correctCount = attempt.answers?.filter((a) => a.is_correct === true).length || 0;
  const incorrectCount = attempt.answers?.filter((a) => a.is_correct === false).length || 0;
  const pendingCount = Math.max(0, totalQuestions - (correctCount + incorrectCount));
  const scoredCount = correctCount + incorrectCount;
  const accuracyPct = scoredCount > 0 ? Math.round((correctCount / scoredCount) * 1000) / 10 : 0;

  // Question Type breakdown
  const typeStats = {};
  (attempt.answers || []).forEach((a) => {
    if (a.is_correct == null) return;
    const q = questionById[String(a.question_id)];
    if (!q) return;
    const bucket = typeStats[q.type] || { correct: 0, total: 0 };
    bucket.total += 1;
    if (a.is_correct) bucket.correct += 1;
    typeStats[q.type] = bucket;
  });
  const typeBreakdown = Object.entries(typeStats)
    .map(([type, s]) => ({
      type,
      label: TYPE_LABELS[type] || type,
      correct: s.correct,
      total: s.total,
      pct: Math.round((s.correct / s.total) * 100),
    }))
    .sort((a, b) => a.pct - b.pct);

  const weakestType = typeBreakdown[0];
  const strongestType = typeBreakdown[typeBreakdown.length - 1];

  // Time calculations
  let totalSeconds = null;
  if (attempt.time_taken_seconds != null) {
    totalSeconds = Math.max(0, attempt.time_taken_seconds);
  } else if (attempt.started_at && (attempt.submitted_at || attempt.updated_at)) {
    const start = new Date(attempt.started_at).getTime();
    const end = new Date(attempt.submitted_at || attempt.updated_at).getTime();
    totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  }
  const fmtDuration = (sec) => `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const durationStr = totalSeconds != null ? fmtDuration(totalSeconds) : '—';
  const avgTimeStr = totalSeconds != null && totalQuestions > 0
    ? fmtDuration(Math.round(totalSeconds / totalQuestions))
    : '—';

  // Dates
  const compDate = new Date(attempt.submitted_at || attempt.updated_at || Date.now());
  const dateFormatted = compDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeFormatted = compDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Gauge setup
  const circleRadius = 70;
  const circumference = 2 * Math.PI * circleRadius;
  const percentage = Math.min(100, Math.max(0, attempt.percentage || 0));
  const strokeOffset = circumference - (percentage / 100) * circumference;

  // Filtered answers list
  const filteredAnswers = (attempt.answers || []).filter((a) => {
    if (filter === 'incorrect') return a.is_correct === false;
    if (filter === 'correct') return a.is_correct === true;
    return true;
  });

  return (
    <div className="w-full min-h-screen pb-20 p-4 sm:p-6 lg:p-8 bg-slate-50/60">
      <div className="w-full max-w-6xl mx-auto space-y-6">

        {/* ── Top Bar Action Header ── */}
        <div className="print:hidden flex items-center justify-between">
          <button
            onClick={() => navigate('/airline/exams')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all border border-slate-200/90 shadow-2xs"
          >
            <HiOutlineArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Back to Dashboard</span>
          </button>
        </div>

        {/* ── Print-only Header ── */}
        <div className="hidden print:flex items-center justify-between border-b border-slate-300 pb-4 mb-2">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="IFOA" className="h-9 w-auto" />
            <div className="leading-tight">
              <div className="text-sm font-black text-slate-900">IFOA Avinfinity</div>
              <div className="text-[10px] font-semibold text-slate-500">Training Management System</div>
            </div>
          </div>
          <div className="text-right text-[10px] font-semibold text-slate-500">
            <div>Official Performance Dashboard Report</div>
            <div>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>

        {/* ── TWO-COLUMN HERO & KPI SECTION (Matching Reference Layout) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          
          {/* LEFT COLUMN: Hero Banner + KPI Row (lg:col-span-8) */}
          <div className="lg:col-span-8 flex flex-col justify-between gap-4">
            
            {/* Hero Card */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl relative overflow-hidden flex-1 flex flex-col justify-center">
              <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-extrabold uppercase tracking-widest text-indigo-300">
                  <HiOutlineChartBar className="w-3.5 h-3.5" /> Assessment Result Analytics
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                  {attempt.exam_title_snapshot || 'Performance Dashboard'}
                </h1>

                <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <HiOutlineCalendar className="w-4 h-4 text-indigo-400" />
                    <span>{dateFormatted} at {timeFormatted}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <HiOutlineClock className="w-4 h-4 text-indigo-400" />
                    <span>Time Taken: {durationStr}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <HiOutlineClipboardList className="w-4 h-4 text-indigo-400" />
                    <span>{totalQuestions} Total Questions</span>
                  </div>
                </div>
              </div>
            </div>

            {/* KPI Metrics Row (4 Unique Metrics) */}
            {!isPending && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 w-full">
                {/* Metric 1: Accuracy */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-1 hover:border-indigo-200 hover:shadow-xs transition-all min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">Accuracy Rate</span>
                    <div className="p-1.5 rounded-xl bg-indigo-50/80 border border-indigo-100/80 text-indigo-600 flex-shrink-0">
                      <HiOutlineChartBar className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">{accuracyPct}%</div>
                  <p className="text-[11px] font-semibold text-slate-500 truncate">{correctCount} of {scoredCount} Questions</p>
                </div>

                {/* Metric 2: Correct Answers */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-1 hover:border-emerald-200 hover:shadow-xs transition-all min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">Correct</span>
                    <div className="p-1.5 rounded-xl bg-emerald-50/80 border border-emerald-100/80 text-emerald-600 flex-shrink-0">
                      <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-emerald-600 tracking-tight">{correctCount}</div>
                  <p className="text-[11px] font-semibold text-slate-500 truncate">Out of {totalQuestions} Items</p>
                </div>

                {/* Metric 3: Incorrect Answers */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-1 hover:border-rose-200 hover:shadow-xs transition-all min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">Incorrect</span>
                    <div className="p-1.5 rounded-xl bg-rose-50/80 border border-rose-100/80 text-rose-600 flex-shrink-0">
                      <HiOutlineXCircle className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-rose-600 tracking-tight">{incorrectCount}</div>
                  <p className="text-[11px] font-semibold text-slate-500 truncate">Requires Review</p>
                </div>

                {/* Metric 4: Pace / Avg Time */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-1 hover:border-purple-200 hover:shadow-xs transition-all min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">Avg Pace</span>
                    <div className="p-1.5 rounded-xl bg-purple-50/80 border border-purple-100/80 text-purple-600 flex-shrink-0">
                      <HiOutlineClock className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">{avgTimeStr}</div>
                  <p className="text-[11px] font-semibold text-slate-500 truncate">Time / Question</p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Standalone Score Donut Card (lg:col-span-4) */}
          <div className="lg:col-span-4 h-full">
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-900/40 flex flex-col items-center justify-center text-center h-full space-y-4 relative overflow-hidden min-h-[260px]">
              <div className="absolute inset-0 bg-indigo-500/5 pointer-events-none" />

              {!isPending ? (
                <div className="relative z-10 flex flex-col items-center space-y-3 w-full">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                    Assessment Performance
                  </span>

                  {/* SVG Donut Gauge */}
                  <div className="relative w-32 h-32 flex items-center justify-center my-1">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="50"
                        stroke="rgba(255, 255, 255, 0.12)"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="50"
                        stroke={attempt.passed ? '#10b981' : '#f43f5e'}
                        strokeWidth="8"
                        strokeDasharray={2 * Math.PI * 50}
                        strokeDashoffset={2 * Math.PI * 50 - (percentage / 100) * (2 * Math.PI * 50)}
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-2xl font-black text-white leading-none">{attempt.percentage}%</span>
                      <span className="text-[9px] font-extrabold uppercase text-slate-300 mt-1">SCORE</span>
                    </div>
                  </div>

                  {/* Verdict Info */}
                  <div className="space-y-1 flex flex-col items-center">
                    <span className={`inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                      attempt.passed
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}>
                      {attempt.passed ? <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" /> : <HiOutlineX className="w-3.5 h-3.5 stroke-[3]" />}
                      {attempt.passed ? 'PASSED' : 'NOT PASSED'}
                    </span>
                    <p className="text-[11px] text-slate-300 font-semibold">
                      {attempt.score != null && attempt.max_score != null
                        ? `${attempt.score} of ${attempt.max_score} Total Points`
                        : `${correctCount} of ${totalQuestions} Correct`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 bg-amber-500/20 border border-amber-500/40 rounded-2xl text-amber-200 text-xs font-bold flex items-center gap-2">
                  <HiOutlineClock className="w-5 h-5 text-amber-400 animate-pulse" />
                  <span>Pending Review</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── TWO-COLUMN ANALYTICAL HUB ── */}
        {!isPending && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* MAIN ANALYTICS COLUMN (Left lg:col-span-8) */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Question Type Accuracy Breakdown */}
              <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                      Accuracy Breakdown by Question Type
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">Performance categorized by item format</p>
                  </div>

                  {/* Highlights Bar */}
                  {typeBreakdown.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-xl">
                        Strongest: {strongestType.label} ({strongestType.pct}%)
                      </span>
                      {weakestType && weakestType.pct < 50 && (
                        <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 border border-rose-200/80 px-2.5 py-1 rounded-xl">
                          Focus: {weakestType.label} ({weakestType.pct}%)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 max-h-[340px] overflow-y-auto pr-1">
                  {typeBreakdown.map((t) => {
                    const c = accuracyStatusColor(t.pct);
                    return (
                      <div key={t.type} className="space-y-1.5 bg-slate-50/70 border border-slate-200/70 p-3 rounded-xl hover:border-slate-300 transition-all">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-extrabold text-slate-800 truncate">{t.label}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-bold text-slate-400">{t.correct}/{t.total}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${c.bg} ${c.text}`}>
                              {t.pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${c.bar}`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* SECONDARY STICKY SIDEBAR (Right lg:col-span-4) */}
            <div className="lg:col-span-4 space-y-4 sticky top-6">
              
              {/* Clean Non-Redundant Attempt Overview & Recommendation Card */}
              <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">
                  Attempt Overview
                </h3>

                <div className="space-y-2.5 divide-y divide-slate-100 text-xs">
                  <div className="flex items-center justify-between pt-1 first:pt-0">
                    <span className="font-semibold text-slate-500">Submitted On</span>
                    <span className="font-bold text-slate-800">{dateFormatted}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2.5">
                    <span className="font-semibold text-slate-500">Total Duration</span>
                    <span className="font-bold text-slate-800">{durationStr}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2.5">
                    <span className="font-semibold text-slate-500">Total Questions</span>
                    <span className="font-bold text-slate-800">{totalQuestions} items</span>
                  </div>
                </div>

                {/* Recommendation Callout Integrated */}
                <div className="pt-2">
                  <div className="bg-gradient-to-br from-indigo-50 to-blue-50/60 rounded-2xl border border-indigo-100 p-4 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-indigo-700 font-extrabold text-xs">
                      <HiOutlineAcademicCap className="w-4 h-4" /> Administrative Recommendation
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {attempt.passed
                        ? 'Candidate has demonstrated required proficiency across all tested material.'
                        : 'Candidate requires attention. Review weaker areas and consider scheduling a retake or supplementary training.'}
                    </p>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ── ANSWER REVIEW DETAILED SECTION ── */}
        {!isPending && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
            
            {/* Sticky Header & Filter Tabs */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-20 px-6 sm:px-8 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Answer Review</h2>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">Detailed responses and explanations per question</p>
              </div>

              {/* Filter Tabs Toggle */}
              <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200/80 self-start sm:self-auto">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                    filter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  All ({totalQuestions})
                </button>
                <button
                  onClick={() => setFilter('incorrect')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                    filter === 'incorrect'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-rose-600'
                  }`}
                >
                  Incorrect ({incorrectCount})
                </button>
                <button
                  onClick={() => setFilter('correct')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                    filter === 'correct'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-emerald-600'
                  }`}
                >
                  Correct ({correctCount})
                </button>
              </div>
            </div>

            {/* Scrollable Questions Review List with Fixed Max Height */}
            <div className="p-6 sm:p-8 max-h-[580px] overflow-y-auto space-y-4 divide-y-0">
              {filteredAnswers.map((a, idx) => {
                const q = questionById[String(a.question_id)];
                if (!q) return null;
                const correctStr = correctAnswerText(q);
                const userStr = responseText(q, a.response);
                const isCorrect = a.is_correct;
                const isUnanswered = userStr == null;

                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isCorrect === true
                        ? 'bg-white border-slate-200/90 hover:border-emerald-300'
                        : isCorrect === false
                        ? 'bg-white border-slate-200/90 hover:border-rose-300'
                        : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <div className="p-5 space-y-3.5">
                      {/* Question Item Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Index Badge */}
                          <span className={`w-7 h-7 rounded-xl font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isCorrect === true
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : isCorrect === false
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {idx + 1}
                          </span>

                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                {TYPE_LABELS[q.type] || q.type}
                              </span>
                              {q.section && (
                                <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                  {q.section}
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-slate-400">
                                {q.points || 1} pt{(q.points || 1) !== 1 ? 's' : ''}
                              </span>
                            </div>

                            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug pt-0.5">
                              {q.prompt}
                            </h3>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex-shrink-0">
                          {isCorrect != null && (
                            isCorrect ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" /> Correct
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200/80">
                                <HiOutlineX className="w-3.5 h-3.5 stroke-[3]" /> Incorrect
                              </span>
                            )
                          )}
                        </div>
                      </div>

                      {/* Response Comparison Box */}
                      <div className="ml-10 bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/70 space-y-2 text-xs">
                        {/* Submitted Answer */}
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-extrabold text-slate-400 uppercase text-[10px] min-w-[110px]">Candidate Answer:</span>
                          {isUnanswered ? (
                            <span className="text-rose-600 italic font-semibold">(No answer submitted)</span>
                          ) : (
                            <span className={`font-bold ${isCorrect ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {userStr}
                            </span>
                          )}
                        </div>

                        {/* Correct Answer */}
                        {isCorrect === false && correctStr && (
                          <div className="flex flex-wrap items-baseline gap-2 pt-1 border-t border-slate-200/50">
                            <span className="font-extrabold text-slate-400 uppercase text-[10px] min-w-[110px]">Correct Answer:</span>
                            <span className="font-bold text-slate-800">{correctStr}</span>
                          </div>
                        )}
                      </div>

                      {/* Rationale / Explanation */}
                      {q.explanation && isCorrect === false && (
                        <div className="ml-10 p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 text-amber-950 text-xs flex items-start gap-2.5">
                          <HiOutlineInformationCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-amber-950 block mb-0.5">Explanation / Rationale:</span>
                            <span className="text-amber-900/90 leading-relaxed font-medium">{q.explanation}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredAnswers.length === 0 && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-8 text-center text-slate-400 text-xs font-semibold">
                  No questions match the selected filter tab.
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── Bottom Callout Banner ── */}
        <div className="print:hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center flex-shrink-0 border border-white/15">
              <HiOutlineAcademicCap className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                {attempt.passed ? 'Candidate Assessment Complete' : 'Candidate Needs Attention'}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 max-w-md leading-relaxed">
                {attempt.passed
                  ? 'Candidate has successfully met all passing proficiency requirements for this assessment.'
                  : 'Candidate did not meet passing requirements. Review performance metrics and assign targeted remediation or re-examination as needed.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/airline/exams')}
            className="w-full sm:w-auto px-6 py-2.5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl text-xs font-black transition-all shadow-sm whitespace-nowrap"
          >
            Back to Exam System
          </button>
        </div>

      </div>
    </div>
  );
}

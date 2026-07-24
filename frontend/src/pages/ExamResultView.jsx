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
  HiOutlineUser,
  HiOutlineClipboardList,
  HiOutlineCalendar,
  HiOutlineDocumentText,
  HiOutlineExclamationCircle,
  HiOutlineSparkles,
  HiOutlineInformationCircle,
  HiOutlineDownload,
  HiOutlineRefresh,
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

// Value-based status color (not an identity palette — every bar measures the
// same metric, accuracy, so color encodes magnitude via a fixed threshold).
function accuracyStatusColor(pct) {
  if (pct >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (pct >= 50) return { bar: 'bg-amber-500', text: 'text-amber-700' };
  return { bar: 'bg-rose-500', text: 'text-rose-700' };
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
  const [filter, setFilter] = useState('all'); // 'all' | 'incorrect'

  useEffect(() => {
    getExamAttemptResult(attemptId)
      .then((res) => setAttempt(res.data))
      .catch(() => toast.error('Failed to load result.'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2.5 text-slate-400">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading report card…</span>
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
  const accuracyPct = scoredCount > 0 ? Math.round((correctCount / scoredCount) * 1000) / 10 : null;

  // Accuracy broken down by question type — computed purely from this
  // attempt's own answers, no cross-candidate data involved.
  const typeStats = {};
  (attempt.answers || []).forEach((a) => {
    if (a.is_correct == null) return; // unscored (likert) or still pending manual grading
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
    .sort((a, b) => a.pct - b.pct); // weakest first
  const weakestType = typeBreakdown[0];
  const strongestType = typeBreakdown[typeBreakdown.length - 1];

  // Duration — prefer the server-computed value (set once, at actual submit
  // time); fall back to a manual diff for older attempts that predate it.
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

  // Date formatted
  const compDate = new Date(attempt.submitted_at || attempt.updated_at || Date.now());
  const dateFormatted = compDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeFormatted = compDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Circular gauge offset
  const circleRadius = 76;
  const circumference = 2 * Math.PI * circleRadius;
  const percentage = Math.min(100, Math.max(0, attempt.percentage || 0));
  const strokeOffset = circumference - (percentage / 100) * circumference;

  // Filtered answers
  const filteredAnswers = (attempt.answers || []).filter((a) => {
    if (filter === 'incorrect') return a.is_correct === false;
    return true;
  });

  return (
    <div className="w-full min-h-full pb-20 p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="w-full max-w-4xl mx-auto space-y-6">

        {/* ── Top Bar Action Row (hidden on print) ── */}
        <div className="print:hidden flex items-center justify-between">
          <button
            onClick={() => navigate('/airline/exams')}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all"
          >
            <HiOutlineArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Back to Dashboard</span>
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all border border-slate-200/80 shadow-2xs"
          >
            <HiOutlineDownload className="w-4 h-4 text-slate-500" />
            <span>Download Report</span>
          </button>
        </div>

        {/* ── Print-only Letterhead ── */}
        <div className="hidden print:flex items-center justify-between border-b border-slate-300 pb-4 mb-2">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="IFOA" className="h-9 w-auto" />
            <div className="leading-tight">
              <div className="text-sm font-black text-slate-900">IFOA Avinfinity</div>
              <div className="text-[10px] font-semibold text-slate-500">Training Management System</div>
            </div>
          </div>
          <div className="text-right text-[10px] font-semibold text-slate-500">
            <div>Exam Report Card</div>
            <div>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>

        {/* ── Main Report Header Card (Matching Image 1) ── */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-2xs text-center space-y-5">
          {/* Top Icon Badge */}
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100/80 text-blue-600 flex items-center justify-center mx-auto shadow-2xs">
            <HiOutlineClipboardList className="w-6 h-6" />
          </div>

          {/* Title & Subtitle */}
          <div className="max-w-2xl mx-auto px-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight break-words leading-tight">
              Performance Dashboard
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-1.5 break-words leading-relaxed">
              {attempt.exam_title_snapshot || 'Assessment Evaluation'}
            </p>
          </div>

          {/* Circular Score Gauge */}
          {!isPending && (
            <div className="flex flex-col items-center justify-center pt-2 pb-1 space-y-3">
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="w-48 h-48 transform -rotate-90">
                  {/* Gauge background track */}
                  <circle
                    cx="96"
                    cy="96"
                    r={circleRadius}
                    stroke="#e2e8f0"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  {/* Gauge progress stroke */}
                  <circle
                    cx="96"
                    cy="96"
                    r={circleRadius}
                    stroke={attempt.passed ? '#10b981' : '#f43f5e'}
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>

                {/* Score text inside gauge */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
                    {attempt.percentage}%
                  </span>
                  <span className="text-xs font-bold text-slate-500 mt-1.5">
                    {attempt.score != null && attempt.max_score != null ? `${attempt.score} / ${attempt.max_score} pts` : `${correctCount} / ${totalQuestions}`}
                  </span>
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 mt-1">
                    Your Score
                  </span>
                </div>
              </div>

              {/* Status Pill Badge */}
              <div className="flex flex-col items-center space-y-1.5">
                <span className={`inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-black shadow-2xs ${
                  attempt.passed
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200/60'
                    : 'bg-rose-100 text-rose-700 border border-rose-200/60'
                }`}>
                  {attempt.passed ? <HiOutlineCheck className="w-4 h-4 stroke-[3]" /> : <HiOutlineX className="w-4 h-4 stroke-[3]" />}
                  {attempt.passed ? 'Passed' : 'Not Passed'}
                </span>

                <p className="text-xs font-semibold text-slate-500 max-w-sm">
                  {attempt.passed
                    ? 'Great job! You have a strong understanding of the material.'
                    : 'Keep practicing to strengthen your knowledge and improve your score.'}
                </p>
              </div>
            </div>
          )}

          {isPending && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs font-bold inline-flex items-center gap-2">
              <HiOutlineClock className="w-4 h-4 text-amber-600 animate-pulse" />
              <span>Assessment is currently pending manual instructor review.</span>
            </div>
          )}

          {/* Metrics Stats Grid Card */}
          {!isPending && (
            <div className={`bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs grid grid-cols-2 ${pendingCount > 0 ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-5'} gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 text-center`}>
              
              {/* Total Questions */}
              <div className="pt-2 sm:pt-0 flex flex-col items-center justify-center space-y-1">
                <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
                  <HiOutlineClipboardList className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Questions</span>
                <span className="text-lg font-black text-slate-900">{totalQuestions}</span>
              </div>

              {/* Correct Answers */}
              <div className="pt-2 sm:pt-0 sm:pl-3 flex flex-col items-center justify-center space-y-1">
                <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                  <HiOutlineCheckCircle className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Correct Answers</span>
                <span className="text-lg font-black text-slate-900">{correctCount}</span>
              </div>

              {/* Incorrect Answers */}
              <div className="pt-2 sm:pt-0 sm:pl-3 flex flex-col items-center justify-center space-y-1">
                <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center">
                  <HiOutlineXCircle className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Incorrect Answers</span>
                <span className="text-lg font-black text-slate-900">{incorrectCount}</span>
              </div>

              {/* Pending Review (if any) */}
              {pendingCount > 0 && (
                <div className="pt-2 sm:pt-0 sm:pl-3 flex flex-col items-center justify-center space-y-1">
                  <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
                    <HiOutlineExclamationCircle className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Review</span>
                  <span className="text-lg font-black text-slate-900">{pendingCount}</span>
                </div>
              )}

              {/* Time Taken */}
              <div className="pt-2 sm:pt-0 sm:pl-3 flex flex-col items-center justify-center space-y-1">
                <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center">
                  <HiOutlineClock className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Time Taken</span>
                <span className="text-lg font-black text-slate-900">{durationStr}</span>
              </div>

              {/* Completed On */}
              <div className="pt-2 sm:pt-0 sm:pl-3 flex flex-col items-center justify-center space-y-1">
                <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
                  <HiOutlineCalendar className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completed On</span>
                <div className="flex flex-col">
                  <span className="text-xs font-black text-slate-900">{dateFormatted}</span>
                  <span className="text-[10px] font-bold text-slate-400">{timeFormatted}</span>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── Performance Analytics ── */}
        {!isPending && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Performance Analytics
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                Accuracy and pacing for this attempt.
              </p>
            </div>

            {/* Headline analytic tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-slate-50/70 border border-slate-200/80 p-4 sm:p-5 text-center space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Overall Accuracy</span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 block tracking-tight">{accuracyPct != null ? `${accuracyPct}%` : '—'}</span>
                <span className="text-xs font-semibold text-slate-500 block">{correctCount} of {scoredCount} scored correct</span>
              </div>
              <div className="rounded-2xl bg-slate-50/70 border border-slate-200/80 p-4 sm:p-5 text-center space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Avg. Time / Question</span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 block tracking-tight">{avgTimeStr}</span>
                <span className="text-xs font-semibold text-slate-500 block">across {totalQuestions} questions</span>
              </div>
              <div className="rounded-2xl bg-slate-50/70 border border-slate-200/80 p-4 sm:p-5 text-center space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Question Types</span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 block tracking-tight">{typeBreakdown.length}</span>
                <span className="text-xs font-semibold text-slate-500 block">distinct formats attempted</span>
              </div>
            </div>

            {/* Accuracy by question type */}
            {typeBreakdown.length > 0 && (
              <div className="space-y-3 pt-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                  Accuracy by Question Type
                </span>
                <div className="bg-slate-50/50 rounded-2xl border border-slate-200/80 p-4 sm:p-5 space-y-3 divide-y divide-slate-100">
                  {typeBreakdown.map((t) => {
                    const c = accuracyStatusColor(t.pct);
                    return (
                      <div key={t.type} className="flex items-center gap-3 sm:gap-4 pt-2.5 first:pt-0">
                        <span className="w-32 sm:w-44 text-xs font-bold text-slate-800 truncate flex-shrink-0">
                          {t.label}
                        </span>
                        <div className="flex-1 h-2.5 rounded-full bg-slate-200/70 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ease-out ${c.bar}`} style={{ width: `${t.pct}%` }} />
                        </div>
                        <span className={`w-12 flex-shrink-0 text-right text-xs font-extrabold ${c.text}`}>{t.pct}%</span>
                        <span className="w-12 flex-shrink-0 text-right text-[11px] font-bold text-slate-400">{t.correct}/{t.total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Strength / weakness callouts — derived only from this attempt's own data */}
            {typeBreakdown.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="rounded-2xl bg-emerald-50/80 border border-emerald-200/80 p-4 flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <HiOutlineCheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Strongest area</span>
                    <span className="text-xs sm:text-sm font-extrabold text-emerald-950">{strongestType.label} — {strongestType.pct}%</span>
                  </div>
                </div>

                <div className="rounded-2xl bg-rose-50/80 border border-rose-200/80 p-4 flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-100/80 text-rose-700 flex items-center justify-center flex-shrink-0">
                    <HiOutlineExclamationCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider block">Needs improvement</span>
                    <span className="text-xs sm:text-sm font-extrabold text-rose-950">{weakestType.label} — {weakestType.pct}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Answer Review Section (Matching Image 1) ── */}
        {!isPending && (
          <div className="space-y-4">
            {/* Answer Review Header & Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Answer Review</h2>
                <p className="text-xs font-semibold text-slate-500">Review your answers and learn from each question.</p>
              </div>

              {/* Filter Tabs Toggle */}
              <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filter === 'all'
                      ? 'bg-white text-blue-600 shadow-2xs border border-blue-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Questions
                </button>
                <button
                  onClick={() => setFilter('incorrect')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filter === 'incorrect'
                      ? 'bg-white text-rose-600 shadow-2xs border border-rose-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Incorrect Only ({incorrectCount})
                </button>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-3">
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
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4 hover:border-slate-300 transition-all"
                  >
                    {/* Top Question Row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Circle Index Badge */}
                        <div className={`w-8 h-8 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isCorrect === true
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : isCorrect === false
                            ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {idx + 1}
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                            {q.prompt}
                          </h3>
                        </div>
                      </div>

                      {/* Status Pill Badge */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isCorrect != null && (
                          isCorrect ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" /> Correct
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                              <HiOutlineX className="w-3.5 h-3.5 stroke-[3]" /> Incorrect
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Submission & Correction details */}
                    <div className="pl-11 space-y-2.5 text-xs">
                      {/* Your Answer */}
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-semibold text-slate-400 min-w-[90px]">Your Answer:</span>
                        {isUnanswered ? (
                          <span className="text-rose-600 italic font-semibold">(No answer submitted)</span>
                        ) : (
                          <span className={`font-bold ${isCorrect ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {userStr}
                          </span>
                        )}
                      </div>

                      {/* Correct Answer if Incorrect */}
                      {isCorrect === false && correctStr && (
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-semibold text-slate-400 min-w-[90px]">Correct Answer:</span>
                          <span className="font-bold text-slate-800">{correctStr}</span>
                        </div>
                      )}

                      {/* Explanation Callout — only worth showing when the student got it wrong */}
                      {q.explanation && isCorrect === false && (
                        <div className="mt-3 p-3.5 rounded-xl bg-rose-50/50 border border-rose-100 text-rose-900 text-xs flex items-start gap-2.5">
                          <HiOutlineInformationCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold text-rose-950 block mb-0.5">Explanation:</span>
                            <span className="text-rose-900/90 leading-relaxed font-medium">{q.explanation}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredAnswers.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-slate-400 text-xs font-semibold">
                  No questions match the selected filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Bottom Callout Banner (hidden on print) ── */}
        <div className="print:hidden bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-blue-50/80 border border-blue-100 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xs">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
              <HiOutlineAcademicCap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Keep learning and stay sharp!</h3>
              <p className="text-xs text-slate-500 mt-0.5 max-w-md leading-relaxed">
                Review the material, strengthen your knowledge, and ace your next quiz assessment.
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/airline/exams')}
            className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm whitespace-nowrap"
          >
            Back to Exam System
          </button>
        </div>

        {/* ── Bottom Action Footer (hidden on print) ── */}
        <div className="print:hidden flex items-center justify-between pt-2">
          <button
            onClick={() => navigate('/airline/exams')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs"
          >
            <HiOutlineArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-2xs"
          >
            <HiOutlinePrinter className="w-4 h-4 text-slate-500" />
            <span>Share Report</span>
          </button>
        </div>

      </div>
    </div>
  );
}

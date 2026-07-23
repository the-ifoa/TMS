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
  HiOutlineClipboardCheck,
  HiOutlineChartBar,
  HiOutlineLightBulb,
  HiOutlineCalendar,
  HiOutlineDocumentText,
  HiOutlineExclamationCircle,
} from 'react-icons/hi';
import { getExamAttemptResult } from '../api';

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
      return response
        .map((p) => (typeof p === 'object' && p !== null ? `${p.left || ''} ↔ ${p.right || ''}` : String(p)))
        .join('; ');
    }
  }

  if (q.type === 'sequence') {
    if (Array.isArray(response)) {
      return response
        .map((item) => (typeof item === 'object' && item !== null ? item.text || item.label || String(item) : String(item)))
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
        <span className="text-sm font-medium">Loading examination report…</span>
      </div>
    );
  }

  if (!attempt) return null;

  const questionById = Object.fromEntries(
    (attempt.questions_snapshot || []).map((q) => [String(q._id), q])
  );

  const isPending = attempt.status === 'pending_review';

  return (
    <div className="w-full min-h-full pb-20 p-4 sm:p-6 lg:p-8">
      {/* ── Main Content Container ── */}
      <div className="w-full max-w-5xl mx-auto space-y-6">
        {/* ── Candidate & Overview Card ── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-6">
          {/* Header Row: Candidate Info & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-lg shadow-2xs flex-shrink-0">
                {attempt.participant_name ? attempt.participant_name.charAt(0).toUpperCase() : <HiOutlineUser className="w-6 h-6" />}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    <HiOutlineAcademicCap className="w-3 h-3 text-blue-600" />
                    {attempt.exam_title_snapshot || 'EXAM RESULT'}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    Attempt #{attempt.attempt_number || 1}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                  {attempt.participant_name}
                </h1>
              </div>
            </div>

            {/* Right Side Action Buttons Section */}
            <div className="flex items-center gap-2.5 flex-shrink-0 self-start sm:self-auto">
              {isPending && (
                <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-3.5 py-2 rounded-xl">
                  <HiOutlineClock className="w-4 h-4 text-amber-600 animate-pulse" />
                  <span>Pending Grading</span>
                </div>
              )}

              <button
                onClick={() => navigate('/airline/exams')}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all border border-slate-200/70"
              >
                <HiOutlineArrowLeft className="w-4 h-4 text-slate-500" />
                <span>Back to Exam System</span>
              </button>

              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition-all shadow-2xs"
              >
                <HiOutlinePrinter className="w-4 h-4" />
                <span>Print Report</span>
              </button>
            </div>
          </div>

          {/* 3 Metric Blocks Grid */}
          {!isPending && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Stat Block 1: Score */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 border border-indigo-100">
                  <HiOutlineClipboardCheck className="w-5.5 h-5.5" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Total Score
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-black text-slate-900">
                      {attempt.score}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      / {attempt.max_score} pts
                    </span>
                  </div>
                </div>
              </div>

              {/* Stat Block 2: Percentage */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 border border-blue-100">
                  <HiOutlineChartBar className="w-5.5 h-5.5" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Percentage Score
                  </span>
                  <span className={`text-xl font-black tracking-tight mt-0.5 block ${attempt.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {attempt.percentage}%
                  </span>
                </div>
              </div>

              {/* Stat Block 3: Assessment Status */}
              <div className={`rounded-2xl p-4 border flex items-center gap-3.5 ${
                attempt.passed
                  ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950'
                  : 'bg-rose-50/70 border-rose-200/80 text-rose-950'
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  attempt.passed ? 'bg-emerald-100/80 text-emerald-700 border-emerald-200' : 'bg-rose-100/80 text-rose-700 border-rose-200'
                }`}>
                  {attempt.passed ? (
                    <HiOutlineCheckCircle className="w-6 h-6" />
                  ) : (
                    <HiOutlineXCircle className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-60 block">
                    Assessment Status
                  </span>
                  <span className={`text-base font-black tracking-tight mt-0.5 block ${attempt.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {attempt.passed ? 'Passed' : 'Not Passed'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Questions & Answers Section ── */}
        {!isPending && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <HiOutlineDocumentText className="w-4.5 h-4.5 text-slate-400" />
                <h2 className="text-xs font-black text-slate-600 uppercase tracking-widest">
                  Questions & Answers
                </h2>
              </div>
              <span className="text-xs font-extrabold text-slate-600 bg-slate-100 border border-slate-200/80 px-3 py-1 rounded-full">
                {attempt.answers.length} Question{attempt.answers.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Individual Question Cards */}
            <div className="space-y-4">
              {attempt.answers.map((a, idx) => {
                const q = questionById[String(a.question_id)];
                if (!q) return null;
                const correctStr = correctAnswerText(q);
                const userStr = responseText(q, a.response);
                const isCorrect = a.is_correct;
                const isUnanswered = userStr == null;

                return (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-4 transition-all hover:border-slate-300"
                  >
                    {/* Top Bar: Question Number, Prompt, Points & Status */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className={`w-7 h-7 rounded-xl text-white font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs ${
                          isCorrect === true
                            ? 'bg-emerald-600'
                            : isCorrect === false
                            ? 'bg-rose-600'
                            : 'bg-slate-800'
                        }`}>
                          {idx + 1}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 leading-snug">
                          {q.prompt}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                          {a.points_awarded ?? 0}/{q.points} pts
                        </span>

                        {isCorrect != null && (
                          isCorrect ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-xl">
                              <HiOutlineCheckCircle className="w-4 h-4 text-emerald-600" /> Correct
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-rose-700 bg-rose-50 border border-rose-200/80 px-3 py-1 rounded-xl">
                              <HiOutlineXCircle className="w-4 h-4 text-rose-600" /> Incorrect
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Answer Comparison Boxes */}
                    <div className="space-y-3 pt-1">
                      {/* User Answer Block */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                          <HiOutlineUser className="w-3.5 h-3.5" />
                          <span>Your Submission</span>
                        </div>
                        <div className={`p-3.5 rounded-xl border text-sm flex items-start gap-2.5 ${
                          isCorrect === true
                            ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950 font-medium'
                            : isCorrect === false
                            ? 'bg-rose-50/60 border-rose-200/80 text-rose-950 font-medium'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}>
                          {isCorrect === true && <HiOutlineCheck className="w-4.5 h-4.5 text-emerald-600 flex-shrink-0 mt-0.5" />}
                          {isCorrect === false && <HiOutlineX className="w-4.5 h-4.5 text-rose-600 flex-shrink-0 mt-0.5" />}
                          {isUnanswered ? (
                            <span className="text-rose-600 italic font-semibold flex items-center gap-1.5">
                              <HiOutlineExclamationCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                              (No answer submitted)
                            </span>
                          ) : (
                            <span className="leading-relaxed font-semibold">{userStr}</span>
                          )}
                        </div>
                      </div>

                      {/* Correct Answer Block (when incorrect or unanswered) */}
                      {isCorrect === false && correctStr && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                            <HiOutlineCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Correct Solution</span>
                          </div>
                          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-sm text-emerald-950 flex items-start gap-2.5">
                            <HiOutlineCheckCircle className="w-4.5 h-4.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <span className="font-bold leading-relaxed">{correctStr}</span>
                          </div>
                        </div>
                      )}

                      {/* Explanation Note */}
                      {q.explanation && (
                        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs text-amber-900 leading-relaxed">
                          <HiOutlineLightBulb className="w-4.5 h-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-extrabold text-amber-950 uppercase tracking-wider text-[10px] block mb-0.5">Explanation:</strong>
                            <span>{q.explanation}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

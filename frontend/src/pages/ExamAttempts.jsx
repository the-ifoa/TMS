import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineUser,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineExclamationCircle,
  HiOutlineSearch,
  HiOutlineAcademicCap,
  HiOutlineUsers,
  HiOutlineClipboardCheck,
  HiOutlineEye,
  HiOutlinePencilAlt,
  HiOutlineX,
} from 'react-icons/hi';
import { listExamAttempts, getExam, getExamAttemptResult, gradeExamAttempt } from '../api';
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
            {/* Sticky Executive Modal Header */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-b border-slate-200/80 bg-slate-50/60 backdrop-blur-md sticky top-0 z-10 space-y-2.5">
              {/* Row 1: Candidate Profile & Executive Stats */}
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
                  {/* Clean Executive Score Badge */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 text-white shadow-2xs">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Score</span>
                    <input
                      type="number" min="0" max={maxTotal}
                      value={liveTotal}
                      onChange={(e) => setTotalOverride(Math.max(0, Math.min(maxTotal, Number(e.target.value))))}
                      title="Directly edit final score"
                      className="w-9 py-0.5 text-xs font-extrabold text-white bg-slate-800/90 border border-slate-700/80 rounded text-center outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs font-extrabold text-slate-300">/ {maxTotal}</span>
                    <span className="ml-0.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-black border border-emerald-500/30">
                      {livePct}%
                    </span>
                    {totalOverride != null && (
                      <button type="button" onClick={() => setTotalOverride(null)} title="Reset to auto-calculated score"
                        className="ml-1 text-[10px] font-bold text-blue-300 hover:text-white underline">
                        reset
                      </button>
                    )}
                  </div>

                  {/* Status Pill Badge with Dot */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border capitalize shadow-2xs ${
                      attempt.status === 'graded' || attempt.status === 'submitted'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                        : attempt.status === 'pending_review'
                        ? 'bg-blue-50 text-blue-700 border-blue-200/80'
                        : 'bg-amber-50 text-amber-700 border-amber-200/80'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      attempt.status === 'graded' || attempt.status === 'submitted'
                        ? 'bg-emerald-500'
                        : attempt.status === 'pending_review'
                        ? 'bg-blue-500'
                        : 'bg-amber-500'
                    }`} />
                    {attempt.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Row 2: Segmented Control Filter Tabs & Bulk Award Action */}
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
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/60 flex-wrap sm:flex-nowrap">
                    {/* Segmented Control */}
                    <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/70 border border-slate-200/80 text-xs overflow-x-auto">
                      {tabs.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setFilter(t.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            filter === t.id
                              ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80 font-black'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 font-semibold'
                          }`}
                        >
                          <span>{t.label}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
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
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white text-xs font-bold shadow-2xs transition-all whitespace-nowrap ml-auto cursor-pointer"
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

                    {/* Question Image if present */}
                    {q.image_url && (
                      <div className="rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-50 p-3">
                        <img
                          src={q.image_url}
                          alt="Question asset"
                          className="max-h-72 rounded-xl object-contain mx-auto"
                        />
                      </div>
                    )}

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
  const [exam, setExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradingId, setGradingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => {
    Promise.all([getExam(id), listExamAttempts({ exam_id: id })])
      .then(([examRes, attemptsRes]) => {
        setExam(examRes.data);
        setAttempts(attemptsRes.data);
      })
      .catch(() => toast.error('Failed to load results.'))
      .finally(() => setLoading(false));
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

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* Integrated Sticky Top Header & Search/Filter Bar */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 space-y-2">
          {/* Top Row: Navigation, Title & Attempts Counter */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 rounded-lg border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 flex-shrink-0 shadow-2xs"
                onClick={() => navigate('/admin/exams')}
                title="Back to Exams"
              >
                <HiOutlineArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Back to Exams</span>
                <span className="sm:hidden">Back</span>
              </Button>

              <div className="flex items-center gap-2 min-w-0 truncate border-l border-slate-200 pl-2.5">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight truncate" title={exam?.title}>
                  {exam?.title || 'Exam'}
                </h1>
                <span className="hidden sm:inline-block text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex-shrink-0">
                  Results
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold shadow-2xs">
                <HiOutlineUsers className="w-3.5 h-3.5 text-slate-300" />
                <span>{attempts.length} <span className="hidden sm:inline">Attempts</span></span>
              </span>
            </div>
          </div>

          {/* Bottom Row: Search Input & Filter Tabs (Sticky inside top bar) */}
          {!loading && attempts.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="relative flex-1 min-w-0">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search candidate by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0 flex-shrink-0">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'pending_review', label: 'Pending Review' },
                  { id: 'graded', label: 'Graded' },
                  { id: 'in_progress', label: 'In Progress' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border whitespace-nowrap cursor-pointer ${
                      statusFilter === tab.id
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4 flex-1">

        {/* Attempts Card List */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-3xl" />
            <Skeleton className="h-20 w-full rounded-3xl" />
            <Skeleton className="h-20 w-full rounded-3xl" />
          </div>
        ) : filteredAttempts.length === 0 ? (
          <Card className="p-12 text-center text-sm font-medium text-slate-400 rounded-3xl">
            {attempts.length === 0 ? 'No candidates have attempted this exam yet.' : 'No attempt matches your search filter.'}
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredAttempts.map((a) => (
              <div
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-3xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all gap-4"
              >
                {/* Left: Avatar & Candidate info */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar className="w-10 h-10 border border-slate-200 shadow-2xs flex-shrink-0">
                    <AvatarFallback className="bg-slate-900 text-white text-xs font-bold">
                      {a.participant_name ? a.participant_name.charAt(0).toUpperCase() : 'S'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {a.participant_name}
                    </p>
                    <p className="text-xs text-slate-400 font-medium truncate">
                      Attempt #{a.attempt_number} · {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Right: Score, Status & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="flex items-center gap-2">
                    {a.percentage != null && (
                      <span
                        className={`text-xs font-extrabold px-3 py-1 rounded-xl border ${
                          a.passed
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {a.percentage}%
                      </span>
                    )}
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-xl border capitalize ${
                        a.status === 'graded' || a.status === 'submitted'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : a.status === 'pending_review'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {a.status.replace('_', ' ')}
                    </span>
                  </div>

                  {a.status !== 'in_progress' && (
                    <Button
                      size="sm"
                      onClick={() => setGradingId(a.id)}
                      className={`rounded-xl text-xs font-bold shadow-2xs ${
                        a.status === 'pending_review'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      {a.status === 'pending_review' ? (
                        <>
                          <HiOutlinePencilAlt className="w-3.5 h-3.5" />
                          Grade
                        </>
                      ) : (
                        <>
                          <HiOutlineEye className="w-3.5 h-3.5" />
                          View
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
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

import { useEffect, useRef, useState } from 'react';
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
  HiOutlinePencilAlt,
  HiOutlineX,
  HiOutlineShieldExclamation,
  HiOutlineChartBar,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
} from 'react-icons/hi';
import { listExamAttempts, getExam, getExamAttemptResult, gradeExamAttempt, getExamAnalytics } from '../api';
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

const VIOLATION_LABELS = {
  fullscreen_exit: 'Exited fullscreen',
  tab_switch: 'Switched tab/window',
  devtools_suspected: 'Suspicious activity detected',
};

function StatTile({ label, value, icon: Icon, color = 'blue' }) {
  const colorMap = {
    blue: {
      bg: 'bg-blue-50/60',
      border: 'border-blue-100',
      iconBg: 'bg-blue-100/70 text-blue-600',
    },
    emerald: {
      bg: 'bg-emerald-50/60',
      border: 'border-emerald-100',
      iconBg: 'bg-emerald-100/70 text-emerald-600',
    },
    violet: {
      bg: 'bg-violet-50/60',
      border: 'border-violet-100',
      iconBg: 'bg-violet-100/70 text-violet-600',
    },
    slate: {
      bg: 'bg-slate-50',
      border: 'border-slate-200/80',
      iconBg: 'bg-slate-100 text-slate-600',
    },
  };
  const theme = colorMap[color] || colorMap.slate;

  return (
    <div className={`p-4 rounded-2xl ${theme.bg} border ${theme.border} flex items-center gap-3.5 transition-all shadow-2xs`}>
      {Icon && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${theme.iconBg} shadow-2xs`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

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
  const { isAdmin } = useAuth();
  const backToExams = isAdmin ? '/admin/exams' : '/airline/exams/manage';
  const [exam, setExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradingId, setGradingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [analytics, setAnalytics] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [expandedViolations, setExpandedViolations] = useState(() => new Set());

  const toggleViolations = (attemptId) => {
    setExpandedViolations((prev) => {
      const next = new Set(prev);
      next.has(attemptId) ? next.delete(attemptId) : next.add(attemptId);
      return next;
    });
  };

  const load = () => {
    Promise.all([getExam(id), listExamAttempts({ exam_id: id }), getExamAnalytics(id)])
      .then(([examRes, attemptsRes, analyticsRes]) => {
        setExam(examRes.data);
        setAttempts(attemptsRes.data);
        setAnalytics(analyticsRes.data);
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
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-2.5">
          {/* Top Row: Navigation, Title & Right Controls */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <button
                type="button"
                className="h-8 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 flex items-center gap-1.5 flex-shrink-0 shadow-2xs transition-all cursor-pointer"
                onClick={() => navigate(backToExams)}
                title="Back to Exams"
              >
                <HiOutlineArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Back to Exams</span>
                <span className="sm:hidden">Back</span>
              </button>

              <div className="flex items-center gap-2 min-w-0 truncate border-l border-slate-200 pl-3">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate" title={exam?.title}>
                  {exam?.title || 'Exam'}
                </h1>
                <span className="hidden sm:inline-block text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200/70 px-2 py-0.5 rounded-md flex-shrink-0">
                  Results
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {analytics && (
                <button
                  type="button"
                  onClick={() => setShowAnalytics((s) => !s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-2xs border transition-all cursor-pointer ${
                    showAnalytics
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <HiOutlineChartBar className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Analytics</span>
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xs">
                <HiOutlineUsers className="w-3.5 h-3.5 text-slate-300" />
                <span>{attempts.length} <span className="hidden sm:inline">Attempt{attempts.length !== 1 ? 's' : ''}</span></span>
              </span>
            </div>
          </div>

          {/* Bottom Row: Search Input & Filter Tabs */}
          {!loading && attempts.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
              <div className="relative flex-1 min-w-0">
                <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search candidate by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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

              {/* Status Filter Segmented Tabs */}
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 overflow-x-auto flex-shrink-0">
                {[
                  { id: 'all', label: 'All', count: attempts.length },
                  { id: 'pending_review', label: 'Pending Review', count: attempts.filter((a) => a.status === 'pending_review').length },
                  { id: 'graded', label: 'Graded', count: attempts.filter((a) => a.status === 'graded' || a.status === 'submitted').length },
                  { id: 'in_progress', label: 'In Progress', count: attempts.filter((a) => a.status === 'in_progress').length },
                ].map((tab) => {
                  const active = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-medium'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                        active ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4 flex-1">

        {/* Analytics Panel */}
        {showAnalytics && analytics && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-2xs">
                  <HiOutlineChartBar className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Performance Analytics</h2>
                  <p className="text-[11px] text-slate-400">Exam metrics, historical pass rates, and question performance</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <StatTile label="Finished" value={analytics.overall.finished_attempts} icon={HiOutlineClipboardCheck} color="blue" />
              <StatTile label="Passed" value={analytics.overall.passed} icon={HiOutlineCheckCircle} color="emerald" />
              <StatTile label="Avg Score" value={analytics.overall.avg_percentage != null ? `${analytics.overall.avg_percentage}%` : '—'} icon={HiOutlineAcademicCap} color="violet" />
              <StatTile label="Total Attempts" value={analytics.overall.total_attempts} icon={HiOutlineUsers} color="slate" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
              {/* Pass Rate Over Time */}
              {analytics.pass_rate_over_time.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-50/60 border border-slate-200/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Pass Rate Over Time</span>
                    <span className="text-[11px] font-semibold text-slate-400">{analytics.pass_rate_over_time.length} recorded session(s)</span>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {analytics.pass_rate_over_time.map((d) => (
                      <div key={d.date} className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{d.date}</span>
                          <span className="font-bold text-emerald-600">{d.pass_rate}% <span className="font-normal text-slate-400">({d.passed}/{d.total} passed)</span></span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${d.pass_rate}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-Question Miss Rate */}
              {analytics.per_question.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-50/60 border border-slate-200/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Per-Question Miss Rate</span>
                    <span className="text-[11px] font-semibold text-slate-400">{analytics.per_question.length} questions</span>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                    {analytics.per_question.map((q, idx) => (
                      <div key={q.question_id || idx} className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">Q{idx + 1}</span>
                            <p className="text-xs font-medium text-slate-800 truncate" title={q.prompt}>
                              {q.prompt || '(untitled question)'}
                            </p>
                          </div>
                        </div>
                        {q.miss_rate != null ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  q.miss_rate > 50 ? 'bg-rose-500' : q.miss_rate > 20 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${q.miss_rate}%` }}
                              />
                            </div>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                              q.miss_rate > 50
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : q.miss_rate > 20
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {q.miss_rate}% miss
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400">No data</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Attempts Card List */}
        {loading ? (
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
            {filteredAttempts.map((a) => {
              const isPending = a.status === 'pending_review';
              const isGraded = a.status === 'graded' || a.status === 'submitted';
              const isInProgress = a.status === 'in_progress';
              const hasViolations = a.violation_count > 0;
              const isViolationExpanded = expandedViolations.has(a.id);

              return (
                <div
                  key={a.id}
                  className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-slate-300/90 transition-all duration-200 overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 gap-3.5">
                    {/* Left: Avatar & Candidate info */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center font-bold text-xs shadow-2xs flex-shrink-0">
                        {a.participant_name ? a.participant_name.charAt(0).toUpperCase() : 'S'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-900 truncate">{a.participant_name}</p>
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/70 flex-shrink-0">
                            Attempt #{a.attempt_number}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
                          {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {a.submitted_at && ` · Completed at ${new Date(a.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                      </div>
                    </div>

                    {/* Right: Score, Status & Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-wrap sm:flex-nowrap pt-2.5 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex-shrink-0">
                      {/* Score Badge */}
                      {a.percentage != null && (
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold ${
                          a.passed
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {a.passed ? <HiOutlineCheckCircle className="w-3.5 h-3.5" /> : <HiOutlineXCircle className="w-3.5 h-3.5" />}
                          <span>{a.percentage}%</span>
                        </div>
                      )}

                      {/* Status Badge */}
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-semibold capitalize ${
                        isGraded
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : isPending
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isGraded ? 'bg-emerald-500' : isPending ? 'bg-blue-500' : 'bg-amber-500'
                        }`} />
                        {a.status.replace('_', ' ')}
                      </span>

                      {/* Violation Badge */}
                      {hasViolations && (
                        <button
                          type="button"
                          onClick={() => toggleViolations(a.id)}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl border transition-all cursor-pointer ${
                            isViolationExpanded
                              ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          }`}
                          title="View security violations"
                        >
                          <HiOutlineShieldExclamation className="w-3.5 h-3.5" />
                          <span>{a.violation_count}</span>
                          {isViolationExpanded ? <HiOutlineChevronUp className="w-3 h-3" /> : <HiOutlineChevronDown className="w-3 h-3" />}
                        </button>
                      )}

                      {/* Action Button */}
                      {!isInProgress && (
                        <button
                          type="button"
                          onClick={() => setGradingId(a.id)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-[0.98] ${
                            isPending
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <HiOutlinePencilAlt className="w-3.5 h-3.5" />
                          <span>{isPending ? 'Grade Attempt' : 'Edit Grade'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Violation Expand Drawer */}
                  {isViolationExpanded && hasViolations && (
                    <div className="px-5 py-3.5 border-t border-rose-100 bg-rose-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                          <HiOutlineShieldExclamation className="w-4 h-4 text-rose-600" />
                          Security Violations Log ({a.violations?.length || a.violation_count})
                        </p>
                        {a.auto_submitted && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                            Auto-submitted
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {(a.violations || []).map((v, vi) => (
                          <div key={vi} className="flex items-center justify-between text-xs bg-white/80 border border-rose-100 px-3 py-1.5 rounded-lg">
                            <span className="font-semibold text-rose-900">{VIOLATION_LABELS[v.type] || v.type}</span>
                            <span className="text-rose-500 font-medium text-[11px]">{new Date(v.at).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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

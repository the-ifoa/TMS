import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineClock, HiOutlineChevronLeft, HiOutlineChevronRight,
  HiOutlineShieldCheck, HiOutlineExclamationCircle,
  HiOutlineBookmark, HiOutlineCheckCircle,
} from 'react-icons/hi';
import QuestionPlayer from './examPlayers/QuestionPlayer';
import { Button } from '@/components/ui/button';
import logoImg from '../assets/logo.png';

// ─── Shared exam runner ───────────────────────────────────────────────────────
// The single presentational + anti-cheat engine used by BOTH the airline-driven
// flow (ExamTake) and the emailed public-link flow (PublicExam) so their layout
// and lockdown behaviour are guaranteed identical. The parent loads the attempt
// and supplies the API callbacks; this component owns all in-exam state.
//
// Props:
//   attempt          — { id, questions_snapshot, answers, started_at, violation_count }
//   exam             — { title, duration_minutes, lockdown_enabled, max_violations }
//   onSaveAnswer(qId, response)  — autosave one answer (fire-and-forget)
//   onSubmit()                   — async: persist final submission server-side
//   onReportViolation(type)      — async → { violation_count, auto_submitted_now }
//   onFinished()                 — called after a successful submit / auto-submit
//   onBack                       — optional: back button handler (hidden if absent)

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function requestFullscreen(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  return fn ? fn.call(el) : Promise.reject(new Error('Fullscreen not supported'));
}
function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  return fn ? fn.call(document) : Promise.resolve();
}
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}
const VIOLATION_LABEL = {
  fullscreen_exit: 'You exited fullscreen mode.',
  tab_switch: 'You switched away from the exam tab/window.',
  devtools_suspected: 'Suspicious activity detected.',
};

export default function ExamRunner({ attempt, exam, onSaveAnswer, onSubmit, onReportViolation, onFinished, onBack, previewMode = false }) {
  const questions = attempt.questions_snapshot;

  const [answers, setAnswers] = useState(() => {
    const init = {};
    (attempt.answers || []).forEach((a) => { init[a.question_id] = a.response; });
    return init;
  });
  const [marked, setMarked] = useState(new Set());
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const deadline = new Date(attempt.started_at).getTime() + exam.duration_minutes * 60000;
    return Math.max(0, Math.round((deadline - Date.now()) / 1000));
  });
  const [submitting, setSubmitting] = useState(false);
  const [violationCount, setViolationCount] = useState(attempt.violation_count || 0);
  const [warning, setWarning] = useState(null);
  const [awaitingFsGesture, setAwaitingFsGesture] = useState(false);
  const finishedRef = useRef(false);
  const violationLockRef = useRef(false);
  // Entering fullscreen the first time is a required SETUP STEP, not a
  // violation. Until the candidate has been in fullscreen at least once, no
  // fullscreen/tab-switch violations are counted — they're just prompted to
  // click to enter the lockdown.
  const hasEnteredFsRef = useRef(false);

  // ── Per-section time budgets (soft, client-side pacing on top of the exam's
  // overall duration_minutes deadline above). A section's clock only starts
  // the moment the candidate first visits it; once exhausted, its answers
  // lock (read-only) and the candidate is nudged to the next open section.
  const sectionTimeLimits = useMemo(() => {
    const map = {};
    (exam.section_settings || []).forEach((s) => {
      if (s.time_minutes > 0) map[s.name || ''] = s.time_minutes * 60;
    });
    return map;
  }, [exam.section_settings]);
  const hasSectionTimers = Object.keys(sectionTimeLimits).length > 0;
  // ms accumulated while THIS section was the active one — only advances
  // while the candidate is actually on it, so navigating away pauses it.
  const sectionElapsedRef = useRef({});
  const [lockedSections, setLockedSections] = useState(() => new Set());
  const [, forceSectionTick] = useState(0);
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);
  const lockedSectionsRef = useRef(lockedSections);
  useEffect(() => { lockedSectionsRef.current = lockedSections; }, [lockedSections]);

  // ── Per-question time budgets — same soft-lock mechanism as section
  // timers, but scoped to one question's own clock (admin-set per question).
  const questionTimeLimits = useMemo(() => {
    const map = {};
    questions.forEach((qq) => { if (qq.time_limit_seconds > 0) map[qq._id] = qq.time_limit_seconds; });
    return map;
  }, [questions]);
  const hasQuestionTimers = Object.keys(questionTimeLimits).length > 0;
  // ms accumulated while THIS question was the active one — paused whenever
  // the candidate is looking at a different question.
  const questionElapsedRef = useRef({});
  const [lockedQuestionIds, setLockedQuestionIds] = useState(() => new Set());
  const lockedQuestionIdsRef = useRef(lockedQuestionIds);
  useEffect(() => { lockedQuestionIdsRef.current = lockedQuestionIds; }, [lockedQuestionIds]);

  // Preview mode (admin testing an exam from ExamBuilder) never enforces
  // lockdown — no forced fullscreen, no violation counting/warnings — since
  // there's no real candidate to police.
  const lockdownEnabled = exam.lockdown_enabled && !previewMode;
  const maxViolations = exam.max_violations || 4;

  const handleSubmit = useMemo(() => async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitting(true);
    try {
      if (isFullscreen()) await exitFullscreen().catch(() => { });
      await onSubmit();
      onFinished();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit exam.');
      finishedRef.current = false;
      setSubmitting(false);
    }
  }, [onSubmit, onFinished]);

  const reportViolation = useCallback(async (type) => {
    if (finishedRef.current || violationLockRef.current) return;
    violationLockRef.current = true;
    try {
      const res = await onReportViolation(type);
      const count = res?.violation_count ?? 0;
      setViolationCount(count);
      if (res?.auto_submitted_now) {
        finishedRef.current = true;
        toast.error('Exam auto-submitted — too many violations.');
        onFinished();
        return;
      }
      setWarning({ message: VIOLATION_LABEL[type] || 'Violation detected.', remaining: Math.max(0, maxViolations - count), count });
      setTimeout(() => setWarning((w) => (w?.count === count ? null : w)), 6000);
    } catch { /* ignore network errors */ } finally {
      setTimeout(() => { violationLockRef.current = false; }, 1200);
    }
  }, [onReportViolation, onFinished, maxViolations]);

  // ── Lockdown listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!lockdownEnabled) return;
    let pendingReenter = false;
    const reenter = () => {
      pendingReenter = false;
      document.removeEventListener('pointerdown', reenter, true);
      document.removeEventListener('keydown', reenter, true);
      if (!isFullscreen() && !finishedRef.current) requestFullscreen(document.documentElement).catch(() => { });
    };
    const armReenter = () => {
      setAwaitingFsGesture(true);
      if (pendingReenter) return;
      pendingReenter = true;
      document.addEventListener('pointerdown', reenter, true);
      document.addEventListener('keydown', reenter, true);
    };
    const onFullscreenChange = () => {
      if (finishedRef.current) return;
      if (isFullscreen()) {
        hasEnteredFsRef.current = true;
        pendingReenter = false;
        setAwaitingFsGesture(false);
      } else {
        // Only a genuine EXIT (after the candidate has entered once) is a
        // violation. The initial "not yet in fullscreen" state is just setup.
        if (hasEnteredFsRef.current) reportViolation('fullscreen_exit');
        requestFullscreen(document.documentElement).catch(() => armReenter());
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden && !finishedRef.current && hasEnteredFsRef.current) reportViolation('tab_switch');
    };
    const blockDefault = (e) => e.preventDefault();
    const blockKeys = (e) => {
      const k = (e.key || '').toUpperCase();
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(k)) || (e.ctrlKey && ['U', 'P', 'S', 'C'].includes(k))) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    const onPrintScreen = (e) => {
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('').catch(() => { });
        toast.error('Screenshots are not permitted during the exam.');
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('contextmenu', blockDefault);
    document.addEventListener('copy', blockDefault);
    document.addEventListener('cut', blockDefault);
    document.addEventListener('keydown', blockKeys, true);
    document.addEventListener('keyup', onPrintScreen);
    if (!isFullscreen()) armReenter();
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('contextmenu', blockDefault);
      document.removeEventListener('copy', blockDefault);
      document.removeEventListener('cut', blockDefault);
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('keyup', onPrintScreen);
      document.removeEventListener('pointerdown', reenter, true);
      document.removeEventListener('keydown', reenter, true);
    };
  }, [lockdownEnabled, reportViolation]);

  useEffect(() => () => { if (isFullscreen()) exitFullscreen().catch(() => { }); }, []);

  useEffect(() => {
    if (secondsLeft <= 0) { handleSubmit(); return; }
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft, handleSubmit]);

  useEffect(() => {
    if (!hasSectionTimers) return;
    const t = setInterval(() => {
      const currentSection = questions[indexRef.current]?.section || '';
      if (sectionTimeLimits[currentSection] != null && !lockedSectionsRef.current.has(currentSection)) {
        sectionElapsedRef.current[currentSection] = (sectionElapsedRef.current[currentSection] || 0) + 1000;
      }

      let justLocked = null;
      Object.entries(sectionTimeLimits).forEach(([name, limit]) => {
        const elapsed = sectionElapsedRef.current[name] || 0;
        if (!lockedSectionsRef.current.has(name) && elapsed / 1000 >= limit) {
          justLocked = name;
        }
      });

      if (justLocked) {
        const lockedName = justLocked;
        setLockedSections((prev) => {
          const next = new Set(prev).add(lockedName);
          lockedSectionsRef.current = next;
          if ((questions[indexRef.current]?.section || '') === lockedName) {
            const nextIdx = questions.findIndex((qq) => !next.has(qq.section || ''));
            if (nextIdx === -1) handleSubmit();
            else setIndex(nextIdx);
          }
          return next;
        });
        toast.error(`Time's up for section "${lockedName || 'Ungrouped'}" — answers locked, moving on.`);
      }
      forceSectionTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [hasSectionTimers, questions, sectionTimeLimits, handleSubmit]);

  useEffect(() => {
    if (!hasQuestionTimers) return;
    const t = setInterval(() => {
      const currentQ = questions[indexRef.current];
      const qid = currentQ?._id;
      if (qid && questionTimeLimits[qid] != null && !lockedQuestionIdsRef.current.has(qid)) {
        questionElapsedRef.current[qid] = (questionElapsedRef.current[qid] || 0) + 1000;
      }

      let justLockedQ = null;
      Object.entries(questionTimeLimits).forEach(([id, limit]) => {
        const elapsed = questionElapsedRef.current[id] || 0;
        if (!lockedQuestionIdsRef.current.has(id) && elapsed / 1000 >= limit) {
          justLockedQ = id;
        }
      });

      if (justLockedQ) {
        const lockedId = justLockedQ;
        setLockedQuestionIds((prev) => {
          const next = new Set(prev).add(lockedId);
          lockedQuestionIdsRef.current = next;
          if (questions[indexRef.current]?._id === lockedId) {
            const nextIdx = questions.findIndex((qq, i) => i > indexRef.current && !next.has(qq._id) && !lockedSectionsRef.current.has(qq.section || ''));
            if (nextIdx === -1) {
              const anyIdx = questions.findIndex((qq) => !next.has(qq._id) && !lockedSectionsRef.current.has(qq.section || ''));
              if (anyIdx === -1) handleSubmit();
              else setIndex(anyIdx);
            } else setIndex(nextIdx);
          }
          return next;
        });
        toast.error("Time's up for this question — locked, moving on.");
      }
      forceSectionTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [hasQuestionTimers, questions, questionTimeLimits, handleSubmit]);

  // Remaining seconds for a section's own budget, or null if it has none.
  const sectionRemaining = (name) => {
    const limit = sectionTimeLimits[name];
    if (limit == null) return null;
    const elapsed = (sectionElapsedRef.current[name] || 0) / 1000;
    return Math.max(0, Math.round(limit - elapsed));
  };

  // Remaining seconds for a single question's own budget, or null if none.
  const questionRemaining = (qid) => {
    const limit = questionTimeLimits[qid];
    if (limit == null) return null;
    const elapsed = (questionElapsedRef.current[qid] || 0) / 1000;
    return Math.max(0, Math.round(limit - elapsed));
  };

  const q = questions[index];
  const currentSectionLocked = lockedSections.has(q.section || '');
  const currentQuestionLocked = lockedQuestionIds.has(q._id);
  const currentLocked = currentSectionLocked || currentQuestionLocked;

  // Group questions by admin-defined section for the sidebar navigator.
  const hasSections = questions.some((qq) => qq.section);
  const sectionGroups = [];
  questions.forEach((qq, i) => {
    const sec = qq.section || '';
    const last = sectionGroups[sectionGroups.length - 1];
    if (!last || last.section !== sec) sectionGroups.push({ section: sec, items: [] });
    sectionGroups[sectionGroups.length - 1].items.push({ ...qq, _index: i });
  });

  const setResponse = (response) => {
    if (currentQuestionLocked) { toast.error("Time's up for this question — answer is locked."); return; }
    if (currentSectionLocked) { toast.error("Time's up for this section — answers are locked."); return; }
    setAnswers((prev) => ({ ...prev, [q._id]: response }));
    onSaveAnswer(q._id, response);
  };
  const toggleMarked = (qId) => setMarked((prev) => { const n = new Set(prev); n.has(qId) ? n.delete(qId) : n.add(qId); return n; });
  const answeredCount = questions.filter((qq) => answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '').length;

  const shellClass = `fixed inset-0 z-[9999] bg-gray-100 flex flex-col h-screen overflow-hidden ${lockdownEnabled ? 'select-none' : ''}`;

  return (
    <div className={shellClass} style={lockdownEnabled ? { userSelect: 'none' } : undefined}>
      {/* ── Top Header Navigation Bar ── */}
      <header className="relative bg-slate-900 text-white px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 border-b border-slate-800/90 shadow-md flex-shrink-0 z-30">
        {/* Left: Logo + Exam Title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {onBack && (
            <button onClick={onBack} className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex-shrink-0 border border-slate-700/60" title="Back to Exams">
              <HiOutlineChevronLeft className="w-5 h-5" />
            </button>
          )}
          <img src={logoImg} alt="IFOA" className="h-6 sm:h-7 w-auto flex-shrink-0 [filter:brightness(0)_invert(1)]" />
          <div className="h-4 w-px bg-slate-800 flex-shrink-0 hidden sm:block" />
          <h1 className="text-xs sm:text-sm font-bold text-slate-100 truncate max-w-xs sm:max-w-md md:max-w-lg">
            {exam.title}
          </h1>
        </div>

        {/* Right: Answered Badge + Status Badges + Timer */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Answered Count Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-xs font-semibold text-slate-300 shadow-2xs">
            <span className="text-blue-400 font-extrabold">{answeredCount}</span>
            <span className="text-slate-500">/</span>
            <span>{questions.length} Answered</span>
          </div>

          {/* Secure Mode Badge */}
          {lockdownEnabled && (
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              <HiOutlineShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>SECURE</span>
            </span>
          )}

          {/* Warning Badge */}
          {lockdownEnabled && violationCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {violationCount}/{maxViolations} WARN
            </span>
          )}

          {/* Timer Clock Badge */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border shadow-2xs ${secondsLeft < 120
                ? 'bg-rose-600 text-white border-rose-500 animate-pulse'
                : 'bg-slate-800/90 text-white border-slate-700/80'
              }`}
          >
            <HiOutlineClock className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>{formatTime(secondsLeft)}</span>
          </div>
        </div>
      </header>

      {awaitingFsGesture && !warning && (
        <div className="bg-blue-50 border-b border-blue-200 text-blue-900 px-4 sm:px-6 py-2 text-xs font-medium flex items-center justify-center gap-2 flex-shrink-0">
          <HiOutlineShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>Click anywhere or press a key to enter the required fullscreen lockdown.</span>
        </div>
      )}
      {warning && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 sm:px-6 py-2 text-xs font-medium flex items-center justify-center gap-2 flex-shrink-0">
          <HiOutlineExclamationCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span><strong>Warning {warning.count}/{maxViolations}:</strong> {warning.message} {warning.remaining > 0 ? `${warning.remaining} more will auto submit your exam.` : ''}</span>
        </div>
      )}
      {currentQuestionLocked && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-900 px-4 sm:px-6 py-2 text-xs font-medium flex items-center justify-center gap-2 flex-shrink-0">
          <HiOutlineClock className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>Time's up for this question — you can still review it, but the answer is locked.</span>
        </div>
      )}
      {!currentQuestionLocked && currentSectionLocked && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-900 px-4 sm:px-6 py-2 text-xs font-medium flex items-center justify-center gap-2 flex-shrink-0">
          <HiOutlineClock className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>Time's up for this section — you can still review it, but answers are locked.</span>
        </div>
      )}

      <div className="relative w-full h-1.5 bg-slate-800 flex-shrink-0 overflow-hidden">
        <div className="h-full bg-blue-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.8)]" style={{ width: `${Math.max(1, (answeredCount / questions.length) * 100)}%` }} />
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-5 flex flex-col overflow-y-auto md:overflow-hidden min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 flex-1 h-full min-h-0 md:overflow-hidden">

          {/* Mobile navigator */}
          <div className="md:hidden bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex flex-col gap-2.5 flex-shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">QUESTIONS ({index + 1}/{questions.length})</span>
              <span className="text-[10px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-full">{Math.round((answeredCount / questions.length) * 100)}% Completed</span>
            </div>
            {hasSections && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none border-b border-slate-100">
                {sectionGroups.map((group, gi) => {
                  const answeredInSec = group.items.filter((qq) => answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '').length;
                  const isCurrentSection = group.items.some((qq) => qq._index === index);
                  return (
                    <button key={gi} onClick={() => setIndex(group.items[0]._index)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border flex items-center gap-1.5 ${
                        isCurrentSection
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200/90 hover:bg-slate-100 hover:text-slate-900'
                      }`}>
                      <span>{group.section || 'Ungrouped'}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${
                        isCurrentSection ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-700'
                      }`}>{answeredInSec}/{group.items.length}</span>
                      {sectionTimeLimits[group.section || ''] != null && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${
                          lockedSections.has(group.section || '')
                            ? 'bg-rose-600 text-white'
                            : isCurrentSection
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200/80 text-slate-700'
                        }`}>
                          {lockedSections.has(group.section || '') ? 'Locked' : formatTime(sectionRemaining(group.section || ''))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
              {(hasSections
                ? (sectionGroups.find((g) => g.items.some((qq) => qq._index === index))?.items || questions.map((qq, i) => ({ ...qq, _index: i })))
                : questions.map((qq, i) => ({ ...qq, _index: i }))
              ).map((qq) => {
                const i = qq._index;
                const isAnswered = answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '';
                let btnCls = 'bg-slate-100 text-slate-600';
                if (i === index) btnCls = 'bg-slate-900 text-white font-bold ring-2 ring-slate-900/20 shadow-2xs';
                else if (marked.has(qq._id)) btnCls = 'bg-amber-500 text-white font-bold';
                else if (isAnswered) btnCls = 'bg-emerald-500 text-white font-bold';
                return <button key={qq._id} onClick={() => setIndex(i)} className={`w-8 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center flex-shrink-0 ${btnCls}`}>{i + 1}</button>;
              })}
            </div>
          </div>

          {/* Desktop sidebar */}
          <aside className="hidden md:flex md:col-span-4 lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs flex-col justify-between space-y-6 h-full min-h-0 flex-shrink-0 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">QUESTIONS</span>
                <span className="text-xs font-extrabold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-full">{Math.round((answeredCount / questions.length) * 100)}%</span>
              </div>
              {hasSections && (
                <div className="space-y-2 border-b border-slate-100 pb-3">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">SECTIONS</span>
                  <div className="flex flex-wrap gap-2">
                    {sectionGroups.map((group, gi) => {
                      const answeredInSec = group.items.filter((qq) => answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '').length;
                      const isCurrentSection = group.items.some((qq) => qq._index === index);
                      return (
                        <button key={gi} type="button" onClick={() => setIndex(group.items[0]._index)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer ${
                            isCurrentSection
                              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200/90 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300'
                          }`}>
                          <span className="truncate max-w-[130px]">{group.section || 'Ungrouped'}</span>
                          {sectionTimeLimits[group.section || ''] != null && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                              lockedSections.has(group.section || '')
                                ? 'bg-rose-600 text-white'
                                : isCurrentSection
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-200/80 text-slate-700'
                            }`}>
                              {lockedSections.has(group.section || '') ? 'Locked' : formatTime(sectionRemaining(group.section || ''))}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                            isCurrentSection ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-700'
                          }`}>{answeredInSec}/{group.items.length}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-4">
                {(hasSections ? sectionGroups.filter((group) => group.items.some((qq) => qq._index === index)) : sectionGroups).map((group, gi) => (
                  <div key={gi} className="space-y-2">
                    {hasSections && <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">{group.section || 'Ungrouped'} Questions</span>}
                    <div className="grid grid-cols-6 gap-2">
                      {group.items.map((qq) => {
                        const i = qq._index;
                        const isAnswered = answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '';
                        let btnCls = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
                        if (i === index) btnCls = 'bg-slate-900 text-white font-bold shadow-2xs ring-2 ring-slate-900/20';
                        else if (marked.has(qq._id)) btnCls = 'bg-amber-500 text-white font-bold shadow-2xs';
                        else if (isAnswered) btnCls = 'bg-emerald-500 text-white font-bold shadow-2xs';
                        return <button key={qq._id} onClick={() => setIndex(i)} className={`w-9 h-9 rounded-full text-xs font-bold transition-all flex items-center justify-center ${btnCls}`}>{i + 1}</button>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4 space-y-2 text-[11px] font-semibold text-slate-600">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" /><span>Answered</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" /><span>Marked for review</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-900 flex-shrink-0" /><span>Current</span></div>
            </div>
          </aside>

          {/* Question panel */}
          <section className="md:col-span-8 lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col h-full overflow-hidden min-h-0">
            <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-white rounded-t-2xl z-10">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {q.section && <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-lg shadow-2xs">{q.section}</span>}
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">QUESTION {index + 1} <span className="text-slate-400 font-semibold">OF {questions.length}</span></span>
                <span className="text-[10px] sm:text-xs font-semibold text-slate-400 border-l border-slate-200 pl-2 sm:pl-3">1 mark</span>
                {questionTimeLimits[q._id] != null && (
                  <span className={`inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full border ${currentQuestionLocked ? 'bg-rose-600 text-white border-rose-600' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                    <HiOutlineClock className="w-3 h-3" />
                    {currentQuestionLocked ? 'Locked' : formatTime(questionRemaining(q._id))}
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => toggleMarked(q._id)}
                className={`rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${marked.has(q._id) ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                <HiOutlineBookmark className={`w-3.5 h-3.5 ${marked.has(q._id) ? 'fill-amber-500 text-amber-600' : 'text-slate-400'}`} />
                {marked.has(q._id) ? 'MARKED' : 'REVIEW'}
              </Button>
            </div>
            <div className="p-4 sm:p-6 lg:p-7 flex-1 overflow-y-auto scrollbar-none min-h-0">
              <QuestionPlayer question={q} response={answers[q._id]} onChange={setResponse} />
            </div>
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 flex items-center justify-between gap-2 flex-shrink-0 bg-white rounded-b-2xl z-10">
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-slate-400">
                <HiOutlineCheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" /><span className="hidden xs:inline">Autosave enabled</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <Button variant="outline" size="sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}
                  className="rounded-xl px-3 sm:px-5 border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs">
                  <HiOutlineChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-0.5 sm:mr-1" /> PREV
                </Button>
                {index < questions.length - 1 ? (
                  <Button size="sm" onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                    className="rounded-xl px-4 sm:px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-2xs text-xs">
                    NEXT <HiOutlineChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5 sm:ml-1" />
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleSubmit} disabled={submitting}
                    className="rounded-xl px-5 sm:px-7 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs text-xs">
                    {submitting ? 'Submitting…' : 'SUBMIT'}
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

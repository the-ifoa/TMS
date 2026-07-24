import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineClock, HiOutlineChevronLeft, HiOutlineChevronRight,
  HiOutlineShieldCheck, HiOutlineExclamationCircle,
  HiOutlineBookmark, HiOutlineCheckCircle,
} from 'react-icons/hi';
import { getExam, getExamAttempt, saveExamAnswer, submitExamAttempt, reportExamViolation } from '../api';
import QuestionPlayer from '../components/examPlayers/QuestionPlayer';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
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

export default function ExamTake() {
  const { examId, attemptId } = useParams();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(null);
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState(new Set());
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const finishedRef = useRef(false);

  // ── Lockdown mode state ──────────────────────────────────────────────────
  const [violationCount, setViolationCount] = useState(0);
  const [warning, setWarning] = useState(null);
  const [awaitingFsGesture, setAwaitingFsGesture] = useState(false);
  const violationLockRef = useRef(false);

  useEffect(() => {
    Promise.all([getExamAttempt(attemptId), getExam(examId)])
      .then(([attRes, examRes]) => {
        const att = attRes.data;
        if (att.status !== 'in_progress') {
          navigate(`/airline/exams/${examId}/result/${attemptId}`, { replace: true });
          return;
        }
        setAttempt(att);
        setExam(examRes.data);
        setViolationCount(att.violation_count || 0);
        const initial = {};
        (att.answers || []).forEach((a) => { initial[a.question_id] = a.response; });
        setAnswers(initial);
        const deadline = new Date(att.started_at).getTime() + examRes.data.duration_minutes * 60000;
        setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
      })
      .catch(() => toast.error('Failed to load exam.'));
  }, [attemptId, examId, navigate]);

  const lockdownEnabled = exam?.lockdown_enabled;
  const maxViolations = exam?.max_violations || 4;

  const handleSubmit = useMemo(() => async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitting(true);
    try {
      if (isFullscreen()) await exitFullscreen().catch(() => {});
      await submitExamAttempt(attemptId);
      navigate(`/airline/exams/${examId}/result/${attemptId}`, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit exam.');
      finishedRef.current = false;
      setSubmitting(false);
    }
  }, [attemptId, examId, navigate]);

  const reportViolation = useCallback(async (type) => {
    if (finishedRef.current || violationLockRef.current) return;
    violationLockRef.current = true;
    try {
      const res = await reportExamViolation(attemptId, type);
      const count = res.data.violation_count ?? 0;
      setViolationCount(count);
      if (res.data.auto_submitted_now) {
        finishedRef.current = true;
        toast.error('Exam auto-submitted — too many violations.');
        navigate(`/airline/exams/${examId}/result/${attemptId}`, { replace: true });
        return;
      }
      const remaining = Math.max(0, maxViolations - count);
      setWarning({ message: VIOLATION_LABEL[type] || 'Violation detected.', remaining, count });
      setTimeout(() => setWarning((w) => (w?.count === count ? null : w)), 6000);
    } catch {
      // ignore network errors
    } finally {
      setTimeout(() => { violationLockRef.current = false; }, 1200);
    }
  }, [attemptId, examId, navigate, maxViolations]);

  useEffect(() => {
    if (!lockdownEnabled) return;

    let pendingReenter = false;
    const reenter = () => {
      pendingReenter = false;
      document.removeEventListener('pointerdown', reenter, true);
      document.removeEventListener('keydown', reenter, true);
      if (!isFullscreen() && !finishedRef.current) {
        requestFullscreen(document.documentElement).catch(() => {});
      }
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
        pendingReenter = false;
        setAwaitingFsGesture(false);
      } else {
        reportViolation('fullscreen_exit');
        requestFullscreen(document.documentElement).catch(() => armReenter());
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden && !finishedRef.current) reportViolation('tab_switch');
    };
    const blockDefault = (e) => e.preventDefault();
    const blockKeys = (e) => {
      const k = (e.key || '').toUpperCase();
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(k)) ||
        (e.ctrlKey && ['U', 'P', 'S', 'C'].includes(k))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onPrintScreen = (e) => {
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('').catch(() => {});
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

    // The click that started this attempt (on the list page) may not have
    // carried enough gesture weight for the browser to grant fullscreen by
    // the time this page mounts — a direct retry here would fail too, since
    // effects run detached from any gesture. Instead, if we're not already
    // fullscreen, arm the same one-shot re-entry used after an exit: the
    // candidate's very next real click/keypress (e.g. picking an answer)
    // carries a fresh gesture and will actually succeed.
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

  useEffect(() => () => { if (isFullscreen()) exitFullscreen().catch(() => {}); }, []);

  useEffect(() => {
    if (secondsLeft == null) return;
    if (secondsLeft <= 0) { handleSubmit(); return; }
    const t = setInterval(() => setSecondsLeft((s) => (s == null ? s : s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft, handleSubmit]);

  if (!attempt || !exam) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 pb-10 p-6">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  const questions = attempt.questions_snapshot;
  const q = questions[index];
  const totalSeconds = exam.duration_minutes * 60;

  // Group questions by the admin-defined section label, in exam order, for
  // the sidebar navigator. No sections defined anywhere → render flat, same
  // as before.
  const hasSections = questions.some((qq) => qq.section);
  const sectionGroups = [];
  questions.forEach((qq, i) => {
    const sec = qq.section || '';
    const last = sectionGroups[sectionGroups.length - 1];
    if (!last || last.section !== sec) sectionGroups.push({ section: sec, items: [] });
    sectionGroups[sectionGroups.length - 1].items.push({ ...qq, _index: i });
  });

  const setResponse = (response) => {
    setAnswers((prev) => ({ ...prev, [q._id]: response }));
    saveExamAnswer(attemptId, q._id, response).catch(() => {});
  };

  const toggleMarked = (qId) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const answeredCount = questions.filter((qq) => answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '').length;

  // Always full-screen — the exam route renders outside the app's Layout
  // (no sidebar/header), and this fixed overlay covers the full viewport
  // regardless of lockdown mode so nothing else is ever visible behind it.
  const shellClass = `fixed inset-0 z-[9999] bg-gray-100 flex flex-col h-screen overflow-hidden ${lockdownEnabled ? 'select-none' : ''}`;

  return (
    <div className={shellClass} style={lockdownEnabled ? { userSelect: 'none' } : undefined}>
      {/* ── Top Header Navigation Bar (Responsive layout to prevent overlap on mobile) ── */}
      <header className="bg-slate-900 text-white px-3.5 sm:px-6 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 shadow-md flex-shrink-0 z-30">
        {/* Top row / Left section */}
        <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0 w-full sm:w-auto">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex-shrink-0"
              title="Back to Exams"
            >
              <HiOutlineChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block sm:hidden">
                ASSESSMENT
              </span>
              <h1 className="text-xs sm:text-base font-bold text-white truncate max-w-[200px] xs:max-w-xs sm:max-w-md">
                {exam.title}
              </h1>
            </div>
          </div>

          {/* Mobile Timer Badge (Top Right on Mobile) */}
          <div className={`inline-flex sm:hidden items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold flex-shrink-0 transition-colors ${secondsLeft < 120 ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-800 text-slate-200 border border-slate-700/80'}`}>
            <HiOutlineClock className="w-3.5 h-3.5 text-blue-400" />
            <span>{formatTime(secondsLeft)}</span>
          </div>
        </div>

        {/* Bottom row on Mobile / Right section on Desktop */}
        <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden sm:inline-block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              ASSESSMENT
            </span>
            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
              {answeredCount} / {questions.length} Answered
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Secure badge — only shown when lockdown mode is actually enforcing it */}
            {lockdownEnabled && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <HiOutlineShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> SECURE
              </span>
            )}

            {/* Warnings badge if lockdown enabled */}
            {lockdownEnabled && violationCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {violationCount}/{maxViolations} WARN
              </span>
            )}

            {/* Desktop Timer Badge */}
            <div className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold transition-colors ${secondsLeft < 120 ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-800 text-slate-200 border border-slate-700/80 shadow-2xs'}`}>
              <HiOutlineClock className="w-4 h-4 text-blue-400" />
              <span>{formatTime(secondsLeft)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Shown until the candidate's first click/keypress lets us actually enter fullscreen */}
      {awaitingFsGesture && !warning && (
        <div className="bg-blue-50 border-b border-blue-200 text-blue-900 px-4 sm:px-6 py-2 text-xs font-medium flex items-center justify-center gap-2 flex-shrink-0">
          <HiOutlineShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>Click anywhere or press a key to enter the required fullscreen lockdown.</span>
        </div>
      )}

      {/* Warning banner if violation triggered */}
      {warning && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 sm:px-6 py-2 text-xs font-medium flex items-center justify-center gap-2 flex-shrink-0">
          <HiOutlineExclamationCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span><strong>Warning {warning.count}/{maxViolations}:</strong> {warning.message} {warning.remaining > 0 ? `${warning.remaining} more will auto-submit your exam.` : ''}</span>
        </div>
      )}

      {/* Glowing Test Completion Progress Bar at Top */}
      <div className="relative w-full h-1.5 bg-slate-800 flex-shrink-0 overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.8)]"
          style={{ width: `${Math.max(1, (answeredCount / questions.length) * 100)}%` }}
        />
      </div>

      {/* ── Main Workspace: Responsive Layout ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 flex flex-col overflow-y-auto md:overflow-hidden min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 flex-1 h-full min-h-0 md:overflow-hidden">
          
          {/* Mobile Question Horizontal Quick Navigator (Only shown < md) */}
          <div className="md:hidden bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex flex-col gap-2.5 flex-shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">QUESTIONS ({index + 1}/{questions.length})</span>
              <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                {Math.round((answeredCount / questions.length) * 100)}% Completed
              </span>
            </div>

            {/* Mobile Section Pills */}
            {hasSections && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none border-b border-slate-100">
                {sectionGroups.map((group, gi) => {
                  const secName = group.section || 'Ungrouped';
                  const secQuestions = group.items;
                  const answeredInSec = secQuestions.filter(qq => answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '').length;
                  const isCurrentSection = group.items.some(qq => qq._index === index);

                  return (
                    <button
                      key={gi}
                      onClick={() => setIndex(group.items[0]._index)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1.5 ${
                        isCurrentSection
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{secName}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-semibold ${isCurrentSection ? 'bg-blue-700 text-white' : 'bg-slate-200/80 text-slate-600'}`}>
                        {answeredInSec}/{secQuestions.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
              {(hasSections
                ? (sectionGroups.find(g => g.items.some(qq => qq._index === index))?.items || questions.map((qq, i) => ({ ...qq, _index: i })))
                : questions.map((qq, i) => ({ ...qq, _index: i }))
              ).map((qq) => {
                const i = qq._index;
                const isCurrent = i === index;
                const isAnswered = answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '';
                const isMarked = marked.has(qq._id);

                let btnCls = 'bg-slate-100 text-slate-600';
                if (isCurrent) {
                  btnCls = 'bg-blue-600 text-white font-bold ring-2 ring-blue-600/30';
                } else if (isMarked) {
                  btnCls = 'bg-amber-500 text-white font-bold';
                } else if (isAnswered) {
                  btnCls = 'bg-emerald-500 text-white font-bold';
                }

                return (
                  <button
                    key={qq._id}
                    onClick={() => setIndex(i)}
                    className={`w-8 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center flex-shrink-0 ${btnCls}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop Left Column: QUESTIONS Sidebar Panel (Hidden < md) - Expanded to 4 cols */}
          <aside className="hidden md:flex md:col-span-4 lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs flex-col justify-between space-y-6 h-full min-h-0 flex-shrink-0 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">QUESTIONS</span>
                <span className="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">
                  {Math.round((answeredCount / questions.length) * 100)}%
                </span>
              </div>

              {/* Sections Navigation inside Left Panel */}
              {hasSections && (
                <div className="space-y-2 border-b border-slate-100 pb-3">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    SECTIONS
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {sectionGroups.map((group, gi) => {
                      const secName = group.section || 'Ungrouped';
                      const secQuestions = group.items;
                      const answeredInSec = secQuestions.filter(qq => answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '').length;
                      const isCurrentSection = group.items.some(qq => qq._index === index);

                      return (
                        <button
                          key={gi}
                          type="button"
                          onClick={() => setIndex(group.items[0]._index)}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-between ${
                            isCurrentSection
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">{secName}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isCurrentSection ? 'bg-blue-700 text-white' : 'bg-slate-200/70 text-slate-600'}`}>
                            {answeredInSec}/{secQuestions.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Questions Grid Bubbles — ONLY show questions for the active selected section */}
              <div className="space-y-4">
                {(hasSections
                  ? sectionGroups.filter((group) => group.items.some((qq) => qq._index === index))
                  : sectionGroups
                ).map((group, gi) => (
                  <div key={gi} className="space-y-2">
                    {hasSections && (
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                        {group.section || 'Ungrouped'} Questions
                      </span>
                    )}
                    <div className="grid grid-cols-6 gap-2">
                      {group.items.map((qq) => {
                        const i = qq._index;
                        const isCurrent = i === index;
                        const isAnswered = answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '';
                        const isMarked = marked.has(qq._id);

                        let btnCls = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
                        if (isCurrent) {
                          btnCls = 'bg-blue-600 text-white font-bold shadow-2xs ring-2 ring-blue-600/30';
                        } else if (isMarked) {
                          btnCls = 'bg-amber-500 text-white font-bold shadow-2xs';
                        } else if (isAnswered) {
                          btnCls = 'bg-emerald-500 text-white font-bold shadow-2xs';
                        }

                        return (
                          <button
                            key={qq._id}
                            onClick={() => setIndex(i)}
                            className={`w-9 h-9 rounded-full text-xs font-bold transition-all flex items-center justify-center ${btnCls}`}
                          >
                            {i + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Color Key / Legend */}
            <div className="border-t border-slate-100 pt-4 space-y-2 text-[11px] font-semibold text-slate-600">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                <span>Marked for review</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 flex-shrink-0" />
                <span>Current</span>
              </div>
            </div>
          </aside>

          {/* Main Column: MAIN QUESTION DISPLAY */}
          <section className="md:col-span-8 lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col h-full overflow-hidden min-h-0">
            
            {/* Question Header Row */}
            <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-white rounded-t-2xl z-10">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {q.section && (
                  <span className="text-[10px] sm:text-[11px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">
                    {q.section}
                  </span>
                )}
                <span className="text-xs sm:text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  QUESTION {index + 1} <span className="text-slate-400 font-semibold">OF {questions.length}</span>
                </span>
                <span className="text-[10px] sm:text-xs font-semibold text-slate-400 border-l border-slate-200 pl-2 sm:pl-3">
                  1 mark
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleMarked(q._id)}
                className={`rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${
                  marked.has(q._id)
                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <HiOutlineBookmark className={`w-3.5 h-3.5 ${marked.has(q._id) ? 'fill-amber-500 text-amber-600' : 'text-slate-400'}`} />
                {marked.has(q._id) ? 'MARKED' : 'REVIEW'}
              </Button>
            </div>

            {/* Inner Question Scroll Body */}
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 min-h-0">
              <QuestionPlayer question={q} response={answers[q._id]} onChange={setResponse} />
            </div>

            {/* Bottom Footer Actions */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 flex items-center justify-between gap-2 flex-shrink-0 bg-white rounded-b-2xl z-10">
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-slate-400">
                <HiOutlineCheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
                <span className="hidden xs:inline">Autosave enabled</span>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  className="rounded-xl px-3 sm:px-5 border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs"
                >
                  <HiOutlineChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-0.5 sm:mr-1" /> PREV
                </Button>

                {index < questions.length - 1 ? (
                  <Button
                    size="sm"
                    onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                    className="rounded-xl px-4 sm:px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-2xs text-xs"
                  >
                    NEXT <HiOutlineChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5 sm:ml-1" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="rounded-xl px-5 sm:px-7 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs text-xs"
                  >
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

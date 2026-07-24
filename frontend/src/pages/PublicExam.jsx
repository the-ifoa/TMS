import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineClock, HiOutlineChevronLeft, HiOutlineChevronRight,
  HiOutlineShieldCheck, HiOutlineExclamationCircle, HiOutlineBookmark,
  HiOutlineCheckCircle, HiOutlineAcademicCap, HiOutlineLockClosed,
  HiOutlineArrowsExpand, HiOutlineShieldExclamation,
} from 'react-icons/hi';
import {
  getPublicExam, startPublicExam, savePublicAnswer, submitPublicExam,
  reportPublicViolation, getPublicExamResult,
} from '../api';
import QuestionPlayer from '../components/examPlayers/QuestionPlayer';
import logoImg from '../assets/logo.png';

function formatTime(total) {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function requestFullscreen(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  return fn ? fn.call(el) : Promise.reject(new Error('no fs'));
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

export default function PublicExam() {
  const { token } = useParams();
  const [phase, setPhase] = useState('loading'); // loading | landing | taking | done | error
  const [info, setInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [starting, setStarting] = useState(false);

  const loadInfo = useCallback(() => {
    getPublicExam(token)
      .then((res) => { setInfo(res.data); setPhase('landing'); })
      .catch((err) => { setErrorMsg(err.response?.data?.error || 'This exam link is invalid.'); setPhase('error'); });
  }, [token]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  const beginAttempt = async () => {
    setStarting(true);
    if (info?.exam?.lockdown_enabled) requestFullscreen(document.documentElement).catch(() => {});
    try {
      const res = await startPublicExam(token);
      setActive(res.data);
      setPhase('taking');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start exam.');
    } finally {
      setStarting(false);
    }
  };

  const [active, setActive] = useState(null); // { attempt, exam }

  if (phase === 'loading') {
    return <Centered><div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" /></Centered>;
  }
  if (phase === 'error') {
    return (
      <Centered>
        <div className="text-center space-y-3 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto"><HiOutlineExclamationCircle className="w-7 h-7" /></div>
          <h1 className="text-lg font-black text-slate-900">Can't open this exam</h1>
          <p className="text-sm text-slate-500">{errorMsg}</p>
        </div>
      </Centered>
    );
  }
  if (phase === 'landing') {
    return <Landing info={info} onBegin={beginAttempt} starting={starting} onViewResult={() => { setActive({ resultOnly: info.last_attempt_id }); setPhase('done'); }} />;
  }
  if (phase === 'done') {
    return <ResultSummary token={token} attemptId={active?.resultOnly} />;
  }
  // taking
  return (
    <TakeShell
      token={token}
      initial={active}
      onFinished={() => setPhase('done')}
      setResultAttempt={(id) => setActive({ resultOnly: id })}
    />
  );
}

function Centered({ children }) {
  return <div className="fixed inset-0 bg-gray-100 flex items-center justify-center p-6">{children}</div>;
}

// ─── Landing card ─────────────────────────────────────────────────────────────
function Landing({ info, onBegin, starting, onViewResult }) {
  const { exam, participant_name, attempts_left, active_attempt_id, status, last_attempt_id } = info;
  const noAttemptsLeft = attempts_left <= 0 && !active_attempt_id;

  return (
    <div className="fixed inset-0 bg-gray-100 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="IFOA" className="h-9 w-auto" />
            <div className="h-8 w-px bg-slate-200" />
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Exam Invitation</span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{exam.title}</h1>
            {exam.description && <p className="text-sm text-slate-500 leading-relaxed">{exam.description}</p>}
          </div>

          <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-2.5">
            <Row label="Candidate" value={participant_name} />
            <Row label="Questions" value={exam.question_count} />
            <Row label="Time allowed" value={exam.duration_minutes ? `${exam.duration_minutes} minutes` : 'No limit'} />
            <Row label="Attempts left" value={attempts_left} />
            <Row label="Pass mark" value={`${exam.pass_percentage}%`} />
          </div>

          {exam.lockdown_enabled && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200/80 p-4 space-y-1.5 text-xs text-amber-900">
              <p className="flex items-start gap-2 font-bold"><HiOutlineLockClosed className="w-4 h-4 flex-shrink-0 mt-0.5" /> This exam runs in a locked fullscreen session.</p>
              <p className="flex items-start gap-2"><HiOutlineShieldExclamation className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" /> Exiting fullscreen or switching tabs is recorded as a violation, and too many will auto-submit your exam.</p>
            </div>
          )}

          {noAttemptsLeft ? (
            <div className="space-y-3">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200/80 p-4 text-sm font-semibold text-emerald-800 flex items-center gap-2">
                <HiOutlineCheckCircle className="w-5 h-5" /> You have completed this exam.
              </div>
              {last_attempt_id && (
                <button onClick={onViewResult} className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-all">
                  View My Result
                </button>
              )}
            </div>
          ) : (
            <button onClick={onBegin} disabled={starting}
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all shadow-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {exam.lockdown_enabled ? <HiOutlineArrowsExpand className="w-4 h-4" /> : <HiOutlineAcademicCap className="w-4 h-4" />}
              {starting ? 'Starting…' : active_attempt_id ? 'Resume Exam' : exam.lockdown_enabled ? 'Start Exam in Fullscreen' : 'Start Exam'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}

// ─── Take shell (self-contained; mirrors the airline ExamTake) ────────────────
function TakeShell({ token, initial, onFinished, setResultAttempt }) {
  const attempt = initial.attempt;
  const exam = initial.exam;
  const attemptId = attempt.id || attempt._id;
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
  const [violationCount, setViolationCount] = useState(0);
  const [warning, setWarning] = useState(null);
  const [awaitingFsGesture, setAwaitingFsGesture] = useState(false);
  const finishedRef = useRef(false);
  const violationLockRef = useRef(false);

  const lockdownEnabled = exam.lockdown_enabled;
  const maxViolations = exam.max_violations || 4;
  const q = questions[index];

  const handleSubmit = useMemo(() => async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitting(true);
    try {
      if (isFullscreen()) await exitFullscreen().catch(() => {});
      await submitPublicExam(token, attemptId);
      setResultAttempt(attemptId);
      onFinished();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit.');
      finishedRef.current = false;
      setSubmitting(false);
    }
  }, [token, attemptId, onFinished, setResultAttempt]);

  const reportViolation = useCallback(async (type) => {
    if (finishedRef.current || violationLockRef.current) return;
    violationLockRef.current = true;
    try {
      const res = await reportPublicViolation(token, attemptId, type);
      const count = res.data.violation_count ?? 0;
      setViolationCount(count);
      if (res.data.auto_submitted_now) {
        finishedRef.current = true;
        toast.error('Exam auto-submitted — too many violations.');
        setResultAttempt(attemptId);
        onFinished();
        return;
      }
      setWarning({ message: VIOLATION_LABEL[type] || 'Violation detected.', remaining: Math.max(0, maxViolations - count), count });
      setTimeout(() => setWarning((w) => (w?.count === count ? null : w)), 6000);
    } catch { /* ignore */ } finally {
      setTimeout(() => { violationLockRef.current = false; }, 1200);
    }
  }, [token, attemptId, maxViolations, onFinished, setResultAttempt]);

  // Lockdown listeners
  useEffect(() => {
    if (!lockdownEnabled) return;
    let pendingReenter = false;
    const reenter = () => {
      pendingReenter = false;
      document.removeEventListener('pointerdown', reenter, true);
      document.removeEventListener('keydown', reenter, true);
      if (!isFullscreen() && !finishedRef.current) requestFullscreen(document.documentElement).catch(() => {});
    };
    const armReenter = () => {
      setAwaitingFsGesture(true);
      if (pendingReenter) return;
      pendingReenter = true;
      document.addEventListener('pointerdown', reenter, true);
      document.addEventListener('keydown', reenter, true);
    };
    const onFsChange = () => {
      if (finishedRef.current) return;
      if (isFullscreen()) { pendingReenter = false; setAwaitingFsGesture(false); }
      else { reportViolation('fullscreen_exit'); requestFullscreen(document.documentElement).catch(() => armReenter()); }
    };
    const onVis = () => { if (document.hidden && !finishedRef.current) reportViolation('tab_switch'); };
    const blockDefault = (e) => e.preventDefault();
    const blockKeys = (e) => {
      const k = (e.key || '').toUpperCase();
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(k)) || (e.ctrlKey && ['U', 'P', 'S', 'C'].includes(k))) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('contextmenu', blockDefault);
    document.addEventListener('copy', blockDefault);
    document.addEventListener('keydown', blockKeys, true);
    if (!isFullscreen()) armReenter();
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('contextmenu', blockDefault);
      document.removeEventListener('copy', blockDefault);
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('pointerdown', reenter, true);
      document.removeEventListener('keydown', reenter, true);
    };
  }, [lockdownEnabled, reportViolation]);

  useEffect(() => () => { if (isFullscreen()) exitFullscreen().catch(() => {}); }, []);

  useEffect(() => {
    if (secondsLeft <= 0) { handleSubmit(); return; }
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft, handleSubmit]);

  const setResponse = (response) => {
    setAnswers((prev) => ({ ...prev, [q._id]: response }));
    savePublicAnswer(token, attemptId, q._id, response).catch(() => {});
  };
  const toggleMarked = (qId) => setMarked((prev) => { const n = new Set(prev); n.has(qId) ? n.delete(qId) : n.add(qId); return n; });
  const answeredCount = questions.filter((qq) => answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '').length;

  return (
    <div className={`fixed inset-0 z-[9999] bg-gray-100 flex flex-col h-screen overflow-hidden ${lockdownEnabled ? 'select-none' : ''}`}>
      <header className="bg-slate-900 text-white px-3.5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 border-b border-slate-800 shadow-md flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src={logoImg} alt="IFOA" className="h-6 w-auto bg-white rounded px-1 py-0.5 hidden sm:block" />
          <h1 className="text-xs sm:text-base font-bold text-white truncate max-w-[200px] sm:max-w-md">{exam.title}</h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">{answeredCount} / {questions.length}</span>
          {lockdownEnabled && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <HiOutlineShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> SECURE
            </span>
          )}
          {lockdownEnabled && violationCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30">{violationCount}/{maxViolations} WARN</span>
          )}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-full text-xs font-extrabold ${secondsLeft < 120 ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-800 text-slate-200 border border-slate-700/80'}`}>
            <HiOutlineClock className="w-4 h-4 text-blue-400" /><span>{formatTime(secondsLeft)}</span>
          </div>
        </div>
      </header>

      {awaitingFsGesture && !warning && (
        <div className="bg-blue-50 border-b border-blue-200 text-blue-900 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 flex-shrink-0">
          <HiOutlineShieldCheck className="w-4 h-4 text-blue-600" /> Click anywhere or press a key to enter the required fullscreen lockdown.
        </div>
      )}
      {warning && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 flex-shrink-0">
          <HiOutlineExclamationCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span><strong>Warning {warning.count}/{maxViolations}:</strong> {warning.message} {warning.remaining > 0 ? `${warning.remaining} more will auto-submit.` : ''}</span>
        </div>
      )}

      <div className="relative w-full h-1.5 bg-slate-800 flex-shrink-0 overflow-hidden">
        <div className="h-full bg-blue-500 transition-all duration-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" style={{ width: `${Math.max(1, (answeredCount / questions.length) * 100)}%` }} />
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 flex flex-col overflow-y-auto md:overflow-hidden min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 flex-1 h-full min-h-0 md:overflow-hidden">
          {/* Mobile nav */}
          <div className="md:hidden bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex flex-col gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {questions.map((qq, i) => {
                const isAnswered = answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '';
                let cls = 'bg-slate-100 text-slate-600';
                if (i === index) cls = 'bg-blue-600 text-white font-bold ring-2 ring-blue-600/30';
                else if (marked.has(qq._id)) cls = 'bg-amber-500 text-white font-bold';
                else if (isAnswered) cls = 'bg-emerald-500 text-white font-bold';
                return <button key={qq._id} onClick={() => setIndex(i)} className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${cls}`}>{i + 1}</button>;
              })}
            </div>
          </div>

          {/* Desktop nav */}
          <aside className="hidden md:flex md:col-span-3 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs flex-col justify-between h-full min-h-0 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Questions</span>
                <span className="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">{Math.round((answeredCount / questions.length) * 100)}%</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((qq, i) => {
                  const isAnswered = answers[qq._id] !== undefined && answers[qq._id] !== null && answers[qq._id] !== '';
                  let cls = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
                  if (i === index) cls = 'bg-blue-600 text-white font-bold ring-2 ring-blue-600/30';
                  else if (marked.has(qq._id)) cls = 'bg-amber-500 text-white font-bold';
                  else if (isAnswered) cls = 'bg-emerald-500 text-white font-bold';
                  return <button key={qq._id} onClick={() => setIndex(i)} className={`w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center ${cls}`}>{i + 1}</button>;
                })}
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4 space-y-2 text-[11px] font-semibold text-slate-600">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Answered</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Marked</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Current</div>
            </div>
          </aside>

          {/* Question panel */}
          <section className="md:col-span-9 bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col h-full overflow-hidden min-h-0">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-white">
              <div>
                {q.section && <span className="inline-block text-[10px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full mb-1">{q.section}</span>}
                <span className="text-[11px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-wider block">Question {index + 1} of {questions.length}</span>
              </div>
              <button onClick={() => toggleMarked(q._id)} className={`rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 border transition-all ${marked.has(q._id) ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                <HiOutlineBookmark className={`w-3.5 h-3.5 ${marked.has(q._id) ? 'fill-amber-500 text-amber-600' : 'text-slate-400'}`} />
                {marked.has(q._id) ? 'MARKED' : 'REVIEW'}
              </button>
            </div>
            <div className="p-4 sm:p-8 flex-1 overflow-y-auto space-y-6 min-h-0">
              <QuestionPlayer question={q} response={answers[q._id]} onChange={setResponse} />
            </div>
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 flex items-center justify-between gap-2 flex-shrink-0 bg-white">
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-slate-400">
                <HiOutlineCheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" /><span className="hidden xs:inline">Autosave on</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}
                  className="rounded-xl px-3 sm:px-5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs disabled:opacity-40 inline-flex items-center gap-1">
                  <HiOutlineChevronLeft className="w-3.5 h-3.5" /> PREV
                </button>
                {index < questions.length - 1 ? (
                  <button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                    className="rounded-xl px-4 sm:px-6 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1">
                    NEXT <HiOutlineChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={submitting}
                    className="rounded-xl px-5 sm:px-7 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-60">
                    {submitting ? 'Submitting…' : 'SUBMIT'}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

// ─── Result summary shown to the candidate after submit ───────────────────────
function ResultSummary({ token, attemptId }) {
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!attemptId) { setLoading(false); return; }
    getPublicExamResult(token, attemptId)
      .then((res) => setAttempt(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, attemptId]);

  if (loading) return <Centered><div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" /></Centered>;

  const pending = attempt && attempt.status === 'pending_review';
  const total = attempt?.answers?.length || 0;
  const correct = attempt?.answers?.filter((a) => a.is_correct === true).length || 0;
  const incorrect = attempt?.answers?.filter((a) => a.is_correct === false).length || 0;

  return (
    <div className="fixed inset-0 bg-gray-100 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8 text-center space-y-5">
          <img src={logoImg} alt="IFOA" className="h-9 w-auto mx-auto" />
          {!attempt ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto"><HiOutlineCheckCircle className="w-7 h-7" /></div>
              <h1 className="text-xl font-black text-slate-900">Exam Submitted</h1>
              <p className="text-sm text-slate-500">Your responses have been recorded. Thank you.</p>
            </>
          ) : pending ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto"><HiOutlineClock className="w-7 h-7" /></div>
              <h1 className="text-xl font-black text-slate-900">Submitted for Review</h1>
              <p className="text-sm text-slate-500">Your exam includes questions that require manual grading. Your final score will be available after review.</p>
            </>
          ) : (
            <>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${attempt.passed ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {attempt.passed ? <HiOutlineCheckCircle className="w-7 h-7" /> : <HiOutlineExclamationCircle className="w-7 h-7" />}
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900">{attempt.percentage}%</h1>
                <p className="text-xs font-bold text-slate-400 mt-0.5">{attempt.score} / {attempt.max_score} points</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-sm font-black ${attempt.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {attempt.passed ? 'Passed' : 'Not Passed'}
              </span>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <Stat label="Total" value={total} />
                <Stat label="Correct" value={correct} color="text-emerald-600" />
                <Stat label="Incorrect" value={incorrect} color="text-rose-600" />
              </div>
            </>
          )}
          <p className="text-xs text-slate-400 pt-2">You may now close this window.</p>
        </div>
      </div>
    </div>
  );
}
function Stat({ label, value, color = 'text-slate-900' }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 p-3">
      <p className={`text-xl font-black ${color}`}>{value}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

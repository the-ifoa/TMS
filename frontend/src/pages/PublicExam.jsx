import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineClock, HiOutlineExclamationCircle,
  HiOutlineCheckCircle, HiOutlineAcademicCap, HiOutlineLockClosed,
  HiOutlineArrowsExpand, HiOutlineShieldExclamation,
  HiOutlineCheck, HiOutlineX,
} from 'react-icons/hi';
import {
  getPublicExam, startPublicExam, savePublicAnswers, checkPublicAnswer, submitPublicExam,
  reportPublicViolation, getPublicExamResult,
} from '../api';
import ExamRunner from '../components/ExamRunner';
import { requestFullscreen, fullscreenSupported } from '@/lib/fullscreen';
import AnswerReviewList, { QuestionMap, SectionBreakdown } from '../components/AnswerReviewList';
import logoImg from '../assets/logo.png';

// "This tab is taking attempt X" — kept in sessionStorage, which survives a
// page refresh but not closing the tab. After a refresh the candidate goes
// straight back into the exam (no landing page) and the refresh is not counted
// as closing the window. Storage can be unavailable: then it just shows the
// landing page with "Resume Exam", as before.
const takingKey = (token) => `exam-taking:${token}`;
function readTaking(token) { try { return sessionStorage.getItem(takingKey(token)); } catch { return null; } }
function writeTaking(token, attemptId) {
  try {
    if (attemptId) sessionStorage.setItem(takingKey(token), attemptId);
    else sessionStorage.removeItem(takingKey(token));
  } catch { /* storage unavailable */ }
}

export default function PublicExam() {
  const { token } = useParams();
  const [phase, setPhase] = useState('loading'); // loading | landing | taking | done | error
  const [info, setInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [starting, setStarting] = useState(false);

  const loadInfo = useCallback(() => {
    getPublicExam(token)
      .then((res) => {
        setInfo(res.data);
        const activeId = res.data.active_attempt_id;
        // Refreshed mid-exam in this tab → resume right away.
        if (activeId && readTaking(token) === activeId) { beginAttempt({ refresh: true }); return; }
        if (!activeId) writeTaking(token, null);
        setPhase('landing');
      })
      .catch((err) => { setErrorMsg(err.response?.data?.error || 'This exam link is invalid.'); setPhase('error'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  // refresh: resuming after a page refresh — no fullscreen request (no click to
  // allow it; the exam asks for one) and the server doesn't count a window close.
  const beginAttempt = async ({ refresh = false } = {}) => {
    setStarting(true);
    if (!refresh && info?.exam?.lockdown_enabled && fullscreenSupported()) requestFullscreen(document.documentElement).catch(() => {});
    try {
      const res = await startPublicExam(token, refresh ? { resume: 'refresh' } : undefined);
      writeTaking(token, res.data.attempt.id || res.data.attempt._id);
      setActive(res.data);
      setPhase('taking');
      // Coming back after closing the window: say how many returns are left.
      const wc = res.data?.window_closes;
      if (wc?.limited && wc.count > 0) {
        toast(wc.left > 0
          ? `You closed the exam window. You can come back ${wc.left} more time${wc.left === 1 ? '' : 's'}; after that your attempt is submitted automatically.`
          : 'You closed the exam window. This is your last return: close it again and your attempt is submitted automatically.',
        { icon: '⚠️', duration: 9000 });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start exam.', { duration: 8000 });
      writeTaking(token, null);
      // Closed the window too often: the attempt is now submitted, so reload
      // the page state (it will offer the result instead of Resume).
      if (err.response?.data?.auto_submitted) loadInfo();
      else if (refresh) setPhase('landing');
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
      onFinished={() => { writeTaking(token, null); setPhase('done'); }}
      setResultAttempt={(id) => setActive({ resultOnly: id })}
    />
  );
}

function Centered({ children }) {
  return <div className="fixed inset-0 bg-gray-100 flex items-center justify-center p-6">{children}</div>;
}

// ─── Landing card ─────────────────────────────────────────────────────────────
function Landing({ info, onBegin, starting, onViewResult }) {
  const { exam, participant_name, attempts_left, active_attempt_id, status, last_attempt_id, scheduling_error, has_passed, awaiting_review, window_closes_left } = info;
  // No new attempt once passed, while an attempt awaits grading, or when none are left.
  const noAttemptsLeft = !active_attempt_id && (attempts_left <= 0 || has_passed || awaiting_review);
  const doneMessage = has_passed
    ? 'You have passed this exam.'
    : awaiting_review
      ? 'Your exam has been submitted and is under review. Your result will be available once it has been graded.'
      : 'You have completed this exam.';
  const resultLabel = awaiting_review ? 'View Submission Status' : 'View My Result';
  // iPhone Safari can't put a page in fullscreen; the lockdown still runs without it.
  const canFullscreen = fullscreenSupported();

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
            <Row label="Attempts left" value={has_passed ? 0 : (awaiting_review && attempts_left > 0 ? `${attempts_left} (after grading)` : attempts_left)} />
            <Row label="Pass mark" value={`${exam.pass_percentage}%`} />
          </div>

          {exam.lockdown_enabled && !noAttemptsLeft && !scheduling_error && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200/80 p-4 space-y-1.5 text-xs text-amber-900">
              {canFullscreen ? (
                <>
                  <p className="flex items-start gap-2 font-bold"><HiOutlineLockClosed className="w-4 h-4 flex-shrink-0 mt-0.5" /> This exam runs in a locked fullscreen session.</p>
                  <p className="flex items-start gap-2"><HiOutlineShieldExclamation className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" /> {exam.allow_tab_switch ? 'Exiting fullscreen is recorded as a violation' : 'Exiting fullscreen or switching tabs is recorded as a violation'}, and too many will auto submit your exam.</p>
                </>
              ) : (
                <>
                  <p className="flex items-start gap-2 font-bold"><HiOutlineLockClosed className="w-4 h-4 flex-shrink-0 mt-0.5" /> This exam runs in a locked session.</p>
                  <p className="flex items-start gap-2"><HiOutlineShieldExclamation className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" /> {exam.allow_tab_switch ? 'Your device cannot lock the screen to fullscreen.' : 'Leaving this page (switching apps or tabs, locking the screen) is recorded as a violation'}{exam.allow_tab_switch ? '' : ', and too many will auto submit your exam.'}</p>
                </>
              )}
            </div>
          )}

          {exam.limit_window_closes && !noAttemptsLeft && !scheduling_error && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200/80 p-4 text-xs text-amber-900">
              <p className="flex items-start gap-2">
                <HiOutlineShieldExclamation className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <span>
                  <span className="font-bold">Do not close this window during the exam.</span>{' '}
                  {exam.max_window_closes > 0
                    ? `If you close it, you can come back ${exam.max_window_closes} time${exam.max_window_closes === 1 ? '' : 's'}; after that your attempt is submitted automatically. Refreshing the page is fine.`
                    : 'If you close it, your attempt is submitted automatically. Refreshing the page is fine.'}
                  {window_closes_left != null && (
                    <span className="block mt-1 font-bold">
                      {window_closes_left > 0 ? `Returns left on this attempt: ${window_closes_left}` : 'No returns left: resuming now will submit your attempt.'}
                    </span>
                  )}
                </span>
              </p>
            </div>
          )}

          {noAttemptsLeft ? (
            <div className="space-y-3">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200/80 p-4 text-sm font-semibold text-emerald-800 flex items-center gap-2">
                <HiOutlineCheckCircle className="w-5 h-5" /> {doneMessage}
              </div>
              {last_attempt_id && (
                <button onClick={onViewResult} className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-all">
                  {resultLabel}
                </button>
              )}
            </div>
          ) : scheduling_error ? (
            <div className="rounded-2xl bg-blue-50 border border-blue-200/80 p-4 text-sm font-semibold text-blue-800 flex items-center gap-2">
              <HiOutlineClock className="w-5 h-5 flex-shrink-0" /> {scheduling_error}
            </div>
          ) : (
            <button onClick={onBegin} disabled={starting}
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all shadow-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {exam.lockdown_enabled && canFullscreen ? <HiOutlineArrowsExpand className="w-4 h-4" /> : <HiOutlineAcademicCap className="w-4 h-4" />}
              {starting ? 'Starting…' : active_attempt_id ? 'Resume Exam' : exam.lockdown_enabled && canFullscreen ? 'Start Exam in Fullscreen' : 'Start Exam'}
            </button>
          )}

          {/* A finished attempt's result stays reachable even while another attempt is open */}
          {!noAttemptsLeft && last_attempt_id && (
            <button onClick={onViewResult} className="w-full py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold transition-all">
              View My Previous Result
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

// ─── Take shell — delegates to the shared ExamRunner (identical to airline) ───
function TakeShell({ token, initial, onFinished, setResultAttempt }) {
  const attempt = initial.attempt;
  const exam = initial.exam;
  const attemptId = attempt.id || attempt._id;

  return (
    <ExamRunner
      attempt={attempt}
      exam={exam}
      onSaveAnswers={(payload, opts) => savePublicAnswers(token, attemptId, payload, opts)}
      onCheckAnswer={(qId, response) => checkPublicAnswer(token, attemptId, qId, response).then((r) => r.data)}
      onSubmit={() => submitPublicExam(token, attemptId)}
      onReportViolation={(type) => reportPublicViolation(token, attemptId, type).then((r) => r.data)}
      onFinished={() => { setResultAttempt(attemptId); onFinished(); }}
    />
  );
}

// ─── Result summary shown to the candidate after submit ───────────────────────
// Website colours: light grey page (primary-100), the score card in brand navy
// (primary-800) with a brand-blue score ring; everything you read (review,
// map) sits on white cards. Green / red only ever mean correct / incorrect.
const DARK_CARD = 'relative overflow-hidden bg-primary-800 text-slate-200 rounded-3xl ring-1 ring-white/[0.08] shadow-[0_24px_50px_-20px_rgba(0,0,33,0.55)]';
const LIGHT_CARD = 'bg-white rounded-3xl ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.18)]';

function PageShell({ children }) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-primary-100 text-slate-800">
      <div className="relative min-h-full">{children}</div>
    </div>
  );
}

function ResultSummary({ token, attemptId }) {
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState(null); // question picked in the map → review opens + scrolls to it
  useEffect(() => {
    if (!attemptId) { setLoading(false); return; }
    getPublicExamResult(token, attemptId)
      .then((res) => setAttempt(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, attemptId]);

  if (loading) {
    return (
      <PageShell>
        <div className="min-h-[100dvh] flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
        </div>
      </PageShell>
    );
  }

  const pending = attempt && attempt.status === 'pending_review';
  // Survey (likert) questions are never scored, so they don't count as questions here.
  const scoredAnswers = (attempt?.answers || []).filter((a) => a.type !== 'likert');
  const total = scoredAnswers.length;
  const correct = scoredAnswers.filter((a) => a.is_correct === true).length;
  const incorrect = scoredAnswers.filter((a) => a.is_correct === false).length;

  const rawPct = attempt?.percentage != null
    ? Number(attempt.percentage)
    : (attempt?.max_score ? (attempt.score / attempt.max_score) * 100 : 0);
  const percentage = Math.min(100, Math.max(0, Math.round(rawPct * 10) / 10));
  const displayPercentage = Number.isInteger(percentage) ? percentage : percentage.toFixed(1);

  const showReview = !!attempt?.review_enabled;
  const R = 44;
  const C = 2 * Math.PI * R;

  // Summary card: logo, status / score. Stands alone when there is no answer
  // review, and becomes the sticky left column when there is.
  const summary = (
    <div className={`${DARK_CARD} p-5 sm:p-7 text-center`}>
      <div className="relative space-y-6">
      <img src={logoImg} alt="IFOA" className="h-7 sm:h-8 w-auto mx-auto [filter:brightness(0)_invert(1)] opacity-90" />

      {attempt?.auto_submitted && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-400/25 p-3 text-xs font-medium text-rose-200 text-left flex items-start gap-2">
          <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-300" />
          <span>
            {attempt.auto_submit_reason === 'window_closed'
              ? `Your exam was submitted automatically because the exam window was closed more times than allowed (${attempt.window_close_count || ''} times).`
              : `Your exam was submitted automatically because the lockdown limit was reached (leaving fullscreen or switching tabs ${attempt.violation_count || attempt.violations?.length || ''} times).`}
          </span>
        </div>
      )}

      {!attempt ? (
        <div className="space-y-3 py-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 flex items-center justify-center mx-auto">
            <HiOutlineCheckCircle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white">Exam submitted</h1>
          <p className="text-sm text-slate-400">Your responses have been recorded successfully. Thank you.</p>
        </div>
      ) : pending ? (
        <div className="space-y-3 py-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30 flex items-center justify-center mx-auto">
            <HiOutlineClock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white">Submitted for review</h1>
          <p className="text-sm text-slate-400">Your exam contains questions that require instructor review. Your final score will be published once grading is complete.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Score ring */}
          <div className="relative w-36 h-36 mx-auto select-none">
            <svg className="relative w-36 h-36 -rotate-90" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="scoreRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="transparent" />
              <circle cx="50" cy="50" r={R} stroke="url(#scoreRing)" strokeWidth="6" strokeLinecap="round" fill="transparent"
                strokeDasharray={C} strokeDashoffset={C - (percentage / 100) * C}
                className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`${String(displayPercentage).length > 4 ? 'text-2xl' : 'text-3xl'} font-bold text-white tracking-tight tabular-nums`}>
                {displayPercentage}<span className="text-lg text-slate-400">%</span>
              </span>
              <span className="text-[10px] font-semibold uppercase text-slate-500 mt-0.5 tracking-[0.2em]">Score</span>
            </div>
          </div>

          {/* Status + points */}
          <div className="space-y-2">
            <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ring-1 ${
              attempt.passed ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30' : 'bg-rose-500/15 text-rose-300 ring-rose-400/30'}`}>
              {attempt.passed ? <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" /> : <HiOutlineX className="w-3.5 h-3.5 stroke-[3]" />}
              {attempt.passed ? 'Passed' : 'Not passed'}
            </span>
            <p className="text-xs text-slate-400">
              {attempt.score != null && attempt.max_score != null
                ? <><span className="font-semibold text-slate-200 tabular-nums">{attempt.score}</span> of {attempt.max_score} points</>
                : `${correct} of ${total} questions correct`}
            </p>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
            {[
              ['Total', total, 'text-white'],
              ['Correct', correct, 'text-emerald-300'],
              ['Incorrect', incorrect, 'text-rose-300'],
            ].map(([label, value, tone]) => (
              <div key={label} className="py-3.5">
                <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="pt-4 border-t border-white/10 text-xs text-slate-500">You may now close this window.</p>
      </div>
    </div>
  );

  if (!showReview) {
    return (
      <PageShell>
        {/* Full screen height (min-h-full can't resolve inside the scroll box),
            so the card sits in the middle of the window both ways. */}
        <div className="w-full min-h-[100dvh] flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md mx-auto">{summary}</div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="w-full max-w-7xl mx-auto px-3 py-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] gap-4 sm:gap-5 lg:gap-6 items-start">
          {/* Left: result summary + question map + section scores. Stays in
              view (scrolling on its own if taller than the screen) while the
              review scrolls. Phones: score → review → map/sections (the aside
              "dissolves" into the grid so its cards sit either side of the review). */}
          <aside className="contents lg:block lg:space-y-4 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:overflow-y-auto lg:-mx-5 lg:px-5 lg:-mt-4 lg:pt-4 lg:pb-10 [scrollbar-width:thin]">
            <div className="order-1 lg:order-none">{summary}</div>
            <div className={`${LIGHT_CARD} p-5 space-y-5 order-3 lg:order-none`}>
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500 mb-3">Questions</h3>
                <QuestionMap attempt={attempt} onPick={(qid) => setFocus({ qid, at: Date.now() })} />
              </div>
              <SectionBreakdown attempt={attempt} />
            </div>
          </aside>

          {/* Right: answer review */}
          <main className={`${LIGHT_CARD} p-4 sm:p-6 lg:p-7 min-w-0 order-2 lg:order-none`}>
            <AnswerReviewList attempt={attempt} focus={focus} />
          </main>
        </div>
      </div>
    </PageShell>
  );
}

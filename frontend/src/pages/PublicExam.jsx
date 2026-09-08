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
  getPublicExam, startPublicExam, savePublicAnswer, submitPublicExam,
  reportPublicViolation, getPublicExamResult,
} from '../api';
import ExamRunner from '../components/ExamRunner';
import logoImg from '../assets/logo.png';

function requestFullscreen(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  return fn ? fn.call(el) : Promise.reject(new Error('no fs'));
}

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
  const { exam, participant_name, attempts_left, active_attempt_id, status, last_attempt_id, scheduling_error } = info;
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
              <p className="flex items-start gap-2"><HiOutlineShieldExclamation className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" /> Exiting fullscreen or switching tabs is recorded as a violation, and too many will auto submit your exam.</p>
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
          ) : scheduling_error ? (
            <div className="rounded-2xl bg-blue-50 border border-blue-200/80 p-4 text-sm font-semibold text-blue-800 flex items-center gap-2">
              <HiOutlineClock className="w-5 h-5 flex-shrink-0" /> {scheduling_error}
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

// ─── Take shell — delegates to the shared ExamRunner (identical to airline) ───
function TakeShell({ token, initial, onFinished, setResultAttempt }) {
  const attempt = initial.attempt;
  const exam = initial.exam;
  const attemptId = attempt.id || attempt._id;

  return (
    <ExamRunner
      attempt={attempt}
      exam={exam}
      onSaveAnswer={(qId, response) => savePublicAnswer(token, attemptId, qId, response).catch(() => {})}
      onSubmit={() => submitPublicExam(token, attemptId)}
      onReportViolation={(type) => reportPublicViolation(token, attemptId, type).then((r) => r.data)}
      onFinished={() => { setResultAttempt(attemptId); onFinished(); }}
    />
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

  const rawPct = attempt?.percentage != null
    ? Number(attempt.percentage)
    : (attempt?.max_score ? (attempt.score / attempt.max_score) * 100 : 0);
  const percentage = Math.min(100, Math.max(0, Math.round(rawPct * 10) / 10));
  const displayPercentage = Number.isInteger(percentage) ? percentage : percentage.toFixed(1);

  return (
    <div className="fixed inset-0 bg-slate-100/90 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-xl p-7 sm:p-8 text-center space-y-6">
          <img src={logoImg} alt="IFOA" className="h-9 w-auto mx-auto" />

          {!attempt ? (
            <div className="space-y-3 py-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <HiOutlineCheckCircle className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-black text-slate-900">Exam Submitted</h1>
              <p className="text-xs text-slate-500 font-medium">Your responses have been recorded successfully. Thank you.</p>
            </div>
          ) : pending ? (
            <div className="space-y-3 py-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <HiOutlineClock className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-black text-slate-900">Submitted for Review</h1>
              <p className="text-xs text-slate-500 font-medium">Your exam contains questions that require instructor review. Your final score will be published once grading is complete.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Score Circular Gauge */}
              <div className="relative w-28 h-28 mx-auto flex items-center justify-center select-none">
                <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="#f1f5f9"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke={attempt.passed ? '#10b981' : '#f43f5e'}
                    strokeWidth="7"
                    strokeDasharray={2 * Math.PI * 42}
                    strokeDashoffset={2 * Math.PI * 42 - (percentage / 100) * (2 * Math.PI * 42)}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className={`${String(displayPercentage).length > 4 ? 'text-xl' : 'text-2xl'} font-black text-slate-900 leading-none tracking-tight`}>
                    {displayPercentage}%
                  </span>
                  <span className="text-[9px] font-black uppercase text-slate-400 mt-1 tracking-wider">
                    SCORE
                  </span>
                </div>
              </div>

              {/* Status and Points */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-center">
                  <span className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border shadow-2xs ${
                    attempt.passed
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {attempt.passed ? (
                      <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" />
                    ) : (
                      <HiOutlineX className="w-3.5 h-3.5 stroke-[3]" />
                    )}
                    {attempt.passed ? 'PASSED' : 'NOT PASSED'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  {attempt.score != null && attempt.max_score != null
                    ? `${attempt.score} of ${attempt.max_score} Total Points`
                    : `${correct} of ${total} Questions Correct`}
                </p>
              </div>

              {/* KPI Performance Tiles */}
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3 text-center">
                  <p className="text-lg font-black text-slate-900">{total}</p>
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5">Total</p>
                </div>
                <div className="rounded-2xl bg-emerald-50/50 border border-emerald-200/70 p-3 text-center">
                  <p className="text-lg font-black text-emerald-600">{correct}</p>
                  <p className="text-[10px] font-extrabold text-emerald-600/80 uppercase tracking-wider mt-0.5">Correct</p>
                </div>
                <div className="rounded-2xl bg-rose-50/50 border border-rose-200/70 p-3 text-center">
                  <p className="text-lg font-black text-rose-600">{incorrect}</p>
                  <p className="text-[10px] font-extrabold text-rose-600/80 uppercase tracking-wider mt-0.5">Incorrect</p>
                </div>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-400 font-medium">
            <span>You may now close this window.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

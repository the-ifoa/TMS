import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  HiChevronLeft, HiChevronRight, HiOutlineBookmark, HiBookmark, HiOutlineViewList,
  HiOutlineQuestionMarkCircle, HiOutlineExclamationCircle, HiCheck,
} from 'react-icons/hi';
import { getPublicFeedback, submitPublicFeedback } from '../api';
import welcomeImg from '../assets/feedback/welcome.jpg';
import qualityImg from '../assets/feedback/quality.jpg';
import materialsImg from '../assets/feedback/materials.jpg';
import instructorImg from '../assets/feedback/instructor.jpg';
import overallImg from '../assets/feedback/overall.jpg';
import ideasImg from '../assets/feedback/ideas.jpg';
import ifoaLogo from '../assets/feedback/ifoa-logo.png';

// ─── Customer Training Feedback — public survey (/feedback/:token) ────────────
// Opened from the emailed link, no login. Follows IFOA's iSpring survey: welcome
// → your details → intro letter → one page per question group → Submit All.
// The questions come from the server (backend/config/feedbackForm.js); this
// page only owns the pictures, keyed by each section's `image`.

const IMAGES = { quality: qualityImg, materials: materialsImg, instructor: instructorImg, overall: overallImg, ideas: ideasImg };
// Website colours: brand navy page / primary buttons, brand blue for selection.
const NAVY = '#000021';
const BLUE = '#0000ff';

// Section titles come from the form in capitals with a trailing ":" or "...":
// "1. TRAINING CONTENT AND MATERIALS:" → "1. Training Content and Materials".
const SMALL_WORDS = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'to', 'in', 'on', 'for', 'with']);
function prettyTitle(t) {
  const trimmed = String(t || '').replace(/(\.\.\.|…|:)\s*$/, '').trim();
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed.toLowerCase().split(' ').map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

function Spinner() {
  return <div className="w-8 h-8 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />;
}

// The survey window on the navy page: slim header (logo + title + actions),
// optional progress bar, a scrollable body and a footer for the buttons.
function Frame({ actions, footer, children, bodyRef, overlay, progress }) {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center px-2.5 py-3 sm:p-6" style={{ background: `radial-gradient(1200px 600px at 50% -10%, #12124a 0%, ${NAVY} 60%)` }}>
      <div className="w-full max-w-[780px] h-[calc(100dvh-24px)] sm:h-[calc(100dvh-48px)] max-h-[720px] bg-white rounded-2xl flex flex-col overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        <header className="h-14 flex-shrink-0 px-4 sm:px-6 flex items-center gap-3 border-b border-slate-100">
          <img src={ifoaLogo} alt="IFOA" className="h-5 sm:h-6 w-auto" />
          <span className="hidden sm:block w-px h-5 bg-slate-200" />
          <span className="hidden sm:block text-[13px] font-semibold text-slate-500 truncate">Customer Training Feedback</span>
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
        {progress != null && (
          <div className="h-1 flex-shrink-0 bg-slate-100">
            <div className="h-full transition-all duration-500" style={{ width: `${Math.round(progress * 100)}%`, background: BLUE }} />
          </div>
        )}
        <div className="relative flex-1 min-h-0">
          <div ref={bodyRef} className="h-full overflow-y-auto">{children}</div>
          {overlay}
        </div>
        <footer className="flex-shrink-0 border-t border-slate-100 bg-slate-50/70 px-4 sm:px-6 py-3 flex items-center gap-2.5 sm:gap-3">{footer}</footer>
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, arrow = true }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-[14px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0000ff]"
      style={{ background: NAVY }}
    >
      {children} {arrow && <HiChevronRight className="w-4 h-4 -mr-1" />}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled, className = '', ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg border border-slate-200 bg-white text-[14px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-40 disabled:hover:bg-white ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// Labelled text box.
function DetailField({ label, value, onChange, error }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-slate-700 mb-1.5">{label} <span className="text-rose-500">*</span></span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={200}
        className={`w-full h-11 rounded-lg border bg-white px-3.5 text-[15px] text-slate-900 outline-none transition-shadow focus:border-[#0000ff] focus:ring-2 focus:ring-[#0000ff]/15 ${error ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300'}`}
      />
    </label>
  );
}

function Radio({ checked, onChange, label, name }) {
  return (
    <label className="relative inline-flex items-center justify-center cursor-pointer p-2 rounded-full hover:bg-slate-100 transition-colors">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only peer" aria-label={label} />
      <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#0000ff]/30"
        style={{ borderColor: checked ? BLUE : '#94a3b8' }}>
        {checked && <span className="w-2.5 h-2.5 rounded-full" style={{ background: BLUE }} />}
      </span>
    </label>
  );
}

// Likert grid: a table on wide screens, one card per statement on phones.
function LikertGrid({ section, scale, ratings, setRating }) {
  return (
    <>
      <div className="hidden sm:block mt-6 rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-[36%]" />
              {scale.map((s) => (
                <th key={s.value} className="px-1 py-3 text-[11px] leading-tight font-semibold uppercase tracking-wide text-slate-500 text-center align-bottom">
                  {s.label.split(' ').map((w) => <span key={w} className="block">{w}</span>)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {section.statements.map((st) => (
              <tr key={st.key} className={`transition-colors ${ratings[st.key] ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}>
                <td className={`pl-4 pr-3 py-4 text-[15px] leading-snug text-slate-800 ${section.statements.length === 1 ? 'font-semibold' : ''}`}>{st.text}</td>
                {scale.map((s) => (
                  <td key={s.value} className="text-center">
                    <Radio name={st.key} label={s.label} checked={ratings[st.key] === s.value} onChange={() => setRating(st.key, s.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden space-y-3 mt-5">
        {section.statements.map((st) => (
          <fieldset key={st.key} className="rounded-xl border border-slate-200 p-3.5">
            <legend className={`float-left w-full text-[15px] leading-snug text-slate-800 mb-3 ${section.statements.length === 1 ? 'font-semibold' : ''}`}>{st.text}</legend>
            <div className="clear-both grid grid-cols-1 gap-1.5">
              {scale.map((s) => {
                const on = ratings[st.key] === s.value;
                return (
                  <label key={s.value} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${on ? 'border-[#0000ff] bg-blue-50/60' : 'border-slate-200'}`}>
                    <input type="radio" name={`m-${st.key}`} checked={on} onChange={() => setRating(st.key, s.value)} className="sr-only" />
                    <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white" style={{ borderColor: on ? BLUE : '#94a3b8' }}>
                      {on && <span className="w-2.5 h-2.5 rounded-full" style={{ background: BLUE }} />}
                    </span>
                    <span className={`text-[14px] ${on ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{s.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </>
  );
}

// Section label, heading and picture (picture on the right; on top on phones).
function QuestionHeader({ eyebrow, title, prompt, image }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-4 sm:gap-8">
      <div className="flex-1 min-w-0">
        {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: BLUE }}>{eyebrow}</p>}
        <h2 className="mt-1.5 text-[19px] sm:text-[21px] leading-snug font-bold whitespace-pre-line text-balance" style={{ color: NAVY }}>{title}</h2>
        {prompt && <p className="mt-2 text-[14px] leading-relaxed text-slate-500 text-balance">{prompt}</p>}
      </div>
      {image && <img src={image} alt="" className="w-full sm:w-[180px] h-[140px] sm:h-[120px] object-cover rounded-xl flex-shrink-0" />}
    </div>
  );
}

export default function PublicFeedback() {
  const { token } = useParams();
  const bodyRef = useRef(null);
  const [state, setState] = useState({ phase: 'loading' }); // loading | error | ready
  const [step, setStep] = useState('welcome');              // welcome | details | intro | q | done
  const [qIndex, setQIndex] = useState(0);
  const [details, setDetails] = useState({ company: '', training_title: '', instructor_name: '' });
  const [detailErrors, setDetailErrors] = useState({});
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState('');
  const [bookmarks, setBookmarks] = useState(new Set());
  const [listOpen, setListOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    getPublicFeedback(token)
      .then((res) => {
        setState({ phase: 'ready', ...res.data });
        setDetails(res.data.prefill);
        if (res.data.status === 'submitted') setStep('done');
      })
      .catch((err) => setState({ phase: 'error', message: err.response?.data?.error || 'This feedback link is invalid.' }));
  }, [token]);

  const form = state.form;
  // Pages: each Likert section, then the free-text question.
  const pages = useMemo(() => (form ? [
    ...form.sections.map((s) => ({ kind: 'likert', section: s, label: prettyTitle(s.title) })),
    { kind: 'essay', essay: form.essay, label: 'Your comments' },
  ] : []), [form]);

  const isAnswered = (page) => (page.kind === 'likert'
    ? page.section.statements.every((st) => ratings[st.key])
    : comments.trim().length > 0);
  // Only the rating pages are required; the comments page is optional.
  const unanswered = pages.filter((p) => p.kind === 'likert' && !isAnswered(p));

  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [step, qIndex]);

  if (state.phase === 'loading') {
    return <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: NAVY }}><Spinner /></div>;
  }
  if (state.phase === 'error') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4" style={{ background: NAVY }}>
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto"><HiOutlineExclamationCircle className="w-7 h-7 text-rose-500" /></div>
          <p className="mt-4 text-[17px] font-semibold text-slate-800">{state.message}</p>
          <p className="mt-1 text-sm text-slate-500">Please use the link from your most recent email, or contact IFOA.</p>
        </div>
      </div>
    );
  }

  const setRating = (key, value) => setRatings((r) => ({ ...r, [key]: value }));

  const goDetails = () => {
    const errs = {};
    for (const k of ['company', 'training_title', 'instructor_name']) if (!details[k].trim()) errs[k] = true;
    setDetailErrors(errs);
    if (!Object.keys(errs).length) setStep('intro');
  };

  const submitAll = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitPublicFeedback(token, { ...details, ratings, comments });
      setConfirmOpen(false);
      setStep('done');
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Could not submit your feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Welcome ────────────────────────────────────────────────────────────────
  if (step === 'welcome') {
    const [first, ...rest] = form.welcome.heading;
    const ratingPages = pages.filter((p) => p.kind === 'likert').length;
    return (
      <Frame bodyRef={bodyRef} footer={<><span className="text-[13px] text-slate-500 hidden sm:inline">{form.welcome.hint}</span><div className="ml-auto"><PrimaryButton onClick={() => setStep('details')}>Start Survey</PrimaryButton></div></>}>
        <div className="min-h-full flex flex-col px-5 sm:px-10 py-6 sm:py-8">
          <img src={welcomeImg} alt="" className="w-full aspect-[16/7] object-cover rounded-xl" />
          <div className="flex-1 flex flex-col items-center justify-center text-center pt-7 pb-2">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: BLUE }}>{first}</p>
            <h1 className="mt-2 text-[26px] sm:text-[32px] leading-tight font-bold" style={{ color: NAVY }}>{rest.join(' ')}</h1>
            <p className="mt-3 max-w-md text-[14px] sm:text-[15px] leading-relaxed text-slate-500">
              Your feedback helps us improve every training we deliver. It takes only a few minutes.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-[12px] font-semibold text-slate-600">
              <span className="px-3 py-1 rounded-full bg-slate-100">{ratingPages} short sections</span>
              <span className="px-3 py-1 rounded-full bg-slate-100">About 3 minutes</span>
            </div>
            <p className="mt-5 text-[13px] text-slate-400 sm:hidden">{form.welcome.hint}</p>
          </div>
        </div>
      </Frame>
    );
  }

  // ── Your details ───────────────────────────────────────────────────────────
  if (step === 'details') {
    const field = (key, label) => (
      <DetailField label={label} value={details[key]} error={detailErrors[key]}
        onChange={(v) => { setDetails((d) => ({ ...d, [key]: v })); setDetailErrors((e) => ({ ...e, [key]: false })); }} />
    );
    return (
      <Frame bodyRef={bodyRef} footer={<><SecondaryButton onClick={() => setStep('welcome')}><HiChevronLeft className="w-4 h-4 -ml-1" /> Back</SecondaryButton><div className="ml-auto"><PrimaryButton onClick={goDetails}>Continue</PrimaryButton></div></>}>
        <div className="min-h-full flex flex-col items-center justify-center px-5 sm:px-10 py-10">
          <div className="w-full max-w-[420px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: BLUE }}>Your details</p>
            <h2 className="mt-1.5 text-[21px] sm:text-[23px] font-bold leading-snug" style={{ color: NAVY }}>{form.details_heading}</h2>
            <p className="mt-2 text-[14px] text-slate-500">These identify the training you are giving feedback on.</p>
            <div className="mt-7 space-y-4">
              {field('company', 'Company')}
              {field('training_title', 'Training title')}
              {field('instructor_name', 'Instructor name')}
              {Object.values(detailErrors).some(Boolean) && <p className="text-[13px] font-medium text-rose-600">Please fill in all fields marked *.</p>}
            </div>
          </div>
        </div>
      </Frame>
    );
  }

  // ── Intro letter ───────────────────────────────────────────────────────────
  if (step === 'intro') {
    const intro = form.intro;
    const bold = (t) => t.split(/(“[^”]+”)/).map((part, i) => (/^“/.test(part) ? <b key={i} className="text-slate-900">{part}</b> : part));
    return (
      <Frame bodyRef={bodyRef} footer={<><SecondaryButton onClick={() => setStep('details')}><HiChevronLeft className="w-4 h-4 -ml-1" /> Back</SecondaryButton><div className="ml-auto"><PrimaryButton onClick={() => { setQIndex(0); setStep('q'); }}>Begin</PrimaryButton></div></>}>
        <div className="max-w-[620px] mx-auto px-5 sm:px-10 py-8 sm:py-10 text-[15px] leading-relaxed text-slate-700 space-y-4">
          <p className="font-semibold text-slate-900">{intro.greeting}</p>
          {intro.paragraphs.map((p) => <p key={p}>{p}</p>)}
          <ul className="space-y-2.5 rounded-xl bg-slate-50 border border-slate-100 p-4 sm:p-5">
            {intro.bullets.map((b) => (
              <li key={b} className="flex gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BLUE }} />
                <span>{bold(b)}</span>
              </li>
            ))}
          </ul>
          <p>{intro.closing}</p>
          <div className="pt-2">
            <p className="text-slate-900 font-medium">{intro.signature}</p>
            <img src={ifoaLogo} alt="IFOA" className="w-[180px] max-w-full mt-3" />
          </div>
        </div>
      </Frame>
    );
  }

  // ── Thank you ──────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <Frame bodyRef={bodyRef} progress={1} footer={<span className="text-[13px] text-slate-500 py-2.5">You can now close this window.</span>}>
        <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 ring-8 ring-emerald-50/60 flex items-center justify-center">
            <div className="w-11 h-11 rounded-full bg-emerald-500 flex items-center justify-center"><HiCheck className="w-6 h-6 text-white" /></div>
          </div>
          <h2 className="mt-6 text-[22px] sm:text-[26px] font-bold" style={{ color: NAVY }}>Thank you!</h2>
          <p className="mt-3 max-w-[500px] text-[15px] sm:text-[16px] leading-relaxed text-slate-600 whitespace-pre-line">{form.thank_you}</p>
          {state.status === 'submitted' && state.submitted_at && (
            <p className="mt-4 text-[13px] text-slate-400">Submitted on {new Date(state.submitted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
          )}
        </div>
      </Frame>
    );
  }

  // ── Question pages ─────────────────────────────────────────────────────────
  const page = pages[qIndex];
  const isLast = qIndex === pages.length - 1;
  const toggleBookmark = () => setBookmarks((b) => { const n = new Set(b); n.has(qIndex) ? n.delete(qIndex) : n.add(qIndex); return n; });

  const actions = (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setListOpen((o) => !o)}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-[13px] font-semibold text-slate-600 transition-colors"
        >
          <HiOutlineViewList className="w-4 h-4" /> <span className="hidden xs:inline">Sections</span>
        </button>
        {listOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setListOpen(false)} />
            <ul className="absolute z-20 right-0 top-11 w-[290px] max-w-[85vw] bg-white rounded-xl shadow-xl border border-slate-200 p-1.5">
              {pages.map((p, i) => (
                <li key={p.label}>
                  <button
                    type="button"
                    onClick={() => { setQIndex(i); setListOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] hover:bg-slate-50 ${i === qIndex ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-700'}`}
                  >
                    <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold ${isAnswered(p) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {isAnswered(p) ? <HiCheck className="w-3.5 h-3.5" /> : i + 1}
                    </span>
                    <span className="flex-1 truncate">{p.label}</span>
                    {bookmarks.has(i) && <HiBookmark className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={toggleBookmark}
        aria-label={bookmarks.has(qIndex) ? 'Remove bookmark' : 'Bookmark this question'}
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
      >
        {bookmarks.has(qIndex) ? <HiBookmark className="w-4 h-4 text-amber-500" /> : <HiOutlineBookmark className="w-4 h-4" />}
      </button>
    </>
  );

  const footer = (
    <>
      <SecondaryButton onClick={() => setConfirmOpen(true)}>Submit all</SecondaryButton>
      <span className="ml-auto text-[13px] font-medium text-slate-500 hidden sm:inline tabular-nums">Step {qIndex + 1} of {pages.length}</span>
      <SecondaryButton onClick={() => setQIndex((i) => Math.max(0, i - 1))} disabled={qIndex === 0} aria-label="Previous step" className="ml-auto sm:ml-0 w-10 !px-0">
        <HiChevronLeft className="w-5 h-5" />
      </SecondaryButton>
      <PrimaryButton onClick={() => (isLast ? setConfirmOpen(true) : setQIndex((i) => i + 1))}>{isLast ? 'Finish' : 'Next'}</PrimaryButton>
    </>
  );

  const overlay = confirmOpen && (
    <div className="absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center px-4">
      <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-2xl p-6 sm:p-7 text-center">
        <div className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center ${unanswered.length ? 'bg-amber-50 text-amber-600' : 'bg-blue-50'}`} style={unanswered.length ? undefined : { color: BLUE }}>
          <HiOutlineQuestionMarkCircle className="w-7 h-7" />
        </div>
        {unanswered.length === 0 ? (
          <>
            <h3 className="mt-4 text-[18px] font-bold" style={{ color: NAVY }}>Submit your feedback?</h3>
            <p className="mt-1.5 text-[14px] text-slate-500">You have answered all questions. You can't change your answers after submitting.</p>
          </>
        ) : (
          <>
            <h3 className="mt-4 text-[18px] font-bold" style={{ color: NAVY }}>A few questions are unanswered</h3>
            <p className="mt-1.5 text-[14px] text-slate-500">Please answer every rating question before submitting:</p>
            <ul className="mt-3 space-y-1 text-[13px] font-medium text-slate-700">
              {unanswered.map((p) => <li key={p.label} className="rounded-lg bg-slate-50 px-3 py-1.5">{p.label}</li>)}
            </ul>
          </>
        )}
        {submitError && <p className="mt-3 text-[13px] font-medium text-rose-600">{submitError}</p>}
        <div className="mt-6 flex flex-col-reverse sm:flex-row justify-center gap-2">
          <SecondaryButton
            onClick={() => {
              setConfirmOpen(false);
              setSubmitError('');
              const first = pages.indexOf(unanswered[0]);
              if (first >= 0) setQIndex(first);
            }}
          >
            {unanswered.length ? 'Answer them' : 'Back to survey'}
          </SecondaryButton>
          {unanswered.length === 0 && (
            <PrimaryButton onClick={submitAll} disabled={submitting} arrow={false}>
              {submitting ? 'Submitting…' : 'Submit feedback'}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );

  const answeredCount = pages.filter((p) => p.kind === 'likert' && isAnswered(p)).length;
  const ratingCount = pages.filter((p) => p.kind === 'likert').length;
  return (
    <Frame bodyRef={bodyRef} actions={actions} footer={footer} overlay={overlay} progress={ratingCount ? answeredCount / ratingCount : 0}>
      <div className="px-5 sm:px-10 py-6 sm:py-8">
        {page.kind === 'likert' ? (
          <>
            <QuestionHeader eyebrow={`Step ${qIndex + 1} of ${pages.length}`} title={page.label} prompt={page.section.prompt} image={IMAGES[page.section.image]} />
            <LikertGrid section={page.section} scale={form.scale} ratings={ratings} setRating={setRating} />
          </>
        ) : (
          <>
            <QuestionHeader eyebrow={`Step ${qIndex + 1} of ${pages.length} · optional`} title={page.essay.text} image={IMAGES[page.essay.image]} />
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              maxLength={page.essay.max_length}
              rows={8}
              placeholder="Share any suggestions or comments…"
              className="mt-6 w-full rounded-xl border border-slate-300 focus:border-[#0000ff] focus:ring-2 focus:ring-[#0000ff]/15 outline-none p-3.5 text-[15px] text-slate-900 resize-none"
            />
            <p className="mt-1 text-right text-[12px] text-slate-400 tabular-nums">{comments.length}/{page.essay.max_length}</p>
          </>
        )}
      </div>
    </Frame>
  );
}

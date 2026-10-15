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
const NAVY = '#000021';

function Spinner() {
  return <div className="w-8 h-8 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />;
}

// The white survey window on the navy page, with fixed header / footer and a
// scrollable body (like the iSpring player).
function Frame({ header, footer, children, bodyRef, overlay }) {
  return (
    <div className="min-h-[100dvh] w-full flex justify-center px-2 sm:px-4 py-3 sm:py-7" style={{ background: NAVY }}>
      <div className="w-full max-w-[744px] h-[calc(100dvh-24px)] sm:h-[calc(100dvh-56px)] max-h-[676px] bg-white rounded-lg flex flex-col overflow-hidden shadow-2xl">
        <div className="h-[52px] flex-shrink-0 border-b border-slate-200 px-4 flex items-center gap-2.5">{header}</div>
        <div className="relative flex-1 min-h-0 m-3 border border-slate-200 rounded-sm">
          <div ref={bodyRef} className="h-full overflow-y-auto">{children}</div>
          {overlay}
        </div>
        <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3 flex items-center gap-3">{footer}</div>
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, green }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 h-10 pl-5 pr-3.5 rounded-md text-[17px] font-bold text-white transition-opacity disabled:opacity-50 ${green ? 'bg-[#3dd56d] hover:bg-[#33c461]' : 'hover:opacity-90'}`}
      style={green ? undefined : { background: NAVY }}
    >
      {children} <HiChevronRight className="w-5 h-5" />
    </button>
  );
}

// Floating-label text box, as on the iSpring details page.
function DetailField({ label, value, onChange, error }) {
  return (
    <label className={`block w-full rounded border px-3 pt-1.5 pb-1 bg-white transition-colors focus-within:border-[#4a7fd8] focus-within:ring-1 focus-within:ring-[#4a7fd8] ${error ? 'border-rose-400' : 'border-slate-300'}`}>
      <span className="block text-[11px] leading-tight text-slate-500">{label}*</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={200}
        className="w-full text-[16px] text-slate-900 outline-none bg-transparent py-0.5"
      />
    </label>
  );
}

function Radio({ checked, onChange, label, name }) {
  return (
    <label className="relative inline-flex items-center justify-center cursor-pointer p-1.5 rounded-full">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only peer" aria-label={label} />
      <span className={`w-[23px] h-[23px] rounded-full border-2 flex items-center justify-center bg-white transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#4a7fd8]/40 ${checked ? 'border-[#4a7fd8]' : 'border-slate-400'}`}>
        {checked && <span className="w-[13px] h-[13px] rounded-full bg-[#4a7fd8]" />}
      </span>
    </label>
  );
}

// Likert grid: a table on wide screens, one card per statement on phones.
function LikertGrid({ section, scale, ratings, setRating }) {
  return (
    <>
      <table className="hidden sm:table w-full border-separate border-spacing-y-[3px] mt-4">
        <thead>
          <tr>
            <th className="w-[34%]" />
            {scale.map((s) => (
              <th key={s.value} className="px-1 pb-1 text-[13px] leading-[1.05] font-bold text-slate-900 align-bottom text-center">
                {s.label.split(' ').map((w) => <span key={w} className="block">{w}</span>)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.statements.map((st) => (
            <tr key={st.key} className={`${ratings[st.key] ? 'bg-[#f0f0f0]' : 'bg-[#e8e8e8]'} hover:bg-[#e2e2e2] transition-colors`}>
              <td className={`px-2 py-5 text-[16px] leading-[1.5] text-slate-900 ${section.statements.length === 1 ? 'font-bold' : ''}`}>{st.text}</td>
              {scale.map((s) => (
                <td key={s.value} className="text-center">
                  <Radio name={st.key} label={s.label} checked={ratings[st.key] === s.value} onChange={() => setRating(st.key, s.value)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sm:hidden space-y-3 mt-4">
        {section.statements.map((st) => (
          <fieldset key={st.key} className="rounded-md bg-[#f0f0f0] p-3">
            <legend className={`float-left w-full text-[15px] leading-snug text-slate-900 mb-2 ${section.statements.length === 1 ? 'font-bold' : ''}`}>{st.text}</legend>
            <div className="clear-both grid grid-cols-1 gap-1">
              {scale.map((s) => (
                <label key={s.value} className={`relative flex items-center gap-2.5 rounded px-2 py-1.5 cursor-pointer ${ratings[st.key] === s.value ? 'bg-white' : ''}`}>
                  <input type="radio" name={`m-${st.key}`} checked={ratings[st.key] === s.value} onChange={() => setRating(st.key, s.value)} className="sr-only" />
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white ${ratings[st.key] === s.value ? 'border-[#4a7fd8]' : 'border-slate-400'}`}>
                    {ratings[st.key] === s.value && <span className="w-2.5 h-2.5 rounded-full bg-[#4a7fd8]" />}
                  </span>
                  <span className="text-[14px] text-slate-800">{s.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </>
  );
}

// Section heading + picture, side by side (stacked on phones).
function QuestionHeader({ title, prompt, image }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-4 sm:gap-6">
      <div className="flex-1 min-w-0 text-[18px] sm:text-[19px] leading-[1.45] text-[#4d4d4d] font-semibold whitespace-pre-line">
        {title}
        {prompt && <span className="block mt-5">{prompt}</span>}
      </div>
      {image && <img src={image} alt="" className="w-full sm:w-[190px] max-h-[160px] sm:max-h-none object-cover sm:object-contain flex-shrink-0" />}
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
    ...form.sections.map((s) => ({ kind: 'likert', section: s, label: s.title.replace(/(\.\.\.|:)\s*$/, '').trim() })),
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
        <div className="max-w-md w-full bg-white rounded-lg p-8 text-center">
          <HiOutlineExclamationCircle className="w-10 h-10 mx-auto text-rose-500" />
          <p className="mt-3 text-[17px] font-semibold text-slate-800">{state.message}</p>
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
    return (
      <Frame bodyRef={bodyRef} header={null} footer={<div className="ml-auto"><PrimaryButton onClick={() => setStep('details')}>Start Survey</PrimaryButton></div>}>
        <div className="min-h-full flex flex-col items-center justify-center px-5 sm:px-9 py-8 text-center">
          <h1 className="text-[24px] sm:text-[30px] leading-[1.35] text-[#4d4d4d] font-semibold">
            {form.welcome.heading.map((l) => <span key={l} className="block">{l}</span>)}
          </h1>
          <img src={welcomeImg} alt="" className="w-full mt-7 aspect-[654/332] object-cover" />
          <p className="mt-5 text-[16px] sm:text-[20px] text-black">{form.welcome.hint}</p>
        </div>
      </Frame>
    );
  }

  // ── Your details ───────────────────────────────────────────────────────────
  if (step === 'details') {
    return (
      <Frame bodyRef={bodyRef} header={null} footer={<div className="ml-auto"><PrimaryButton green onClick={goDetails}>Submit</PrimaryButton></div>}>
        <div className="min-h-full flex flex-col items-center justify-center px-5 py-10">
          <h2 className="text-[19px] font-semibold text-[#4d4d4d] text-center">{form.details_heading}</h2>
          <div className="w-full max-w-[382px] mt-14 space-y-3">
            <DetailField label="Company" value={details.company} error={detailErrors.company} onChange={(v) => { setDetails((d) => ({ ...d, company: v })); setDetailErrors((e) => ({ ...e, company: false })); }} />
            <DetailField label="Training Title" value={details.training_title} error={detailErrors.training_title} onChange={(v) => { setDetails((d) => ({ ...d, training_title: v })); setDetailErrors((e) => ({ ...e, training_title: false })); }} />
            <DetailField label="Instructor name" value={details.instructor_name} error={detailErrors.instructor_name} onChange={(v) => { setDetails((d) => ({ ...d, instructor_name: v })); setDetailErrors((e) => ({ ...e, instructor_name: false })); }} />
            {Object.values(detailErrors).some(Boolean) && <p className="text-[13px] text-rose-600">Please fill in all fields marked *.</p>}
          </div>
        </div>
      </Frame>
    );
  }

  // ── Intro letter ───────────────────────────────────────────────────────────
  if (step === 'intro') {
    const intro = form.intro;
    const bold = (t) => t.split(/(“[^”]+”)/).map((part, i) => (/^“/.test(part) ? <b key={i}>{part}</b> : part));
    return (
      <Frame bodyRef={bodyRef} header={null} footer={<div className="ml-auto"><PrimaryButton onClick={() => { setQIndex(0); setStep('q'); }}>Continue</PrimaryButton></div>}>
        <div className="px-6 sm:px-12 py-10 text-[16px] leading-[1.3] text-black space-y-5">
          <p>{intro.greeting}</p>
          {intro.paragraphs.map((p) => <p key={p}>{p}</p>)}
          <ul className="list-disc pl-10 space-y-2">
            {intro.bullets.map((b) => <li key={b}>{bold(b)}</li>)}
          </ul>
          <p>{intro.closing}</p>
          <div>
            <p>{intro.signature}</p>
            <img src={ifoaLogo} alt="IFOA" className="w-[262px] max-w-full mt-3" />
          </div>
        </div>
      </Frame>
    );
  }

  // ── Thank you ──────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <Frame bodyRef={bodyRef} header={null} footer={<span className="text-[13px] text-slate-500 py-2.5">You can now close this window.</span>}>
        <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className="w-14 h-14 rounded-full bg-[#3dd56d] flex items-center justify-center"><HiCheck className="w-8 h-8 text-white" /></div>
          <p className="mt-6 max-w-[520px] text-[17px] sm:text-[19px] leading-[1.5] text-[#4d4d4d] font-semibold whitespace-pre-line">{form.thank_you}</p>
          {state.status === 'submitted' && state.submitted_at && (
            <p className="mt-3 text-[13px] text-slate-500">Submitted on {new Date(state.submitted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
          )}
          <img src={ifoaLogo} alt="IFOA" className="w-[220px] max-w-full mt-8" />
        </div>
      </Frame>
    );
  }

  // ── Question pages ─────────────────────────────────────────────────────────
  const page = pages[qIndex];
  const isLast = qIndex === pages.length - 1;
  const toggleBookmark = () => setBookmarks((b) => { const n = new Set(b); n.has(qIndex) ? n.delete(qIndex) : n.add(qIndex); return n; });

  const header = (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setListOpen((o) => !o)}
          className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-slate-100 hover:bg-slate-200 text-[14px] text-slate-600 transition-colors"
        >
          <HiOutlineViewList className="w-4 h-4" /> Question List
        </button>
        {listOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setListOpen(false)} />
            <ul className="absolute z-20 left-0 top-10 w-[280px] max-w-[80vw] bg-white rounded-md shadow-xl border border-slate-200 py-1">
              {pages.map((p, i) => (
                <li key={p.label}>
                  <button
                    type="button"
                    onClick={() => { setQIndex(i); setListOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-slate-50 ${i === qIndex ? 'font-bold text-slate-900' : 'text-slate-700'}`}
                  >
                    <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] ${isAnswered(p) ? 'bg-[#3dd56d] text-white' : 'bg-slate-100 text-slate-500'}`}>
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
        className="inline-flex items-center justify-center w-11 h-8 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
      >
        {bookmarks.has(qIndex) ? <HiBookmark className="w-4 h-4 text-amber-500" /> : <HiOutlineBookmark className="w-4 h-4" />}
      </button>
    </>
  );

  const footer = (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="h-10 px-5 rounded-md bg-slate-100 hover:bg-slate-200 text-[15px] text-slate-600 transition-colors"
      >
        Submit All
      </button>
      <span className="ml-auto text-[14px] text-slate-600 hidden sm:inline">Question {qIndex + 1} of {pages.length}</span>
      <button
        type="button"
        onClick={() => setQIndex((i) => Math.max(0, i - 1))}
        disabled={qIndex === 0}
        aria-label="Previous question"
        className="ml-auto sm:ml-0 w-10 h-10 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 flex items-center justify-center text-slate-600"
      >
        <HiChevronLeft className="w-5 h-5" />
      </button>
      <PrimaryButton onClick={() => (isLast ? setConfirmOpen(true) : setQIndex((i) => i + 1))}>Next</PrimaryButton>
    </>
  );

  const overlay = confirmOpen && (
    <div className="absolute inset-0 z-20 bg-slate-900/30 flex items-center justify-center px-4">
      <div className="w-full max-w-[580px] bg-white shadow-2xl px-6 py-9 text-center">
        <HiOutlineQuestionMarkCircle className="w-7 h-7 mx-auto text-slate-700" />
        {unanswered.length === 0 ? (
          <p className="mt-4 text-[16px] text-[#000021]">You have answered all questions. Would you like to finish the Survey?</p>
        ) : (
          <>
            <p className="mt-4 text-[16px] text-[#000021]">
              Please answer every rating question before submitting. Still unanswered:
            </p>
            <ul className="mt-2 text-[14px] text-slate-600">
              {unanswered.map((p) => <li key={p.label}>{p.label}</li>)}
            </ul>
          </>
        )}
        {submitError && <p className="mt-3 text-[14px] text-rose-600">{submitError}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {unanswered.length === 0 && (
            <button
              type="button"
              onClick={submitAll}
              disabled={submitting}
              className="h-10 px-5 rounded-md text-[17px] font-bold text-white ring-2 ring-offset-2 ring-[#000021] disabled:opacity-60"
              style={{ background: NAVY }}
            >
              {submitting ? 'Submitting…' : 'Submit All'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setConfirmOpen(false);
              setSubmitError('');
              const first = pages.indexOf(unanswered[0]);
              if (first >= 0) setQIndex(first);
            }}
            className="h-10 px-5 rounded-md text-[17px] font-bold text-white"
            style={{ background: NAVY }}
          >
            Return to Survey
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <Frame bodyRef={bodyRef} header={header} footer={footer} overlay={overlay}>
      <div className="px-5 sm:px-12 py-8 sm:py-10">
        {page.kind === 'likert' ? (
          <>
            <QuestionHeader title={page.section.title} prompt={page.section.prompt} image={IMAGES[page.section.image]} />
            <LikertGrid section={page.section} scale={form.scale} ratings={ratings} setRating={setRating} />
          </>
        ) : (
          <div className="flex flex-col-reverse sm:flex-row gap-6">
            <div className="flex-1 min-w-0">
              <p className="text-[18px] sm:text-[19px] leading-[1.45] text-[#4d4d4d] font-semibold whitespace-pre-line">{page.essay.text}</p>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                maxLength={page.essay.max_length}
                rows={10}
                className="mt-7 w-full rounded border border-slate-300 focus:border-[#4a7fd8] focus:ring-1 focus:ring-[#4a7fd8] outline-none p-3 text-[16px] text-slate-900 resize-none"
              />
              <p className="text-right text-[12px] text-slate-400">{comments.length}/{page.essay.max_length}</p>
            </div>
            <img src={IMAGES[page.essay.image]} alt="" className="w-full sm:w-[213px] max-h-[160px] sm:max-h-none object-cover sm:object-contain sm:self-start flex-shrink-0" />
          </div>
        )}
      </div>

    </Frame>
  );
}

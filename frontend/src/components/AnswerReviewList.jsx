import { useEffect, useMemo, useState } from 'react';
import { HiOutlineCheck, HiOutlineX, HiOutlineLightBulb, HiChevronDown } from 'react-icons/hi';
import { correctAnswerText, responseText, TYPE_LABELS } from '../utils/examReview';

// Candidate-facing answer review: every question with the candidate's answer,
// whether it was right, the correct answer and the explanation. Only rendered
// when the exam has review enabled (the server withholds the answer key otherwise).
// QuestionMap and SectionBreakdown are the side-panel companions.

const CHOICE_TYPES = new Set(['mcq', 'true_false', 'select_list', 'multi_response']);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// The candidate's graded questions, in exam order: [{ q, a, n }].
export function reviewItems(attempt) {
  const questions = attempt.questions_snapshot || [];
  const byQ = {};
  (attempt.answers || []).forEach((a) => { byQ[String(a.question_id)] ??= a; });
  return questions
    .filter((q) => q.type !== 'likert' && byQ[String(q._id)])
    .map((q, i) => ({ q, a: byQ[String(q._id)], n: i + 1 }));
}

const statusOf = (a) => (a.is_correct === true ? 'correct' : a.is_correct === false ? 'incorrect' : 'pending');

function StatusChip({ a, className = '' }) {
  const s = statusOf(a);
  if (s === 'pending') return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 whitespace-nowrap ${
      s === 'correct' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-rose-50 text-rose-700 ring-rose-600/20'} ${className}`}>
      {s === 'correct' ? <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" /> : <HiOutlineX className="w-3.5 h-3.5 stroke-[3]" />}
      {s === 'correct' ? 'Correct' : 'Incorrect'}
    </span>
  );
}

// Choice questions: every option, with the candidate's pick and the right one marked.
function ChoiceOptions({ q, response }) {
  const picked = new Set([].concat(response ?? []).map(String));
  return (
    <ul className="space-y-1.5">
      {(q.options || []).map((o, i) => {
        const mine = picked.has(String(o._id));
        const right = !!o.is_correct;
        const tone = right
          ? 'ring-emerald-500/40 bg-emerald-50/80'
          : mine ? 'ring-rose-500/40 bg-rose-50/80' : 'ring-slate-200 bg-white';
        return (
          <li key={o._id || i} className={`flex items-start gap-3 rounded-xl ring-1 px-3 py-2.5 ${tone}`}>
            <span className={`w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
              right ? 'bg-emerald-600 text-white' : mine ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {LETTERS[i]}
            </span>
            <div className="flex-1 min-w-0 sm:flex sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-800 leading-snug break-words">{o.text}</p>
                {o.image_url && <img src={o.image_url} alt="" className="mt-2 max-h-32 rounded-lg ring-1 ring-slate-200" />}
              </div>
              {(mine || right) && (
                <span className={`mt-1 sm:mt-0.5 inline-block text-[10px] font-bold uppercase tracking-wide whitespace-nowrap flex-shrink-0 ${right ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {mine && right ? 'Your answer · Correct' : mine ? 'Your answer' : 'Correct answer'}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Everything else: "Your answer" next to "Correct answer".
function TextAnswers({ q, a }) {
  const mine = responseText(q, a.response);
  const correct = correctAnswerText(q);
  const showCorrect = a.is_correct === false && correct;
  return (
    <div className={`grid gap-2.5 ${showCorrect ? 'sm:grid-cols-2' : ''}`}>
      <div className={`rounded-xl ring-1 px-3.5 py-2.5 ${a.is_correct === false ? 'ring-rose-500/30 bg-rose-50/80' : a.is_correct ? 'ring-emerald-500/30 bg-emerald-50/80' : 'ring-slate-200 bg-slate-50'}`}>
        <p className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider mb-1">Your answer</p>
        {mine == null
          ? <p className="text-sm text-slate-500 italic">Not answered</p>
          : <p className="text-sm font-medium text-slate-800 break-words whitespace-pre-line">{mine}</p>}
      </div>
      {showCorrect && (
        <div className="rounded-xl ring-1 ring-emerald-500/30 bg-emerald-50/80 px-3.5 py-2.5">
          <p className="font-semibold text-emerald-700 uppercase text-[10px] tracking-wider mb-1">Correct answer</p>
          <p className="text-sm font-medium text-slate-800 break-words">{correct}</p>
        </div>
      )}
    </div>
  );
}

// focus: { qid, at } — set by the question map; opens and scrolls to that question.
export default function AnswerReviewList({ attempt, focus }) {
  const [filter, setFilter] = useState('all');
  const [openIds, setOpenIds] = useState(() => new Set());
  const toggle = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const items = useMemo(() => reviewItems(attempt), [attempt]);
  const shown = items.filter(({ a }) => filter === 'all' || statusOf(a) === filter);
  const nWrong = items.filter(({ a }) => statusOf(a) === 'incorrect').length;
  const nRight = items.filter(({ a }) => statusOf(a) === 'correct').length;
  const allOpen = shown.length > 0 && shown.every(({ q }) => openIds.has(String(q._id)));

  useEffect(() => {
    if (!focus?.qid) return;
    setFilter('all');
    setOpenIds((prev) => new Set(prev).add(focus.qid));
    // After the filter/open re-render, bring the question into view.
    requestAnimationFrame(() => document.getElementById(`review-q-${focus.qid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [focus]);

  const tabs = [
    ['all', `All`, items.length],
    ['incorrect', 'Incorrect', nWrong],
    ['correct', 'Correct', nRight],
  ];

  return (
    <div className="text-left">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 mb-2 border-b border-slate-100">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900">Answer review</h2>
          <p className="text-xs text-slate-500 mt-0.5">Your answer, the correct one and the explanation for each question.</p>
        </div>
        <div className="grid grid-cols-3 sm:inline-flex p-1 bg-slate-100 rounded-xl ring-1 ring-slate-200/80 w-full sm:w-auto">
          {tabs.map(([key, label, count]) => (
            <button key={key} type="button" onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${filter === key
                ? 'bg-primary-800 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'}`}>
              {label} <span className={`tabular-nums ${filter === key && key === 'incorrect' ? 'text-rose-300' : filter === key && key === 'correct' ? 'text-emerald-300' : 'text-slate-400'}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length > 0 && (
        <div className="flex items-center justify-between py-2">
          <p className="text-[11px] font-medium text-slate-400">
            Showing {shown.length} of {items.length}
          </p>
          <button type="button"
            onClick={() => setOpenIds(allOpen ? new Set() : new Set(shown.map(({ q }) => String(q._id))))}
            className="text-xs font-semibold text-[#0000ff] hover:text-blue-800">
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}

      <ol className="space-y-2.5">
        {shown.map(({ q, a, n }) => {
          const qid = String(q._id);
          const open = openIds.has(qid);
          const s = statusOf(a);
          const images = [...(q.image_url ? [{ url: q.image_url }] : []), ...(q.images || [])].filter((img) => img.url);
          return (
            <li key={qid} id={`review-q-${qid}`} className={`scroll-mt-4 rounded-2xl ring-1 transition-colors ${open ? 'bg-white ring-slate-300 shadow-[0_10px_28px_-16px_rgba(15,23,42,0.3)]' : 'bg-white ring-slate-200 hover:ring-slate-300'}`}>
              <button type="button" onClick={() => toggle(qid)} aria-expanded={open}
                className="w-full flex items-start gap-3 p-3.5 sm:p-4 text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                <span className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 tabular-nums ring-1 ${
                  s === 'correct' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                    : s === 'incorrect' ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                  {n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium text-slate-900 leading-relaxed whitespace-pre-line break-words ${open ? '' : 'line-clamp-2'}`}>{q.prompt}</p>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{TYPE_LABELS[q.type] || q.type}</span>
                    {q.section && <span className="text-[10px] font-medium text-slate-400">· {q.section}</span>}
                    <span className="text-[10px] font-medium text-slate-400">· {a.points_awarded ?? 0}/{q.points} pt{q.points === 1 ? '' : 's'}</span>
                    <StatusChip a={a} className="sm:hidden" />
                  </div>
                </div>
                <StatusChip a={a} className="hidden sm:inline-flex mt-1" />
                <HiChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 mt-1 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
              </button>

              {open && (
                <div className="px-3.5 sm:px-4 pb-4 sm:pl-[3.75rem] space-y-3">
                  {images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {images.map((img, i) => (
                        <a key={i} href={img.url} target="_blank" rel="noreferrer">
                          <img src={img.url} alt="" className="max-h-48 rounded-xl ring-1 ring-slate-200" />
                        </a>
                      ))}
                    </div>
                  )}
                  {CHOICE_TYPES.has(q.type) && (q.options || []).length > 0
                    ? <ChoiceOptions q={q} response={a.response} />
                    : <TextAnswers q={q} a={a} />}
                  {a.feedback && (
                    <div className="rounded-xl ring-1 ring-slate-200 bg-slate-50 px-3.5 py-2.5">
                      <p className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider mb-1">Instructor feedback</p>
                      <p className="text-sm text-slate-700 whitespace-pre-line">{a.feedback}</p>
                    </div>
                  )}
                  {q.explanation && (
                    <div className="rounded-xl ring-1 ring-amber-500/20 bg-amber-50/80 px-3.5 py-3 flex items-start gap-2.5">
                      <HiOutlineLightBulb className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-semibold text-amber-700 uppercase text-[10px] tracking-wider mb-0.5">Explanation</p>
                        <p className="text-sm text-amber-950/85 leading-relaxed whitespace-pre-line break-words">{q.explanation}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {shown.length === 0 && <p className="text-xs font-medium text-slate-400 text-center py-10">No questions in this view.</p>}
    </div>
  );
}

// Numbered tile per question, coloured by result — click to jump to it.
export function QuestionMap({ attempt, onPick }) {
  const items = useMemo(() => reviewItems(attempt), [attempt]);
  return (
    <div>
      <div className="grid grid-cols-8 sm:grid-cols-10 lg:grid-cols-6 gap-1.5">
        {items.map(({ q, a, n }) => {
          const s = statusOf(a);
          return (
            <button key={String(q._id)} type="button" onClick={() => onPick(String(q._id))}
              title={`Question ${n}: ${s === 'correct' ? 'correct' : s === 'incorrect' ? 'incorrect' : 'not scored'}`}
              className={`aspect-square rounded-lg text-[11px] font-bold tabular-nums ring-1 transition-all hover:scale-105 ${
                s === 'correct' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100'
                  : s === 'incorrect' ? 'bg-rose-50 text-rose-700 ring-rose-600/20 hover:bg-rose-100' : 'bg-slate-50 text-slate-500 ring-slate-200'} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600`}>
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] font-medium text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-500/40" /> Correct</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-100 ring-1 ring-rose-500/40" /> Incorrect</span>
      </div>
    </div>
  );
}

// Correct / total per section. Null when the exam doesn't use sections.
export function SectionBreakdown({ attempt }) {
  const rows = useMemo(() => {
    const by = new Map();
    reviewItems(attempt).forEach(({ q, a }) => {
      if (a.is_correct == null) return;
      const name = q.section || 'Ungrouped';
      if (!by.has(name)) by.set(name, { name, right: 0, total: 0 });
      const r = by.get(name);
      r.total += 1;
      if (a.is_correct) r.right += 1;
    });
    return [...by.values()];
  }, [attempt]);
  // Hidden only when the exam uses no sections at all.
  if (!rows.length || (rows.length === 1 && rows[0].name === 'Ungrouped')) return null;
  return (
    <div className="pt-5 border-t border-slate-100">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500 mb-3">Score by section</h3>
      <ul className="space-y-3">
        {rows.map((r) => {
          const pct = r.total ? Math.round((r.right / r.total) * 100) : 0;
          return (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-slate-700 truncate">{r.name}</span>
                <span className="text-slate-400 tabular-nums flex-shrink-0"><span className="font-semibold text-slate-900">{r.right}</span>/{r.total} · {pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-[#0000ff]" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

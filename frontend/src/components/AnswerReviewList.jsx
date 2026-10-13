import { useState } from 'react';
import { HiOutlineCheck, HiOutlineX, HiOutlineInformationCircle, HiChevronDown } from 'react-icons/hi';
import { correctAnswerText, responseText, TYPE_LABELS } from '../utils/examReview';

// Candidate-facing answer review: every question with the candidate's answer,
// whether it was right, the correct answer and the explanation. Only rendered
// when the exam has review enabled (the server withholds the answer key otherwise).
export default function AnswerReviewList({ attempt }) {
  const [filter, setFilter] = useState('all');
  // Accordion: every question starts collapsed; any number can be open at once.
  const [openIds, setOpenIds] = useState(() => new Set());
  const toggle = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const questions = attempt.questions_snapshot || [];
  const byId = Object.fromEntries(questions.map((q) => [String(q._id), q]));
  const answers = (attempt.answers || []).filter((a) => byId[String(a.question_id)]);
  const shown = answers.filter((a) => filter === 'all' || (filter === 'incorrect' ? a.is_correct === false : a.is_correct === true));
  const nWrong = answers.filter((a) => a.is_correct === false).length;
  const nRight = answers.filter((a) => a.is_correct === true).length;

  const tab = (key, label, active) => (
    <button key={key} type="button" onClick={() => setFilter(key)}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border border-transparent ${filter === key ? active : 'text-slate-500 hover:text-slate-900'}`}>
      {label}
    </button>
  );

  return (
    <div className="text-left">
      <div className="flex items-center justify-between gap-3 flex-wrap pb-4 mb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Answer review</h2>
          <p className="text-xs text-slate-400 mt-0.5">{answers.length} questions, with your answer and the correct one</p>
        </div>
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80">
          {tab('all', `All (${answers.length})`, 'bg-white text-slate-900 shadow-2xs border border-slate-200')}
          {tab('incorrect', `Incorrect (${nWrong})`, 'bg-white text-rose-600 shadow-2xs border border-slate-200')}
          {tab('correct', `Correct (${nRight})`, 'bg-white text-emerald-600 shadow-2xs border border-slate-200')}
        </div>
      </div>

      {shown.length > 0 && (
        <div className="flex justify-end mb-1">
          <button type="button"
            onClick={() => setOpenIds(shown.every((x) => openIds.has(String(x.question_id))) ? new Set() : new Set(shown.map((x) => String(x.question_id))))}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer">
            {shown.every((x) => openIds.has(String(x.question_id))) ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {shown.map((a) => {
          const q = byId[String(a.question_id)];
          const idx = answers.indexOf(a) + 1;
          const mine = responseText(q, a.response);
          const correct = correctAnswerText(q);
          const showCorrect = a.is_correct === false && correct;
          const qid = String(a.question_id);
          const open = openIds.has(qid);
          return (
            <div key={qid}>
              <button type="button" onClick={() => toggle(qid)} aria-expanded={open}
                className="w-full flex items-center justify-between gap-3 py-3.5 text-left cursor-pointer rounded-xl hover:bg-slate-50/70 transition-colors px-2 -mx-2">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0 tabular-nums">{idx}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-snug">{q.prompt}</p>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{TYPE_LABELS[q.type] || q.type}</span>
                  </div>
                </div>
                {a.is_correct != null && (
                  <span className={`ml-auto flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                    a.is_correct ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                    {a.is_correct ? <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" /> : <HiOutlineX className="w-3.5 h-3.5 stroke-[3]" />}
                    {a.is_correct ? 'Correct' : 'Incorrect'}
                  </span>
                )}
                <HiChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
              </button>

              {open && (
              <div className="pb-4">

              <div className={`mt-1 ml-10 grid gap-2.5 text-xs ${showCorrect ? 'sm:grid-cols-2' : ''}`}>
                <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                  <p className="font-semibold text-slate-400 uppercase text-[10px] tracking-wider mb-1">Your answer</p>
                  {mine == null
                    ? <p className="text-rose-600 italic font-semibold">Not answered</p>
                    : <p className={`font-semibold break-words ${a.is_correct === true ? 'text-emerald-700' : a.is_correct === false ? 'text-rose-600' : 'text-slate-800'}`}>{mine}</p>}
                </div>
                {showCorrect && (
                  <div className="rounded-xl bg-emerald-50/70 px-3.5 py-2.5">
                    <p className="font-semibold text-emerald-700/80 uppercase text-[10px] tracking-wider mb-1">Correct answer</p>
                    <p className="font-semibold text-slate-800 break-words">{correct}</p>
                  </div>
                )}
              </div>

              {q.explanation && (
                <div className="mt-2.5 ml-10 px-3.5 py-2.5 rounded-xl bg-amber-50/70 text-xs flex items-start gap-2.5">
                  <HiOutlineInformationCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-950 block mb-0.5">Explanation</span>
                    <span className="text-amber-900/90 leading-relaxed">{q.explanation}</span>
                  </div>
                </div>
              )}
              </div>
              )}
            </div>
          );
        })}
      </div>
      {shown.length === 0 && <p className="text-xs font-semibold text-slate-400 text-center py-10">No questions in this view.</p>}
    </div>
  );
}

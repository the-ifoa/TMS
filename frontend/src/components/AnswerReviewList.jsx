import { useState } from 'react';
import { HiOutlineCheck, HiOutlineX, HiOutlineInformationCircle } from 'react-icons/hi';
import { correctAnswerText, responseText, TYPE_LABELS } from '../utils/examReview';

// Candidate-facing answer review: every question with the candidate's answer,
// whether it was right, the correct answer and the explanation. Only rendered
// when the exam has review enabled (the server withholds the answer key otherwise).
export default function AnswerReviewList({ attempt }) {
  const [filter, setFilter] = useState('all');
  const questions = attempt.questions_snapshot || [];
  const byId = Object.fromEntries(questions.map((q) => [String(q._id), q]));
  const answers = (attempt.answers || []).filter((a) => byId[String(a.question_id)]);
  const shown = answers.filter((a) => filter === 'all' || (filter === 'incorrect' ? a.is_correct === false : a.is_correct === true));
  const nWrong = answers.filter((a) => a.is_correct === false).length;
  const nRight = answers.filter((a) => a.is_correct === true).length;

  const tab = (key, label, active) => (
    <button key={key} type="button" onClick={() => setFilter(key)}
      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${filter === key ? active : 'text-slate-500 hover:text-slate-900'}`}>
      {label}
    </button>
  );

  return (
    <div className="text-left space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-extrabold text-slate-900">Answer review</h2>
        <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200/80">
          {tab('all', `All (${answers.length})`, 'bg-white text-slate-900 shadow-2xs border border-slate-200')}
          {tab('incorrect', `Incorrect (${nWrong})`, 'bg-rose-600 text-white')}
          {tab('correct', `Correct (${nRight})`, 'bg-emerald-600 text-white')}
        </div>
      </div>

      {shown.map((a) => {
        const q = byId[String(a.question_id)];
        const idx = answers.indexOf(a) + 1;
        const mine = responseText(q, a.response);
        const correct = correctAnswerText(q);
        return (
          <div key={String(a.question_id)} className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  {TYPE_LABELS[q.type] || q.type}
                </span>
                <p className="text-sm font-bold text-slate-900 leading-snug mt-1.5">{idx}. {q.prompt}</p>
              </div>
              {a.is_correct != null && (
                <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border ${
                  a.is_correct ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  {a.is_correct ? <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" /> : <HiOutlineX className="w-3.5 h-3.5 stroke-[3]" />}
                  {a.is_correct ? 'Correct' : 'Incorrect'}
                </span>
              )}
            </div>

            <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-200/70 space-y-1.5 text-xs">
              <p><span className="font-extrabold text-slate-400 uppercase text-[10px] mr-2">Your answer</span>
                {mine == null
                  ? <span className="text-rose-600 italic font-semibold">(not answered)</span>
                  : <span className={`font-bold ${a.is_correct ? 'text-emerald-700' : 'text-rose-600'}`}>{mine}</span>}
              </p>
              {a.is_correct === false && correct && (
                <p><span className="font-extrabold text-slate-400 uppercase text-[10px] mr-2">Correct answer</span>
                  <span className="font-bold text-slate-800">{correct}</span></p>
              )}
            </div>

            {q.explanation && (
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 text-xs flex items-start gap-2.5">
                <HiOutlineInformationCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold text-amber-950 block mb-0.5">Explanation</span>
                  <span className="text-amber-900/90 leading-relaxed font-medium">{q.explanation}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {shown.length === 0 && <p className="text-xs font-semibold text-slate-400 text-center py-6">No questions in this view.</p>}
    </div>
  );
}

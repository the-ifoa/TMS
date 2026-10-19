import { useEffect, useState } from 'react';
import { getLatestExamResults } from '../api';

// Each participant's newest finished exam attempt (GET /exams/latest-results),
// used by the participant lists for an "Exam result" column and its sorts.

// Sort options shared by the participant lists. 'added' keeps the list's own order.
export const RESULT_SORTS = [
  ['added', 'Default order'],
  ['result_newest', 'Newest exam result'],
  ['result_oldest', 'Oldest exam result'],
  ['score_high', 'Highest score'],
  ['score_low', 'Lowest score'],
  ['name', 'Name A–Z'],
];

// participant id → latest result. A failed load just leaves it empty, so the
// column reads "No exam yet" instead of breaking the page.
export function useLatestExamResults() {
  const [byParticipant, setByParticipant] = useState({});
  useEffect(() => {
    getLatestExamResults()
      .then((res) => setByParticipant(Object.fromEntries((res.data || []).map((r) => [r.participant_id, r]))))
      .catch(() => {});
  }, []);
  return byParticipant;
}

// Returns `list` sorted by `sortKey`. People without a result always go last.
export function sortByLatestResult(list, sortKey, byParticipant) {
  if (!sortKey || sortKey === 'added') return list;
  const res = (r) => byParticipant[String(r.id || r._id)];
  const when = (r) => (res(r) ? new Date(res(r).submitted_at).getTime() : null);
  const score = (r) => (res(r)?.percentage ?? null);
  const byValue = (get, dir) => (a, b) => {
    const x = get(a); const y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return dir * (x - y);
  };
  const cmp = {
    result_newest: byValue(when, -1),
    result_oldest: byValue(when, 1),
    score_high: byValue(score, -1),
    score_low: byValue(score, 1),
    name: (a, b) => (a.participant_name || '').localeCompare(b.participant_name || ''),
  }[sortKey];
  return cmp ? [...list].sort(cmp) : list;
}

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

// Score + Passed/Failed, then the exam and when it was submitted.
export function LatestResultCell({ result }) {
  if (!result) return <span className="text-xs text-slate-300">No exam yet</span>;
  const pending = result.status === 'pending_review' || result.passed == null;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {pending ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Awaiting review
          </span>
        ) : (
          <>
            {result.percentage != null && (
              <span className={`text-xs font-bold tabular-nums ${result.passed ? 'text-emerald-600' : 'text-rose-600'}`}>{result.percentage}%</span>
            )}
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${result.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {result.passed ? 'Passed' : 'Failed'}
            </span>
          </>
        )}
      </div>
      <p className="text-[11px] text-slate-400 truncate max-w-[14rem]" title={result.exam_title}>
        {result.exam_title} · {fmtDate(result.submitted_at)}
      </p>
    </div>
  );
}

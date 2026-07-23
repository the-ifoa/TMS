import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import { listExamAttempts, getExam, getExamAttemptResult, gradeExamAttempt } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

function responseText(q, response) {
  if (response == null || response === '') return '(no answer)';

  if (['mcq', 'true_false', 'select_list'].includes(q.type)) {
    return (q.options || []).find((o) => String(o._id) === String(response))?.text || String(response);
  }

  if (q.type === 'multi_response') {
    const ids = Array.isArray(response) ? response.map(String) : [];
    const matched = (q.options || []).filter((o) => ids.includes(String(o._id))).map((o) => o.text);
    return matched.length > 0 ? matched.join(', ') : '(no answer)';
  }

  if (q.type === 'drag_drop') {
    if (Array.isArray(response)) {
      const items = response.map((item) => {
        if (typeof item === 'object' && item !== null) {
          const label = item.item_label || item.label || '';
          const targetIdx = item.target_Index ?? item.target_index;
          const target = item.target_label || (q.dragdrop_targets?.[targetIdx]?.label) || `Zone ${targetIdx !== undefined ? targetIdx + 1 : ''}`;
          return `${label} → ${target}`;
        }
        return String(item);
      });
      return items.join('; ');
    }
  }

  if (q.type === 'matching') {
    if (Array.isArray(response)) {
      return response
        .map((p) => (typeof p === 'object' && p !== null ? `${p.left || ''} ↔ ${p.right || ''}` : String(p)))
        .join('; ');
    }
  }

  if (q.type === 'sequence') {
    if (Array.isArray(response)) {
      return response
        .map((item) => (typeof item === 'object' && item !== null ? item.text || item.label || String(item) : String(item)))
        .join(' → ');
    }
  }

  if (q.type === 'fill_blank' || q.type === 'drag_words') {
    if (Array.isArray(response)) {
      return response.join(', ');
    }
  }

  if (typeof response === 'object' && response !== null) {
    try {
      if (Array.isArray(response)) {
        return response.map((r) => (typeof r === 'object' ? JSON.stringify(r) : String(r))).join(', ');
      }
      return Object.entries(response)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    } catch {
      return JSON.stringify(response);
    }
  }

  return String(response);
}

const STATUS_VARIANT = {
  in_progress: 'amber',
  submitted: 'emerald',
  pending_review: 'blue',
  graded: 'emerald',
};

function GradeModal({ attemptId, onClose, onGraded }) {
  const [attempt, setAttempt] = useState(null);
  const [scores, setScores] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getExamAttemptResult(attemptId).then((res) => setAttempt(res.data)).catch(() => toast.error('Failed to load attempt.'));
  }, [attemptId]);

  const questionById = Object.fromEntries((attempt?.questions_snapshot || []).map((q) => [String(q._id), q]));

  const submit = async () => {
    const answers = attempt.answers
      .filter((a) => a.needs_manual_grading)
      .map((a) => ({ question_id: a.question_id, points_awarded: scores[a.question_id] ?? 0, feedback: '' }));
    setSaving(true);
    try {
      await gradeExamAttempt(attemptId, { answers });
      toast.success('Attempt graded.');
      onGraded();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save grading.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {!attempt ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{attempt.participant_name}</DialogTitle>
              <DialogDescription>{attempt.exam_title_snapshot} · Attempt #{attempt.attempt_number}</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {attempt.answers.map((a, idx) => {
                const q = questionById[String(a.question_id)];
                if (!q) return null;
                return (
                  <div key={idx} className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                    <p className="text-sm font-medium text-slate-800">{q.prompt}</p>
                    <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 whitespace-pre-wrap">{responseText(q, a.response)}</p>
                    {a.needs_manual_grading ? (
                      <label className="text-xs text-slate-500 flex items-center gap-2">
                        Points (max {q.points})
                        <input type="number" min="0" max={q.points} defaultValue={a.points_awarded ?? ''}
                          onChange={(e) => setScores((prev) => ({ ...prev, [a.question_id]: Number(e.target.value) }))}
                          className="w-20 px-2 py-1 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500" />
                      </label>
                    ) : (
                      <p className={`text-xs font-semibold ${a.is_correct ? 'text-emerald-600' : a.is_correct === false ? 'text-red-500' : 'text-slate-400'}`}>
                        {a.is_correct === null ? 'Not scored' : a.is_correct ? 'Correct' : 'Incorrect'} — {a.points_awarded ?? 0}/{q.points} pts
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>Close</Button>
              {attempt.status === 'pending_review' && (
                <Button variant="primary" onClick={submit} disabled={saving}>
                  {saving ? 'Saving…' : 'Submit Grades'}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ExamAttempts() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradingId, setGradingId] = useState(null);

  const load = () => {
    Promise.all([getExam(id), listExamAttempts({ exam_id: id })])
      .then(([examRes, attemptsRes]) => { setExam(examRes.data); setAttempts(attemptsRes.data); })
      .catch(() => toast.error('Failed to load results.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [id]);

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-4 sm:p-6 lg:p-8">
      <Button variant="ghost" size="sm" className="px-2 -ml-2 text-slate-500 hover:text-slate-900" onClick={() => navigate('/admin/exams')}>
        <HiOutlineArrowLeft className="w-4 h-4" /> Back to Exam System
      </Button>

      <div>
        <h1 className="text-xl font-bold text-slate-900">{exam?.title || 'Exam'} — Results</h1>
        <p className="text-sm text-slate-500 mt-0.5">{attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : attempts.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl">
          <p className="text-sm text-slate-400">No one has attempted this exam yet.</p>
        </div>
      ) : (
        <Card className="overflow-hidden divide-y divide-slate-100">
          {attempts.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{a.participant_name}</p>
                <p className="text-[11px] text-slate-400">Attempt #{a.attempt_number} · {new Date(a.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {a.percentage != null && (
                  <span className={`text-sm font-semibold ${a.passed ? 'text-emerald-600' : 'text-red-500'}`}>{a.percentage}%</span>
                )}
                <Badge variant={STATUS_VARIANT[a.status]}>{a.status.replace('_', ' ')}</Badge>
                {a.status !== 'in_progress' && (
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setGradingId(a.id)}>
                    {a.status === 'pending_review' ? 'Grade' : 'View'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {gradingId && (
        <GradeModal attemptId={gradingId} onClose={() => setGradingId(null)} onGraded={() => { setGradingId(null); load(); }} />
      )}
    </div>
  );
}

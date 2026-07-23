import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineArrowLeft, HiOutlinePlusCircle, HiOutlineSave } from 'react-icons/hi';
import { getExam, createExam, updateExam } from '../api';
import QuestionEditor, { QUESTION_TYPES, createEmptyQuestion } from '../components/examQuestions/QuestionEditor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// Client-generated placeholder ids (see `uid()` in QuestionEditor.jsx) aren't
// valid Mongo ObjectIds — strip them so Mongoose assigns real ones on save.
function stripTempIds(value) {
  if (Array.isArray(value)) return value.map(stripTempIds);
  if (value && typeof value === 'object') {
    const next = {};
    Object.entries(value).forEach(([k, v]) => {
      if (k === '_id' && typeof v === 'string' && v.startsWith('new-')) return;
      next[k] = stripTempIds(v);
    });
    return next;
  }
  return value;
}

const emptyExam = () => ({
  title: '', description: '', duration_minutes: 30, pass_percentage: 60,
  max_attempts: 1, shuffle_questions: false, shuffle_options: false,
  lockdown_enabled: true, max_violations: 4, questions: [],
});

export default function ExamBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [exam, setExam] = useState(emptyExam());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState(QUESTION_TYPES[0].value);

  useEffect(() => {
    if (isNew) return;
    getExam(id).then((res) => setExam(res.data)).catch(() => toast.error('Failed to load exam.')).finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (key, value) => setExam((prev) => ({ ...prev, [key]: value }));

  const addQuestion = () => {
    setExam((prev) => ({ ...prev, questions: [...prev.questions, createEmptyQuestion(newType)] }));
  };

  const updateQuestion = (idx, next) => {
    setExam((prev) => ({ ...prev, questions: prev.questions.map((q, i) => (i === idx ? next : q)) }));
  };

  const deleteQuestion = (idx) => {
    setExam((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== idx) }));
  };

  const moveQuestion = (idx, dir) => {
    setExam((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.questions.length) return prev;
      const next = [...prev.questions];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, questions: next };
    });
  };

  const save = async () => {
    if (!exam.title.trim()) return toast.error('Exam title is required.');
    setSaving(true);
    try {
      const payload = stripTempIds(exam);
      if (isNew) {
        const res = await createExam(payload);
        toast.success('Exam created.');
        navigate(`/admin/exams/${res.data.id}/edit`, { replace: true });
      } else {
        const res = await updateExam(id, payload);
        setExam(res.data);
        toast.success('Exam saved.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save exam.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-10 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* ── Flush Full-Width Sticky Top Action Header ── */}
      <div className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/exams')} className="rounded-xl border-slate-200">
            <HiOutlineArrowLeft className="w-4 h-4" /> Back to Exam System
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
              {exam.questions.length} Question{exam.questions.length !== 1 ? 's' : ''}
            </span>
            <Button variant="primary" onClick={save} disabled={saving} className="rounded-xl shadow-2xs">
              <HiOutlineSave className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Exam'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2-Column Split Workspace Container ── */}
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Questions List (Scrollable with page) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="flex items-center justify-between px-1 pb-1">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Exam Questions ({exam.questions.length})
            </h2>
            <span className="text-xs text-slate-400 font-medium">
              Drag or reorder questions below
            </span>
          </div>

          {exam.questions.length === 0 ? (
            <Card className="p-10 text-center text-sm font-medium text-slate-400 border-dashed rounded-2xl">
              No questions added yet. Use the control below to add your first question.
            </Card>
          ) : (
            <div className="space-y-4">
              {exam.questions.map((q, idx) => (
                <QuestionEditor
                  key={q._id || idx}
                  question={q}
                  index={idx}
                  onChange={(next) => updateQuestion(idx, next)}
                  onDelete={() => deleteQuestion(idx)}
                  onMoveUp={() => moveQuestion(idx, -1)}
                  onMoveDown={() => moveQuestion(idx, 1)}
                  isFirst={idx === 0}
                  isLast={idx === exam.questions.length - 1}
                />
              ))}
            </div>
          )}

          {/* Add Question Component */}
          <Card className="flex items-center gap-3 border-dashed p-4 rounded-2xl bg-slate-50/50">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="flex-1 bg-white rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="primary" onClick={addQuestion} className="rounded-xl shadow-2xs">
              <HiOutlinePlusCircle className="w-4 h-4" /> Add Question
            </Button>
          </Card>
        </div>

        {/* RIGHT COLUMN: Exam Settings Panel (Fixed / Sticky on Right) */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20 space-y-4">
          <Card className="p-5 space-y-4 rounded-2xl border border-slate-200/80 shadow-2xs bg-white">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Exam Settings</h3>
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                Configuration
              </span>
            </div>

            {/* Title & Description Fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Exam Title</label>
                <input
                  value={exam.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Initial Competency Assessment"
                  className="w-full px-3 py-2 text-sm font-bold text-slate-900 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  value={exam.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={2}
                  placeholder="Overview or instructions for candidates..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white"
                />
              </div>
            </div>

            {/* Column-wise Parameters */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Duration (min)</label>
                  <Input
                    type="number"
                    min="1"
                    value={exam.duration_minutes}
                    onChange={(e) => set('duration_minutes', Number(e.target.value))}
                    className="text-xs rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pass %</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={exam.pass_percentage}
                    onChange={(e) => set('pass_percentage', Number(e.target.value))}
                    className="text-xs rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Max attempts</label>
                  <Input
                    type="number"
                    min="1"
                    value={exam.max_attempts}
                    onChange={(e) => set('max_attempts', Number(e.target.value))}
                    className="text-xs rounded-xl"
                  />
                </div>
                <div className="flex flex-col justify-end pb-1 text-xs text-slate-600">
                  <label className="flex items-center gap-2 cursor-pointer font-bold select-none">
                    <Checkbox
                      checked={exam.shuffle_questions}
                      onCheckedChange={(checked) => set('shuffle_questions', !!checked)}
                    />
                    Shuffle questions
                  </label>
                </div>
              </div>
            </div>

            {/* Lockdown Settings Panel */}
            <div className="pt-2 border-t border-slate-100">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <Checkbox
                    checked={exam.lockdown_enabled}
                    onCheckedChange={(checked) => set('lockdown_enabled', !!checked)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-xs block">Lockdown Mode</span>
                    <span className="text-[11px] text-slate-500 leading-snug block font-medium">
                      Fullscreen required. Tab switches & exits count as violations.
                    </span>
                  </div>
                </label>

                {exam.lockdown_enabled && (
                  <div className="pt-1 border-t border-slate-200/60">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Max violations</label>
                    <Input
                      type="number"
                      min="1"
                      value={exam.max_violations}
                      disabled={!exam.lockdown_enabled}
                      onChange={(e) => set('max_violations', Number(e.target.value))}
                      className="text-xs bg-white rounded-xl"
                    />
                    <span className="block text-[10px] text-slate-400 mt-1 font-semibold">
                      Auto-submits exam when violations exceeded
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  </div>
);
}

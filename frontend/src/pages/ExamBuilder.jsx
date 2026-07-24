import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft, HiOutlinePlusCircle, HiOutlineSave,
  HiOutlinePencilAlt, HiOutlineTrash, HiOutlineCheck, HiOutlineX,
} from 'react-icons/hi';
import { getExam, createExam, updateExam } from '../api';
import QuestionEditor, { QUESTION_TYPES, createEmptyQuestion } from '../components/examQuestions/QuestionEditor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/hooks/use-confirm';

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
  lockdown_enabled: true, max_violations: 4, questions: [], sections: [],
});

export default function ExamBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [exam, setExam] = useState(emptyExam());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState(QUESTION_TYPES[0].value);
  const [newSectionName, setNewSectionName] = useState('');
  const [editingSection, setEditingSection] = useState(null); // section name currently being renamed
  const [editingSectionValue, setEditingSectionValue] = useState('');
  const [bulkTargetSection, setBulkTargetSection] = useState('');
  const [activeSectionFilter, setActiveSectionFilter] = useState(null); // null = show all, '' = Ungrouped, else a section name
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    if (isNew) return;
    getExam(id).then((res) => setExam({ sections: [], ...res.data })).catch(() => toast.error('Failed to load exam.')).finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (key, value) => setExam((prev) => ({ ...prev, [key]: value }));

  // Appends a new question to the END of the given section's block (so
  // sections stay contiguous in the underlying array), or to the very end
  // of the exam for the ungrouped ('') bucket.
  const addQuestionToSection = (sectionName) => {
    setExam((prev) => {
      const newQ = { ...createEmptyQuestion(newType), section: sectionName };
      const sectionIndices = prev.questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => (q.section || '') === sectionName)
        .map(({ i }) => i);
      const insertAt = sectionIndices.length > 0 ? sectionIndices[sectionIndices.length - 1] + 1 : prev.questions.length;
      const next = [...prev.questions];
      next.splice(insertAt, 0, newQ);
      return { ...prev, questions: next };
    });
  };

  const updateQuestion = (idx, next) => {
    setExam((prev) => ({ ...prev, questions: prev.questions.map((q, i) => (i === idx ? next : q)) }));
  };

  const deleteQuestion = (idx) => {
    setExam((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== idx) }));
  };

  // Move a question up/down relative to its neighbors WITHIN its own
  // section only — a plain global swap would pull it into an adjacent
  // section's block instead.
  const moveQuestionInSection = (idx, dir) => {
    setExam((prev) => {
      const sec = prev.questions[idx].section || '';
      const sectionIndices = prev.questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => (q.section || '') === sec)
        .map(({ i }) => i);
      const posInSection = sectionIndices.indexOf(idx);
      const targetPos = posInSection + dir;
      if (targetPos < 0 || targetPos >= sectionIndices.length) return prev;
      const targetIdx = sectionIndices[targetPos];
      const next = [...prev.questions];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return { ...prev, questions: next };
    });
  };

  // Re-assign an existing question to a different (or no) section, sliding
  // it to the end of that section's block so grouping stays contiguous.
  const moveQuestionToSection = (idx, targetSection) => {
    setExam((prev) => {
      const moved = { ...prev.questions[idx], section: targetSection };
      const rest = prev.questions.filter((_, i) => i !== idx);
      const sectionIndices = rest
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => (q.section || '') === targetSection)
        .map(({ i }) => i);
      const insertAt = sectionIndices.length > 0 ? sectionIndices[sectionIndices.length - 1] + 1 : rest.length;
      const next = [...rest];
      next.splice(insertAt, 0, moved);
      return { ...prev, questions: next };
    });
  };

  // Bulk-assign every currently ungrouped question to one section at once.
  const moveAllUngroupedTo = (targetSection) => {
    if (!targetSection) return;
    setExam((prev) => {
      const moving = prev.questions.filter((q) => !(q.section || ''));
      if (moving.length === 0) return prev;
      const rest = prev.questions.filter((q) => q.section || '');
      const tagged = moving.map((q) => ({ ...q, section: targetSection }));
      const restIndices = rest
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => (q.section || '') === targetSection)
        .map(({ i }) => i);
      const insertAt = restIndices.length > 0 ? restIndices[restIndices.length - 1] + 1 : rest.length;
      const next = [...rest];
      next.splice(insertAt, 0, ...tagged);
      return { ...prev, questions: next };
    });
    setBulkTargetSection('');
  };

  const addSection = () => {
    const name = newSectionName.trim();
    if (!name) return;
    if ((exam.sections || []).includes(name)) { toast.error('A section with that name already exists.'); return; }
    setExam((prev) => ({ ...prev, sections: [...(prev.sections || []), name] }));
    setNewSectionName('');
  };

  const startRenameSection = (name) => { setEditingSection(name); setEditingSectionValue(name); };

  const commitRenameSection = () => {
    const oldName = editingSection;
    const newName = editingSectionValue.trim();
    setEditingSection(null);
    if (!newName || newName === oldName) return;
    if ((exam.sections || []).includes(newName)) { toast.error('A section with that name already exists.'); return; }
    setExam((prev) => ({
      ...prev,
      sections: (prev.sections || []).map((s) => (s === oldName ? newName : s)),
      questions: prev.questions.map((q) => ((q.section || '') === oldName ? { ...q, section: newName } : q)),
    }));
    setActiveSectionFilter((f) => (f === oldName ? newName : f));
  };

  const deleteSection = async (name) => {
    const count = exam.questions.filter((q) => (q.section || '') === name).length;
    const confirmed = await confirm(
      count > 0
        ? `Delete section "${name}"? Its ${count} question${count > 1 ? 's' : ''} will move to Ungrouped, not be deleted.`
        : `Delete empty section "${name}"?`,
      { title: 'Delete section', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;
    setExam((prev) => ({
      ...prev,
      sections: (prev.sections || []).filter((s) => s !== name),
      questions: prev.questions.map((q) => ((q.section || '') === name ? { ...q, section: '' } : q)),
    }));
    setActiveSectionFilter((f) => (f === name ? null : f));
  };

  // Section render order: admin-defined `sections` first, then any legacy
  // section names found only on questions (shouldn't normally happen, but
  // keeps mistagged questions visible instead of silently hidden).
  const questionSectionNames = [...new Set(exam.questions.map((q) => q.section).filter(Boolean))];
  const orderedSectionNames = [...(exam.sections || []), ...questionSectionNames.filter((n) => !(exam.sections || []).includes(n))];
  const groupFor = (name) => exam.questions.map((q, idx) => ({ q, idx })).filter(({ q }) => (q.section || '') === name);
  const ungroupedItems = groupFor('');

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
      <div className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-2.5 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Back button */}
          <div className="flex items-center flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/exams')} className="rounded-xl border-slate-200 text-xs font-semibold">
              <HiOutlineArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Exam System</span><span className="sm:hidden">Back</span>
            </Button>
          </div>

          {/* Center: Section filter tabs inline */}
          {(orderedSectionNames.length > 0 || ungroupedItems.length > 0) && (
            <div className="flex items-center justify-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl mx-auto">
              {orderedSectionNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setActiveSectionFilter(name)}
                  className={`flex-shrink-0 px-3.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                    (activeSectionFilter === name || (activeSectionFilter === null && name === orderedSectionNames[0]))
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {name} ({groupFor(name).length})
                </button>
              ))}
              {ungroupedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveSectionFilter('')}
                  className={`flex-shrink-0 px-3.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                    activeSectionFilter === ''
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Ungrouped ({ungroupedItems.length})
                </button>
              )}
            </div>
          )}

          {/* Right: Question Count & Save Button */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs font-semibold text-slate-500 hidden md:inline">
              {exam.questions.length} Question{exam.questions.length !== 1 ? 's' : ''}
            </span>
            <Button variant="primary" onClick={save} disabled={saving} className="rounded-xl shadow-2xs text-xs font-bold px-3.5 py-1.5 bg-[#0000ff] hover:bg-blue-700">
              <HiOutlineSave className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Exam'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2-Column Split Workspace Container ── */}
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* EXAM SETTINGS PANEL (Right column on desktop, 4 cols width) */}
          <div className="order-1 lg:order-2 lg:col-span-4 lg:sticky lg:top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 space-y-4 scrollbar-none">
            <Card className="p-4 sm:p-5 space-y-4 rounded-2xl border border-slate-200/80 shadow-2xs bg-white">
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
                    className="w-full px-3 py-2 text-xs font-bold text-slate-900 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white"
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
                <div className="grid grid-cols-2 gap-2.5">
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

                <div className="grid grid-cols-2 gap-2.5">
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
                  <div className="flex flex-col justify-end">
                    <div className="flex items-center justify-between px-2.5 py-2 bg-slate-50 border border-slate-200/80 rounded-xl">
                      <span className="text-[11px] font-bold text-slate-700">Shuffle</span>
                      <Checkbox
                        checked={exam.shuffle_questions}
                        onCheckedChange={(checked) => set('shuffle_questions', !!checked)}
                      />
                    </div>
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
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-bold text-slate-900 text-xs block">Lockdown Mode</span>
                      <span className="text-[11px] text-slate-500 leading-snug block font-medium">
                        Fullscreen required. Tab switches & exits count as violations.
                      </span>
                    </div>
                  </label>

                  {exam.lockdown_enabled && (
                    <div className="pt-2 border-t border-slate-200/60">
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

            {/* Sections management */}
            <Card className="p-4 sm:p-5 space-y-4 rounded-2xl border border-slate-200/80 shadow-2xs bg-white">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 tracking-tight">Sections</h3>
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                  {orderedSectionNames.length}
                </span>
              </div>

              {/* Existing sections list - fixed height container so adding items never expands the card */}
              {orderedSectionNames.length > 0 && (
                <div className="h-28 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin">
                  {orderedSectionNames.map((name) => {
                    const count = groupFor(name).length;
                    return (
                      <div key={name} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
                        {editingSection === name ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              autoFocus
                              value={editingSectionValue}
                              onChange={(e) => setEditingSectionValue(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && commitRenameSection()}
                              className="flex-1 px-2 py-1 text-xs font-bold text-slate-900 border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25"
                            />
                            <button type="button" onClick={commitRenameSection} className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-100">
                              <HiOutlineCheck className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => setEditingSection(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-200">
                              <HiOutlineX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-xs font-bold text-slate-800 truncate">{name}</span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-[10px] font-bold text-slate-400">{count}</span>
                              <button type="button" onClick={() => startRenameSection(name)} title="Rename" className="p-1 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800">
                                <HiOutlinePencilAlt className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => deleteSection(name)} title="Delete" className="p-1 rounded-lg text-rose-500 hover:bg-rose-50">
                                <HiOutlineTrash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Section */}
              <div className="flex items-center gap-2">
                <input
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSection()}
                  placeholder="e.g. Aptitude, Logical..."
                  className="flex-1 px-3 py-2 text-xs font-medium text-slate-800 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white min-w-0"
                />
                <Button variant="outline" size="sm" onClick={addSection} className="rounded-xl flex-shrink-0">
                  <HiOutlinePlusCircle className="w-4 h-4" /> Add
                </Button>
              </div>

              {/* Bulk-assign ungrouped questions */}
              {ungroupedItems.length > 0 && orderedSectionNames.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Move all {ungroupedItems.length} ungrouped question{ungroupedItems.length !== 1 ? 's' : ''} to:
                  </label>
                  <div className="flex items-center gap-2">
                    <Select value={bulkTargetSection} onValueChange={setBulkTargetSection}>
                      <SelectTrigger className="flex-1 bg-white rounded-xl text-xs">
                        <SelectValue placeholder="Choose a section…" />
                      </SelectTrigger>
                      <SelectContent>
                        {orderedSectionNames.map((name) => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!bulkTargetSection}
                      onClick={() => moveAllUngroupedTo(bulkTargetSection)}
                      className="rounded-xl flex-shrink-0"
                    >
                      Move
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* QUESTIONS LIST (Left column on desktop, 8 cols width) */}
          <div className="order-2 lg:order-1 lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between px-1 pb-1">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Exam Questions ({exam.questions.length})
              </h2>
            </div>

            {exam.questions.length === 0 && orderedSectionNames.length === 0 && (
              <Card className="p-10 text-center text-sm font-medium text-slate-400 border-dashed rounded-2xl">
                No sections or questions yet. Add a section from Exam Settings, or add a question directly below.
              </Card>
            )}

            {/* Section blocks, in admin-defined order — respects the section filter tabs in the top header */}
            {orderedSectionNames.filter((name) => activeSectionFilter === null || activeSectionFilter === name).map((name) => {
              const items = groupFor(name);
              return (
                <div key={name} className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-3 sm:p-4 space-y-3">
                  {/* Section header */}
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-sm font-black text-slate-900 tracking-tight uppercase">{name}</span>
                    <span className="text-[11px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                      {items.length} question{items.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Questions in this section */}
                  <div className="space-y-3">
                    {items.map(({ q, idx }, pos) => (
                      <QuestionEditor
                        key={q._id || idx}
                        question={q}
                        index={idx}
                        onChange={(next) => updateQuestion(idx, next)}
                        onDelete={() => deleteQuestion(idx)}
                        onMoveUp={() => moveQuestionInSection(idx, -1)}
                        onMoveDown={() => moveQuestionInSection(idx, 1)}
                        isFirst={pos === 0}
                        isLast={pos === items.length - 1}
                        sectionNames={orderedSectionNames}
                        onMoveToSection={(target) => moveQuestionToSection(idx, target)}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
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
                    <Button variant="outline" size="sm" onClick={() => addQuestionToSection(name)} className="rounded-xl border-dashed flex-shrink-0">
                      <HiOutlinePlusCircle className="w-4 h-4" /> Add to {name}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Ungrouped questions — always shown once anything lives here, or as the
                only bucket for exams that don't use sections at all; hidden when a
                specific section tab is selected up top */}
            {(activeSectionFilter === null || activeSectionFilter === '') && (ungroupedItems.length > 0 || orderedSectionNames.length === 0) && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4 space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-sm font-black text-slate-500 tracking-tight uppercase">
                    {orderedSectionNames.length === 0 ? 'Questions' : 'Ungrouped'}
                  </span>
                  {orderedSectionNames.length > 0 && (
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                      {ungroupedItems.length} question{ungroupedItems.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {ungroupedItems.map(({ q, idx }, pos) => (
                    <QuestionEditor
                      key={q._id || idx}
                      question={q}
                      index={idx}
                      onChange={(next) => updateQuestion(idx, next)}
                      onDelete={() => deleteQuestion(idx)}
                      onMoveUp={() => moveQuestionInSection(idx, -1)}
                      onMoveDown={() => moveQuestionInSection(idx, 1)}
                      isFirst={pos === 0}
                      isLast={pos === ungroupedItems.length - 1}
                      sectionNames={orderedSectionNames}
                      onMoveToSection={(target) => moveQuestionToSection(idx, target)}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
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
                  <Button variant="outline" size="sm" onClick={() => addQuestionToSection('')} className="rounded-xl border-dashed flex-shrink-0">
                    <HiOutlinePlusCircle className="w-4 h-4" /> Add Question
                  </Button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
      {ConfirmDialog}
  </div>
);
}

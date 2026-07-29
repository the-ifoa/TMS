import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlusCircle, HiOutlineChevronDown, HiOutlineChevronUp,
  HiOutlineSearch, HiOutlineX, HiOutlineCollection, HiOutlineArrowLeft,
  HiOutlinePencilAlt, HiOutlineTrash, HiOutlineCheck,
} from 'react-icons/hi';
import {
  listQuestionBankGroups, createQuestionBankGroup, updateQuestionBankGroup, deleteQuestionBankGroup,
  listQuestionBankItems, getQuestionBankTopics, createQuestionBankItem, updateQuestionBankItem, deleteQuestionBankItem,
} from '../api';
import QuestionEditor, { QUESTION_TYPES, createEmptyQuestion } from '../components/examQuestions/QuestionEditor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/hooks/use-confirm';

// Client-generated placeholder ids (see `uid()` in QuestionEditor.jsx) aren't
// valid Mongo ObjectIds — strip them so Mongoose assigns real ones on save.
// (Same helper as ExamBuilder.jsx — small enough that duplicating beats
// wiring up a shared module for one function.)
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

export const DIFFICULTY_BADGE = {
  easy:   'bg-emerald-50 text-emerald-700 border-emerald-200/90 font-bold',
  medium: 'bg-amber-50 text-amber-700 border-amber-200/90 font-bold',
  hard:   'bg-rose-50 text-rose-700 border-rose-200/90 font-bold',
};

export function TagBadges({ item }) {
  const diff = item.difficulty || 'medium';
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`px-2.5 py-0.5 rounded-md text-[10px] uppercase tracking-wider border shadow-2xs ${DIFFICULTY_BADGE[diff] || DIFFICULTY_BADGE.medium}`}>
        {diff}
      </span>
      {item.is_knowledge && <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80">Knowledge</span>}
      {item.is_skill && <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">Skill</span>}
      {item.is_initial && <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200/80">Initial</span>}
      {item.is_recurrent && <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/80">Recurrent</span>}
      {item.section && <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">{item.section}</span>}
    </div>
  );
}

function TagPanel({ item, onChange }) {
  return (
    <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Difficulty Level
          </label>
          <div className="flex gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60">
            {['easy', 'medium', 'hard'].map((d) => {
              const active = item.difficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChange({ ...item, difficulty: d })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                    active
                      ? d === 'easy'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : d === 'medium'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Topic / Section (Optional)
          </label>
          <input
            value={item.section || ''}
            onChange={(e) => onChange({ ...item, section: e.target.value })}
            placeholder="e.g. Fuel Systems, Hydraulics..."
            className="w-full px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 bg-white placeholder:text-slate-400 transition-all"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
          Categorization Tags
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['is_knowledge', 'Knowledge', 'bg-blue-50 border-blue-200 text-blue-700'],
            ['is_skill', 'Skill', 'bg-indigo-50 border-indigo-200 text-indigo-700'],
            ['is_initial', 'Initial', 'bg-teal-50 border-teal-200 text-teal-700'],
            ['is_recurrent', 'Recurrent', 'bg-purple-50 border-purple-200 text-purple-700'],
          ].map(([key, label, tagCls]) => {
            const checked = !!item[key];
            return (
              <label
                key={key}
                className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all select-none ${
                  checked
                    ? `${tagCls} shadow-2xs ring-1 ring-slate-900/5`
                    : 'bg-slate-50/60 border-slate-200/80 text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                }`}
              >
                <span>{label}</span>
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => onChange({ ...item, [key]: !!c })}
                  className="w-3.5 h-3.5"
                />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bank list — /admin/question-bank
// ═══════════════════════════════════════════════════════════════════════════
export default function QuestionBankList() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const { confirm, ConfirmDialog } = useConfirm();

  const load = () => {
    setLoading(true);
    listQuestionBankGroups()
      .then((res) => setGroups(res.data))
      .catch(() => toast.error('Failed to load question banks.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createGroup = async () => {
    if (!newName.trim()) return toast.error('Bank name is required.');
    setCreating(true);
    try {
      const res = await createQuestionBankGroup({ name: newName.trim(), description: newDesc.trim() });
      setGroups((prev) => [res.data, ...prev]);
      setNewName(''); setNewDesc(''); setShowCreate(false);
      navigate(`/admin/question-bank/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create question bank.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (g) => { setEditingId(g.id); setEditName(g.name); setEditDesc(g.description || ''); };
  const commitEdit = async () => {
    if (!editName.trim()) return toast.error('Bank name is required.');
    try {
      const res = await updateQuestionBankGroup(editingId, { name: editName.trim(), description: editDesc.trim() });
      setGroups((prev) => prev.map((g) => (g.id === editingId ? { ...g, ...res.data } : g)));
      setEditingId(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update question bank.');
    }
  };

  const deleteGroup = async (g) => {
    const confirmed = await confirm(
      `Delete "${g.name}"? This permanently deletes all ${g.question_count} question${g.question_count !== 1 ? 's' : ''} inside it.`,
      { title: 'Delete question bank', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;
    try {
      await deleteQuestionBankGroup(g.id);
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete question bank.');
    }
  };

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-6 lg:px-8 py-2.5 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex-shrink-0">Question Bank</h1>
            <span className="hidden sm:inline-block text-xs font-medium text-slate-400 truncate border-l border-slate-200 pl-3">
              Organize reusable questions into named banks
            </span>
          </div>
          <Button onClick={() => setShowCreate((s) => !s)} className="bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-2xs flex items-center gap-1.5 px-4 py-2 flex-shrink-0">
            <HiOutlinePlusCircle className="w-4 h-4" /> New Bank
          </Button>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4 flex-1">
        {showCreate && (
          <Card className="p-4 rounded-2xl border border-blue-200 bg-blue-50/40 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createGroup()}
                placeholder="Bank name — e.g. Initial Ground School"
                className="px-3 py-2 text-sm font-semibold border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white"
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createGroup()}
                placeholder="Description (optional)"
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)} className="rounded-xl text-xs font-bold">Cancel</Button>
              <Button size="sm" onClick={createGroup} disabled={creating} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
                {creating ? 'Creating…' : 'Create Bank'}
              </Button>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        ) : groups.length === 0 ? (
          <Card className="p-12 text-center text-sm font-medium text-slate-400 rounded-2xl flex flex-col items-center gap-2">
            <HiOutlineCollection className="w-8 h-8 text-slate-300" />
            No question banks yet. Create one to start adding reusable questions.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g) => (
              <Card key={g.id} className="p-5 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between gap-3">
                {editingId === g.id ? (
                  <div className="space-y-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                      className="w-full px-2.5 py-1.5 text-sm font-bold border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25" autoFocus />
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                      placeholder="Description" className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25" />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={commitEdit} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"><HiOutlineCheck className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><HiOutlineX className="w-4 h-4" /></button>
                    </div>
                  </div>
                ) : (
                  <div className="cursor-pointer" onClick={() => navigate(`/admin/question-bank/${g.id}`)}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
                        <HiOutlineCollection className="w-4.5 h-4.5" />
                      </div>
                      <h3 className="text-sm font-black text-slate-900 truncate">{g.name}</h3>
                    </div>
                    {g.description && <p className="text-xs text-slate-500 font-medium mt-2 line-clamp-2">{g.description}</p>}
                    <span className="inline-block mt-3 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">
                      {g.question_count} question{g.question_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                {editingId !== g.id && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                    <button type="button" onClick={() => navigate(`/admin/question-bank/${g.id}`)} className="flex-1 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-1.5">
                      Open
                    </button>
                    <button type="button" onClick={() => startEdit(g)} title="Rename" className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500">
                      <HiOutlinePencilAlt className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => deleteGroup(g)} title="Delete" className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-500 hover:text-rose-600">
                      <HiOutlineTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Bank detail — /admin/question-bank/:bankId — questions within one bank
// ═══════════════════════════════════════════════════════════════════════════
const emptyFilters = { search: '', difficulty: [], knowledge: false, skill: false, initial: false, recurrent: false, type: '', topic: '' };

export function QuestionBankDetail() {
  const { bankId } = useParams();
  const navigate = useNavigate();
  const [bankName, setBankName] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [newType, setNewType] = useState(QUESTION_TYPES[0].value);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [dirty, setDirty] = useState(() => new Set());
  const [saving, setSaving] = useState(() => new Set());
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    listQuestionBankGroups()
      .then((res) => setBankName(res.data.find((g) => g.id === bankId)?.name || 'Question Bank'))
      .catch(() => {});
    getQuestionBankTopics(bankId).then((res) => setTopics(res.data)).catch(() => {});
  }, [bankId]);

  const load = () => {
    const params = { bank_id: bankId };
    if (filters.search) params.search = filters.search;
    if (filters.difficulty.length > 0) params.difficulty = filters.difficulty.join(',');
    if (filters.knowledge) params.knowledge = '1';
    if (filters.skill) params.skill = '1';
    if (filters.initial) params.initial = '1';
    if (filters.recurrent) params.recurrent = '1';
    if (filters.type) params.type = filters.type;
    if (filters.topic) params.topic = filters.topic;
    setLoading(true);
    listQuestionBankItems(params)
      .then((res) => setItems(res.data))
      .catch(() => toast.error('Failed to load questions.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, bankId]);

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateLocal = (id, next) => {
    setItems((prev) => prev.map((it) => (it.id === id ? next : it)));
    setDirty((prev) => new Set(prev).add(id));
  };

  const addQuestion = async () => {
    setCreating(true);
    try {
      const draft = { ...stripTempIds(createEmptyQuestion(newType)), bank_id: bankId };
      const res = await createQuestionBankItem(draft);
      setItems((prev) => [...prev, res.data]);
      setExpanded((prev) => new Set(prev).add(res.data.id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create question.');
    } finally {
      setCreating(false);
    }
  };

  const saveItem = async (id, { silent = false } = {}) => {
    const item = items.find((it) => it.id === id);
    if (!item) return true;
    setSaving((prev) => new Set(prev).add(id));
    try {
      const res = await updateQuestionBankItem(id, stripTempIds(item));
      setItems((prev) => prev.map((it) => (it.id === id ? res.data : it)));
      setDirty((prev) => { const next = new Set(prev); next.delete(id); return next; });
      if (!silent) toast.success('Question saved.');
      return true;
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.error || 'Failed to save question.');
      return false;
    } finally {
      setSaving((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const saveAll = async () => {
    const ids = [...dirty];
    if (ids.length === 0) return;
    const results = await Promise.all(ids.map((id) => saveItem(id, { silent: true })));
    const failed = results.filter((ok) => !ok).length;
    if (failed === 0) toast.success(`Saved ${ids.length} question${ids.length !== 1 ? 's' : ''}.`);
    else toast.error(`Saved ${ids.length - failed}, failed to save ${failed}.`);
  };

  const deleteItem = async (id) => {
    const confirmed = await confirm('Delete this question from the bank? This cannot be undone.', { title: 'Delete question', confirmLabel: 'Delete' });
    if (!confirmed) return;
    try {
      await deleteQuestionBankItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete question.');
    }
  };

  const typeLabel = (t) => QUESTION_TYPES.find((qt) => qt.value === t)?.label || t;
  const activeFilterCount = Object.values(filters).filter((v) => (Array.isArray(v) ? v.length > 0 : !!v)).length;

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md px-3.5 sm:px-6 lg:px-8 py-2.5 shadow-2xs border-b border-slate-200/80">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/question-bank')} className="rounded-xl border-slate-200 text-xs font-semibold flex-shrink-0">
              <HiOutlineArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">All Banks</span>
            </Button>
            <div className="h-4 w-px bg-slate-200 flex-shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">{bankName}</h1>
            <span className="hidden sm:inline-block text-xs font-medium text-slate-400 truncate border-l border-slate-200 pl-3 flex-shrink-0">
              {items.length} question{items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="w-40 bg-white rounded-xl text-xs hidden sm:flex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {dirty.size > 0 && (
              <Button
                onClick={saveAll}
                disabled={saving.size > 0}
                variant="outline"
                className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs sm:text-sm font-bold rounded-xl shadow-2xs flex items-center gap-1.5 px-4 py-2 flex-shrink-0"
              >
                Save All ({dirty.size})
              </Button>
            )}
            <Button onClick={addQuestion} disabled={creating} className="bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-2xs flex items-center gap-1.5 px-4 py-2 flex-shrink-0">
              <HiOutlinePlusCircle className="w-4 h-4" /> {creating ? 'Adding…' : 'New Question'}
            </Button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4 flex-1">
        {/* Filter bar */}
        <Card className="p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search question text…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
              />
            </div>
            <Select value={filters.type || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, type: v === 'all' ? '' : v }))}>
              <SelectTrigger className="w-40 bg-white rounded-xl text-xs"><SelectValue placeholder="Question type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any type</SelectItem>
                {QUESTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {topics.length > 0 && (
              <Select value={filters.topic || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, topic: v === 'all' ? '' : v }))}>
                <SelectTrigger className="w-36 bg-white rounded-xl text-xs"><SelectValue placeholder="Topic" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any topic</SelectItem>
                  {topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {activeFilterCount > 0 && (
              <button type="button" onClick={() => setFilters(emptyFilters)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1.5">
                <HiOutlineX className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['easy', 'medium', 'hard'].map((d) => (
              <label key={d} className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer capitalize transition-all ${filters.difficulty.includes(d) ? DIFFICULTY_BADGE[d] : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                <Checkbox
                  checked={filters.difficulty.includes(d)}
                  onCheckedChange={() => setFilters((f) => ({
                    ...f, difficulty: f.difficulty.includes(d) ? f.difficulty.filter((x) => x !== d) : [...f.difficulty, d],
                  }))}
                />
                {d}
              </label>
            ))}
            <span className="w-px h-4 bg-slate-200 mx-0.5" />
            {[
              ['knowledge', 'Knowledge'], ['skill', 'Skill'], ['initial', 'Initial'], ['recurrent', 'Recurrent'],
            ].map(([key, label]) => (
              <label key={key} className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all ${filters[key] ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                <Checkbox checked={filters[key]} onCheckedChange={(c) => setFilters((f) => ({ ...f, [key]: !!c }))} className={filters[key] ? 'border-white' : ''} />
                {label}
              </label>
            ))}
          </div>
        </Card>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-12 text-center text-sm font-medium text-slate-400 rounded-2xl flex flex-col items-center gap-2">
            <HiOutlineCollection className="w-8 h-8 text-slate-300" />
            {activeFilterCount > 0 ? 'No questions match these filters.' : 'No questions in this bank yet — add one above.'}
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => {
              const isExpanded = expanded.has(item.id);
              const isDirty = dirty.has(item.id);
              const isSaving = saving.has(item.id);
              return (
                <div key={item.id} className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50/60 transition-colors"
                  >
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg flex-shrink-0">
                      {typeLabel(item.type)}
                    </span>
                    <p className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">
                      {item.prompt || '(no prompt yet)'}
                    </p>
                    <div className="hidden md:block flex-shrink-0"><TagBadges item={item} /></div>
                    <span className="text-xs font-bold text-slate-400 flex-shrink-0">{item.points} pt{item.points !== 1 ? 's' : ''}</span>
                    {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" title="Unsaved changes" />}
                    {isExpanded ? <HiOutlineChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <HiOutlineChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                  </button>
                  <div className="md:hidden px-4 pb-3"><TagBadges item={item} /></div>

                  {isExpanded && (
                    <div className="p-4 sm:p-5 border-t border-slate-100 space-y-4 bg-slate-50/40">
                      <TagPanel item={item} onChange={(next) => updateLocal(item.id, next)} />
                      <QuestionEditor
                        question={item}
                        index={idx}
                        isFirst
                        isLast
                        onMoveUp={() => {}}
                        onMoveDown={() => {}}
                        sectionNames={[]}
                        onChange={(next) => updateLocal(item.id, next)}
                        onDelete={() => deleteItem(item.id)}
                      />
                      <div className="flex items-center justify-end gap-2 pt-1">
                        {isDirty && <span className="text-[11px] font-bold text-amber-600 mr-auto">Unsaved changes</span>}
                        <Button size="sm" variant="outline" onClick={() => toggleExpand(item.id)} className="rounded-xl border-slate-200 text-xs font-bold">
                          Collapse
                        </Button>
                        <Button size="sm" onClick={() => saveItem(item.id)} disabled={!isDirty || isSaving} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
                          {isSaving ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}

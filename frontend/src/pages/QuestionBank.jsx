import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlusCircle, HiOutlineChevronDown, HiOutlineChevronUp,
  HiOutlineSearch, HiOutlineX, HiOutlineCollection, HiOutlineArrowLeft,
  HiOutlinePencilAlt, HiOutlineTrash, HiOutlineCheck, HiOutlineFilter,
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
      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border shadow-2xs ${DIFFICULTY_BADGE[diff] || DIFFICULTY_BADGE.medium}`}>
        {diff}
      </span>
      {item.is_knowledge && <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80">Knowledge</span>}
      {item.is_skill && <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">Skill</span>}
      {item.is_initial && <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200/80">Initial</span>}
      {item.is_recurrent && <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/80">Recurrent</span>}
      {item.section && <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200/80">{item.section}</span>}
    </div>
  );
}

function TagPanel({ item, onChange }) {
  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 space-y-5 shadow-2xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">
            Difficulty Level
          </label>
          <div className="flex gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 h-[42px] items-center">
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
          <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">
            Topic / Section (Optional)
          </label>
          <input
            value={item.section || ''}
            onChange={(e) => onChange({ ...item, section: e.target.value })}
            placeholder="e.g. Fuel Systems, Hydraulics..."
            className="w-full h-[42px] px-3.5 text-xs font-medium border border-slate-200/90 rounded-xl outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 bg-white placeholder:text-slate-400 transition-all"
          />
        </div>
      </div>

      <div className="pt-1">
        <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">
          Categorization Tags
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            ['is_knowledge', 'Knowledge', 'bg-blue-50/80 border-blue-200 text-blue-700'],
            ['is_skill', 'Skill', 'bg-indigo-50/80 border-indigo-200 text-indigo-700'],
            ['is_initial', 'Initial', 'bg-teal-50/80 border-teal-200 text-teal-700'],
            ['is_recurrent', 'Recurrent', 'bg-purple-50/80 border-purple-200 text-purple-700'],
          ].map(([key, label, tagCls]) => {
            const checked = !!item[key];
            return (
              <button
                type="button"
                key={key}
                onClick={() => onChange({ ...item, [key]: !checked })}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all select-none ${
                  checked
                    ? `${tagCls} shadow-2xs ring-1 ring-slate-900/5`
                    : 'bg-slate-50/60 border-slate-200/80 text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                }`}
              >
                <span>{label}</span>
                <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                  checked ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {checked && <HiOutlineCheck className="w-3 h-3 text-white" />}
                </div>
              </button>
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
export default function QuestionBankList({ embedded = false, showCreateState, setShowCreateState }) {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [internalShowCreate, setInternalShowCreate] = useState(false);
  
  const showCreate = setShowCreateState ? showCreateState : internalShowCreate;
  const setShowCreate = setShowCreateState ? setShowCreateState : setInternalShowCreate;

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [bankSearch, setBankSearch] = useState('');
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
    <div className={embedded ? "w-full" : "w-full min-h-full pb-20 flex flex-col"}>
      {!embedded && (
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
      )}

      <div className={embedded ? "w-full space-y-4" : "w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4 flex-1"}>
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

        {!loading && groups.length > 0 && (
          <div className="relative max-w-md">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
              placeholder="Search banks by name or description…"
              className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {bankSearch && (
              <button type="button" onClick={() => setBankSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
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
        ) : (() => {
          const q = bankSearch.trim().toLowerCase();
          const shown = q
            ? groups.filter((g) => (g.name || '').toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q))
            : groups;
          if (shown.length === 0) {
            return (
              <Card className="p-12 text-center text-sm font-medium text-slate-400 rounded-2xl">
                No banks match “{bankSearch}”.
              </Card>
            );
          }
          return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {shown.map((g) => (
              <Card key={g.id} className="group p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-slate-300 transition-all duration-200 flex flex-col justify-between">
                {editingId === g.id ? (
                  <div className="space-y-3">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                      className="w-full px-3 py-1.5 text-sm font-bold border border-blue-400 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" autoFocus />
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                      placeholder="Description" className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" />
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-8 rounded-xl text-xs font-bold">Cancel</Button>
                      <Button size="sm" onClick={commitEdit} className="h-8 rounded-xl bg-slate-900 text-white text-xs font-bold px-3">Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 cursor-pointer" onClick={() => navigate(`/admin/question-bank/${g.id}`)}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-600/90 text-white flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                        <HiOutlineCollection className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900 break-words group-hover:text-indigo-600 transition-colors" title={g.name}>
                          {g.name}
                        </h3>
                        <span className="inline-block mt-0.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                          {g.question_count} question{g.question_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    <div className="h-9 flex items-center">
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                        {g.description || <span className="italic text-slate-300">No description provided</span>}
                      </p>
                    </div>
                  </div>
                )}
                {editingId !== g.id && (
                  <div className="flex items-center gap-2 pt-3.5 mt-3.5 border-t border-slate-100/90">
                    <Button
                      type="button"
                      onClick={() => navigate(`/admin/question-bank/${g.id}`)}
                      className="flex-1 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 h-8 shadow-2xs"
                    >
                      Open Bank
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => startEdit(g)}
                      title="Rename"
                      className="h-8 w-8 p-0 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-500 hover:text-slate-900"
                    >
                      <HiOutlinePencilAlt className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => deleteGroup(g)}
                      title="Delete"
                      className="h-8 w-8 p-0 rounded-xl bg-white border border-slate-200/90 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600"
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
          );
        })()}
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
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const rightSidebarRef = useRef(null);
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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (rightSidebarRef.current) {
          rightSidebarRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return next;
    });
  };

  const updateLocal = (id, next) => {
    setItems((prev) => prev.map((it) => (it.id === id ? next : it)));
    setDirty((prev) => new Set(prev).add(id));
  };

  const toggleSelect = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((it) => it.id)));
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const confirmed = await confirm(
      `Are you sure you want to delete ${count} selected question${count !== 1 ? 's' : ''}?`,
      { title: 'Bulk Delete Questions', confirmLabel: 'Delete All' }
    );
    if (!confirmed) return;

    try {
      await Promise.all([...selectedIds].map((id) => deleteQuestionBankItem(id)));
      setItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
      setSelectedIds(new Set());
      toast.success(`Deleted ${count} question${count !== 1 ? 's' : ''}.`);
    } catch (err) {
      toast.error('Failed to delete some questions.');
    }
  };

  const bulkSetPoints = (pts) => {
    if (selectedIds.size === 0 || isNaN(pts)) return;
    const count = selectedIds.size;
    setItems((prev) => prev.map((it) => (selectedIds.has(it.id) ? { ...it, points: pts } : it)));
    setDirty((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    toast.success(`Set points to ${pts} for ${count} question${count !== 1 ? 's' : ''}.`);
  };

  const bulkSetDifficulty = (diff) => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setItems((prev) => prev.map((it) => (selectedIds.has(it.id) ? { ...it, difficulty: diff } : it)));
    setDirty((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    toast.success(`Set difficulty to "${diff}" for ${count} question${count !== 1 ? 's' : ''}.`);
  };

  const addQuestion = async () => {
    setCreating(true);
    try {
      const draft = { ...stripTempIds(createEmptyQuestion(newType)), bank_id: bankId };
      const res = await createQuestionBankItem(draft);
      setItems((prev) => [...prev, res.data]);
      setExpanded((prev) => new Set(prev).add(res.data.id));

      // Auto-scroll smooth into view to focus on the newly created question
      setTimeout(() => {
        const el = document.getElementById(`q-item-${res.data.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
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
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/exams?tab=question-bank')} className="rounded-xl border-slate-200 text-xs font-semibold flex-shrink-0">
              <HiOutlineArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">All Banks</span>
            </Button>
            <div className="h-4 w-px bg-slate-200 flex-shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight break-words">{bankName}</h1>
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

      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT SECTION: Questions List */}
          <div className="order-2 lg:order-1 lg:col-span-8 space-y-3">

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
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      id={`q-item-${item.id}`}
                      className={`group bg-white border rounded-2xl shadow-2xs hover:shadow-xs transition-all ${
                        isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/15'
                          : isExpanded
                          ? 'border-slate-400 ring-2 ring-slate-900/5'
                          : 'border-slate-200/90 hover:border-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50/60 transition-colors rounded-2xl"
                      >
                        <div
                          onClick={(e) => toggleSelect(item.id, e)}
                          className="p-1 hover:bg-slate-200/60 rounded-lg transition-colors flex items-center justify-center flex-shrink-0"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleSelect(item.id, e)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                          />
                        </div>
                        <span className="w-7 h-7 rounded-xl bg-slate-100 border border-slate-200/80 text-slate-700 font-black text-xs flex items-center justify-center flex-shrink-0 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900 transition-all">
                          {idx + 1}
                        </span>
                        <span className="text-[11px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg flex-shrink-0 tracking-wide">
                          {typeLabel(item.type)}
                        </span>
                        <p className="flex-1 min-w-0 text-sm font-bold text-slate-900 truncate">
                          {item.prompt || '(no prompt specified yet)'}
                        </p>
                        <div className="hidden md:block flex-shrink-0"><TagBadges item={item} /></div>
                        <span className="text-xs font-extrabold text-slate-500 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg flex-shrink-0">
                          {item.points} pt{item.points !== 1 ? 's' : ''}
                        </span>
                        {isDirty && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" title="Unsaved changes" />}
                        <div className="w-7 h-7 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700 transition-all flex-shrink-0">
                          {isExpanded ? <HiOutlineChevronUp className="w-4 h-4" /> : <HiOutlineChevronDown className="w-4 h-4" />}
                        </div>
                      </button>
                      <div className="md:hidden px-4 pb-3"><TagBadges item={item} /></div>

                      {isExpanded && (
                        <div className="p-4 sm:p-6 border-t border-slate-200/80 space-y-5 bg-slate-50/50 rounded-b-2xl">
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
                          <div className="flex items-center justify-between pt-3 border-t border-slate-200/70">
                            <div>
                              {isDirty ? (
                                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Unsaved changes
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-slate-400">All changes saved</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => toggleExpand(item.id)} className="rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50">
                                Collapse
                              </Button>
                              <Button size="sm" onClick={() => saveItem(item.id)} disabled={!isDirty || isSaving} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 shadow-2xs">
                                {isSaving ? 'Saving…' : 'Save Question'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT SECTION: Filters & Controls Sidebar */}
          <div ref={rightSidebarRef} className="order-1 lg:order-2 lg:col-span-4 space-y-4 lg:sticky lg:top-20">
            {/* Bulk Actions Card (Light Theme) */}
            {selectedIds.size > 0 && (
              <Card className="p-4 bg-white border border-indigo-200/90 rounded-2xl shadow-sm space-y-3.5 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === items.length && items.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                    />
                    <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                      {selectedIds.size} Selected
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
                    title="Clear selection"
                  >
                    <HiOutlineX className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Set Difficulty Level
                    </span>
                    <div className="grid grid-cols-3 gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200/80">
                      {['easy', 'medium', 'hard'].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => bulkSetDifficulty(d)}
                          className="text-[10px] font-extrabold uppercase tracking-wider py-1 rounded-lg bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-900 hover:text-white transition-all shadow-2xs text-center"
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Set Points:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        defaultValue="1"
                        id="bulk-pts-input-side"
                        className="w-12 text-center bg-slate-50 text-slate-900 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none focus:border-slate-400 py-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = Number(document.getElementById('bulk-pts-input-side')?.value);
                          if (val) bulkSetPoints(val);
                        }}
                        className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1 rounded-lg transition-all"
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100">
                    <Button
                      size="sm"
                      onClick={bulkDelete}
                      className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 text-xs font-bold rounded-xl py-1.5 h-9 flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <HiOutlineTrash className="w-4 h-4 text-rose-600" /> Delete Selected ({selectedIds.size})
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Top Bar: Total Count & Expand All */}
            <Card className="p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs bg-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {items.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedIds.size === items.length && items.length > 0}
                    onChange={toggleSelectAll}
                    title="Select / Deselect All Questions"
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                  />
                )}
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  {items.length} Question{items.length !== 1 ? 's' : ''} Listed
                </span>
                {activeFilterCount > 0 && (
                  <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                    {activeFilterCount} Active
                  </span>
                )}
              </div>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (expanded.size === items.length) {
                      setExpanded(new Set());
                    } else {
                      setExpanded(new Set(items.map((i) => i.id)));
                    }
                  }}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 px-3 py-1 rounded-xl transition-all"
                >
                  {expanded.size === items.length ? 'Collapse All' : 'Expand All'}
                </button>
              )}
            </Card>

            {/* Filters Sidebar */}
            <Card className="p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-4 bg-white">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <HiOutlineFilter className="w-4 h-4 text-slate-600" />
                  <h3 className="text-sm font-extrabold text-slate-900">Filters & Search</h3>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilters(emptyFilters)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
              </div>

              {/* Search */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                  Search Prompt
                </label>
                <div className="relative">
                  <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search question text…"
                    value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
                  />
                </div>
              </div>

              {/* Question Type */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                  Question Type
                </label>
                <Select value={filters.type || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, type: v === 'all' ? '' : v }))}>
                  <SelectTrigger className="w-full bg-slate-50 rounded-xl text-xs border-slate-200/80 h-9 font-medium"><SelectValue placeholder="Any type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any type</SelectItem>
                    {QUESTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Topic / Section */}
              {topics.length > 0 && (
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                    Topic / Section
                  </label>
                  <Select value={filters.topic || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, topic: v === 'all' ? '' : v }))}>
                    <SelectTrigger className="w-full bg-slate-50 rounded-xl text-xs border-slate-200/80 h-9 font-medium"><SelectValue placeholder="Any topic" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any topic</SelectItem>
                      {topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Difficulty */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                  Difficulty Level
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60">
                  {['easy', 'medium', 'hard'].map((d) => {
                    const checked = filters.difficulty.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setFilters((f) => ({
                          ...f, difficulty: f.difficulty.includes(d) ? f.difficulty.filter((x) => x !== d) : [...f.difficulty, d],
                        }))}
                        className={`py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                          checked
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

              {/* Categorization Tags */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                  Categorization Tags
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['knowledge', 'Knowledge'], ['skill', 'Skill'], ['initial', 'Initial'], ['recurrent', 'Recurrent'],
                  ].map(([key, label]) => {
                    const checked = filters[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, [key]: !checked }))}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all select-none ${
                          checked
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-slate-50/70 border-slate-200/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <span>{label}</span>
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                          checked ? 'bg-white border-white text-slate-900' : 'border-slate-300 bg-white'
                        }`}>
                          {checked && <HiOutlineCheck className="w-3 h-3 text-slate-900" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft, HiOutlinePlusCircle, HiOutlineSave, HiOutlineEye,
  HiOutlinePencilAlt, HiOutlineTrash, HiOutlineCheck, HiOutlineX,
  HiOutlineCollection, HiOutlineSearch, HiOutlineCalendar, HiOutlineClock,
  HiOutlineDuplicate,
} from 'react-icons/hi';
import { getExam, createExam, updateExam, listQuestionBankGroups, listQuestionBankItems, getQuestionBankTopics, createQuestionBankItem } from '../api';
import { useAuth } from '../context/AuthContext';
import QuestionEditor, { QUESTION_TYPES, createEmptyQuestion } from '../components/examQuestions/QuestionEditor';
import { TagBadges, DIFFICULTY_BADGE } from './QuestionBank';
import QuestionPlayer from '../components/examPlayers/QuestionPlayer';
import ExamRunner from '../components/ExamRunner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/hooks/use-confirm';
import { TimePicker } from '@/components/ui/time-picker';

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
  opens_at: null, closes_at: null, section_settings: [],
});

// datetime-local inputs work in local time with no timezone suffix; Mongo
// dates round-trip as ISO strings — convert between the two on read/write.
function getLocalDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getLocalTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineDateTimeToIso(dateStr, timeStr, defaultTime = '00:00') {
  if (!dateStr) return null;
  const time = timeStr || defaultTime;
  const d = new Date(`${dateStr}T${time}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function formatIsoDisplay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function DateTimeInputCard({ label, isoValue, onChange, defaultTime = '09:00', borderAccent = 'blue' }) {
  const dateVal = getLocalDate(isoValue);
  const timeVal = getLocalTime(isoValue);
  const formattedDisplay = formatIsoDisplay(isoValue);

  const handleDateChange = (e) => {
    const d = e.target.value;
    if (!d) {
      onChange(null);
    } else {
      onChange(combineDateTimeToIso(d, timeVal || defaultTime, defaultTime));
    }
  };

  const handleTimeChange = (t) => {
    const d = dateVal || getLocalDate(new Date().toISOString());
    onChange(combineDateTimeToIso(d, t, defaultTime));
  };

  return (
    <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-3 space-y-2.5 transition-all hover:border-slate-300 hover:bg-slate-50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-800">
          {label}
        </span>
        {isoValue && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] font-bold text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-1.5 py-0.5 rounded transition-colors"
            title="Clear restriction"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Date Field */}
        <div>
          <label className="block text-[10px] font-extrabold text-blue-600 uppercase tracking-wider mb-1 flex items-center gap-1">
            <HiOutlineCalendar className="w-3.5 h-3.5 text-blue-600" />
            Date
          </label>
          <input
            type="date"
            value={dateVal}
            onChange={handleDateChange}
            className="w-full px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 shadow-2xs transition-all cursor-pointer"
          />
        </div>

        {/* Time Field */}
        <div>
          <label className={`block text-[10px] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1 ${dateVal ? 'text-purple-600' : 'text-slate-400'}`}>
            <HiOutlineClock className={`w-3.5 h-3.5 ${dateVal ? 'text-purple-600' : 'text-slate-400'}`} />
            Time
          </label>
          <TimePicker
            value={timeVal}
            onChange={handleTimeChange}
            disabled={!dateVal}
          />
        </div>
      </div>

      {formattedDisplay && (
        <div className="pt-1.5 border-t border-slate-200/60 text-[10px] font-medium text-slate-500 flex items-center justify-between gap-1">
          <span className="text-slate-400 font-semibold flex-shrink-0">Scheduled:</span>
          <span className="text-slate-800 font-bold bg-white px-2 py-0.5 rounded border border-slate-200/80 shadow-2xs truncate">
            {formattedDisplay}
          </span>
        </div>
      )}
    </div>
  );
}

const uid = () => `new-${Math.random().toString(36).slice(2, 10)}`;

// A bank item carries classification tags (difficulty, knowledge/skill,
// initial/recurrent) an exam question doesn't have — Mongoose would silently
// drop them anyway (not in questionSchema), but stripping here keeps the
// client-side exam state clean. Also swaps in a fresh temp _id so importing
// the same bank question twice doesn't collide.
function bankItemToQuestion(item, section) {
  const {
    id, _id, created_by, created_at, updated_at, __v,
    difficulty, is_knowledge, is_skill, is_initial, is_recurrent,
    ...rest
  } = item;
  return { ...rest, _id: uid(), section };
}

const emptyBankFilters = { search: '', difficulty: [], knowledge: false, skill: false, initial: false, recurrent: false, type: '', topic: '' };

function shuffled(arr) {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function QuestionBankPicker({ open, onClose, sectionNames, onImport }) {
  const [groups, setGroups] = useState([]);
  const [bankId, setBankId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState([]);
  const [filters, setFilters] = useState(emptyBankFilters);
  const [selected, setSelected] = useState(() => new Set());
  const [targetSection, setTargetSection] = useState('');
  const [previewItem, setPreviewItem] = useState(null);
  // Questions the admin explicitly unchecked during this picker session —
  // Auto Select never re-suggests them, so rejecting a bad pick sticks.
  const [rejectedIds, setRejectedIds] = useState(() => new Set());
  // Questions already imported into the exam this session (via a previous
  // "Add Selected") — also excluded from future auto-select, even if the
  // admin later deletes that question back out of the exam question list.
  const [importedIds, setImportedIds] = useState(() => new Set());
  const [autoCount, setAutoCount] = useState(5);
  const toggleDifficulty = (d) => setFilters((f) => ({
    ...f, difficulty: f.difficulty.includes(d) ? f.difficulty.filter((x) => x !== d) : [...f.difficulty, d],
  }));

  useEffect(() => {
    if (!open) return;
    listQuestionBankGroups()
      .then((res) => {
        setGroups(res.data);
        setBankId((prev) => prev || res.data[0]?.id || '');
      })
      .catch(() => toast.error('Failed to load question banks.'));
  }, [open]);

  useEffect(() => {
    if (!open || !bankId) return;
    getQuestionBankTopics(bankId).then((res) => setTopics(res.data)).catch(() => {});
  }, [open, bankId]);

  // Reset rejections/imports when switching banks — they only make sense
  // against the pool they came from. Both otherwise persist across
  // close/reopen and across repeated Auto Select clicks within this bank.
  useEffect(() => { setRejectedIds(new Set()); setImportedIds(new Set()); }, [bankId]);

  useEffect(() => {
    if (!open || !bankId) { setItems([]); setLoading(false); return; }
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
    const t = setTimeout(() => {
      listQuestionBankItems(params)
        .then((res) => setItems(res.data))
        .catch(() => toast.error('Failed to load questions.'))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [open, bankId, filters]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
      // Unchecking = rejecting — don't suggest it again this session.
      setRejectedIds((r) => new Set(r).add(id));
    } else {
      next.add(id);
    }
    return next;
  });

  const selectAllFiltered = () => setSelected(new Set(items.map((it) => it.id)));
  const clearSelection = () => setSelected(new Set());

  // Randomly picks `autoCount` questions from the current filtered pool,
  // skipping anything already rejected this session, and replaces whatever
  // was selected before with the fresh batch — repeated clicks shuffle
  // differently each time as long as the pool has enough candidates left.
  const autoSelect = () => {
    const pool = items.filter((it) => !rejectedIds.has(it.id) && !importedIds.has(it.id));
    if (pool.length === 0) {
      toast.error('No unique questions left in this bank matching your filters — you\'ve already added or removed them all.');
      return;
    }
    const picks = shuffled(pool).slice(0, Math.max(1, autoCount));
    setSelected(new Set(picks.map((p) => p.id)));
    if (picks.length < autoCount) {
      toast.error(`Only ${picks.length} unique question${picks.length !== 1 ? 's' : ''} left matching your filters — the rest were already added or removed.`);
    } else {
      toast.success(`Auto-selected ${picks.length} question${picks.length !== 1 ? 's' : ''}.`);
    }
  };

  const handleImport = () => {
    const chosen = items.filter((it) => selected.has(it.id));
    if (chosen.length === 0) return;
    onImport(chosen.map((it) => bankItemToQuestion(it, targetSection)));
    setImportedIds((prev) => { const next = new Set(prev); chosen.forEach((it) => next.add(it.id)); return next; });
    toast.success(`Imported ${chosen.length} question${chosen.length !== 1 ? 's' : ''} from the bank.`);
    setSelected(new Set());
    onClose();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-full h-[85vh] max-h-[850px] min-h-[550px] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
        <div className="flex-shrink-0 px-5 py-4 border-b border-slate-200/80 space-y-3">
          <DialogTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
            <HiOutlineCollection className="w-4.5 h-4.5 text-slate-400" /> Import from Question Bank
          </DialogTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={bankId} onValueChange={(v) => { setBankId(v); setSelected(new Set()); }}>
              <SelectTrigger className="w-48 bg-white rounded-xl text-xs font-bold"><SelectValue placeholder="Choose a bank…" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.question_count})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search question text…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
              />
            </div>
            {topics.length > 0 && (
              <Select value={filters.topic || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, topic: v === 'all' ? '' : v }))}>
                <SelectTrigger className="w-32 bg-white rounded-xl text-xs"><SelectValue placeholder="Topic" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any topic</SelectItem>
                  {topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['easy', 'medium', 'hard'].map((d) => (
              <label key={d} className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer capitalize transition-all ${filters.difficulty.includes(d) ? DIFFICULTY_BADGE[d] : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                <Checkbox checked={filters.difficulty.includes(d)} onCheckedChange={() => toggleDifficulty(d)} />
                {d}
              </label>
            ))}
            <span className="w-px h-4 bg-slate-200 mx-0.5" />
            {[['knowledge', 'Knowledge'], ['skill', 'Skill'], ['initial', 'Initial'], ['recurrent', 'Recurrent']].map(([key, label]) => (
              <label key={key} className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${filters[key] ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                <Checkbox checked={filters[key]} onCheckedChange={(c) => setFilters((f) => ({ ...f, [key]: !!c }))} className={filters[key] ? 'border-white' : ''} />
                {label}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-500">Auto Select</span>
            <input
              type="number" min="1"
              value={autoCount}
              onChange={(e) => setAutoCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 px-2 py-1 text-xs font-bold text-center border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
            />
            <span className="text-xs font-medium text-slate-400">questions matching filters, randomly</span>
            <Button size="sm" variant="outline" onClick={autoSelect} disabled={items.length === 0} className="rounded-xl border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold ml-auto">
              <HiOutlineCollection className="w-3.5 h-3.5" /> Auto Select
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[350px] px-5 py-3 space-y-2">
          {groups.length === 0 ? (
            <p className="text-xs text-slate-400 font-medium py-8 text-center">No question banks yet. Create one from the Question Bank page first.</p>
          ) : loading ? (
            <div className="space-y-2 pt-2">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-400 font-medium py-8 text-center">No questions match these filters.</p>
          ) : (
            items.map((item) => (
              <label
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selected.has(item.id) ? 'bg-blue-50/60 border-blue-200' : 'bg-white border-slate-200/80 hover:bg-slate-50'}`}
              >
                <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} className="flex-shrink-0" />
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-lg flex-shrink-0">
                  {QUESTION_TYPES.find((t) => t.value === item.type)?.label || item.type}
                </span>
                <span className="flex-1 min-w-0 text-xs font-semibold text-slate-800 truncate">{item.prompt || '(no prompt)'}</span>
                {importedIds.has(item.id) && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg flex-shrink-0" title="Already imported into this exam this session — skipped by Auto Select">
                    Added
                  </span>
                )}
                <div className="hidden sm:block flex-shrink-0"><TagBadges item={item} /></div>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewItem(item); }}
                  title="Preview question"
                  className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <HiOutlineEye className="w-4 h-4" />
                </button>
              </label>
            ))
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-3.5 border-t border-slate-200/80 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button type="button" onClick={selectAllFiltered} disabled={items.length === 0} className="text-xs font-bold text-blue-600 hover:text-blue-800 disabled:opacity-40">
              Select all ({items.length})
            </button>
            {selected.size > 0 && (
              <button type="button" onClick={clearSelection} className="text-xs font-bold text-slate-400 hover:text-slate-700">
                Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-semibold text-slate-500">Add into</span>
            <Select value={targetSection || '__ungrouped'} onValueChange={(v) => setTargetSection(v === '__ungrouped' ? '' : v)}>
              <SelectTrigger className="w-36 bg-white rounded-xl text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ungrouped">Ungrouped</SelectItem>
                {sectionNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleImport} disabled={selected.size === 0} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
              Add {selected.size > 0 ? `${selected.size} ` : ''}Selected
            </Button>
          </div>
        </div>
      </DialogContent>
      </Dialog>
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-2xl w-full max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
          <div className="flex-shrink-0 px-5 py-4 border-b border-slate-200/80 flex items-center justify-between gap-3">
            <DialogTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
              <HiOutlineEye className="w-4.5 h-4.5 text-slate-400" /> Question Preview
            </DialogTitle>
            {previewItem && <TagBadges item={previewItem} />}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-5">
            {previewItem && <QuestionPlayer question={previewItem} response={null} onChange={() => {}} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SendToBankModal({ question, onClose }) {
  const [groups, setGroups] = useState([]);
  const [bankId, setBankId] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!question) return;
    listQuestionBankGroups()
      .then((res) => { setGroups(res.data); setBankId(res.data[0]?.id || ''); })
      .catch(() => toast.error('Failed to load question banks.'));
  }, [question]);

  const send = async () => {
    if (!bankId) return;
    setSending(true);
    try {
      const { _id, id, ...rest } = stripTempIds(question);
      await createQuestionBankItem({ ...rest, bank_id: bankId });
      toast.success('Sent to question bank.');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send question to bank.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!question} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-full rounded-2xl border border-slate-200/80 shadow-2xl bg-white p-5 space-y-4">
        <DialogTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
          <HiOutlineCollection className="w-4.5 h-4.5 text-slate-400" /> Send to Question Bank
        </DialogTitle>
        <p className="text-xs text-slate-500 font-medium truncate">{question?.prompt || '(no prompt)'}</p>
        {groups.length === 0 ? (
          <p className="text-xs text-slate-400 font-medium py-4 text-center">No question banks yet. Create one from the Question Bank page first.</p>
        ) : (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Choose a bank</label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger className="w-full bg-white rounded-xl text-xs"><SelectValue placeholder="Choose a bank…" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.question_count})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl text-xs font-bold">Cancel</Button>
          <Button size="sm" onClick={send} disabled={!bankId || sending} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ExamBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const base = isAdmin ? '/admin/exams' : '/airline/exams';
  const isNew = !id;

  const [exam, setExam] = useState(emptyExam());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState(QUESTION_TYPES[0].value);
  const [previewing, setPreviewing] = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const importFromBank = (newQuestions) => {
    setExam((prev) => ({ ...prev, questions: [...prev.questions, ...newQuestions] }));
  };
  const [sendToBankQuestion, setSendToBankQuestion] = useState(null);

  const startPreview = () => {
    if (exam.questions.length === 0) { toast.error('Add at least one question first.'); return; }
    setPreviewing(true);
  };
  const exitPreview = () => setPreviewing(false);
  const previewAttempt = {
    id: 'preview',
    questions_snapshot: exam.questions,
    answers: [],
    started_at: new Date().toISOString(),
    violation_count: 0,
  };
  const [newSectionName, setNewSectionName] = useState('');
  const [editingSection, setEditingSection] = useState(null); // section name currently being renamed
  const [editingSectionValue, setEditingSectionValue] = useState('');
  const [bulkTargetSection, setBulkTargetSection] = useState('');
  const [activeSectionFilter, setActiveSectionFilter] = useState(null); // null = show all, '' = Ungrouped, else a section name
  const { confirm, ConfirmDialog } = useConfirm();

  const [selectedQIds, setSelectedQIds] = useState(() => new Set());
  const rightSidebarRef = useRef(null);
  const getQKey = (q, idx) => q._id || idx;

  useEffect(() => {
    if (selectedQIds.size > 0 && rightSidebarRef.current) {
      rightSidebarRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedQIds.size]);

  const toggleSelectQuestion = (qId) => {
    setSelectedQIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const selectAllQuestions = () => {
    if (selectedQIds.size === exam.questions.length) {
      setSelectedQIds(new Set());
    } else {
      setSelectedQIds(new Set(exam.questions.map((q, idx) => getQKey(q, idx))));
    }
  };

  const clearQuestionSelection = () => {
    setSelectedQIds(new Set());
  };

  const bulkDeleteQuestions = async () => {
    if (selectedQIds.size === 0) return;
    const count = selectedQIds.size;
    const confirmed = await confirm(
      `Are you sure you want to delete ${count} selected question${count > 1 ? 's' : ''}?`,
      { title: 'Delete Selected Questions', confirmLabel: 'Delete All' }
    );
    if (!confirmed) return;
    setExam((prev) => ({
      ...prev,
      questions: prev.questions.filter((q, idx) => !selectedQIds.has(getQKey(q, idx))),
    }));
    setSelectedQIds(new Set());
    toast.success(`Deleted ${count} question${count > 1 ? 's' : ''}.`);
  };

  const bulkMoveToSection = (targetSection) => {
    if (selectedQIds.size === 0) return;
    const count = selectedQIds.size;
    setExam((prev) => ({
      ...prev,
      questions: prev.questions.map((q, idx) =>
        selectedQIds.has(getQKey(q, idx)) ? { ...q, section: targetSection } : q
      ),
    }));
    toast.success(`Moved ${count} question${count > 1 ? 's' : ''} to ${targetSection || 'Ungrouped'}.`);
  };

  const bulkSetPoints = (pts) => {
    if (selectedQIds.size === 0 || isNaN(pts)) return;
    const count = selectedQIds.size;
    setExam((prev) => ({
      ...prev,
      questions: prev.questions.map((q, idx) =>
        selectedQIds.has(getQKey(q, idx)) ? { ...q, points: pts } : q
      ),
    }));
    toast.success(`Set points to ${pts} for ${count} question${count > 1 ? 's' : ''}.`);
  };

  const bulkDuplicateQuestions = () => {
    if (selectedQIds.size === 0) return;
    const count = selectedQIds.size;
    setExam((prev) => {
      const nextQuestions = [];
      prev.questions.forEach((q, idx) => {
        nextQuestions.push(q);
        if (selectedQIds.has(getQKey(q, idx))) {
          const copy = JSON.parse(JSON.stringify(q));
          copy._id = uid();
          if (copy.prompt) copy.prompt = `${copy.prompt} (Copy)`;
          nextQuestions.push(copy);
        }
      });
      return { ...prev, questions: nextQuestions };
    });
    setSelectedQIds(new Set());
    toast.success(`Duplicated ${count} question${count > 1 ? 's' : ''}.`);
  };

  useEffect(() => {
    if (isNew) return;
    getExam(id).then((res) => setExam({ sections: [], section_settings: [], ...res.data })).catch(() => toast.error('Failed to load exam.')).finally(() => setLoading(false));
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

  // Per-section time limit + score weight, keyed by section name (see
  // Exam.section_settings). Both optional — a section with neither set
  // behaves exactly as before (no timer, flat points-sum scoring).
  const getSectionSetting = (name) =>
    (exam.section_settings || []).find((s) => (s.name || '') === name) || { name, time_minutes: null, weight: null };
  const setSectionSetting = (name, patch) => {
    setExam((prev) => {
      const existing = prev.section_settings || [];
      const idx = existing.findIndex((s) => (s.name || '') === name);
      const next = [...existing];
      if (idx >= 0) next[idx] = { ...next[idx], ...patch };
      else next.push({ name, time_minutes: null, weight: null, ...patch });
      return { ...prev, section_settings: next };
    });
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
      section_settings: (prev.section_settings || []).map((s) => ((s.name || '') === oldName ? { ...s, name: newName } : s)),
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
      section_settings: (prev.section_settings || []).filter((s) => (s.name || '') !== name),
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
        navigate(`${base}/${res.data.id}/edit`, { replace: true });
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
    <div className="w-full h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-gray-50">
      {/* ── Flush Full-Width Top Action Header ── */}
      <div className="flex-shrink-0 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-2.5 shadow-2xs z-30">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Back button */}
          <div className="flex items-center flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate(isAdmin ? '/admin/exams' : '/airline/exams/manage')} className="rounded-xl border-slate-200 text-xs font-semibold">
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
                  className={`flex-shrink-0 px-3.5 py-1 rounded-full text-xs font-bold border transition-colors ${(activeSectionFilter === name || (activeSectionFilter === null && name === orderedSectionNames[0]))
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
                  className={`flex-shrink-0 px-3.5 py-1 rounded-full text-xs font-bold border transition-colors ${activeSectionFilter === ''
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
            {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowBankPicker(true)} className="rounded-xl border-slate-200 text-xs font-bold">
              <HiOutlineCollection className="w-4 h-4" /> <span className="hidden sm:inline">Import from Bank</span>
            </Button>
            )}
            <Button variant="outline" size="sm" onClick={startPreview} className="rounded-xl border-slate-200 text-xs font-bold">
              <HiOutlineEye className="w-4 h-4" /> Preview
            </Button>
            <Button variant="primary" onClick={save} disabled={saving} className="rounded-xl shadow-2xs text-xs font-bold px-3.5 py-1.5 bg-[#0000ff] hover:bg-blue-700">
              <HiOutlineSave className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Exam'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2-Column Split Workspace Container ── */}
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex-1 min-h-0 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0 items-start">

          {/* EXAM SETTINGS PANEL (Right column on desktop, 4 cols width) */}
          <div ref={rightSidebarRef} className="order-1 lg:order-2 lg:col-span-4 h-full overflow-y-auto p-1 space-y-4 scrollbar-thin scroll-smooth">
            {/* Bulk Question Actions Card (Appears in Right Sidebar when questions are selected - Light Theme) */}
            {selectedQIds.size > 0 && (
              <Card className="p-4 space-y-3.5 rounded-2xl border-2 border-blue-500 bg-gradient-to-b from-blue-50/70 via-white to-white shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between border-b border-blue-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black bg-blue-600 text-white px-2.5 py-1 rounded-lg shadow-2xs">
                      {selectedQIds.size} Selected
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      of {exam.questions.length} questions
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearQuestionSelection}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Deselect all questions"
                  >
                    <HiOutlineX className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Move Section */}
                  {orderedSectionNames.length > 0 && (
                    <div className="space-y-1">
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        Move Selected to Section
                      </label>
                      <Select
                        onValueChange={(val) => {
                          if (val) bulkMoveToSection(val === '__UNGROUPED__' ? '' : val);
                        }}
                      >
                        <SelectTrigger className="w-full bg-white text-xs font-bold text-slate-800 rounded-xl border border-slate-200 shadow-2xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-9">
                          <SelectValue placeholder="Select target section…" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-slate-200 shadow-lg rounded-xl">
                          <SelectItem value="__UNGROUPED__" className="text-xs font-bold text-slate-700 cursor-pointer">
                            Ungrouped
                          </SelectItem>
                          {orderedSectionNames.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs font-bold text-slate-900 cursor-pointer">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Points */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Batch Set Points
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 2"
                        id="bulk-pts-sidebar-input"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target.value !== '') {
                            bulkSetPoints(Number(e.target.value));
                            e.target.value = '';
                          }
                        }}
                        className="flex-1 bg-white text-xs font-bold text-slate-800 px-3 py-2 rounded-xl border border-slate-200 shadow-2xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const input = document.getElementById('bulk-pts-sidebar-input');
                          if (input && input.value !== '') {
                            bulkSetPoints(Number(input.value));
                            input.value = '';
                          }
                        }}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 shadow-2xs"
                      >
                        Set
                      </Button>
                    </div>
                  </div>

                  {/* Duplicate & Delete Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={bulkDuplicateQuestions}
                      className="w-full rounded-xl border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 py-2 shadow-2xs"
                    >
                      <HiOutlineDuplicate className="w-3.5 h-3.5 text-blue-600" /> Duplicate
                    </Button>

                    <Button
                      size="sm"
                      onClick={bulkDeleteQuestions}
                      className="w-full rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 py-2 shadow-2xs"
                    >
                      <HiOutlineTrash className="w-3.5 h-3.5 text-rose-600" /> Delete ({selectedQIds.size})
                    </Button>
                  </div>
                </div>
              </Card>
            )}

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

            {/* Sections management (High Priority Middle Position) */}
            <Card className="p-4 sm:p-5 space-y-4 rounded-2xl border border-slate-200/80 shadow-2xs bg-white">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 tracking-tight">Sections</h3>
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                  {orderedSectionNames.length}
                </span>
              </div>

              {/* Existing sections list - fixed height container so adding items never expands the card */}
              {orderedSectionNames.length > 0 && (
                <div className="h-48 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin">
                  {orderedSectionNames.map((name) => {
                    const count = groupFor(name).length;
                    const setting = getSectionSetting(name);
                    return (
                      <div key={name} className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
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
                        {editingSection !== name && (
                          <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200/60">
                            <input
                              type="number" min="0"
                              placeholder="Time (min)"
                              title="Section time limit in minutes — blank means no separate limit"
                              value={setting.time_minutes ?? ''}
                              onChange={(e) => setSectionSetting(name, { time_minutes: e.target.value === '' ? null : Number(e.target.value) })}
                              className="w-0 flex-1 px-2 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                            />
                            <input
                              type="number" min="0"
                              placeholder="Weight %"
                              title="Score weight — relative, doesn't need to sum to 100. Blank means flat point-scoring"
                              value={setting.weight ?? ''}
                              onChange={(e) => setSectionSetting(name, { weight: e.target.value === '' ? null : Number(e.target.value) })}
                              className="w-0 flex-1 px-2 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-slate-400 font-semibold -mt-1">
                Weight is relative (doesn't need to total 100). Set it on every section to switch that exam's scoring from flat points to weighted; leave all blank to keep flat scoring.
              </p>

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

            {/* Scheduling window (Optional Card at Bottom) */}
            <Card className="p-4 sm:p-5 space-y-3 rounded-2xl border border-slate-200/80 shadow-2xs bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <label className="block text-xs font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                  <HiOutlineCalendar className="w-4 h-4 text-blue-600" />
                  Scheduling Window
                </label>
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  Optional
                </span>
              </div>

              <div className="space-y-2.5">
                <DateTimeInputCard
                  label="Opens At"
                  isoValue={exam.opens_at}
                  onChange={(iso) => set('opens_at', iso)}
                  defaultTime="09:00"
                  borderAccent="blue"
                />

                <DateTimeInputCard
                  label="Closes At"
                  isoValue={exam.closes_at}
                  onChange={(iso) => set('closes_at', iso)}
                  defaultTime="23:59"
                  borderAccent="emerald"
                />
              </div>

              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                Leave blank for no restriction. Gates starting a new attempt — existing attempts are not cut off.
              </p>
            </Card>
          </div>

          {/* QUESTIONS LIST (Left column on desktop, 8 cols width - independent scrolling) */}
          <div className="order-2 lg:order-1 lg:col-span-8 h-full overflow-y-auto pr-3 space-y-4 scrollbar-thin">
            <div className="flex items-center justify-between px-1 pb-1">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Exam Questions ({exam.questions.length})
              </h2>
              {exam.questions.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-2xs transition-all select-none">
                  <input
                    type="checkbox"
                    checked={selectedQIds.size > 0 && selectedQIds.size === exam.questions.length}
                    onChange={selectAllQuestions}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>
                    {selectedQIds.size === exam.questions.length
                      ? 'Deselect All'
                      : selectedQIds.size > 0
                      ? `Selected (${selectedQIds.size}/${exam.questions.length})`
                      : 'Select All'}
                  </span>
                </label>
              )}
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
                        isSelected={selectedQIds.has(getQKey(q, idx))}
                        onToggleSelect={() => toggleSelectQuestion(getQKey(q, idx))}
                        onSendToBank={isAdmin ? () => setSendToBankQuestion(q) : undefined}
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
                      isSelected={selectedQIds.has(getQKey(q, idx))}
                      onToggleSelect={() => toggleSelectQuestion(getQKey(q, idx))}
                      onSendToBank={isAdmin ? () => setSendToBankQuestion(q) : undefined}
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
      <QuestionBankPicker
        open={showBankPicker}
        onClose={() => setShowBankPicker(false)}
        sectionNames={orderedSectionNames}
        onImport={importFromBank}
      />
      <SendToBankModal question={sendToBankQuestion} onClose={() => setSendToBankQuestion(null)} />
      {previewing && (
        <ExamRunner
          attempt={previewAttempt}
          exam={exam}
          onBack={exitPreview}
          onSaveAnswer={() => {}}
          onSubmit={async () => { toast.success('Preview finished — nothing was saved.'); }}
          onReportViolation={async () => ({ violation_count: 0, auto_submitted_now: false })}
          onFinished={exitPreview}
          previewMode
        />
      )}
    </div>
  );
}

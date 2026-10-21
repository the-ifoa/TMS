import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineArrowLeft,
  HiOutlineSave,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineChevronUp,
  HiOutlineChevronDown,
  HiOutlineDuplicate,
  HiOutlineCheck,
  HiOutlineDocumentDuplicate,
  HiOutlineX,
  HiOutlineLightningBolt,
  HiOutlineStar,
  HiOutlineFire,
  HiOutlineChartBar,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineCheckCircle,
  HiOutlineSwitchHorizontal,
  HiOutlineViewGrid,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineCog,
  HiOutlineInformationCircle,
  HiOutlineCollection,
  HiOutlineSearch,
  HiOutlinePhotograph,
  HiOutlineRefresh,
} from 'react-icons/hi';
import {
  getLiveGame, createLiveGame, updateLiveGame, listExams, getLiveExamQuestions,
  listQuestionBankGroups, listQuestionBankItems, getQuestionBankTopics, uploadExamImage, deleteExamImage,
} from '../../api';
import { compressImageFile } from '../../utils/compressImage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import ExamHelpButton from '../../components/ExamHelpGuide';
import { COVERS, TYPE_LABEL, CoverIcon, CoverBadge, coverColor, coverName } from '../../components/live/liveUi';

// ─── Live Quiz Editor ────────────────────────────────────────────────────────
// Professional, ultra-clean quiz authoring workspace:
// 1. Left: Question list navigation & reordering
// 2. Center: Clean question & MCQ canvas stage (solid background, no dots)
// 3. Right: Settings inspector

const uid = () => `tmp-${Math.random().toString(36).slice(2, 9)}`;
const TIMES = [5, 10, 20, 30, 45, 60, 90, 120];

const TYPES = {
  quiz: { icon: HiOutlineCheckCircle, label: 'Single Choice', hint: 'One correct answer among choices.' },
  true_false: { icon: HiOutlineSwitchHorizontal, label: 'True / False', hint: 'A statement that is true or false.' },
  multi: { icon: HiOutlineViewGrid, label: 'Multi-Select', hint: 'Multiple correct answers; players pick all that apply.' },
  poll: { icon: HiOutlineChartBar, label: 'Live Poll', hint: 'No right or wrong answer; gathers audience votes.' },
};

const POINTS = [
  ['standard', 'Standard', 'Up to 1,000 pts', 'Default scoring with speed bonus'],
  ['double', 'Double Points', 'Up to 2,000 pts', 'High-stakes bonus question'],
  ['none', 'No Points', '0 pts', 'Practice or icebreaker question'],
];

const blank = (type = 'quiz') => ({
  key: uid(),
  type,
  prompt: '',
  time_limit: 20,
  points: type === 'poll' ? 'none' : 'standard',
  options:
    type === 'true_false'
      ? [
          { text: 'True', is_correct: true },
          { text: 'False', is_correct: false },
        ]
      : [
          { text: '', is_correct: type !== 'poll' },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
        ],
});

// Validation rules
function problemOf(q) {
  if (!q.prompt.trim()) return 'Question prompt is required.';
  if (q.options.some((o) => !o.text.trim())) return 'Fill in or remove empty answer options.';
  const right = q.options.filter((o) => o.is_correct).length;
  if (q.type === 'multi' && right < 1) return 'Mark at least one correct answer.';
  if (['quiz', 'true_false'].includes(q.type) && right !== 1) return 'Mark exactly one correct answer.';
  return null;
}

// Changing type preserves relevant options
function withType(q, type) {
  if (type === q.type) return q;
  if (type === 'true_false') {
    return {
      ...q,
      type,
      options: [
        { text: 'True', is_correct: true },
        { text: 'False', is_correct: false },
      ],
      points: q.points === 'none' ? 'standard' : q.points,
    };
  }
  let options = q.type === 'true_false' ? blank(type).options : q.options;
  if (type === 'poll') {
    options = options.map((o) => ({ ...o, is_correct: false }));
  }
  if (type === 'quiz') {
    const first = options.findIndex((o) => o.is_correct);
    options = options.map((o, i) => ({ ...o, is_correct: i === (first < 0 ? 0 : first) }));
  }
  return {
    ...q,
    type,
    options,
    points: type === 'poll' ? 'none' : q.points === 'none' ? 'standard' : q.points,
  };
}

// ── Question bank → live question ────────────────────────────────────────────
// Same conversion the server does for "Import from exam": choice questions with
// 2–6 text answers come across with their right answers; anything else can't
// be played live. Returns { question } or { reason }.
const BANK_TYPE = { mcq: 'quiz', select_list: 'quiz', true_false: 'true_false', multi_response: 'multi' };
const BANK_TYPE_LABEL = {
  mcq: 'Multiple choice', select_list: 'Select list', true_false: 'True / False', multi_response: 'Multiple response',
  short_answer: 'Short answer', numeric: 'Numeric', essay: 'Essay', matching: 'Matching', ordering: 'Ordering',
  fill_blank: 'Fill in the blank', hotspot: 'Hotspot', drag_drop: 'Drag & drop',
};
function bankToLive(item) {
  const type = BANK_TYPE[item.type];
  if (!type) return { reason: `${BANK_TYPE_LABEL[item.type] || item.type} can't be played live` };
  const prompt = String(item.prompt || '').replace(/\s+/g, ' ').trim();
  if (!prompt) return { reason: 'No question text' };
  const options = (item.options || []).map((o) => ({ text: String(o.text || '').trim().slice(0, 120), is_correct: !!o.is_correct }));
  if (options.length < 2 || options.length > 6) return { reason: `${options.length} answers (needs 2–6)` };
  if (options.some((o) => !o.text)) return { reason: 'An answer has no text (image only)' };
  const right = options.filter((o) => o.is_correct).length;
  if (type === 'multi' ? right < 1 : right !== 1) return { reason: 'Answer key is incomplete' };
  return {
    question: {
      type,
      prompt: prompt.slice(0, 300),
      image_url: /^https?:\/\//i.test(item.image_url || '') ? item.image_url : '',
      image_public_id: /^https?:\/\//i.test(item.image_url || '') ? item.image_public_id || '' : '',
      options: type === 'true_false' ? [{ text: 'True', is_correct: !!options[0]?.is_correct }, { text: 'False', is_correct: !!options[1]?.is_correct }] : options,
      time_limit: 20,
      points: 'standard',
    },
  };
}

const DIFFICULTY_TONE = { easy: 'bg-emerald-50 text-emerald-700 border-emerald-200', medium: 'bg-amber-50 text-amber-700 border-amber-200', hard: 'bg-rose-50 text-rose-700 border-rose-200' };

function ImportFromBank({ onClose, onAdd }) {
  const [banks, setBanks] = useState(null);
  const [bankId, setBankId] = useState('');
  const [topics, setTopics] = useState([]);
  const [topic, setTopic] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState(null);
  const [picked, setPicked] = useState(() => new Set());

  useEffect(() => {
    listQuestionBankGroups()
      .then((r) => {
        const list = (r.data || []).filter((b) => b.question_count > 0);
        setBanks(list);
        if (list.length === 1) setBankId(String(list[0].id || list[0]._id));
      })
      .catch(() => { toast.error('Could not load question banks.'); setBanks([]); });
  }, []);

  useEffect(() => {
    if (!bankId) return;
    setItems(null); setPicked(new Set()); setTopic('all');
    getQuestionBankTopics(bankId).then((r) => setTopics(r.data || [])).catch(() => setTopics([]));
    listQuestionBankItems({ bank_id: bankId })
      .then((r) => setItems((r.data || []).map((it) => ({ ...it, key: String(it.id || it._id), ...bankToLive(it) }))))
      .catch((err) => { toast.error(err.response?.data?.error || 'Could not load questions.'); setItems([]); });
  }, [bankId]);

  const q = search.trim().toLowerCase();
  const shown = (items || []).filter((it) =>
    (topic === 'all' || it.section === topic)
    && (difficulty === 'all' || it.difficulty === difficulty)
    && (!q || `${it.prompt || ''} ${it.section || ''}`.toLowerCase().includes(q)));
  const usable = shown.filter((it) => it.question);
  const allPicked = usable.length > 0 && usable.every((it) => picked.has(it.key));
  const toggle = (key) => setPicked((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggleAll = () => setPicked((prev) => {
    const n = new Set(prev);
    usable.forEach((it) => (allPicked ? n.delete(it.key) : n.add(it.key)));
    return n;
  });
  const chosen = (items || []).filter((it) => it.question && picked.has(it.key));
  const unusable = (items || []).filter((it) => !it.question).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[94vw] max-h-[86vh] p-0 gap-0 rounded-2xl overflow-hidden shadow-xl border-slate-200 flex flex-col">
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
          <DialogTitle className="text-base font-bold text-slate-900">Import from question bank</DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Pick questions to add. Multiple choice, true/false and multiple-response questions come across with their right answers, 20 seconds each.
          </p>
        </div>

        <div className="px-5 sm:px-6 py-4 space-y-3 border-b border-slate-100 flex-shrink-0">
          <Select value={bankId} onValueChange={setBankId}>
            <SelectTrigger className="w-full rounded-xl text-sm border-slate-200 h-10">
              <SelectValue placeholder={!banks ? 'Loading banks…' : banks.length ? 'Choose a question bank…' : 'No question banks with questions yet'} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {(banks || []).map((b) => (
                <SelectItem key={b.id || b._id} value={String(b.id || b._id)}>
                  {b.name} <span className="text-slate-400">· {b.question_count}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bankId && (
            <div className="grid grid-cols-2 sm:grid-cols-[1fr_9rem_9rem] gap-2">
              <div className="relative col-span-2 sm:col-span-1">
                <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search questions or topics"
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                />
              </div>
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger className="rounded-xl text-xs border-slate-200 h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All topics</SelectItem>
                  {topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="rounded-xl text-xs border-slate-200 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any difficulty</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-[8rem] overflow-y-auto">
          {!bankId ? (
            <div className="py-12 px-6 text-center">
              <HiOutlineCollection className="w-8 h-8 mx-auto text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">Choose a question bank to see its questions.</p>
            </div>
          ) : !items ? (
            <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>
          ) : !shown.length ? (
            <p className="py-12 text-center text-sm text-slate-400">No questions match these filters.</p>
          ) : (
            <>
              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-5 sm:px-6 py-2 border-b border-slate-100 flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={allPicked} onChange={toggleAll} disabled={!usable.length} className="w-4 h-4 rounded border-slate-300 accent-blue-600" />
                  Select all {usable.length} shown
                </label>
                <span className="text-[11px] text-slate-400">{shown.length} question{shown.length === 1 ? '' : 's'}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {shown.map((it) => {
                  const ok = !!it.question;
                  const on = picked.has(it.key);
                  return (
                    <li key={it.key}>
                      <label className={`flex items-start gap-3 px-5 sm:px-6 py-3 ${ok ? 'cursor-pointer hover:bg-slate-50' : 'opacity-55 cursor-not-allowed'} ${on ? 'bg-blue-50/50' : ''}`}>
                        <input type="checkbox" checked={on} disabled={!ok} onChange={() => toggle(it.key)} className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-blue-600 flex-shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-slate-900 leading-snug line-clamp-2">{it.prompt || <em className="text-slate-400">No question text</em>}</span>
                          <span className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px]">
                            <span className="px-1.5 py-px rounded-md bg-slate-100 text-slate-600 font-medium">{BANK_TYPE_LABEL[it.type] || it.type}</span>
                            {it.difficulty && <span className={`px-1.5 py-px rounded-md border font-medium capitalize ${DIFFICULTY_TONE[it.difficulty] || ''}`}>{it.difficulty}</span>}
                            {it.section && <span className="px-1.5 py-px rounded-md bg-slate-50 border border-slate-200 text-slate-500">{it.section}</span>}
                            {!ok && <span className="text-amber-700 font-medium">· {it.reason}</span>}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-shrink-0">
          <p className="text-[11px] text-slate-500 min-w-0">
            {unusable > 0 && `${unusable} question${unusable === 1 ? '' : 's'} in this bank can't be played live.`}
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="ghost" onClick={onClose} className="rounded-xl text-xs font-semibold h-9 px-4">Cancel</Button>
            <Button
              disabled={!chosen.length}
              onClick={() => { onAdd(chosen.map((it) => it.question)); onClose(); }}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-9 px-4 shadow-sm"
            >
              Import {chosen.length || ''} question{chosen.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// "Import ▾" — from an exam, or from the question bank.
function ImportMenu({ onExam, onBank, big = false }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label="Import questions"
          className={`rounded-xl text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs gap-1.5 ${big ? 'h-10' : 'h-9 px-2.5 sm:px-3'}`}
        >
          <HiOutlineDocumentDuplicate className="w-4 h-4 text-slate-500" />
          <span className={big ? '' : 'hidden sm:inline'}>Import</span>
          <HiOutlineChevronDown className="hidden sm:block w-3.5 h-3.5 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5 rounded-2xl shadow-xl border-slate-200">
        {[
          [onExam, HiOutlineDocumentDuplicate, 'From an exam', 'Copy the choice questions of an IFOA exam'],
          [onBank, HiOutlineCollection, 'From question bank', 'Pick questions by bank, topic and difficulty'],
        ].map(([fn, Icon, label, hint]) => (
          <DropdownMenuItem key={label} onSelect={fn} className="flex items-start gap-3 p-2.5 rounded-xl cursor-pointer">
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 border border-slate-200">
              <Icon className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-900">{label}</span>
              <span className="block text-[11px] text-slate-500 leading-tight mt-0.5">{hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Import questions dialog ──────────────────────────────────────────────────
function ImportFromExam({ onClose, onAdd }) {
  const [exams, setExams] = useState(null);
  const [examId, setExamId] = useState('');
  const [found, setFound] = useState(null);

  useEffect(() => {
    listExams()
      .then((r) => setExams((r.data || []).filter((e) => !e.owner_airline && !e.deleted_at)))
      .catch(() => setExams([]));
  }, []);

  useEffect(() => {
    if (!examId) return;
    setFound(null);
    getLiveExamQuestions(examId)
      .then((r) => setFound(r.data))
      .catch((err) => toast.error(err.response?.data?.error || 'Could not load questions.'));
  }, [examId]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[94vw] p-0 gap-0 rounded-2xl overflow-hidden shadow-xl border-slate-200">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50/50">
          <DialogTitle className="text-base font-bold text-slate-900">Import questions from exam</DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Questions with 2–6 answers will be converted with their correct answers preserved.
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Select Exam</label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger className="w-full rounded-xl text-sm border-slate-200 h-10">
                <SelectValue placeholder={exams ? 'Choose an exam to import from…' : 'Loading exams…'} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(exams || []).map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {examId && !found && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
              <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              <span>Fetching questions from exam…</span>
            </div>
          )}
          {found && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                <HiOutlineCheckCircle className="w-4 h-4 text-emerald-600" />
                {found.questions.length} question{found.questions.length === 1 ? '' : 's'} available to import
              </p>
              {found.skipped > 0 && (
                <p className="text-slate-500 pl-5">
                  {found.skipped} unsupported question type{found.skipped === 1 ? '' : 's'} will be skipped.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="rounded-xl text-xs font-semibold h-9 px-4">
            Cancel
          </Button>
          <Button
            disabled={!found?.questions.length}
            onClick={() => {
              onAdd(found.questions);
              onClose();
            }}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-9 px-4 shadow-sm"
          >
            Import {found?.questions.length || ''} questions
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Question dropdown button ─────────────────────────────────────────────
function AddQuestionMenu({ onAdd, className = '', label = 'Add question', variant = 'primary' }) {
  const baseBtnStyle =
    variant === 'secondary'
      ? 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs hover:border-slate-300'
      : 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs hover:shadow';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold h-9 px-3.5 transition-all cursor-pointer ${baseBtnStyle} ${className}`}
        >
          <HiOutlinePlus className="w-3.5 h-3.5" /> {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-1.5 rounded-2xl shadow-xl border-slate-200">
        <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Choose Question Type
        </div>
        {Object.entries(TYPES).map(([type, t]) => (
          <DropdownMenuItem
            key={type}
            onSelect={() => onAdd(type)}
            className="flex items-start gap-3 p-2.5 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5 border border-slate-200">
              <t.icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 leading-snug">{TYPE_LABEL[type]}</span>
              <span className="block text-[11px] text-slate-500 leading-tight mt-0.5">{t.hint}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Auto-expanding textarea
function AutoTextarea({ value, onChange, className, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} onChange={onChange} rows={1} className={`resize-none overflow-hidden ${className}`} {...rest} />;
}

// ── Left: Question list sidebar ───────────────────────────────────────────────
function QuestionList({ questions, selected, onSelect, onAdd, onDuplicate, onDelete }) {
  return (
    <div className="h-full flex flex-col bg-white border-r border-slate-200/80">
      <div className="px-3.5 py-2.5 border-b border-slate-200/70 flex items-center justify-between bg-slate-50/40">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Questions</p>
          <span className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 tabular-nums border border-slate-200/60">
            {questions.length}
          </span>
        </div>
        <AddQuestionMenu onAdd={onAdd} label="New" variant="secondary" className="h-7 px-2.5 text-xs font-medium rounded-lg" />
      </div>

      <ol className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {questions.map((q, i) => {
          const T = TYPES[q.type];
          const on = q.key === selected;
          const problem = problemOf(q);
          return (
            <li key={q.key} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(q.key)}
                className={`w-full text-left rounded-xl border p-3 transition-all duration-150 ${
                  on
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900/10 shadow-xs'
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-md text-[11px] font-bold flex items-center justify-center tabular-nums transition-colors ${
                      on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <T.icon className={`w-3.5 h-3.5 ${on ? 'text-slate-900' : 'text-slate-400'}`} />
                  <span className="text-[11px] font-semibold text-slate-600 truncate">{TYPE_LABEL[q.type]}</span>
                  {problem ? (
                    <HiOutlineExclamationCircle className="ml-auto w-4 h-4 text-amber-500 flex-shrink-0" title={problem} />
                  ) : (
                    <HiOutlineCheckCircle className="ml-auto w-3.5 h-3.5 text-emerald-500/70 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>

                <p
                  className={`mt-2 text-xs leading-snug line-clamp-2 ${
                    q.prompt.trim() ? 'text-slate-800 font-medium' : 'text-slate-400 italic'
                  }`}
                >
                  {q.prompt.trim() || 'Untitled question'}
                </p>

                <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <HiOutlineClock className="w-3 h-3 text-slate-400" /> {q.time_limit}s
                  </span>
                  {q.points === 'double' && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-bold bg-amber-50 px-1.5 py-0.2 rounded">
                      2×
                    </span>
                  )}
                  {q.points === 'none' && (
                    <span className="text-slate-400 text-[10px]">0 pts</span>
                  )}
                  {q.image_url && (
                    <span className="inline-flex items-center text-slate-400" title="Has an image">
                      <HiOutlinePhotograph className="w-3.5 h-3.5" />
                    </span>
                  )}

                  {/* Clean text counter instead of colored dots */}
                  <span className="ml-auto text-[11px] text-slate-400 font-medium">
                    {q.options.length} options
                  </span>
                </div>
              </button>

              {/* Quick actions on hover */}
              <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1 bg-white/95 backdrop-blur-xs rounded-lg p-0.5 shadow-xs border border-slate-200">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(q.key);
                  }}
                  title="Duplicate question"
                  className="w-6 h-6 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
                >
                  <HiOutlineDuplicate className="w-3.5 h-3.5" />
                </button>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(q.key);
                    }}
                    title="Delete question"
                    className="w-6 h-6 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                  >
                    <HiOutlineTrash className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <AddQuestionMenu onAdd={onAdd} className="w-full" label="Add another question" />
      </div>
    </div>
  );
}

// ── MCQ Option Card (Clean, minimal, professional single-row) ─────────────────
function OptionCard({
  option,
  index,
  questionType,
  isCorrect,
  onToggleCorrect,
  onChangeText,
  onRemove,
  canRemove,
  isFixed,
}) {
  const letter = String.fromCharCode(65 + index);
  const isPoll = questionType === 'poll';
  const isMulti = questionType === 'multi';

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-xl border transition-all duration-150 px-3.5 py-2.5 bg-white ${
        isCorrect
          ? 'border-emerald-500 bg-emerald-50/30 ring-1 ring-emerald-500/20 shadow-2xs'
          : 'border-slate-200 hover:border-slate-300 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-400/10'
      }`}
    >
      {/* Option Letter button - clickable to toggle correct */}
      {!isPoll ? (
        <button
          type="button"
          onClick={onToggleCorrect}
          title={isCorrect ? 'Correct option (click to toggle)' : 'Mark as correct answer'}
          className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${
            isCorrect
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          {isCorrect ? <HiOutlineCheck className="w-4 h-4 stroke-[2.5]" /> : letter}
        </button>
      ) : (
        <span className="w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-600">
          {letter}
        </span>
      )}

      {/* Radio / Checkbox toggle for explicit correct answer selection */}
      {!isPoll && (
        <button
          type="button"
          onClick={onToggleCorrect}
          title={isCorrect ? 'Correct option' : 'Mark as correct'}
          className="flex-shrink-0 cursor-pointer focus:outline-none"
        >
          {isMulti ? (
            <span
              className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                isCorrect ? 'bg-emerald-600 text-white' : 'border border-slate-300 hover:border-slate-400'
              }`}
            >
              {isCorrect && <HiOutlineCheck className="w-3 h-3 stroke-[3]" />}
            </span>
          ) : (
            <span
              className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                isCorrect ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 hover:border-slate-400'
              }`}
            >
              {isCorrect && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </span>
          )}
        </button>
      )}

      {/* Answer text input */}
      <input
        type="text"
        value={option.text}
        disabled={isFixed}
        onChange={(e) => onChangeText(e.target.value.slice(0, 120))}
        placeholder={`Option ${letter}${index >= 2 ? ' (optional)' : ''}`}
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm font-medium text-slate-800 placeholder:text-slate-400 py-1"
      />

      {/* Right side: Correct badge or remove button */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isCorrect && !isPoll && (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 border border-emerald-200/70 px-2 py-0.5 rounded-md">
            Correct
          </span>
        )}

        {canRemove && !isFixed && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove option"
            aria-label="Remove answer"
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors opacity-60 hover:opacity-100 cursor-pointer"
          >
            <HiOutlineTrash className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── True / False Dedicated Cards (Clean, professional) ────────────────────────
function TrueFalseCards({ q, onChange }) {
  const isTrueCorrect = q.options[0]?.is_correct;
  const isFalseCorrect = q.options[1]?.is_correct;

  const selectCorrect = (isTrue) => {
    onChange({
      ...q,
      options: [
        { text: 'True', is_correct: isTrue },
        { text: 'False', is_correct: !isTrue },
      ],
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* True Card */}
      <button
        type="button"
        onClick={() => selectCorrect(true)}
        className={`group text-left rounded-xl border p-4 transition-all flex items-center justify-between cursor-pointer ${
          isTrueCorrect
            ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/20 shadow-2xs'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
              isTrueCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {isTrueCorrect ? <HiOutlineCheck className="w-4 h-4 stroke-[2.5]" /> : 'A'}
          </span>
          <div>
            <p className="text-base font-bold text-slate-900">True</p>
            <p className="text-xs text-slate-500">Correct answer</p>
          </div>
        </div>
        <span
          className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
            isTrueCorrect ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
          }`}
        >
          {isTrueCorrect && <span className="w-2 h-2 rounded-full bg-white" />}
        </span>
      </button>

      {/* False Card */}
      <button
        type="button"
        onClick={() => selectCorrect(false)}
        className={`group text-left rounded-xl border p-4 transition-all flex items-center justify-between cursor-pointer ${
          isFalseCorrect
            ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/20 shadow-2xs'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
              isFalseCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {isFalseCorrect ? <HiOutlineCheck className="w-4 h-4 stroke-[2.5]" /> : 'B'}
          </span>
          <div>
            <p className="text-base font-bold text-slate-900">False</p>
            <p className="text-xs text-slate-500">Correct answer</p>
          </div>
        </div>
        <span
          className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
            isFalseCorrect ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
          }`}
        >
          {isFalseCorrect && <span className="w-2 h-2 rounded-full bg-white" />}
        </span>
      </button>
    </div>
  );
}

// ── Centre: Question Canvas Stage ────────────────────────────────────────────
// Optional picture for the question — shown on the big screen and every phone.
// Uploads go to the same image store as exam questions (compressed first).
function QuestionImage({ q, set }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast.error('Use a JPG, PNG or WebP image.'); return; }
    setBusy(true);
    const old = q.image_public_id;
    try {
      const small = await compressImageFile(file);
      if (small.size > 8 * 1024 * 1024) { toast.error('That image is too large (8 MB max).'); return; }
      const { data } = await uploadExamImage(small);
      set({ image_url: data.url, image_public_id: data.public_id || '' });
      // The replaced picture is only really deleted if nothing else uses it.
      if (old) deleteExamImage(old).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.error || 'Image upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = () => {
    const old = q.image_public_id;
    set({ image_url: '', image_public_id: '' });
    if (old) deleteExamImage(old).catch(() => {});
  };

  return (
    <div className="mt-4">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {q.image_url ? (
        <div className="relative group mx-auto w-fit max-w-full">
          <img src={q.image_url} alt="Question" className="max-h-56 max-w-full rounded-xl border border-slate-200 object-contain bg-slate-50" />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button type="button" onClick={() => input.current?.click()} disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/95 border border-slate-200 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-white disabled:opacity-60">
              <HiOutlineRefresh className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> {busy ? 'Uploading…' : 'Replace'}
            </button>
            <button type="button" onClick={remove} disabled={busy} aria-label="Remove image"
              className="p-1.5 rounded-lg bg-white/95 border border-slate-200 text-slate-500 shadow-sm hover:text-rose-600 hover:border-rose-200">
              <HiOutlineTrash className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors disabled:opacity-60">
          {busy
            ? <><span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" /> Uploading…</>
            : <><HiOutlinePhotograph className="w-4 h-4" /> Add image <span className="font-normal text-slate-400">(optional · chart, instrument, aircraft…)</span></>}
        </button>
      )}
    </div>
  );
}

function QuestionCanvas({ q, index, total, onChange, onPrev, onNext }) {
  const set = (patch) => onChange({ ...q, ...patch });
  const fixed = q.type === 'true_false';
  const problem = problemOf(q);

  const toggleCorrect = (i) => {
    if (q.type === 'poll') return;
    set({
      options: q.options.map((o, j) =>
        q.type === 'multi' ? (j === i ? { ...o, is_correct: !o.is_correct } : o) : { ...o, is_correct: j === i }
      ),
    });
  };

  const updateOptionText = (i, text) => {
    set({
      options: q.options.map((x, j) => (j === i ? { ...x, text } : x)),
    });
  };

  const removeOption = (i) => {
    if (q.options.length <= 2) return;
    set({
      options: q.options.filter((_, j) => j !== i),
    });
  };

  const addOption = () => {
    if (q.options.length >= 6) return;
    set({
      options: [...q.options, { text: '', is_correct: false }],
    });
  };

  return (
    <motion.div
      key={q.key}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="max-w-3xl mx-auto"
    >
      {/* Stage Header without colored dots */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-xl bg-white border border-slate-200/90 text-slate-700 text-xs font-bold shadow-2xs">
            Question {index + 1} of {total}
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-white border border-slate-200/90 text-slate-600 text-xs font-semibold shadow-2xs">
            {TYPE_LABEL[q.type]}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200/90 text-slate-700 shadow-2xs">
            <HiOutlineClock className="w-3.5 h-3.5 text-slate-400" />
            <span>{q.time_limit}s limit</span>
          </span>
          {q.type !== 'poll' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200/90 text-slate-700 shadow-2xs">
              <HiOutlineStar
                className={`w-3.5 h-3.5 ${
                  q.points === 'double' ? 'text-amber-500 fill-amber-500' : 'text-slate-400'
                }`}
              />
              <span>
                {q.points === 'double'
                  ? 'Double points (2,000)'
                  : q.points === 'none'
                  ? 'No points'
                  : 'Standard (1,000)'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Question Prompt Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 sm:p-8 relative transition-all duration-200 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-400/10">
        <div className="flex items-center justify-between mb-3 text-slate-400">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Question Prompt
          </span>
          <span
            className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md ${
              q.prompt.length >= 280
                ? 'bg-rose-50 text-rose-700'
                : q.prompt.length >= 240
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {q.prompt.length}/300
          </span>
        </div>

        <AutoTextarea
          value={q.prompt}
          onChange={(e) => set({ prompt: e.target.value.slice(0, 300) })}
          placeholder="Start typing your question here..."
          className="w-full bg-transparent border-0 outline-none text-center text-xl sm:text-2xl font-semibold text-slate-900 placeholder-slate-300 leading-snug py-2 min-h-[4.5rem]"
        />

        <div className="mt-2 text-center">
          <p className="text-xs text-slate-400">
            {q.prompt.trim()
              ? 'Clear and concise questions keep players engaged'
              : 'Keep it clear, engaging, and under 300 characters'}
          </p>
        </div>

        <QuestionImage q={q} set={set} />
      </div>

      {/* Answers Section Header */}
      <div className="mt-6 mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Answer Options
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {q.type === 'true_false'
              ? 'Select whether True or False is the correct answer'
              : q.type === 'multi'
              ? 'Click the letter or checkbox to mark one or more correct answers'
              : q.type === 'poll'
              ? 'Poll choices show audience voting distributions with no correct answer'
              : 'Click the letter or radio to mark the correct answer'}
          </p>
        </div>

        {!fixed && (
          <span className="text-xs font-medium text-slate-400 whitespace-nowrap flex-shrink-0 pt-px">
            {q.options.length}/6 options
          </span>
        )}
      </div>

      {/* Answers Layout */}
      {fixed ? (
        <TrueFalseCards q={q} onChange={onChange} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {q.options.map((option, i) => (
            <OptionCard
              key={i}
              option={option}
              index={i}
              questionType={q.type}
              isCorrect={q.type !== 'poll' && option.is_correct}
              onToggleCorrect={() => toggleCorrect(i)}
              onChangeText={(val) => updateOptionText(i, val)}
              onRemove={() => removeOption(i)}
              canRemove={q.options.length > 2}
              isFixed={fixed}
            />
          ))}

          {/* Add Option button */}
          {!fixed && q.options.length < 6 && (
            <button
              type="button"
              onClick={addOption}
              className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer ${
                q.options.length % 2 === 0 ? 'md:col-span-2' : ''
              }`}
            >
              <HiOutlinePlus className="w-4 h-4 text-slate-500" />
              <span>Add option</span>
              <span className="text-[11px] text-slate-400 font-normal">
                ({6 - q.options.length} remaining)
              </span>
            </button>
          )}
        </div>
      )}

      {/* Canvas Footer */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80">
        <div>
          {problem ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 text-xs font-semibold shadow-2xs animate-in fade-in">
              <HiOutlineExclamationCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>{problem}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/90 text-emerald-900 text-xs font-semibold shadow-2xs animate-in fade-in">
              <HiOutlineCheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Question is complete and ready</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index === 0}
            onClick={onPrev}
            className="rounded-xl h-9 border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 shadow-2xs gap-1.5"
          >
            <HiOutlineChevronLeft className="w-4 h-4" /> Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index === total - 1}
            onClick={onNext}
            className="rounded-xl h-9 border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 shadow-2xs gap-1.5"
          >
            Next <HiOutlineChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Right: Settings panel ────────────────────────────────────────────────────
function Section({ title, children, action, subtitle }) {
  return (
    <section className="px-5 py-4 border-b border-slate-100 last:border-b-0">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SettingsPanel({
  q,
  onChange,
  game,
  setGame,
  onMove,
  onDuplicate,
  onDelete,
  index,
  total,
  tab,
  setTab,
}) {
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top Segmented Controls */}
      <div className="flex-shrink-0 p-3 border-b border-slate-100 bg-slate-50/50">
        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-200/70 text-xs font-semibold">
          {[
            ['question', 'Question'],
            ['game', 'Quiz Settings'],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`h-8 rounded-lg transition-all cursor-pointer ${
                tab === k
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'question' && q ? (
          <>
            <Section title="Question Type" subtitle="Select how players interact with this question">
              <div className="grid grid-cols-2 gap-2 mt-2">
                {Object.entries(TYPES).map(([type, t]) => {
                  const on = q.type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onChange(withType(q, type))}
                      aria-pressed={on}
                      className={`text-left rounded-xl border p-3 transition-all duration-150 cursor-pointer ${
                        on
                          ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900/10 shadow-xs'
                          : 'border-slate-200/90 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <t.icon className={`w-4 h-4 ${on ? 'text-slate-900' : 'text-slate-400'}`} />
                        {on && <HiOutlineCheck className="w-3.5 h-3.5 text-slate-900 stroke-[3]" />}
                      </div>
                      <span className="mt-2 block text-xs font-bold text-slate-900 leading-tight">
                        {TYPE_LABEL[type]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Time Limit" subtitle="Time allocated per player response">
              <div className="grid grid-cols-4 gap-1.5 mt-2">
                {TIMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onChange({ ...q, time_limit: t })}
                    aria-pressed={q.time_limit === t}
                    className={`h-8 rounded-lg text-xs font-bold tabular-nums border transition-all cursor-pointer ${
                      q.time_limit === t
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'border-slate-200/90 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    {t}s
                  </button>
                ))}
              </div>
            </Section>

            {q.type !== 'poll' && (
              <Section title="Points & Scoring" subtitle="Value awarded for accurate responses">
                <div className="space-y-2 mt-2">
                  {POINTS.map(([k, l, d, desc]) => {
                    const on = q.points === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onChange({ ...q, points: k })}
                        aria-pressed={on}
                        className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                          on
                            ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900/10 shadow-xs'
                            : 'border-slate-200/90 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            on ? 'border-slate-900' : 'border-slate-300'
                          }`}
                        >
                          {on && <span className="w-2 h-2 rounded-full bg-slate-900" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">{l}</span>
                            <span className="text-[11px] font-semibold text-slate-500">{d}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section title="Question Actions">
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => onMove(-1)}
                  className="rounded-xl h-9 text-xs font-semibold border-slate-200 gap-1.5"
                >
                  <HiOutlineChevronUp className="w-3.5 h-3.5" /> Move up
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={index === total - 1}
                  onClick={() => onMove(1)}
                  className="rounded-xl h-9 text-xs font-semibold border-slate-200 gap-1.5"
                >
                  <HiOutlineChevronDown className="w-3.5 h-3.5" /> Move down
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDuplicate}
                  className="rounded-xl h-9 text-xs font-semibold border-slate-200 gap-1.5"
                >
                  <HiOutlineDuplicate className="w-3.5 h-3.5" /> Duplicate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDelete}
                  className="rounded-xl h-9 text-xs font-semibold border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200 gap-1.5"
                >
                  <HiOutlineTrash className="w-3.5 h-3.5" /> Delete
                </Button>
              </div>
            </Section>
          </>
        ) : tab === 'question' ? (
          <div className="p-8 text-center text-slate-400">
            <HiOutlineInformationCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-medium">Add a question to configure its settings.</p>
          </div>
        ) : (
          <>
            <Section title="Quiz Details">
              <div className="space-y-3.5 mt-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-xs font-bold text-slate-700">Quiz Title</span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {(game.title || '').length}/120
                    </span>
                  </div>
                  <input
                    value={game.title}
                    onChange={(e) => setGame((g) => ({ ...g, title: e.target.value.slice(0, 120) }))}
                    placeholder="e.g. Flight Safety Recurrent Quiz"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-xs font-bold text-slate-700">
                      Description <span className="font-normal text-slate-400">(optional)</span>
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {(game.description || '').length}/500
                    </span>
                  </div>
                  <textarea
                    value={game.description}
                    onChange={(e) => setGame((g) => ({ ...g, description: e.target.value.slice(0, 500) }))}
                    rows={3}
                    placeholder="Brief description for participants..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 resize-none transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>
            </Section>

            <Section title="Gameplay">
              <label className="mt-2 flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!game.shuffle_options}
                  onChange={(e) => setGame((g) => ({ ...g, shuffle_options: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 accent-slate-900 flex-shrink-0"
                />
                <span>
                  <span className="block text-xs font-bold text-slate-800">Shuffle answers on each phone</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Every player sees the answers in a different order, so neighbours can&apos;t copy by position. The big screen keeps your order; true/false is never shuffled.
                  </span>
                </span>
              </label>
            </Section>

            <Section title="Quiz Cover Icon" subtitle="Shown on the game card, the host screen and players' phones">
              <div className="grid grid-cols-6 gap-2 mt-2">
                {COVERS.map((c) => {
                  const on = game.cover === c;
                  const col = coverColor(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setGame((g) => ({ ...g, cover: c }))}
                      aria-label={coverName(c)}
                      title={coverName(c)}
                      aria-pressed={on}
                      style={on ? { background: col, borderColor: col, boxShadow: `0 0 0 3px ${col}26` } : { color: col }}
                      className={`h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                        on ? 'text-white' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <CoverIcon cover={c} className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-500">
                <CoverBadge cover={game.cover} size="xs" />
                <span className="font-semibold text-slate-700">{coverName(game.cover)}</span> selected
              </p>

            </Section>

            <Section title="Scoring Rules Reference">
              <ul className="space-y-3 text-xs text-slate-600 mt-2">
                {[
                  [HiOutlineLightningBolt, 'Speed Bonus', 'Correct answers award up to 1,000 points, scaling down to 500 at the buzzer.'],
                  [HiOutlineStar, 'Double Points', 'Double points questions double both base and speed bonus points.'],
                  [HiOutlineFire, 'Streak Bonus', 'Consecutive correct answers award +100 bonus up to +500.'],
                  [HiOutlineChartBar, 'Poll Questions', 'Live polls award no points and display voting breakdowns.'],
                ].map(([Icon, t, d]) => (
                  <li key={t} className="flex gap-3 items-start p-2.5 rounded-xl bg-slate-50/80 border border-slate-100">
                    <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <span className="block font-bold text-slate-900">{t}</span>
                      <span className="text-[11px] text-slate-500 leading-normal">{d}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function LiveQuizEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(() => {
    const first = blank();
    return { title: '', description: '', cover: 'plane', shuffle_options: false, questions: [first] };
  });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingBank, setImportingBank] = useState(false);
  const [activeTab, setActiveTab] = useState('question');

  useEffect(() => {
    if (!id) return;
    getLiveGame(id)
      .then((r) => {
        const questions = r.data.questions.map((q) => ({ ...q, key: q._id || uid() }));
        setGame({ ...r.data, questions });
        setSelected(questions[0]?.key || null);
      })
      .catch(() => {
        toast.error('Game not found.');
        navigate('/admin/live');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const qs = game.questions;
  const selKey = selected && qs.some((q) => q.key === selected) ? selected : qs[0]?.key;
  const index = qs.findIndex((q) => q.key === selKey);
  const current = qs[index];
  const problems = useMemo(() => qs.map(problemOf).filter(Boolean).length, [qs]);
  const totalTime = qs.reduce((t, q) => t + (q.time_limit || 0) + 8, 0);

  const updateQ = (q) =>
    setGame((g) => ({
      ...g,
      questions: g.questions.map((x) => (x.key === q.key ? q : x)),
    }));

  const add = (type) => {
    const q = blank(type);
    setGame((g) => ({ ...g, questions: [...g.questions, q] }));
    setSelected(q.key);
  };

  const move = (d) =>
    setGame((g) => {
      const list = [...g.questions];
      const [x] = list.splice(index, 1);
      list.splice(index + d, 0, x);
      return { ...g, questions: list };
    });

  const duplicate = (targetKey = selKey) => {
    const targetIdx = qs.findIndex((q) => q.key === targetKey);
    if (targetIdx < 0) return;
    const targetQ = qs[targetIdx];
    const copy = {
      ...targetQ,
      key: uid(),
      _id: undefined,
      options: targetQ.options.map((o) => ({ ...o })),
    };
    setGame((g) => {
      const list = [...g.questions];
      list.splice(targetIdx + 1, 0, copy);
      return { ...g, questions: list };
    });
    setSelected(copy.key);
  };

  const remove = (targetKey = selKey) => {
    if (qs.length <= 1) {
      toast.error('A quiz must have at least one question.');
      return;
    }
    const targetIdx = qs.findIndex((q) => q.key === targetKey);
    if (targetIdx < 0) return;
    const next = qs[targetIdx + 1] || qs[targetIdx - 1];
    setGame((g) => ({
      ...g,
      questions: g.questions.filter((x) => x.key !== targetKey),
    }));
    setSelected(next?.key || null);
  };

  const save = async () => {
    if (!game.title.trim()) {
      setActiveTab('game');
      toast.error('Give the quiz a title (Quiz Settings tab).');
      return;
    }
    if (!qs.length) {
      toast.error('Add at least one question.');
      return;
    }
    const bad = qs.findIndex((q) => problemOf(q));
    if (bad >= 0) {
      setSelected(qs[bad].key);
      toast.error(`Question ${bad + 1}: ${problemOf(qs[bad])}`);
      return;
    }
    setSaving(true);
    try {
      const body = { ...game, questions: qs.map(({ key, ...q }) => q) };
      if (id) await updateLiveGame(id, body);
      else await createLiveGame(body);
      toast.success('Quiz saved successfully.');
      navigate('/admin/live');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the quiz.');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl + S to save
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
        <p className="text-xs font-medium text-slate-500">Loading quiz editor…</p>
      </div>
    );
  }

  return (
    <div className="w-full lg:h-[calc(100vh-4rem)] flex flex-col lg:overflow-hidden bg-slate-50 font-sans">
      {/* Top bar header */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200/80 px-3 sm:px-6 py-2.5 sticky top-0 z-20">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Back button */}
          <button
            type="button"
            onClick={() => navigate('/admin/live')}
            aria-label="Back to Quiz Arena"
            title="Back to Quiz Arena"
            className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
          >
            <HiOutlineArrowLeft className="w-4 h-4" />
          </button>

          <div className="hidden sm:block h-4 w-px bg-slate-200 flex-shrink-0" />

          {/* Interactive Cover Icon */}
          <button
            type="button"
            onClick={() => setActiveTab('game')}
            title="Click to change quiz icon & settings"
            className="flex-shrink-0 rounded-lg hover:scale-105 transition-transform cursor-pointer"
          >
            <CoverBadge cover={game.cover} size="bar" />
          </button>

          {/* Editable Title & Metadata */}
          <div className="min-w-0 flex-1">
            <input
              value={game.title}
              onChange={(e) => setGame((g) => ({ ...g, title: e.target.value.slice(0, 120) }))}
              placeholder="Untitled quiz"
              aria-label="Quiz title"
              className="w-full max-w-md bg-transparent border border-transparent hover:border-slate-200/80 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15 outline-none text-[15px] sm:text-base font-bold text-slate-900 placeholder-slate-400 rounded-md px-1.5 py-0.5 -ml-1.5 transition-all tracking-tight leading-tight block"
            />
            <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 min-w-0 text-xs text-slate-500 whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
                <HiOutlineViewGrid className="hidden sm:block w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-800">{qs.length}</span>
                <span className="sm:hidden">Q</span>
                <span className="hidden sm:inline">{qs.length === 1 ? 'question' : 'questions'}</span>
              </span>
              <span className="hidden sm:inline text-slate-300 select-none">•</span>
              <span className="hidden sm:inline-flex items-center gap-1.5 font-medium text-slate-500">
                <HiOutlineClock className="w-3.5 h-3.5 text-slate-400" />
                ~{Math.max(1, Math.round(totalTime / 60))} min
              </span>
              {problems > 0 ? (
                <>
                  <span className="text-slate-300 select-none">•</span>
                  <span className="inline-flex items-center text-[11px] font-semibold text-amber-700 bg-amber-50/90 border border-amber-200/80 px-2 py-0.5 rounded-full flex-shrink-0">
                    {problems} {problems === 1 ? 'issue' : 'issues'}
                  </span>
                </>
              ) : qs.length > 0 ? (
                <>
                  <span className="text-slate-300 select-none">•</span>
                  <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50/90 border border-emerald-200/80 px-2 py-0.5 rounded-full flex-shrink-0">
                    <span className="sm:hidden">Ready</span><span className="hidden sm:inline">Ready to save</span>
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <ExamHelpButton guide="live" className="h-9 w-9" />
            <ImportMenu onExam={() => setImporting(true)} onBank={() => setImportingBank(true)} />
            <Button
              onClick={save}
              disabled={saving}
              className="rounded-xl h-9 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white px-3 sm:px-4 shadow-sm hover:shadow transition-all gap-1.5 cursor-pointer"
            >
              <HiOutlineSave className="w-4 h-4" />
              <span>{saving ? 'Saving…' : 'Save'}</span>
              <span className="hidden md:inline-block text-[10px] opacity-75 font-normal ml-0.5 border border-white/20 rounded px-1">
                ⌘S
              </span>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile: horizontal question scroll strip */}
      <div className="lg:hidden flex-shrink-0 bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2 overflow-x-auto">
        {qs.map((q, i) => (
          <button
            key={q.key}
            type="button"
            onClick={() => setSelected(q.key)}
            className={`relative h-9 min-w-9 px-3 rounded-lg text-xs font-bold tabular-nums transition-colors ${
              q.key === selKey ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {i + 1}
            {problemOf(q) && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />}
          </button>
        ))}
        <AddQuestionMenu onAdd={add} label="Add" className="h-9 px-3 text-xs flex-shrink-0" />
      </div>

      {/* Main 3-column workspace */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[17.5rem_minmax(0,1fr)_20rem]">
        {/* Left: Questions sidebar */}
        <aside className="hidden lg:block min-h-0">
          <QuestionList
            questions={qs}
            selected={selKey}
            onSelect={setSelected}
            onAdd={add}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        </aside>

        {/* Center: Interactive Question Canvas (Solid clean background, no dot pattern) */}
        <main className="min-h-0 lg:overflow-y-auto px-4 sm:px-8 py-6 sm:py-8 bg-slate-50/70">
          <AnimatePresence mode="wait">
            {current ? (
              <QuestionCanvas
                key={current.key}
                q={current}
                index={index}
                total={qs.length}
                onChange={updateQ}
                onPrev={() => setSelected(qs[index - 1]?.key)}
                onNext={() => setSelected(qs[index + 1]?.key)}
              />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-md mx-auto mt-16 text-center bg-white p-8 rounded-2xl border border-slate-200 shadow-sm"
              >
                <span className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200 mb-4">
                  <HiOutlineCog className="w-6 h-6" />
                </span>
                <h2 className="text-base font-bold text-slate-900">No questions in this quiz</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Create your first question or import an existing exam to get started.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <AddQuestionMenu onAdd={add} />
                  <ImportMenu big onExam={() => setImporting(true)} onBank={() => setImportingBank(true)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Right: Settings panel */}
        <aside className="min-h-0 border-t lg:border-t-0 lg:border-l border-slate-200/80 bg-white">
          <SettingsPanel
            q={current}
            onChange={updateQ}
            game={game}
            setGame={setGame}
            index={index}
            total={qs.length}
            onMove={move}
            onDuplicate={duplicate}
            onDelete={remove}
            tab={activeTab}
            setTab={setActiveTab}
          />
        </aside>
      </div>

      {/* Import modals */}
      {(importing || importingBank) && (() => {
        const Importer = importingBank ? ImportFromBank : ImportFromExam;
        return (
        <Importer
          onClose={() => { setImporting(false); setImportingBank(false); }}
          onAdd={(list) => {
            const added = list.map((q) => ({ ...q, key: uid() }));
            setGame((g) => ({
              ...g,
              questions: [
                ...g.questions.filter((q) => q.prompt.trim() || q.options.some((o) => o.text.trim())),
                ...added,
              ],
            }));
            setSelected(added[0]?.key);
            toast.success(`${added.length} question${added.length === 1 ? '' : 's'} imported.`);
          }}
        />
        );
      })()}
    </div>
  );
}

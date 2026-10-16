import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineSearch, HiOutlineArrowLeft, HiOutlineChevronRight, HiOutlineDocumentDuplicate } from 'react-icons/hi';
import { listExams, getExam } from '../api';
import { QUESTION_TYPES } from './examQuestions/QuestionEditor';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// ─── Import questions from another exam ───────────────────────────────────────
// Step 1: pick an exam. Step 2: tick questions (or whole sections) and choose
// where they go. Imported questions are independent copies — every _id is
// replaced with a temporary one, so Mongo gives them new ids on save and
// editing a copy never touches the source exam.

const uid = () => `new-${Math.random().toString(36).slice(2, 10)}`;
const KEEP_SECTIONS = '__keep__';
const UNGROUPED = '__none__';

// Deep copy with fresh temporary ids everywhere (question, options, items…).
function freshCopy(value) {
  if (Array.isArray(value)) return value.map(freshCopy);
  if (value && typeof value === 'object') {
    const next = {};
    Object.entries(value).forEach(([k, v]) => {
      if (k === 'id') return;
      next[k] = k === '_id' ? uid() : freshCopy(v);
    });
    return next;
  }
  return value;
}

const typeLabel = (t) => QUESTION_TYPES.find((qt) => qt.value === t)?.label || t;
const statusCls = {
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-slate-50 text-slate-600 border-slate-200',
  archived: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function ExamQuestionImporter({ open, onClose, currentExamId, sectionNames, onImport }) {
  const [exams, setExams] = useState(null);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState(null); // full exam being imported from
  const [loadingSource, setLoadingSource] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [placement, setPlacement] = useState(KEEP_SECTIONS);

  useEffect(() => {
    if (!open) return;
    setSource(null); setSelected(new Set()); setSearch(''); setPlacement(KEEP_SECTIONS);
    listExams()
      .then((res) => setExams(res.data.filter((e) => String(e.id || e._id) !== String(currentExamId) && e.can_edit !== false)))
      .catch(() => { toast.error('Failed to load exams.'); setExams([]); });
  }, [open, currentExamId]);

  const q = search.trim().toLowerCase();
  const shown = useMemo(() => (exams || []).filter((e) => !q || e.title.toLowerCase().includes(q)
    || (e.owner_airline_name || '').toLowerCase().includes(q)), [exams, q]);

  const pick = (exam) => {
    setLoadingSource(true);
    getExam(exam.id || exam._id)
      .then((res) => {
        setSource(res.data);
        setSelected(new Set((res.data.questions || []).map((qq) => String(qq._id))));
      })
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load that exam.'))
      .finally(() => setLoadingSource(false));
  };

  // Source questions grouped by section, in exam order.
  const groups = useMemo(() => {
    const out = [];
    (source?.questions || []).forEach((qq, idx) => {
      const sec = qq.section || '';
      let g = out.find((x) => x.section === sec);
      if (!g) { g = { section: sec, items: [] }; out.push(g); }
      g.items.push({ q: qq, n: idx + 1 });
    });
    return out;
  }, [source]);

  const allIds = (source?.questions || []).map((qq) => String(qq._id));
  const allOn = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setMany = (ids, on) => setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });

  const doImport = () => {
    const chosen = source.questions.filter((qq) => selected.has(String(qq._id)));
    const target = placement === KEEP_SECTIONS ? null : placement === UNGROUPED ? '' : placement;
    const copies = chosen.map((qq) => ({ ...freshCopy(qq), section: target == null ? (qq.section || '') : target }));
    const newSections = target == null ? [...new Set(copies.map((c) => c.section).filter(Boolean))] : [];
    onImport(copies, newSections);
    toast.success(`Imported ${copies.length} question${copies.length === 1 ? '' : 's'} from "${source.title}".`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[94vw] h-[85vh] max-h-[760px] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-slate-100">
          <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2 pr-6">
            <HiOutlineDocumentDuplicate className="w-5 h-5 text-slate-400" /> Import questions from an exam
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            {source ? 'Choose the questions to copy. Copies are independent: editing them never changes the original exam.' : 'Pick the exam to copy questions from.'}
          </p>
        </div>

        {!source ? (
          <>
            <div className="flex-shrink-0 px-6 py-3 border-b border-slate-100">
              <div className="relative">
                <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exams"
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {exams == null || loadingSource ? (
                <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>
              ) : shown.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">{exams.length ? 'No matches.' : 'There are no other exams to import from yet.'}</p>
              ) : (
                <ul className="space-y-0.5">
                  {shown.map((e) => {
                    const empty = !e.question_count;
                    return (
                      <li key={e.id || e._id}>
                        <button type="button" disabled={empty} onClick={() => pick(e)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent transition-colors">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-800 truncate">{e.title}</span>
                            <span className="block text-[11px] text-slate-400 truncate">
                              {[`${e.question_count || 0} question${e.question_count === 1 ? '' : 's'}`, e.owner_department_name || e.owner_airline_name].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${statusCls[e.status] || statusCls.draft}`}>{e.status}</span>
                          <HiOutlineChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex-shrink-0 px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <button type="button" onClick={() => { setSource(null); setSelected(new Set()); }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 min-w-0">
                <HiOutlineArrowLeft className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{source.title}</span>
              </button>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer flex-shrink-0">
                <Checkbox checked={allOn} onCheckedChange={() => setMany(allIds, !allOn)} /> Select all ({selected.size}/{allIds.length})
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {groups.map((g) => {
                const ids = g.items.map(({ q: qq }) => String(qq._id));
                const on = ids.every((id) => selected.has(id));
                const some = !on && ids.some((id) => selected.has(id));
                return (
                  <section key={g.section || '__ungrouped'} className="rounded-xl border border-slate-200 overflow-hidden">
                    <label className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 cursor-pointer">
                      <Checkbox checked={on ? true : some ? 'indeterminate' : false} onCheckedChange={() => setMany(ids, !on)} />
                      <span className="flex-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">{g.section || 'Ungrouped'}</span>
                      <span className="text-[11px] font-semibold text-slate-400">{g.items.length} question{g.items.length === 1 ? '' : 's'}</span>
                    </label>
                    <ul className="divide-y divide-slate-100">
                      {g.items.map(({ q: qq, n }) => (
                        <li key={qq._id}>
                          <label className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50/60">
                            <Checkbox className="mt-0.5" checked={selected.has(String(qq._id))} onCheckedChange={() => toggle(String(qq._id))} />
                            <span className="w-6 text-[11px] font-bold text-slate-400 tabular-nums pt-0.5">{n}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs text-slate-800 leading-snug line-clamp-2">{qq.prompt || <em className="text-slate-400">No question text</em>}</span>
                              <span className="block mt-0.5 text-[10px] text-slate-400">{typeLabel(qq.type)} · {qq.points} pt{qq.points === 1 ? '' : 's'}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
            <div className="flex-shrink-0 px-6 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-slate-500 flex-shrink-0">Put into</span>
                <Select value={placement} onValueChange={setPlacement}>
                  <SelectTrigger className="h-9 w-56 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={KEEP_SECTIONS}>Same sections as the original</SelectItem>
                    <SelectItem value={UNGROUPED}>Ungrouped</SelectItem>
                    {sectionNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={doImport} disabled={selected.size === 0}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold h-9">
                Import {selected.size} question{selected.size === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineClipboardCopy, HiOutlineDownload, HiOutlineUpload, HiOutlineCheckCircle, HiOutlineExclamation,
  HiOutlineXCircle, HiOutlineCode, HiOutlineX, HiOutlinePhotograph,
} from 'react-icons/hi';
import { QUESTION_TYPES } from './examQuestions/QuestionEditor';
import { QUESTION_JSON_TEMPLATE, templateJsonText, parseQuestionsJson } from '../utils/examQuestionJson';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// ─── Import questions from a JSON file ────────────────────────────────────────
// "Template" gives a ready-to-edit file with one example of every question
// type (copy or download). "Import" takes a file or pasted JSON, checks every
// question, shows what will be added and imports the valid ones. Images are
// never in the file — they are uploaded in the editor afterwards.

const typeLabel = (t) => QUESTION_TYPES.find((qt) => qt.value === t)?.label || t;
const KEEP = '__keep__';
const NONE = '__none__';

// Field reference per type, read from the template examples.
const FIELD_HELP = QUESTION_JSON_TEMPLATE.questions.map((ex) => ({
  type: ex.type,
  fields: Object.keys(ex).filter((k) => !k.startsWith('_') && !['type', 'question', 'section', 'points', 'time_limit_seconds', 'explanation'].includes(k)),
  note: ex._note || '',
}));

export default function ExamJsonImporter({ open, onClose, sectionNames, onImport }) {
  const [tab, setTab] = useState('template');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [placement, setPlacement] = useState(KEEP);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTab('template'); setText(''); setFileName(''); setPlacement(KEEP);
  }, [open]);

  const result = useMemo(() => (text.trim() ? parseQuestionsJson(text) : null), [text]);
  const ready = (result?.items || []).filter((it) => it.question && !it.errors.length);
  const broken = (result?.items || []).filter((it) => it.errors.length);
  const warned = ready.filter((it) => it.warnings.length);

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(templateJsonText());
      toast.success('Template copied.');
    } catch {
      toast.error('Could not copy. Use Download instead.');
    }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateJsonText()], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'exam-questions-template.json' });
    a.click();
    URL.revokeObjectURL(url);
  };
  const readFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('That file is larger than 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result || '')); setFileName(file.name); };
    reader.onerror = () => toast.error('Could not read the file.');
    reader.readAsText(file);
  };

  const doImport = () => {
    if (!ready.length) return;
    const target = placement === KEEP ? null : placement === NONE ? '' : placement;
    const questions = ready.map((it) => ({ ...it.question, section: target == null ? it.question.section : target }));
    const newSections = [...new Set(questions.map((q) => q.section).filter((s) => s && !sectionNames.includes(s)))];
    onImport(questions, newSections);
    toast.success(`${questions.length} question${questions.length === 1 ? '' : 's'} added. Save the exam to keep them.`);
    if (warned.length) toast(`${warned.length} need an image or a check in the editor before saving.`, { icon: 'ℹ️', duration: 7000 });
    onClose();
  };

  const TAB = (key, label) => (
    <button key={key} type="button" onClick={() => setTab(key)}
      className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors ${tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose className="max-w-3xl w-[94vw] h-[88vh] max-h-[820px] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="flex-shrink-0 px-6 pt-5 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-xl bg-slate-900 text-white flex-shrink-0"><HiOutlineCode className="w-5 h-5" /></span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold text-slate-900">Import questions from JSON</DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">Write many questions in one file: text, options, correct answers, explanations, points and sections. Images are added in the editor afterwards.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-1 mt-3 -mb-px">
            {TAB('template', '1. Get the template')}
            {TAB('import', `2. Import${result?.items?.length ? ` (${result.items.length})` : ''}`)}
          </div>
        </div>

        {tab === 'template' ? (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <ol className="space-y-1.5 text-[13px] text-slate-600 list-decimal pl-5">
              <li><strong className="text-slate-900">Copy</strong> or <strong className="text-slate-900">download</strong> the template. It has one example of every question type.</li>
              <li>Edit it: change the examples, copy them for more questions, delete the types you don't need.</li>
              <li>Open <strong className="text-slate-900">2. Import</strong>, upload or paste the file, check the list and click Import.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={copyTemplate} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold h-9 flex items-center gap-1.5">
                <HiOutlineClipboardCopy className="w-4 h-4" /> Copy template
              </Button>
              <Button type="button" variant="outline" onClick={downloadTemplate} className="rounded-xl text-xs font-bold h-9 flex items-center gap-1.5">
                <HiOutlineDownload className="w-4 h-4" /> Download .json
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Fields for every question
              </div>
              <ul className="divide-y divide-slate-100 text-[13px]">
                {[
                  ['type', 'Required. One of the types below, e.g. "mcq".'],
                  ['question', 'Required. The question text.'],
                  ['section', 'Optional. Section name; new sections are created.'],
                  ['points', 'Optional. Defaults to 1.'],
                  ['time_limit_seconds', 'Optional. Time limit for this question.'],
                  ['explanation', 'Optional. Shown after marking.'],
                ].map(([k, v]) => (
                  <li key={k} className="px-4 py-2 grid grid-cols-[10rem_1fr] gap-3">
                    <code className="text-[12px] font-mono font-semibold text-slate-900">{k}</code>
                    <span className="text-slate-600">{v}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Extra fields per type
              </div>
              <ul className="divide-y divide-slate-100 text-[13px]">
                {FIELD_HELP.map((f) => (
                  <li key={f.type} className="px-4 py-2.5 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-3">
                    <span>
                      <code className="text-[12px] font-mono font-semibold text-slate-900">{f.type}</code>
                      <span className="block text-[11px] text-slate-400">{typeLabel(f.type)}</span>
                    </span>
                    <span className="block mt-1 sm:mt-0">
                      <span className="flex flex-wrap gap-1">
                        {f.fields.map((k) => <code key={k} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[11px] font-mono text-slate-700">{k}</code>)}
                        {(f.type === 'hotspot' || f.type === 'drag_drop') && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-[11px] font-semibold text-amber-800"><HiOutlinePhotograph className="w-3 h-3" /> image after import</span>
                        )}
                      </span>
                      {f.note && <span className="block mt-1 text-[12px] text-slate-500">{f.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <details className="rounded-xl border border-slate-200 overflow-hidden">
              <summary className="px-4 py-2.5 text-xs font-bold text-slate-700 cursor-pointer bg-slate-50 hover:bg-slate-100">Show the full template</summary>
              <pre className="px-4 py-3 text-[11px] leading-relaxed font-mono text-slate-700 bg-white overflow-x-auto max-h-80">{templateJsonText()}</pre>
            </details>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}
                className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <HiOutlineUpload className="w-6 h-6 text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{fileName || 'Drop a .json file here'}</p>
                    <p className="text-[11px] text-slate-500">…or paste the JSON into the box below.</p>
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="rounded-xl text-xs font-bold h-9 flex-shrink-0">Choose file</Button>
                <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
                  onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
              </div>

              <textarea value={text} onChange={(e) => { setText(e.target.value); setFileName(''); }} rows={7} spellCheck={false}
                placeholder='{ "format": "ifoa-exam-questions", "questions": [ … ] }'
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 resize-y" />

              {result?.fatal && (
                <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800">
                  <HiOutlineXCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {result.fatal}
                </p>
              )}

              {result?.items?.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <HiOutlineCheckCircle className="w-3.5 h-3.5" /> {ready.length} ready
                    </span>
                    {warned.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                        <HiOutlineExclamation className="w-3.5 h-3.5" /> {warned.length} need a step in the editor
                      </span>
                    )}
                    {broken.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                        <HiOutlineXCircle className="w-3.5 h-3.5" /> {broken.length} can't be imported
                      </span>
                    )}
                  </div>
                  <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {result.items.map((it) => {
                      const bad = it.errors.length > 0;
                      const warn = !bad && it.warnings.length > 0;
                      const Icon = bad ? HiOutlineXCircle : warn ? HiOutlineExclamation : HiOutlineCheckCircle;
                      return (
                        <li key={it.index} className={`px-3.5 py-2.5 ${bad ? 'bg-rose-50/40' : ''}`}>
                          <div className="flex items-start gap-2.5">
                            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${bad ? 'text-rose-500' : warn ? 'text-amber-500' : 'text-emerald-500'}`} />
                            <span className="text-[11px] font-bold text-slate-400 tabular-nums w-6 flex-shrink-0 mt-0.5">{it.index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] text-slate-800 truncate">{it.question?.prompt || String(it.raw?.question || it.raw?.prompt || '(no question text)')}</p>
                              <p className="text-[11px] text-slate-400">
                                {it.question ? typeLabel(it.question.type) : String(it.raw?.type || 'unknown type')}
                                {it.question?.section ? ` · ${it.question.section}` : ''}
                                {it.question ? ` · ${it.question.points} pt${it.question.points === 1 ? '' : 's'}` : ''}
                              </p>
                              {[...it.errors, ...it.warnings].map((m) => (
                                <p key={m} className={`text-[11px] mt-0.5 ${it.errors.includes(m) ? 'text-rose-700' : 'text-amber-800'}`}>{m.replace(/^Question \d+: /, '')}</p>
                              ))}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 px-6 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">Put into</span>
                <Select value={placement} onValueChange={setPlacement}>
                  <SelectTrigger className="h-9 w-56 text-xs rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={KEEP}>Sections from the file</SelectItem>
                    <SelectItem value={NONE}>Ungrouped</SelectItem>
                    {sectionNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                {broken.length > 0 && ready.length > 0 && <span className="text-[11px] text-slate-500">{broken.length} with problems will be skipped</span>}
                <Button type="button" onClick={doImport} disabled={!ready.length}
                  className="rounded-xl bg-[#0000ff] hover:bg-blue-700 text-white text-xs font-bold h-9 px-4">
                  Import {ready.length || ''} question{ready.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { HiOutlineX, HiOutlineReply } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { COURSE_TYPES, DEFAULT_SUBJECTS, gradeFromMark, gradeBadge, averageOfSubjects, pickRestore } from './helpers';

// ── Edit Batch Modal ──────────────────────────────────────────────────────────
// Edits every student of one batch in a single pass: the shared batch / course
// details, the course list, and a students × courses score grid. Only students
// whose data actually changed are sent; the whole save can be undone.
export function BatchEditModal({ group, onSave, onClose }) {
  const items = group.items;
  const first = items[0] || {};
  const initialCols = (() => {
    const seen = new Map();
    items.forEach(r => (r.subjects || []).forEach(sub => {
      if (!seen.has(sub.abbr)) seen.set(sub.abbr, { abbr: sub.abbr, name: sub.name, max: Number(sub.max_marks) || 100 });
    }));
    const base = seen.size ? [...seen.values()] : DEFAULT_SUBJECTS.map(d => ({ abbr: d.abbr, name: d.name, max: 100 }));
    return base.map((c, i) => ({ key: `c${i}`, orig: c.abbr, ...c }));
  })();

  const [shared, setShared] = useState({
    batch_name: group.batch_name || '', course_type: group.course_type || 'FDI',
    course_name: first.course_name || '', result_header_text: first.result_header_text || '',
    training_mode: first.training_mode || 'HYBRID',
    start_date: first.start_date || '', end_date: first.end_date || '',
    lead_instructor: first.lead_instructor || '',
    instructors: Array.isArray(first.instructors) ? first.instructors.join(', ') : '',
  });
  const [cols, setCols] = useState(initialCols);
  // rows[i].marks: { [colKey]: number | null }
  const [rows, setRows] = useState(() => items.map(r => {
    const marks = {};
    initialCols.forEach(c => {
      const sub = (r.subjects || []).find(x => x.abbr === c.orig);
      marks[c.key] = sub && sub.marks_obtained != null ? sub.marks_obtained : null;
    });
    return { id: r._id || r.id, first_name: r.first_name, last_name: r.last_name, marks,
      final_exam_score: r.final_exam_score != null ? r.final_exam_score : '' };
  }));
  const [saving, setSaving] = useState(false);
  const [filterQ, setFilterQ] = useState('');
  const [newCourse, setNewCourse] = useState({ abbr: '', name: '' });
  const [history, setHistory] = useState([]);
  const lastEdit = useRef(null);
  const nextKey = useRef(initialCols.length);

  const setSh = (k, v) => setShared(f => ({ ...f, [k]: v }));
  const snap = () => ({ cols: cols.map(c => ({ ...c })), rows: rows.map(r => ({ ...r, marks: { ...r.marks } })) });
  const pushHistory = (label) => setHistory(h => [...h.slice(-49), { label, ...snap() }]);
  const undo = () => setHistory(h => {
    if (!h.length) return h;
    const last = h[h.length - 1];
    setCols(last.cols); setRows(last.rows); lastEdit.current = null;
    toast.success(`Undid: ${last.label}`);
    return h.slice(0, -1);
  });

  const setCell = (ri, colKey, raw) => {
    const col = cols.find(c => c.key === colKey);
    const isNA = raw === '' || raw == null;
    if (!isNA) {
      const n = Number(raw);
      if (n < 0 || n > col.max) { toast.error(`Score must be between 0 and ${col.max}.`); return; }
    }
    const tag = `${ri}:${colKey}`;
    if (lastEdit.current !== tag) { pushHistory(`edited ${col.abbr} score`); lastEdit.current = tag; }
    setRows(rs => rs.map((r, i) => (i === ri ? { ...r, marks: { ...r.marks, [colKey]: isNA ? null : Number(raw) } } : r)));
  };
  const setFinalExam = (ri, raw) => {
    if (raw !== '' && (Number(raw) < 0 || Number(raw) > 100)) { toast.error('Final exam score must be between 0 and 100.'); return; }
    const tag = `${ri}:final`;
    if (lastEdit.current !== tag) { pushHistory('edited final exam score'); lastEdit.current = tag; }
    setRows(rs => rs.map((r, i) => (i === ri ? { ...r, final_exam_score: raw } : r)));
  };
  const setName = (ri, k, v) => setRows(rs => rs.map((r, i) => (i === ri ? { ...r, [k]: v } : r)));

  const removeCol = (key) => {
    pushHistory(`removed course ${cols.find(c => c.key === key).abbr}`); lastEdit.current = null;
    setCols(cs => cs.filter(c => c.key !== key));
  };
  const renameCol = (key, field, v) => {
    const tag = `${key}:${field}`;
    if (lastEdit.current !== tag) { pushHistory('modified course'); lastEdit.current = tag; }
    setCols(cs => cs.map(c => (c.key === key ? { ...c, [field]: v } : c)));
  };
  const addCol = (abbr, name) => {
    const a = (abbr || '').trim().toUpperCase(); const n = (name || '').trim();
    if (!a || !n) { toast.error('Course needs an abbreviation and a name.'); return; }
    if (cols.some(c => c.abbr.toUpperCase() === a)) { toast.error(`Course ${a} already exists.`); return; }
    pushHistory(`added course ${a}`); lastEdit.current = null;
    const key = `c${nextKey.current++}`;
    setCols(cs => [...cs, { key, orig: null, abbr: a, name: n, max: 100 }]);
    setRows(rs => rs.map(r => ({ ...r, marks: { ...r.marks, [key]: null } })));
    setNewCourse({ abbr: '', name: '' });
  };
  const missingDefaults = DEFAULT_SUBJECTS.filter(d => !cols.some(c => c.abbr === d.abbr));

  const subjectsFor = (r) => {
    const subs = cols.map(c => ({
      abbr: c.abbr.trim(), name: c.name.trim(), max_marks: c.max,
      marks_obtained: r.marks[c.key] ?? null,
    }));
    return [...subs.filter(x => x.marks_obtained != null), ...subs.filter(x => x.marks_obtained == null)];
  };

  const handleSave = async () => {
    if (!shared.batch_name.trim() || !shared.course_name.trim() || !shared.start_date || !shared.end_date) {
      toast.error('Batch name, course name and both dates are required.'); return;
    }
    if (cols.some(c => !c.abbr.trim() || !c.name.trim())) { toast.error('Every course needs an abbreviation and a name.'); return; }
    if (rows.some(r => !r.first_name.trim() || !r.last_name.trim())) { toast.error('Every student needs a first and last name.'); return; }
    const sharedPayload = {
      ...shared, batch_name: shared.batch_name.trim(),
      instructors: shared.instructors.split(',').map(x => x.trim()).filter(Boolean),
    };
    const updates = [];
    rows.forEach((r, i) => {
      const orig = items[i];
      const payload = { ...sharedPayload, first_name: r.first_name.trim(), last_name: r.last_name.trim(), subjects: subjectsFor(r),
        final_exam_score: r.final_exam_score === '' || r.final_exam_score == null ? null : Number(r.final_exam_score) };
      const before = pickRestore(orig);
      const sameShared = ['batch_name','course_type','course_name','result_header_text','training_mode','start_date','end_date','lead_instructor']
        .every(k => (payload[k] || '') === (orig[k] || ''))
        && JSON.stringify(payload.instructors) === JSON.stringify(orig.instructors || []);
      const sameNames = payload.first_name === orig.first_name && payload.last_name === orig.last_name
        && (payload.final_exam_score ?? null) === (orig.final_exam_score ?? null);
      const strip = (arr) => JSON.stringify((arr || []).map(x => [x.abbr, x.name, Number(x.max_marks) || 100, x.marks_obtained ?? null]));
      if (sameShared && sameNames && strip(payload.subjects) === strip(orig.subjects)) return;
      updates.push({ id: r.id, name: `${payload.first_name} ${payload.last_name}`, before, payload });
    });
    if (!updates.length) { toast('No changes to save.'); return; }
    setSaving(true);
    try { await onSave(updates); } finally { setSaving(false); }
  };

  const inp = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900';
  const cell = 'border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium text-center focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900';

  return (
    <>
      <div className="fixed -inset-20 z-50 bg-slate-900/40 backdrop-blur-sm pointer-events-none" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl border border-slate-200/80 w-full max-w-6xl max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 bg-white z-20 flex items-center justify-between p-5 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Edit Batch</h2>
              <p className="text-xs font-medium text-slate-400 mt-0.5">{group.batch_name} · {group.course_type}{group.company ? ` · ${group.company}` : ''} · {items.length} student{items.length === 1 ? '' : 's'}</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={undo} disabled={history.length === 0}
                title={history.length ? `Undo: ${history[history.length - 1].label}` : 'Nothing to undo'}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent">
                <HiOutlineReply className="w-4 h-4" /> Undo{history.length > 0 && <span className="text-slate-400">({history.length})</span>}
              </button>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><HiOutlineX className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="p-5 space-y-6">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">Batch details <span className="normal-case font-medium text-slate-400">(applied to every student)</span></h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Batch Name *</label>
                  <input className={inp} value={shared.batch_name} onChange={e => setSh('batch_name', e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Course Type *</label>
                  <Select value={shared.course_type} onValueChange={v => setSh('course_type', v)}>
                    <SelectTrigger className="text-xs font-semibold"><SelectValue /></SelectTrigger>
                    <SelectContent>{COURSE_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input type="date" className={inp} value={shared.start_date} onChange={e => setSh('start_date', e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                  <input type="date" className={inp} value={shared.end_date} onChange={e => setSh('end_date', e.target.value)} /></div>
                <div className="col-span-2"><label className="block text-xs font-semibold text-slate-700 mb-1">Course Name *</label>
                  <input className={inp} value={shared.course_name} onChange={e => setSh('course_name', e.target.value)} /></div>
                <div className="col-span-2"><label className="block text-xs font-semibold text-slate-700 mb-1">PDF Header Text</label>
                  <input className={inp} value={shared.result_header_text} onChange={e => setSh('result_header_text', e.target.value)} /></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Training Mode</label>
                  <Select value={shared.training_mode} onValueChange={v => setSh('training_mode', v)}>
                    <SelectTrigger className="text-xs font-semibold"><SelectValue /></SelectTrigger>
                    <SelectContent>{['HYBRID','ONLINE','IN-PERSON'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Lead Instructor</label>
                  <input className={inp} value={shared.lead_instructor} onChange={e => setSh('lead_instructor', e.target.value)} /></div>
                <div className="col-span-2"><label className="block text-xs font-semibold text-slate-700 mb-1">Other Instructors (comma-separated)</label>
                  <input className={inp} placeholder="e.g. John Smith, Jane Doe" value={shared.instructors} onChange={e => setSh('instructors', e.target.value)} /></div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Students &amp; scores <span className="normal-case font-medium text-slate-400">({rows.length})</span></h3>
                {rows.length > 6 && (
                  <input value={filterQ} onChange={e => setFilterQ(e.target.value)} placeholder="Filter students…"
                    className="w-52 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900" />
                )}
              </div>
              <p className="text-xs text-slate-400 mb-3 font-medium">Edit names and scores for the whole batch. Blank = N/A. Courses can be renamed, removed or added in the column headers; the average updates automatically.</p>
              <div className="overflow-auto max-h-[50vh] border border-slate-200 rounded-xl">
                <table className="text-xs w-max min-w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="sticky left-0 z-30 bg-slate-50 px-3 py-2 text-left font-bold min-w-[210px] border-b border-slate-200">Student</th>
                      {cols.map(c => (
                        <th key={c.key} className="px-1.5 py-2 min-w-[96px] align-top bg-slate-50 border-b border-slate-200">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-0.5">
                              <input value={c.abbr} onChange={e => renameCol(c.key, 'abbr', e.target.value.toUpperCase())}
                                className="w-full border border-slate-200 bg-white rounded-md px-1.5 py-1 text-[11px] font-bold text-center focus:outline-none focus:border-slate-900" title="Abbreviation" />
                              <button type="button" onClick={() => removeCol(c.key)} title={`Remove ${c.abbr}`} className="p-0.5 rounded text-rose-500 hover:bg-rose-50"><HiOutlineX className="w-3.5 h-3.5" /></button>
                            </div>
                            <input value={c.name} onChange={e => renameCol(c.key, 'name', e.target.value)}
                              className="w-full border border-slate-200 bg-white rounded-md px-1.5 py-1 text-[10px] font-medium text-slate-500 text-center focus:outline-none focus:border-slate-900" title="Course name" />
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center font-bold min-w-[110px] bg-slate-50 border-b border-slate-200">Average <span className="text-[9px] text-emerald-600">AUTO</span></th>
                      <th className="px-1.5 py-2 text-center font-bold min-w-[110px] bg-slate-50 border-b border-slate-200">Final Exam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => {
                      const q = filterQ.trim().toLowerCase();
                      if (q && !`${r.first_name} ${r.last_name}`.toLowerCase().includes(q)) return null;
                      const avg = averageOfSubjects(cols.map(c => ({ marks_obtained: r.marks[c.key], max_marks: c.max })));
                      const g = gradeFromMark(avg);
                      return (
                        <tr key={r.id} className="group">
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-2 py-1.5 border-b border-slate-100">
                            <div className="flex gap-1.5">
                              <input className={`${cell} text-left w-full`} value={r.first_name} onChange={e => setName(ri, 'first_name', e.target.value)} placeholder="First" />
                              <input className={`${cell} text-left w-full`} value={r.last_name} onChange={e => setName(ri, 'last_name', e.target.value)} placeholder="Last" />
                            </div>
                          </td>
                          {cols.map(c => (
                            <td key={c.key} className="px-1.5 py-1.5 border-b border-slate-100 group-hover:bg-slate-50">
                              <input type="number" min="0" max={c.max} className={`${cell} w-full`} placeholder="N/A"
                                value={r.marks[c.key] ?? ''} onChange={e => setCell(ri, c.key, e.target.value)}
                                onWheel={e => e.currentTarget.blur()} onBlur={() => { lastEdit.current = null; }} />
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-center whitespace-nowrap border-b border-slate-100 group-hover:bg-slate-50">
                            <span className="font-bold text-slate-800">{avg != null ? `${avg}%` : '—'}</span>
                            {g && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${gradeBadge(g)}`}>{g}</span>}
                          </td>
                          <td className="px-1.5 py-1.5 border-b border-slate-100 group-hover:bg-slate-50">
                            <input type="number" min="0" max="100" className={`${cell} w-full`} placeholder="N/A"
                              value={r.final_exam_score} onChange={e => setFinalExam(ri, e.target.value)}
                              onWheel={e => e.currentTarget.blur()} onBlur={() => { lastEdit.current = null; }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Add course to all students</p>
                {missingDefaults.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {missingDefaults.map(d => (
                      <button key={d.abbr} type="button" onClick={() => addCol(d.abbr, d.name)}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">+ {d.abbr}</button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input placeholder="ABBR" value={newCourse.abbr} onChange={e => setNewCourse(c => ({ ...c, abbr: e.target.value.toUpperCase() }))}
                    className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:border-slate-900" />
                  <input placeholder="Course name" value={newCourse.name} onChange={e => setNewCourse(c => ({ ...c, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCol(newCourse.abbr, newCourse.name); } }}
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:border-slate-900" />
                  <button type="button" onClick={() => addCol(newCourse.abbr, newCourse.name)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">Add</button>
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4 flex justify-end gap-2.5">
            <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 shadow-2xs">
              {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Save All Changes
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}

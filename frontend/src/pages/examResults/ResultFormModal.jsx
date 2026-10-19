import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { HiOutlinePlus, HiOutlineTrash, HiOutlinePencil, HiOutlineX, HiOutlineReply } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { getParticipants } from '../../api';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { COURSE_TYPES, DEFAULT_SUBJECTS, gradeFromMark, gradeBadge, mergeSubjects, averageOfSubjects, emptyForm } from './helpers';
import { AirlineSelect } from './AirlineSelect';

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
export function ResultFormModal({ initial, prefill = null, onSave, onClose, batches = [] }) {
  const [form, setForm] = useState(() => {
    if (!initial && prefill) {
      return {
        ...emptyForm(), ...prefill,
        instructors: Array.isArray(prefill.instructors) ? prefill.instructors.join(', ') : (prefill.instructors || ''),
        // same courses as the rest of the batch, scores blank
        subjects: mergeSubjects(prefill.subjects).map(s => ({ ...s, marks_obtained: null, grade: null })),
      };
    }
    if (!initial) return emptyForm();
    return {
      ...initial,
      instructors: Array.isArray(initial.instructors) ? initial.instructors.join(', ') : '',
      subjects: mergeSubjects(initial.subjects),
      final_exam_score: initial.final_exam_score ?? '',
      final_marks: initial.final_marks ?? '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [batchSuggestions, setBatchSuggestions] = useState([]);
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);
  const batchInputRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const existingBatchNames = (() => {
    const seen = new Map();
    batches
      .map(b => b._id?.batch_name)
      .filter(Boolean)
      .forEach(name => {
        const key = name.trim().toLowerCase();
        if (!seen.has(key)) seen.set(key, name.trim());
      });
    return [...seen.values()].sort();
  })();

  const filterBatches = (val) => {
    const lower = (val || '').trim().toLowerCase();
    return existingBatchNames.filter(name => name.toLowerCase().includes(lower));
  };

  // Combobox: opens on focus with every existing batch, narrows as you type,
  // and offers "Create" for a name that doesn't exist yet.
  const handleBatchNameChange = (val) => {
    set('batch_name', val);
    setBatchSuggestions(filterBatches(val));
    setShowBatchDropdown(true);
  };

  const openBatchDropdown = () => {
    setBatchSuggestions(filterBatches(form.batch_name));
    setShowBatchDropdown(true);
  };

  // ── Participant picker (add mode): participants of the chosen airline ──
  const [airlineParticipants, setAirlineParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [pickedParticipant, setPickedParticipant] = useState('');

  useEffect(() => {
    if (initial || !form.company) { setAirlineParticipants([]); return; }
    let cancelled = false;
    setLoadingParticipants(true);
    getParticipants({ company: form.company })
      .then(res => { if (!cancelled) setAirlineParticipants(res.data || []); })
      .catch(() => { if (!cancelled) setAirlineParticipants([]); })
      .finally(() => { if (!cancelled) setLoadingParticipants(false); });
    return () => { cancelled = true; };
  }, [form.company, initial]);

  const pickParticipant = (id) => {
    setPickedParticipant(id);
    const p = airlineParticipants.find(x => String(x._id || x.id) === id);
    if (!p) return;
    const ct = COURSE_TYPES.find(c => c.value === p.training_type);
    const day = (d) => (d ? String(d).slice(0, 10) : '');
    setForm(f => ({
      ...f,
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      company: p.company || f.company,
      course_type: ct ? ct.value : f.course_type,
      course_name: f.course_name || (ct ? ct.label.split('–')[1]?.trim() : '') || '',
      start_date: day(p.training_date) || f.start_date,
      end_date: day(p.end_date || p.training_date) || f.end_date,
    }));
  };

  const selectBatchSuggestion = (name) => {
    setForm(f => ({ ...f, batch_name: name }));
    setBatchSuggestions([]);
    setShowBatchDropdown(false);
  };

  // ── Undo history for this form (score edits, course add / remove / rename) ──
  const [history, setHistory] = useState([]);
  const lastEditAbbr = useRef(null);
  const [manageCourses, setManageCourses] = useState(false);
  const [newCourse, setNewCourse] = useState({ abbr: '', name: '' });

  const pushHistory = (label) =>
    setHistory(h => [...h.slice(-49), { label, subjects: form.subjects.map(s => ({ ...s })) }]);

  const undo = () => {
    setHistory(h => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      set('subjects', last.subjects);
      lastEditAbbr.current = null;
      toast.success(`Undid: ${last.label}`);
      return h.slice(0, -1);
    });
  };

  const sortSubjects = (subs) => [
    ...subs.filter(s => s.marks_obtained != null),
    ...subs.filter(s => s.marks_obtained == null),
  ];

  const setSubject = (i, v) => {
    const isNA = v === '' || v === null || v === undefined;
    const max = Number(form.subjects[i].max_marks) || 100;
    if (!isNA) {
      const num = Number(v);
      if (num < 0 || num > max) {
        toast.error(`Course score must be between 0 and ${max}.`);
        return;
      }
    }
    const abbr = form.subjects[i].abbr;
    // consecutive keystrokes in the same box count as one undo step
    if (lastEditAbbr.current !== abbr) {
      pushHistory(isNA ? `cleared ${abbr}` : `edited ${abbr} score`);
      lastEditAbbr.current = abbr;
    }
    const subs = [...form.subjects];
    subs[i] = { ...subs[i], marks_obtained: isNA ? null : Number(v) };
    // Order stays put while editing (re-sorting here made the boxes jump under the
    // cursor); recorded courses are moved ahead of N/A ones once, on save.
    set('subjects', subs);
  };

  const removeCourse = (i) => {
    const gone = form.subjects[i];
    pushHistory(`removed course ${gone.abbr}`);
    lastEditAbbr.current = null;
    set('subjects', form.subjects.filter((_, idx) => idx !== i));
  };

  const renameCourse = (i, key, v) => {
    const abbr = form.subjects[i].abbr;
    const tag = `${abbr}:${key}`;
    if (lastEditAbbr.current !== tag) {
      pushHistory(`modified course ${abbr}`);
      lastEditAbbr.current = tag;
    }
    const subs = [...form.subjects];
    subs[i] = { ...subs[i], [key]: v };
    set('subjects', subs);
  };

  const addCourse = (abbr, name) => {
    const a = (abbr || '').trim().toUpperCase();
    const n = (name || '').trim();
    if (!a || !n) { toast.error('Course needs an abbreviation and a name.'); return; }
    if (form.subjects.some(s => s.abbr.toUpperCase() === a)) { toast.error(`Course ${a} already exists.`); return; }
    pushHistory(`added course ${a}`);
    lastEditAbbr.current = null;
    set('subjects', [...form.subjects, { abbr: a, name: n, max_marks: 100, marks_obtained: null }]);
    setNewCourse({ abbr: '', name: '' });
  };

  const missingDefaults = DEFAULT_SUBJECTS.filter(d => !form.subjects.some(s => s.abbr === d.abbr));
  // Average is always derived from the scores — never typed in by hand.
  const autoAvg = averageOfSubjects(form.subjects);

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.batch_name || !form.course_name || !form.start_date || !form.end_date) {
      toast.error('Please fill in all required fields.');
      return;
    }
    for (const s of form.subjects) {
      if (!s.abbr?.trim() || !s.name?.trim()) {
        toast.error('Every course needs an abbreviation and a name.');
        return;
      }
      const max = Number(s.max_marks) || 100;
      if (s.marks_obtained != null && (s.marks_obtained < 0 || s.marks_obtained > max)) {
        toast.error(`${s.abbr} score must be between 0 and ${max}.`);
        return;
      }
    }
    const fe = form.final_exam_score !== '' ? Number(form.final_exam_score) : null;
    const fm = autoAvg;
    if (fe != null && (fe < 0 || fe > 100)) {
      toast.error('Final Exam Score must be between 0 and 100.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        subjects: sortSubjects(form.subjects),
        instructors: form.instructors.split(',').map(s => s.trim()).filter(Boolean),
        final_exam_score: fe,
        final_marks: fm,
      };
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed -inset-20 z-50 bg-slate-900/40 backdrop-blur-sm pointer-events-none" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl border border-slate-200/80 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            {initial ? 'Edit Exam Result' : prefill ? `Add Student to ${prefill.batch_name}` : 'Add Exam Result'}
          </h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={undo} disabled={history.length === 0}
              title={history.length ? `Undo: ${history[history.length - 1].label}` : 'Nothing to undo'}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent">
              <HiOutlineReply className="w-4 h-4" /> Undo{history.length > 0 && <span className="text-slate-400">({history.length})</span>}
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><HiOutlineX className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Student Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Airline</label>
                <AirlineSelect value={form.company} onChange={v => { set('company', v); setPickedParticipant(''); }} />
              </div>
              {!initial && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Participant</label>
                  <Select value={pickedParticipant || undefined} onValueChange={pickParticipant} disabled={!form.company || loadingParticipants}>
                    <SelectTrigger className="text-xs font-semibold">
                      <SelectValue placeholder={
                        !form.company ? 'Select an airline first'
                          : loadingParticipants ? 'Loading…'
                          : airlineParticipants.length ? 'Select participant' : 'No participants. Enter below.'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {airlineParticipants.map(p => {
                        const id = String(p._id || p.id);
                        return (
                          <SelectItem key={id} value={id}>
                            {p.participant_name || `${p.first_name} ${p.last_name}`}
                            <span className="text-slate-400"> · {p.training_type}{p.department ? ` · ${p.department}` : ''}</span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {[{ label: 'First Name *', key: 'first_name' }, { label: 'Last Name *', key: 'last_name' }].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
                  <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                    value={form[key]} onChange={e => set(key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Batch & Course</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Name *</label>
                <input
                  ref={batchInputRef}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  placeholder="e.g. NOV-DEC 2024"
                  value={form.batch_name}
                  onChange={e => handleBatchNameChange(e.target.value)}
                  onFocus={openBatchDropdown}
                  onBlur={() => setTimeout(() => setShowBatchDropdown(false), 200)}
                  autoComplete="off"
                />
                {showBatchDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {batchSuggestions.length > 0 && (
                      <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Existing batches</p>
                    )}
                    {batchSuggestions.map(name => (
                      <button
                        key={name}
                        type="button"
                        onMouseDown={() => selectBatchSuggestion(name)}
                        className="w-full text-left px-3 py-2 text-xs text-slate-800 hover:bg-slate-50 flex items-center gap-2 transition-colors font-medium"
                      >
                        {name}
                        <span className="ml-auto text-[10px] text-slate-400">Use existing</span>
                      </button>
                    ))}
                    {form.batch_name.trim() && !existingBatchNames.some(n => n.toLowerCase() === form.batch_name.trim().toLowerCase()) && (
                      <button
                        type="button"
                        onMouseDown={() => selectBatchSuggestion(form.batch_name.trim())}
                        className="w-full text-left px-3 py-2 text-xs text-slate-900 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100 font-bold"
                      >
                        <HiOutlinePlus className="w-3.5 h-3.5" /> Create "{form.batch_name.trim()}"
                      </button>
                    )}
                    {batchSuggestions.length === 0 && !form.batch_name.trim() && (
                      <p className="px-3 py-2 text-xs text-slate-400">No batches yet. Type a name to create one.</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course Type *</label>
                <Select value={form.course_type} onValueChange={v => set('course_type', v)}>
                  <SelectTrigger className="text-xs font-semibold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COURSE_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course Name *</label>
                <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  placeholder="e.g. Flight Dispatch Initial Training / Promotion"
                  value={form.course_name} onChange={e => set('course_name', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">PDF Header Text (below "EXAM RESULTS")</label>
                <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  placeholder="e.g. 4-Weeks Flight Dispatch Initial Course Promotion NOV-DEC 2024 / 04 November - 06 December 2024"
                  value={form.result_header_text || ''} onChange={e => set('result_header_text', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
                <input type="date" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
                <input type="date" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Training Mode</label>
                <Select value={form.training_mode} onValueChange={v => set('training_mode', v)}>
                  <SelectTrigger className="text-xs font-semibold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['HYBRID','ONLINE','IN-PERSON'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lead Instructor</label>
                <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  value={form.lead_instructor} onChange={e => set('lead_instructor', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Other Instructors (comma-separated)</label>
                <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  placeholder="e.g. John Smith, Jane Doe" value={form.instructors} onChange={e => set('instructors', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Courses &amp; Scores</h3>
              <button type="button" onClick={() => setManageCourses(m => !m)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                  manageCourses ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                <HiOutlinePencil className="w-3 h-3" /> {manageCourses ? 'Done' : 'Manage courses'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3 font-medium">Leave blank to mark as N/A on result sheet. N/A courses always appear last. The average updates automatically.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-4">
              {form.subjects.map((s, i) => {
                const max = Number(s.max_marks) || 100;
                const isOver = s.marks_obtained != null && s.marks_obtained > max;
                return (
                  <div key={i} className="flex flex-col">
                    {manageCourses ? (
                      <div className="mb-1 flex items-center gap-1">
                        <input value={s.abbr} onChange={e => renameCourse(i, 'abbr', e.target.value.toUpperCase())}
                          className="w-14 border border-slate-200 rounded-lg px-1.5 py-1 text-[11px] font-bold focus:outline-none focus:border-slate-900" title="Abbreviation" />
                        <input value={s.name} onChange={e => renameCourse(i, 'name', e.target.value)}
                          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-1.5 py-1 text-[11px] font-medium focus:outline-none focus:border-slate-900" title="Course name" />
                        <button type="button" onClick={() => removeCourse(i)} title={`Remove ${s.abbr}`}
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-50"><HiOutlineTrash className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <label className="text-xs font-semibold text-slate-700 mb-1 min-h-[2rem] flex items-end leading-tight">
                        <span>{s.abbr} – {s.name}</span>
                      </label>
                    )}
                    <input type="number" min="0" max={max}
                      className={`w-full border rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 ${
                        isOver
                          ? 'border-rose-400 bg-rose-50 focus:ring-rose-400 text-rose-700'
                          : 'border-slate-200 focus:ring-slate-900/10 focus:border-slate-900'
                      }`}
                      placeholder="Leave blank = N/A"
                      value={s.marks_obtained ?? ''}
                      onChange={e => setSubject(i, e.target.value)}
                      onWheel={e => e.currentTarget.blur()}
                      onBlur={() => { lastEditAbbr.current = null; }} />
                    {isOver && (
                      <p className="text-[10px] text-rose-500 mt-0.5 font-bold">Max {max}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {form.subjects.length === 0 && (
              <p className="text-xs text-slate-400 font-medium py-3">No courses on this sheet. Add one below.</p>
            )}
            {manageCourses && (
              <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Add course</p>
                {missingDefaults.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {missingDefaults.map(d => (
                      <button key={d.abbr} type="button" onClick={() => addCourse(d.abbr, d.name)}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
                        + {d.abbr}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input placeholder="ABBR" value={newCourse.abbr} onChange={e => setNewCourse(c => ({ ...c, abbr: e.target.value.toUpperCase() }))}
                    className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:border-slate-900" />
                  <input placeholder="Course name" value={newCourse.name} onChange={e => setNewCourse(c => ({ ...c, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCourse(newCourse.abbr, newCourse.name); } }}
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:border-slate-900" />
                  <button type="button" onClick={() => addCourse(newCourse.abbr, newCourse.name)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">Add</button>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Final Marks & Sheet</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Final Exam Score</label>
                <input type="number" min="0" max="100"
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 ${
                    form.final_exam_score !== '' && Number(form.final_exam_score) > 100
                      ? 'border-rose-400 bg-rose-50 focus:ring-rose-400 text-rose-700'
                      : 'border-slate-200 focus:ring-slate-900/10 focus:border-slate-900'
                  }`}
                  value={form.final_exam_score}
                  onWheel={e => e.currentTarget.blur()}
                  onChange={e => set('final_exam_score', e.target.value)} />
                {form.final_exam_score !== '' && Number(form.final_exam_score) > 100 && (
                  <p className="text-[10px] text-rose-500 mt-0.5 font-bold">Max 100</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Overall Average / Final Marks <span className="text-[10px] font-bold text-emerald-600 ml-1">AUTO</span>
                </label>
                <div className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>{autoAvg != null ? `${autoAvg}%` : '—'}</span>
                  {autoAvg != null && gradeFromMark(autoAvg) && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${gradeBadge(gradeFromMark(autoAvg))}`}>{gradeFromMark(autoAvg)}</span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sheet Date</label>
                <input type="date"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  value={form.sheet_date} onChange={e => set('sheet_date', e.target.value)} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <Checkbox checked={form.sheet_issued} onCheckedChange={c => set('sheet_issued', !!c)} />
                  Sheet Already Issued
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4 flex justify-end gap-2.5">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 shadow-2xs">
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {initial ? 'Save Changes' : 'Add Result'}
          </button>
        </div>
        </motion.div>
      </div>
    </>
  );
}

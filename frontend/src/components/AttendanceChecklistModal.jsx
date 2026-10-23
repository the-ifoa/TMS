import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineClipboardList, HiOutlineCheckCircle, HiOutlineX, HiOutlineDocumentDownload, HiOutlineEye, HiOutlineRefresh, HiOutlineUpload } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { getAttendanceSheet, saveAttendanceSheet, updateAttendanceSheet } from '../api';
import { generateAttendancePdf } from '../utils/generateAttendancePdf';
import {
  STATUS, STATUS_ORDER, courseDays, statusMatrix, summarise, defaultDetails, mergeDetails, toStorage, nameKey,
} from '../utils/attendanceRecord';
import { TRAINING_LABELS } from '../pages/airlines/helpers';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { INSTRUCTORS, findInstructor, signatureFor, signatureFileToDataUrl } from '../utils/instructors';

// ─── Attendance editor ────────────────────────────────────────────────────────
// Three tabs for one training batch:
//   Daily register  — a status per trainee per day (P / L / E / A); everyone
//                     starts as Present.
//   Hours & remarks — hours attended (typed, or worked out from the days
//                     present), attendance % (automatic) and remarks.
//   Record details  — what the printed Training Attendance Record needs and
//                     the system doesn't hold (course title, venue, instructor…).
// Export / Preview build the PDF from what is on screen, saved or not.

const STATUS_STYLE = {
  P: { on: 'bg-emerald-600 text-white border-emerald-600', off: 'text-emerald-700 hover:bg-emerald-50' },
  L: { on: 'bg-amber-500 text-white border-amber-500', off: 'text-amber-700 hover:bg-amber-50' },
  E: { on: 'bg-orange-600 text-white border-orange-600', off: 'text-orange-700 hover:bg-orange-50' },
  A: { on: 'bg-rose-600 text-white border-rose-600', off: 'text-rose-700 hover:bg-rose-50' },
};
const CODE_TEXT = { P: 'text-emerald-700', L: 'text-amber-700', E: 'text-orange-700', A: 'text-rose-700' };

const inputCls = 'w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50';
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export default function AttendanceChecklistModal({
  participants,
  startDate,
  endDate,
  company,
  trainingType,
  attendanceId: initialId,
  onIdSaved,
  onClose,
  readOnly = false,
}) {
  const valid = useMemo(
    () => participants.filter((p) => (p.first_name || '').trim() || (p.last_name || '').trim()),
    [participants],
  );
  const days = useMemo(() => courseDays(startDate, endDate), [startDate, endDate]);
  const trainingLabel = TRAINING_LABELS[trainingType] || trainingType || '';
  const baseDetails = useMemo(() => defaultDetails({ company, trainingLabel, endDate: endDate || startDate }), [company, trainingLabel, endDate, startDate]);

  const [tab, setTab] = useState('register');
  const [matrix, setMatrix] = useState(() => statusMatrix(null, valid.length, days));
  const [extras, setExtras] = useState(() => valid.map(() => ({ hours: null, remarks: '' }))); // per trainee
  const [details, setDetails] = useState(baseDetails);
  const [sheetMeta, setSheetMeta] = useState(null); // _id / created_at, for the record number
  const [selectedDate, setSelectedDate] = useState(days[0] || null);
  const [attendanceId, setAttendanceId] = useState(initialId || null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!initialId);

  useEffect(() => {
    if (!initialId) return;
    setLoading(true);
    getAttendanceSheet(initialId)
      .then((res) => {
        const sheet = res.data;
        // The sheet's participants may be in another order than the ones passed
        // in: carry statuses / hours / remarks over by name.
        const sheetIdx = new Map((sheet.participants || []).map((p, i) => [nameKey(p), i]));
        const stored = statusMatrix(sheet, (sheet.participants || []).length, days);
        const next = {};
        days.forEach((d) => {
          next[d] = valid.map((p) => { const i = sheetIdx.get(nameKey(p)); return i == null ? 'P' : (stored[d] || [])[i] || 'P'; });
        });
        setMatrix(next);
        setExtras(valid.map((p) => {
          const sp = (sheet.participants || [])[sheetIdx.get(nameKey(p))];
          return { hours: sp?.hours ?? null, remarks: sp?.remarks || '' };
        }));
        setDetails(mergeDetails(sheet.details, baseDetails));
        setSheetMeta({ _id: sheet._id, created_at: sheet.created_at });
      })
      .catch(() => toast.error('Could not load the saved attendance.'))
      .finally(() => setLoading(false));
  }, [initialId]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = valid.map((p, i) => ({ ...p, ...extras[i] }));
  const sum = summarise({ participants: people, matrix, days, details });

  const setCode = (date, idx, code) => {
    if (readOnly) return;
    setMatrix((prev) => {
      const arr = [...(prev[date] || valid.map(() => 'P'))];
      arr[idx] = code;
      return { ...prev, [date]: arr };
    });
  };
  const setDay = (date, code) => !readOnly && setMatrix((prev) => ({ ...prev, [date]: valid.map(() => code) }));
  const resetAll = () => {
    if (readOnly) return;
    setMatrix(statusMatrix(null, valid.length, days));
    toast.success('Everyone set back to Present on every day.');
  };
  const setExtra = (i, patch) => setExtras((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const setDetail = (k, v) => setDetails((prev) => ({ ...prev, [k]: v }));

  // Instructor: pick from the IFOA list or type a name ("Other"). Changing the
  // instructor drops any uploaded signature, which belonged to the old one.
  const [typingName, setTypingName] = useState(false);
  const sigInput = useRef(null);
  const listed = findInstructor(details.instructor_name);
  const instructorChoice = listed ? listed.name : (typingName || details.instructor_name ? '__other__' : '');
  const chooseInstructor = (value) => {
    setTypingName(value === '__other__');
    setDetails((prev) => ({ ...prev, instructor_name: value === '__other__' ? '' : value, instructor_signature: '' }));
  };
  const uploadSignature = async (file) => {
    try {
      setDetail('instructor_signature', await signatureFileToDataUrl(file));
    } catch (err) {
      toast.error(err.message);
    }
  };
  const signature = signatureFor(details);

  const sheetForPdf = () => ({
    ...(sheetMeta || {}), company, airline_name: company, training_type: trainingType, start_date: startDate, end_date: endDate,
  });
  const exportPdf = (mode) => generateAttendancePdf({ sheet: sheetForPdf(), participants: people, matrix, details, trainingLabel, mode });

  const handleSave = async () => {
    if (readOnly) return;
    if (!startDate) { toast.error('No start date set'); return; }
    setSaving(true);
    try {
      const payload = {
        company: company || 'Unknown',
        training_type: trainingType || '',
        start_date: startDate,
        end_date: endDate || null,
        participants: people.map(({ first_name, last_name, hours, remarks }) => ({ first_name, last_name, hours: hours === '' ? null : hours, remarks })),
        details,
        ...toStorage(matrix, days),
      };
      if (attendanceId) {
        await updateAttendanceSheet(attendanceId, payload);
        toast.success('Attendance updated');
      } else {
        const res = await saveAttendanceSheet(payload);
        setAttendanceId(res.data._id);
        setSheetMeta({ _id: res.data._id, created_at: res.data.created_at });
        onIdSaved && onIdSaved(res.data._id);
        toast.success('Attendance saved');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const dayCounts = (date) => {
    const arr = matrix[date] || [];
    return STATUS_ORDER.reduce((m, c) => ({ ...m, [c]: arr.filter((x) => (x || 'P') === c).length }), {});
  };
  const notPresentTotal = days.reduce((t, d) => t + (matrix[d] || []).filter((c) => c && c !== 'P').length, 0);

  const tabBtn = (key, label) => (
    <button type="button" onClick={() => setTab(key)} aria-pressed={tab === key}
      className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
      {label}
    </button>
  );

  return (
    <>
      <div className="fixed -inset-20 z-50 bg-black/50 backdrop-blur-sm pointer-events-none" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0"><HiOutlineClipboardList className="w-5 h-5" /></span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
                    Training attendance record
                    {readOnly && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">View only</span>}
                  </h2>
                  <p className="text-[13px] text-slate-500 truncate">
                    {[company, trainingLabel, `${startDate || ''}${endDate && endDate !== startDate ? ` – ${endDate}` : ''}`, `${valid.length} trainee${valid.length !== 1 ? 's' : ''}`, `${days.length} day${days.length !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 inline-flex items-center justify-center"><HiOutlineX className="w-5 h-5" /></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex p-0.5 rounded-lg bg-slate-100">
                {tabBtn('register', 'Daily register')}
                {tabBtn('hours', 'Hours & remarks')}
                {tabBtn('details', 'Record details')}
              </div>
              <p className="text-[11px] text-slate-500">
                {sum.average != null && <>Average attendance <span className="font-semibold text-slate-800">{sum.average}%</span> · </>}
                <span className="font-semibold text-slate-800">{sum.met}</span> of {sum.enrolled} meet {sum.minPct}%
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="py-20 flex justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>
            ) : !startDate ? (
              <p className="text-sm text-slate-500 text-center py-16">Set the training start date to build the attendance record.</p>
            ) : valid.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-16">No trainees in this batch.</p>
            ) : tab === 'register' ? (
              <div className="grid grid-cols-1 md:grid-cols-[13rem_minmax(0,1fr)] min-h-full">
                {/* Day list */}
                <nav className="border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/60 p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto">
                  {days.map((d, i) => {
                    const c = dayCounts(d);
                    const off = c.A + c.L + c.E;
                    return (
                      <button key={d} type="button" onClick={() => setSelectedDate(d)}
                        className={`flex-shrink-0 text-left rounded-lg px-3 py-2 transition-colors cursor-pointer ${selectedDate === d ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'hover:bg-white/70'}`}>
                        <span className="block text-[11px] font-semibold text-slate-400">Day {i + 1}</span>
                        <span className="block text-sm font-semibold text-slate-800 whitespace-nowrap">{fmtDay(d)}</span>
                        <span className={`block text-[11px] ${off ? 'text-amber-700' : 'text-emerald-700'}`}>{off ? `${c.P} present · ${off} other` : 'All present'}</span>
                      </button>
                    );
                  })}
                </nav>

                {/* Selected day */}
                <div className="p-5">
                  {selectedDate && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        {!readOnly && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => setDay(selectedDate, 'P')} className="h-8 px-3 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700">All present this day</button>
                            <button type="button" onClick={() => setDay(selectedDate, 'A')} className="h-8 px-3 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700">All absent this day</button>
                            <button type="button" onClick={resetAll} className="h-8 px-3 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><HiOutlineRefresh className="w-3.5 h-3.5" />Reset all days</button>
                          </div>
                        )}
                      </div>
                      <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                        {valid.map((p, idx) => {
                          const code = (matrix[selectedDate] || [])[idx] || 'P';
                          return (
                            <li key={idx} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                              <span className="text-sm text-slate-800 min-w-0 truncate"><span className="font-semibold">{(p.last_name || '').toUpperCase()}</span>{p.first_name ? `, ${p.first_name}` : ''}</span>
                              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden" role="radiogroup" aria-label={`Status for ${p.first_name} ${p.last_name}`}>
                                {STATUS_ORDER.map((c) => (
                                  <button key={c} type="button" role="radio" aria-checked={code === c} disabled={readOnly} title={STATUS[c].label}
                                    onClick={() => setCode(selectedDate, idx, c)}
                                    className={`h-8 px-2.5 text-xs font-bold border-l first:border-l-0 border-slate-200 transition-colors disabled:cursor-default ${code === c ? STATUS_STYLE[c].on : `bg-white ${STATUS_STYLE[c].off}`}`}>
                                    {c}<span className="hidden sm:inline font-medium"> {STATUS[c].label.split(' ')[0]}</span>
                                  </button>
                                ))}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-3 text-[11px] text-slate-500">P = Present · L = Late arrival / early departure (add a remark) · E = Excused absence · A = Absent. Everyone starts as Present.</p>
                    </>
                  )}
                </div>
              </div>
            ) : tab === 'hours' ? (
              <div className="p-5">
                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2.5 w-8">#</th>
                        <th className="text-left px-3 py-2.5">Trainee</th>
                        <th className="text-left px-3 py-2.5">Days</th>
                        <th className="text-left px-3 py-2.5 w-32">Hours attended</th>
                        <th className="text-left px-3 py-2.5 w-24">Attendance</th>
                        <th className="text-left px-3 py-2.5">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {valid.map((p, i) => {
                        const r = sum.rows[i];
                        return (
                          <tr key={i}>
                            <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                            <td className="px-3 py-2 whitespace-nowrap"><span className="font-semibold">{(p.last_name || '').toUpperCase()}</span>{p.first_name ? `, ${p.first_name}` : ''}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums">
                              {STATUS_ORDER.filter((c) => r.counts[c]).map((c) => <span key={c} className={`mr-2 font-bold ${CODE_TEXT[c]}`}>{c} {r.counts[c]}</span>)}
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" min="0" step="0.5" disabled={readOnly}
                                value={extras[i]?.hours ?? ''}
                                placeholder={r.autoHours != null ? `${r.autoHours} (auto)` : sum.scheduled ? '' : 'Set scheduled hours'}
                                onChange={(e) => setExtra(i, { hours: e.target.value === '' ? null : Number(e.target.value) })}
                                className={`${inputCls} h-8 w-28 tabular-nums`} aria-label={`Hours attended by ${p.first_name} ${p.last_name}`} />
                            </td>
                            <td className="px-3 py-2">
                              {r.pct == null ? <span className="text-slate-400">—</span> : (
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ring-1 ring-inset ${r.met ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15' : 'bg-rose-50 text-rose-700 ring-rose-600/15'}`}>{r.pct}%</span>
                              )}
                            </td>
                            <td className="px-3 py-2 min-w-[14rem]">
                              <input type="text" maxLength={300} disabled={readOnly} value={extras[i]?.remarks || ''}
                                onChange={(e) => setExtra(i, { remarks: e.target.value })}
                                placeholder={r.counts.L ? 'e.g. Day 2 late arrival 1.5 h' : r.counts.E ? 'e.g. Day 2 excused (medical)' : ''}
                                className={`${inputCls} h-8`} aria-label={`Remarks for ${p.first_name} ${p.last_name}`} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                  {sum.scheduled
                    ? <>Leave hours blank to use the days present × {Math.round(sum.perDay * 10) / 10} h per day (P and L count as a day, E and A as none). </>
                    : <>Set <span className="font-semibold">Scheduled hours</span> in Record details to calculate hours; until then attendance % is days present ÷ course days. </>}
                  Attendance % = hours attended ÷ scheduled hours. Minimum for completion: {sum.minPct}%.
                </p>
              </div>
            ) : (
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
                <Field label="Course title"><input className={inputCls} disabled={readOnly} value={details.course_title} onChange={(e) => setDetail('course_title', e.target.value)} placeholder="e.g. Aircraft Dispatcher – Recurrent Training" /></Field>
                <Field label="Client / operator"><input className={inputCls} disabled={readOnly} value={details.client} onChange={(e) => setDetail('client', e.target.value)} /></Field>
                <Field label="Delivery mode"><input className={inputCls} disabled={readOnly} value={details.delivery_mode} onChange={(e) => setDetail('delivery_mode', e.target.value)} placeholder="e.g. Classroom, Online, Blended" /></Field>
                <Field label="Venue"><input className={inputCls} disabled={readOnly} value={details.venue} onChange={(e) => setDetail('venue', e.target.value)} placeholder="e.g. IFOA Training Centre" /></Field>
                <Field label="Scheduled hours" hint={days.length ? `Across ${days.length} day${days.length !== 1 ? 's' : ''}. Used for hours and attendance %.` : ''}>
                  <input type="number" min="0" step="0.5" className={inputCls} disabled={readOnly} value={details.scheduled_hours ?? ''} onChange={(e) => setDetail('scheduled_hours', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 24" />
                </Field>
                <Field label="Minimum attendance (%)" hint="Needed to complete the course.">
                  <input type="number" min="0" max="100" className={inputCls} disabled={readOnly} value={details.min_attendance ?? ''} onChange={(e) => setDetail('min_attendance', e.target.value === '' ? null : Number(e.target.value))} />
                </Field>
                {/* div, not a <label>: a label would re-open the dropdown on click */}
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-1">Instructor name</span>
                  <Select value={instructorChoice || undefined} onValueChange={chooseInstructor} disabled={readOnly}>
                    <SelectTrigger className="h-9 rounded-lg bg-white" aria-label="Instructor name">
                      <SelectValue placeholder="Select instructor" />
                    </SelectTrigger>
                    <SelectContent className="z-[60]">
                      {INSTRUCTORS.map((i) => <SelectItem key={i.name} value={i.name}>{i.name}</SelectItem>)}
                      <SelectItem value="__other__">Other (type name)</SelectItem>
                    </SelectContent>
                  </Select>
                  {instructorChoice === '__other__' && (
                    <input className={`${inputCls} mt-2`} disabled={readOnly} value={details.instructor_name} onChange={(e) => setDetail('instructor_name', e.target.value)} placeholder="Instructor's full name" aria-label="Instructor's full name" autoFocus={!readOnly && !details.instructor_name} />
                  )}
                </div>
                <Field label="Instructor role / qualification"><input className={inputCls} disabled={readOnly} value={details.instructor_title} onChange={(e) => setDetail('instructor_title', e.target.value)} placeholder="e.g. Lead Instructor · FAA Aircraft Dispatcher" /></Field>
                <div className="sm:col-span-2">
                  <span className="block text-xs font-semibold text-slate-700 mb-1">Instructor signature</span>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="h-20 w-full sm:w-72 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center px-3">
                      {signature
                        ? <img src={signature} alt={`Signature of ${details.instructor_name || 'the instructor'}`} className="max-h-16 max-w-full object-contain" />
                        : <span className="text-[11px] text-slate-400">No signature. The record prints a blank line to sign by hand.</span>}
                    </div>
                    {!readOnly && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input ref={sigInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadSignature(f); }} />
                        <button type="button" onClick={() => sigInput.current?.click()}
                          className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5">
                          <HiOutlineUpload className="w-4 h-4" />
                          {details.instructor_signature ? 'Replace signature' : listed?.signature ? 'Upload a different one' : 'Upload signature'}
                        </button>
                        {details.instructor_signature && (
                          <button type="button" onClick={() => setDetail('instructor_signature', '')}
                            className="h-9 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100">
                            {listed?.signature ? 'Use built-in signature' : 'Remove'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="block text-[11px] text-slate-400 mt-1">
                    {details.instructor_signature
                      ? 'Uploaded for this record.'
                      : listed?.signature
                        ? `Built-in signature for ${listed.name}.`
                        : 'PNG or JPG on a plain light background works best.'}
                  </span>
                </div>
                <Field label="Certification date"><input type="date" className={inputCls} disabled={readOnly} value={details.certified_on || ''} onChange={(e) => setDetail('certified_on', e.target.value)} /></Field>
                <Field label="Form reference" hint="Printed bottom left with the record number."><input className={inputCls} disabled={readOnly} value={details.form_ref} onChange={(e) => setDetail('form_ref', e.target.value)} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Header tagline" hint="Printed under the title, e.g. your approvals."><input className={inputCls} disabled={readOnly} value={details.tagline} onChange={(e) => setDetail('tagline', e.target.value)} /></Field>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {notPresentTotal ? `${notPresentTotal} day mark${notPresentTotal !== 1 ? 's' : ''} other than Present` : 'Everyone present on every day'}
              {attendanceId && <span className="ml-1.5 text-emerald-600 font-medium">· Saved</span>}
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => exportPdf('preview')} disabled={!startDate || !valid.length} className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"><HiOutlineEye className="w-4 h-4" />Preview PDF</button>
              <button type="button" onClick={() => exportPdf('download')} disabled={!startDate || !valid.length} className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"><HiOutlineDocumentDownload className="w-4 h-4" />Download PDF</button>
              {!readOnly && (
                <button type="button" onClick={handleSave} disabled={saving} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5 disabled:opacity-60">
                  {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</> : <><HiOutlineCheckCircle className="w-4 h-4" />Save</>}
                </button>
              )}
              <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">Close</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

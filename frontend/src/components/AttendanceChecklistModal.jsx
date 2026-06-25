import { useState, useEffect } from 'react';
import { HiOutlineClipboardList, HiOutlineCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { getAttendanceSheet, saveAttendanceSheet, updateAttendanceSheet } from '../api';
import { generateAttendancePdf } from '../utils/generateAttendancePdf';

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
  const valid = participants.filter(p => (p.first_name || '').trim() || (p.last_name || '').trim());

  const allDates = [];
  if (startDate) {
    const start = new Date(startDate + 'T12:00:00');
    const end   = endDate ? new Date(endDate + 'T12:00:00') : new Date(start);
    const cur   = new Date(start);
    while (cur <= end && allDates.length < 366) {
      allDates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
  }
  const dateSet = new Set(allDates);

  const [attendance, setAttendance]     = useState({});
  const [selectedDate, setSelectedDate] = useState(allDates[0] || null);
  const [currentMonth, setCurrentMonth] = useState(() =>
    allDates.length ? new Date(allDates[0] + 'T12:00:00') : new Date()
  );
  const [attendanceId, setAttendanceId] = useState(initialId || null);
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialId) return;
    setLoading(true);
    getAttendanceSheet(initialId)
      .then(res => {
        const loaded = {};
        (res.data.records || []).forEach(r => {
          const arr = new Array(valid.length).fill(false);
          (r.present || []).forEach(i => { if (i < arr.length) arr[i] = true; });
          loaded[r.date] = arr;
        });
        setAttendance(loaded);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [initialId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (date, idx) => {
    if (readOnly) return;
    setAttendance(prev => {
      const arr = Array.from(prev[date] || new Array(valid.length).fill(false));
      while (arr.length < valid.length) arr.push(false);
      arr[idx] = !arr[idx];
      return { ...prev, [date]: arr };
    });
  };

  const markAll = (date, present) => {
    if (readOnly) return;
    setAttendance(prev => ({ ...prev, [date]: new Array(valid.length).fill(present) }));
  };

  const handleSave = async () => {
    if (readOnly) return;
    if (!startDate) { toast.error('No start date set'); return; }
    setSaving(true);
    try {
      const records = allDates
        .map(date => ({
          date,
          present: (attendance[date] || []).reduce((acc, p, i) => { if (p) acc.push(i); return acc; }, []),
        }))
        .filter(r => r.present.length > 0);

      const payload = { company: company || 'Unknown', training_type: trainingType || '', start_date: startDate, end_date: endDate || null, participants: valid, records };

      if (attendanceId) {
        await updateAttendanceSheet(attendanceId, payload);
        toast.success('Attendance updated');
      } else {
        const res = await saveAttendanceSheet(payload);
        const newId = res.data._id;
        setAttendanceId(newId);
        onIdSaved && onIdSaved(newId);
        toast.success('Attendance saved');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const yr = currentMonth.getFullYear();
  const mo = currentMonth.getMonth();

  const calendarCells = () => {
    const first       = new Date(yr, mo, 1);
    const daysInMonth = new Date(yr, mo + 1, 0).getDate();
    const offset      = (first.getDay() + 6) % 7;
    const cells       = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  };

  const toDateStr = d =>
    d ? `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;

  const getSummary = d => {
    const ds = toDateStr(d);
    if (!ds || !dateSet.has(ds)) return null;
    const arr     = attendance[ds] || [];
    const present = arr.filter(Boolean).length;
    return { present, total: valid.length };
  };

  const firstMonth = allDates.length ? new Date(allDates[0] + 'T12:00:00') : null;
  const lastMonth  = allDates.length ? new Date(allDates[allDates.length - 1] + 'T12:00:00') : null;
  const canPrev = firstMonth && (yr > firstMonth.getFullYear() || (yr === firstMonth.getFullYear() && mo > firstMonth.getMonth()));
  const canNext = lastMonth  && (yr < lastMonth.getFullYear()  || (yr === lastMonth.getFullYear()  && mo < lastMonth.getMonth()));

  const cells       = calendarCells();
  const totalMarked = Object.values(attendance).reduce((acc, arr) => acc + arr.filter(Boolean).length, 0);
  const selectedArr = selectedDate ? (attendance[selectedDate] || new Array(valid.length).fill(false)) : [];

  const generatePDF = (mode = 'download') =>
    generateAttendancePdf({ participants: valid, startDate, endDate, company, trainingType, attendance, mode });

  return (
    <>
      <div className="fixed -inset-20 z-50 bg-black/50 backdrop-blur-sm pointer-events-none" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-primary-200">
          <div>
            <h2 className="text-base font-bold text-primary-800 flex items-center gap-2">
              <HiOutlineClipboardList className="w-5 h-5 text-accent-500" />
              Attendance Checklist
              {readOnly && <span className="text-[10px] font-normal text-primary-400 bg-primary-100 px-2 py-0.5 rounded-full">View Only</span>}
            </h2>
            <p className="text-xs text-primary-400 mt-0.5">
              {startDate}{endDate && endDate !== startDate ? ` – ${endDate}` : ''}
              {' · '}{valid.length} participant{valid.length !== 1 ? 's' : ''}
              {' · '}{allDates.length} day{allDates.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-primary-400 hover:text-primary-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary-100 transition-colors">×</button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            {!startDate ? (
              <p className="text-sm text-primary-400 text-center py-10">Set training start date to generate checklist.</p>
            ) : (
              <>
                <div className="select-none">
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => setCurrentMonth(new Date(yr, mo - 1, 1))} disabled={!canPrev}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-primary-500 hover:bg-primary-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm">◀</button>
                    <span className="text-sm font-semibold text-primary-700">
                      {currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                    </span>
                    <button type="button" onClick={() => setCurrentMonth(new Date(yr, mo + 1, 1))} disabled={!canNext}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-primary-500 hover:bg-primary-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm">▶</button>
                  </div>

                  <div className="grid grid-cols-7 mb-1">
                    {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                      <div key={d} className="text-center text-[10px] font-semibold text-primary-400 uppercase py-1">{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-0.5">
                    {cells.map((d, i) => {
                      if (!d) return <div key={`e${i}`} />;
                      const ds         = toDateStr(d);
                      const inRange    = dateSet.has(ds);
                      const isSel      = selectedDate === ds;
                      const sum        = getSummary(d);
                      const hasAny     = sum && sum.present > 0;
                      const allPresent = sum && sum.total > 0 && sum.present === sum.total;
                      return (
                        <button key={ds} type="button" disabled={!inRange} onClick={() => setSelectedDate(ds)}
                          className={['flex flex-col items-center justify-center rounded-lg py-1.5 gap-0.5 transition-all',
                            !inRange ? 'text-primary-200 cursor-default' : '',
                            inRange && !isSel ? 'text-primary-700 hover:bg-primary-50 cursor-pointer' : '',
                            isSel ? 'bg-accent-500 text-white' : '',
                          ].join(' ')}>
                          <span className="text-xs font-medium leading-none">{d}</span>
                          {inRange && (
                            <span className={['w-1.5 h-1.5 rounded-full',
                              isSel ? 'bg-white/60' : '',
                              !isSel && allPresent ? 'bg-emerald-500' : '',
                              !isSel && hasAny && !allPresent ? 'bg-amber-400' : '',
                              !isSel && !hasAny ? 'bg-primary-200' : '',
                            ].join(' ')} />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 mt-2 justify-end">
                    {[{ color: 'bg-emerald-500', label: 'All present' }, { color: 'bg-amber-400', label: 'Partial' }, { color: 'bg-primary-200', label: 'Not marked' }].map(({ color, label }) => (
                      <span key={label} className="flex items-center gap-1 text-[10px] text-primary-400">
                        <span className={`w-2 h-2 rounded-full ${color}`} />{label}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedDate && (
                  <div className="border border-primary-100 rounded-xl overflow-hidden">
                    <div className="bg-primary-50 px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary-600 uppercase tracking-wider">
                        {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      {!readOnly && valid.length > 1 && (
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => markAll(selectedDate, true)} className="text-[10px] text-emerald-600 hover:text-emerald-700 font-semibold">All Present</button>
                          <span className="text-primary-200 text-xs">|</span>
                          <button type="button" onClick={() => markAll(selectedDate, false)} className="text-[10px] text-primary-400 hover:text-primary-600 font-semibold">Clear</button>
                        </div>
                      )}
                    </div>
                    {valid.length === 0 ? (
                      <p className="text-sm text-primary-400 text-center py-6">No participants.</p>
                    ) : (
                      <div className="divide-y divide-primary-50 max-h-52 overflow-y-auto">
                        {valid.map((p, idx) => {
                          const checked = !!(selectedArr[idx]);
                          return (
                            <label key={idx}
                              className={`flex items-center gap-3 px-4 py-2.5 select-none transition-colors ${readOnly ? 'cursor-default' : 'hover:bg-emerald-50/40 cursor-pointer'}`}
                              onClick={readOnly ? undefined : () => toggle(selectedDate, idx)}>
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-primary-300'}`}>
                                {checked && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              {!readOnly && <input type="checkbox" checked={checked} onChange={() => toggle(selectedDate, idx)} className="sr-only" />}
                              <span className={`text-sm flex-1 ${checked ? 'text-emerald-700 font-medium' : 'text-primary-700'}`}>
                                {p.first_name} {p.last_name}
                              </span>
                              <span className={`text-xs font-medium ${checked ? 'text-emerald-600' : 'text-primary-300'}`}>
                                {checked ? 'Present' : '—'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-primary-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
          <span className="text-xs text-primary-400 text-center sm:text-left">
            {totalMarked} mark{totalMarked !== 1 ? 's' : ''} recorded
            {attendanceId && <span className="ml-1.5 text-emerald-600 font-medium">· Saved</span>}
          </span>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
            <button type="button" onClick={generatePDF} className="flex-1 sm:flex-initial btn-outline text-sm py-1.5 px-3">Export PDF</button>
            {!readOnly && (
              <button type="button" onClick={handleSave} disabled={saving}
                className="flex-1 sm:flex-initial btn-primary text-sm py-1.5 px-3 flex items-center justify-center gap-1.5">
                {saving
                  ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
                  : <><HiOutlineCheckCircle className="w-3.5 h-3.5" />Save</>}
              </button>
            )}
            <button type="button" onClick={onClose} className="flex-1 sm:flex-initial btn-outline text-sm py-1.5 px-3">Close</button>
          </div>
        </div>
      </div>
    </div>
  </>
  );
}

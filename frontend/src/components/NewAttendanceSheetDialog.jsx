import { useEffect, useMemo, useState } from 'react';
import { HiOutlineCalendar, HiOutlineUsers, HiOutlineCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { getParticipants, bulkEnsureAttendanceSheets } from '../api';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TRAINING_LABELS } from '../pages/airlines/helpers';

// ─── New attendance sheet (admin) ─────────────────────────────────────────────
// Pick an airline, then one of its submitted training batches, then who is on
// the sheet. The sheet is attributed to the airline that submitted the batch;
// the caller opens it in the checklist editor to fill in.

const day = (v) => (v || '').slice(0, 10);
const airlineOf = (p) => (p.airline_name || p.company || '').trim();
const nameOf = (p) => {
  const first = p.first_name || (p.participant_name || '').trim().split(/\s+/)[0] || '';
  const last = p.last_name || (p.participant_name || '').trim().split(/\s+/).slice(1).join(' ');
  return `${first} ${last}`.trim();
};
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function NewAttendanceSheetDialog({ open, onOpenChange, existingSheets = [], onCreated }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [airline, setAirline] = useState('');
  const [batchKey, setBatchKey] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAirline(''); setBatchKey(''); setPicked(new Set());
    setLoading(true);
    getParticipants()
      .then((res) => setRecords(res.data || []))
      .catch((err) => toast.error(err.response?.data?.error || 'Could not load participants'))
      .finally(() => setLoading(false));
  }, [open]);

  const airlines = useMemo(
    () => [...new Set(records.map(airlineOf).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [records],
  );

  // Training batches for the chosen airline: same type + start + end date.
  const batches = useMemo(() => {
    if (!airline) return [];
    const map = new Map();
    for (const p of records) {
      if (airlineOf(p) !== airline || !day(p.training_date)) continue;
      const start = day(p.training_date);
      const end = day(p.end_date) || null;
      const key = [p.training_type || '', start, end || ''].join('||');
      if (!map.has(key)) map.set(key, { key, training_type: p.training_type || '', start, end, people: [] });
      map.get(key).people.push(p);
    }
    const hasSheet = (b) => existingSheets.some((s) =>
      (s.airline_name || s.company) === airline && (s.training_type || '') === b.training_type
      && s.start_date === b.start && (s.end_date || null) === b.end);
    return [...map.values()]
      .map((b) => ({ ...b, hasSheet: hasSheet(b) }))
      .sort((a, b) => b.start.localeCompare(a.start));
  }, [airline, records, existingSheets]);

  const batch = batches.find((b) => b.key === batchKey) || null;

  const chooseBatch = (b) => {
    setBatchKey(b.key);
    setPicked(new Set(b.people.map((p) => String(p.id || p._id))));
  };
  const togglePerson = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleCreate = async () => {
    if (!batch || !picked.size) return;
    setSaving(true);
    try {
      const res = await bulkEnsureAttendanceSheets([...picked]);
      const first = res.data?.sheets?.[0];
      if (!first) { toast.error('Could not set up the attendance sheet'); return; }
      toast.success(first.created ? 'Attendance sheet created' : 'Sheet already existed. Names added and opened.');
      onCreated({ ...first.sheet, airline_name: airline });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not set up the attendance sheet');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New attendance sheet</DialogTitle>
          <DialogDescription>Choose the airline and the submitted training batch. You fill in the register and record details next.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
              <span className="text-sm font-medium">Loading submissions…</span>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Airline</p>
                <Select value={airline || undefined} onValueChange={(v) => { setAirline(v); setBatchKey(''); setPicked(new Set()); }}>
                  <SelectTrigger><SelectValue placeholder={airlines.length ? 'Select airline' : 'No submissions yet'} /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {airlines.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {airline && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1">Training batch</p>
                  {batches.length === 0 ? (
                    <p className="text-xs text-slate-500">This airline has no submissions with a training start date.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {batches.map((b) => {
                        const on = b.key === batchKey;
                        return (
                          <button key={b.key} type="button" onClick={() => chooseBatch(b)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${on ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${on ? 'border-slate-900' : 'border-slate-300'}`}>
                              {on && <span className="w-2 h-2 rounded-full bg-slate-900" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold text-slate-800 truncate">
                                {b.training_type}{TRAINING_LABELS[b.training_type] ? `: ${TRAINING_LABELS[b.training_type]}` : ''}
                              </span>
                              <span className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500 font-medium">
                                <span className="inline-flex items-center gap-1"><HiOutlineCalendar className="w-3 h-3" />{fmtDate(b.start)}{b.end && b.end !== b.start ? ` – ${fmtDate(b.end)}` : ''}</span>
                                <span className="inline-flex items-center gap-1"><HiOutlineUsers className="w-3 h-3" />{b.people.length} participant{b.people.length !== 1 ? 's' : ''}</span>
                              </span>
                            </span>
                            {b.hasSheet && (
                              <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">Has sheet</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {batch && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-700">On this sheet ({picked.size} of {batch.people.length})</p>
                    <button type="button" className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                      onClick={() => setPicked(picked.size === batch.people.length ? new Set() : new Set(batch.people.map((p) => String(p.id || p._id))))}>
                      {picked.size === batch.people.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  {batch.hasSheet && (
                    <p className="text-[11px] text-slate-500 mb-1.5">This batch already has a sheet. Anyone not on it yet is added, and it opens for editing.</p>
                  )}
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {batch.people.map((p) => {
                      const id = String(p.id || p._id);
                      const on = picked.has(id);
                      return (
                        <button key={id} type="button" role="checkbox" aria-checked={on} onClick={() => togglePerson(id)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
                          <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${on ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                            {on && <HiOutlineCheck className="w-3 h-3 text-white" />}
                          </span>
                          <span className="flex-1 min-w-0 text-sm text-slate-800 font-medium truncate">{nameOf(p) || '—'}</span>
                          {p.department && <span className="text-[11px] text-slate-400 truncate">{p.department}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)}
            className="px-3.5 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={handleCreate} disabled={!batch || !picked.size || saving}
            className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? 'Setting up…' : batch?.hasSheet ? 'Open sheet' : 'Create & fill in'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

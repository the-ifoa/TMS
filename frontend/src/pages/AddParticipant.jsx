import { useState, useEffect } from 'react';
import DatePicker from '../components/DatePicker';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineArrowLeft,
  HiOutlinePlusCircle,
  HiOutlineTrash,
  HiOutlineUserGroup,
  HiOutlineUser,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineClipboardList,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { createParticipant, getAirlinesList, sendSubmissionConfirmation } from '../api';
import { useAuth } from '../context/AuthContext';
import AttendanceChecklistModal from '../components/AttendanceChecklistModal';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const TRAINING_TYPES = [
  { value: 'FDI', label: 'FDI – Flight Dispatch Initial' },
  { value: 'FDR', label: 'FDR – Flight Dispatch Recurrent' },
  { value: 'FDA', label: 'FDA – Flight Dispatch Advanced' },
  { value: 'FTL', label: 'FTL – Flight Time Limitations' },
  { value: 'NDG', label: 'NDG – Dangerous Goods No-Carry' },
  { value: 'HF',  label: 'HF – Human Factors for OCC' },
  { value: 'GD',  label: 'GD – Ground Operations' },
  { value: 'TCD', label: 'TCD – Training Competencies Development' },
];

const ALL_MODULES = [
  'Air Law', 'Aircraft Systems', 'Navigation', 'Meteorology',
  'Flight Planning', 'Human Performance', 'Mass & Balance',
  'Operational Procedures', 'Communications', 'Flight Monitoring',
  'Aircraft Performance', 'Air Traffic Management', 'Principles of Flight',
];

const DEPARTMENT_OPTIONS = [
  'CAMO',
  'Compliance Monitoring',
  'Crew Control',
  'Flight Dispatch',
  'Flight Operations',
  'Ground Operations',
  'LCC',
  'MOC/MCC',
  'OCC',
  'Reservation',
  'Security',
  'Training',
];

const emptyRow = (defaultNdgSubtype = 'I', defaultDepartment = '') => ({
  id: Date.now() + Math.random(),
  first_name: '',
  last_name: '',
  email: '',
  department: defaultDepartment,
  ndg_subtype: defaultNdgSubtype, // I or R for NDG training overrides
});

// AttendanceChecklistModal — imported from ../components/AttendanceChecklistModal

// ─── Single-mode form ─────────────────────────────────────────────────────────
function SingleForm({ isAdmin, airlineName, airlineOptions, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [attendanceSheetId, setAttendanceSheetId] = useState(null);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    company: isAdmin ? '' : (airlineName || ''),
    department: '',
    training_type: '',
    training_date: '',
    end_date: '',
    location: '',
    modules: [],
    ndg_subtype: 'I',          // I = Initial, R = Recurrent (NDG only)
    online_synchronous: false,  // replaces location with 'Online Synchronous'
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleModule = (mod) =>
    setForm(prev => ({
      ...prev,
      modules: prev.modules.includes(mod)
        ? prev.modules.filter(m => m !== mod)
        : [...prev.modules, mod],
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('Please enter both first and last name');
      return;
    }
    if (!form.company || !form.department || !form.training_type || !form.training_date) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      setSaving(true);
      const saved = await createParticipant(form);
      // Send one confirmation email (airline only — fire-and-forget)
      if (!isAdmin) {
        sendSubmissionConfirmation({
          participants: [{ first_name: saved.data.first_name, last_name: saved.data.last_name, department: saved.data.department }],
          trainingType: saved.data.training_type,
          trainingDate: saved.data.training_date,
          endDate:      saved.data.end_date || null,
        }).catch(() => {}); // silent — email errors never block the UI
      }
      toast.success('Participant added successfully');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add participant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-5">
      {/* First + Last name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">First Name *</label>
          <input name="first_name" value={form.first_name} onChange={handleChange} className="input-field" placeholder="e.g. Ahmed" />
        </div>
        <div>
          <label className="label">Last Name *</label>
          <input name="last_name" value={form.last_name} onChange={handleChange} className="input-field" placeholder="e.g. Al Mansouri" />
        </div>
      </div>

      {/* Email — used to send the participant their exam link */}
      <div>
        <label className="label">Email <span className="text-primary-400 font-normal normal-case">(for exam invitations)</span></label>
        <input type="email" name="email" value={form.email} onChange={handleChange} className="input-field" placeholder="e.g. ahmed@example.com" />
      </div>

      {/* Airline + Department */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Airline Name *</label>
          {isAdmin ? (
            <Select value={form.company || undefined} onValueChange={v => handleChange({ target: { name: 'company', value: v } })}>
              <SelectTrigger><SelectValue placeholder="Select airline" /></SelectTrigger>
              <SelectContent>
                {airlineOptions.map(a => (
                  <SelectItem key={a.airlineName} value={a.airlineName}>{a.airlineName}</SelectItem>
                ))}
                <SelectItem value="__other__">Other (type manually)</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <input
              name="company"
              value={form.company}
              readOnly
              className="input-field bg-primary-100 cursor-not-allowed text-primary-500"
            />
          )}
          {isAdmin && form.company === '__other__' && (
            <input
              name="company"
              value={form._customCompany || ''}
              onChange={e => setForm(f => ({ ...f, _customCompany: e.target.value, company: e.target.value }))}
              className="input-field mt-2"
              placeholder="Type airline name"
              autoFocus
            />
          )}
          {!isAdmin && <p className="text-[10px] text-primary-400 mt-1">Auto-filled from your account</p>}
        </div>
        <div>
          <label className="label">Department *</label>
          <input name="department" value={form.department} onChange={handleChange} className="input-field" placeholder="e.g. Flight Operations" />
        </div>
      </div>

      {/* Training Type */}
      <div>
        <label className="label">Type of Training *</label>
        <Select value={form.training_type || undefined} onValueChange={v => handleChange({ target: { name: 'training_type', value: v } })}>
          <SelectTrigger><SelectValue placeholder="Select training type" /></SelectTrigger>
          <SelectContent>
            {TRAINING_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* NDG subtype — Initial or Recurrent */}
      {form.training_type === 'NDG' && (
        <div>
          <label className="label">NDG Training Type *</label>
          <div className="flex gap-3">
            {[{ val: 'I', label: 'I — Initial' }, { val: 'R', label: 'R — Recurrent' }].map(opt => (
              <button key={opt.val} type="button"
                onClick={() => setForm(f => ({ ...f, ndg_subtype: opt.val }))}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                  form.ndg_subtype === opt.val
                    ? 'border-accent-500 bg-accent-50 text-accent-700'
                    : 'border-primary-200 text-primary-500 hover:border-primary-400'
                }`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  form.ndg_subtype === opt.val ? 'border-accent-500' : 'border-primary-300'
                }`}>
                  {form.ndg_subtype === opt.val && <div className="w-2.5 h-2.5 rounded-full bg-accent-500" />}
                </div>
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-primary-400 mt-1.5">Select whether this is an Initial or Recurrent DG No-Carry training</p>
        </div>
      )}

      {/* Start Date + End Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Start Date *</label>
          <DatePicker
            value={form.training_date}
            onChange={val => setForm(f => ({ ...f, training_date: val }))}
            placeholder="mm/dd/yyyy"
          />
        </div>
        <div>
          <label className="label">End Date</label>
          <DatePicker
            value={form.end_date}
            onChange={val => setForm(f => ({ ...f, end_date: val }))}
            min={form.training_date || undefined}
            placeholder="mm/dd/yyyy"
          />
          <p className="text-[10px] text-primary-400 mt-1">Completion date shown on certificate</p>
        </div>
      </div>

      {/* Online Synchronous + Location */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <button type="button"
            onClick={() => setForm(f => ({ ...f, online_synchronous: !f.online_synchronous, location: '' }))}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
              form.online_synchronous ? 'bg-accent-600 border-accent-600' : 'border-primary-300 hover:border-primary-500'
            }`}>
            {form.online_synchronous && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <span className="text-sm font-medium text-primary-700">Online Synchronous</span>
          <span className="text-xs text-primary-400">(replaces location on certificate)</span>
        </div>
        {!form.online_synchronous && (
          <div>
            <label className="label">Training Location</label>
            <input
              name="location"
              value={form.location}
              onChange={handleChange}
              className="input-field"
              placeholder="e.g. Dubai, UAE"
            />
          </div>
        )}
        {form.online_synchronous && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-accent-200 bg-accent-50">
            <span className="text-xs text-accent-700 font-medium">Certificate will show: <strong>Online Synchronous</strong></span>
          </div>
        )}
      </div>

      {/* Modules for FDR */}
      {form.training_type === 'FDR' && (
        <div>
          <label className="label">Training Modules</label>
          <p className="text-xs text-primary-400 mb-3">Select all modules completed during recurrent training</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_MODULES.map(mod => (
              <button
                key={mod}
                type="button"
                onClick={() => toggleModule(mod)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                  form.modules.includes(mod)
                    ? 'border-accent-400 bg-accent-50 text-accent-700 font-medium'
                    : 'border-primary-200 text-primary-600 hover:border-primary-300'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
                  form.modules.includes(mod) ? 'bg-accent-500' : 'border border-primary-300'
                }`}>
                  {form.modules.includes(mod) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {mod}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isAdmin && (
        <div className="flex items-start gap-2 p-3 rounded-lg border" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <span className="text-sm mt-0.5" style={{ color: '#0000ff' }}>ℹ</span>
          <p className="text-xs" style={{ color: '#3b4f9e' }}>
            Once submitted, this record will be <strong>locked</strong>. Only IFOA administrators can edit or delete it.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-primary-200">
        <button
          type="button"
          onClick={() => {
            if (!form.training_date) { toast.error('Set a start date first'); return; }
            setShowChecklist(true);
          }}
          className="btn-outline flex items-center gap-1.5"
        >
          <HiOutlineClipboardList className="w-4 h-4" />
          Attendance Checklist
        </button>
        <button type="button" onClick={onSuccess} className="btn-outline">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : isAdmin ? 'Add Participant' : 'Submit Enrollment'}
        </button>
      </div>

      {showChecklist && (
        <AttendanceChecklistModal
          participants={[{ first_name: form.first_name, last_name: form.last_name }]}
          startDate={form.training_date}
          endDate={form.end_date}
          company={form.company}
          trainingType={form.training_type}
          attendanceId={attendanceSheetId}
          onIdSaved={(id) => setAttendanceSheetId(id)}
          onClose={() => setShowChecklist(false)}
        />
      )}
    </form>
  );
}

// ─── Simple name-only row for bulk mode ──────────────────────────────────────
function BulkRow({ row, idx, onChange, onRemove, result, isNDG, ndgMode, departmentMode }) {
  const hasError   = result?.status === 'error';
  const hasSuccess = result?.status === 'success';
  const canEditNdgSubtype = isNDG && ndgMode === 'M' && !hasSuccess;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className={`flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 rounded-xl border transition-colors ${
        hasError   ? 'border-red-300 bg-red-50/40' :
        hasSuccess ? 'border-emerald-300 bg-emerald-50/40' :
        'border-primary-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2 w-full sm:flex-1">
        {/* Row number */}
        <span className="w-6 text-center text-xs font-semibold text-primary-400 flex-shrink-0">{idx + 1}</span>

        {/* First name */}
        <input
          value={row.first_name}
          onChange={e => onChange(row.id, 'first_name', e.target.value)}
          className="input-field text-sm flex-1"
          placeholder="First name"
          disabled={hasSuccess}
        />

        {/* Last name */}
        <input
          value={row.last_name}
          onChange={e => onChange(row.id, 'last_name', e.target.value)}
          className="input-field text-sm flex-1"
          placeholder="Last name"
          disabled={hasSuccess}
        />

        {/* Email — for exam invitations */}
        <input
          type="email"
          value={row.email}
          onChange={e => onChange(row.id, 'email', e.target.value)}
          className="input-field text-sm flex-1"
          placeholder="Email (optional)"
          disabled={hasSuccess}
        />
      </div>

      {(departmentMode === 'manual' || isNDG) && (
        <div className="flex items-center gap-2 w-full sm:w-auto pl-8 sm:pl-0">
          {/* Department per row — only in manual mode */}
          {departmentMode === 'manual' && (
            <Select value={row.department || undefined} onValueChange={v => onChange(row.id, 'department', v)} disabled={hasSuccess}>
              <SelectTrigger className="text-sm flex-1 sm:w-44"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {DEPARTMENT_OPTIONS.map(dep => (
                  <SelectItem key={dep} value={dep}>{dep}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* NDG Training Type Toggle — only show for NDG training */}
          {isNDG && (
            <div className="w-[84px] flex items-center justify-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-lg border border-primary-200 bg-primary-50/50">
              {[{ val: 'I', label: 'I' }, { val: 'R', label: 'R' }].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  disabled={!canEditNdgSubtype}
                  onClick={() => onChange(row.id, 'ndg_subtype', opt.val)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                    row.ndg_subtype === opt.val
                      ? 'bg-accent-500 text-white border border-accent-500'
                      : 'bg-white text-primary-600 border border-primary-300 hover:border-primary-400'
                  } ${!canEditNdgSubtype ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status / remove */}
      <div className="flex items-center justify-end gap-2 w-full sm:w-auto flex-shrink-0 pl-8 sm:pl-0 border-t border-primary-100 sm:border-0 pt-2 sm:pt-0">
        {hasSuccess && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        {hasError && (
          <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium" title={result.error}>
            <HiOutlineExclamationCircle className="w-3.5 h-3.5" />
            {result.error || 'Failed'}
          </span>
        )}
        {!hasSuccess && (
          <button type="button" onClick={() => onRemove(row.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-primary-300 hover:text-red-500 transition-colors">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Bulk mode form ───────────────────────────────────────────────────────────
function BulkForm({ isAdmin, airlineName, airlineOptions, onSuccess }) {
  const [rows, setRows]       = useState([emptyRow('I', ''), emptyRow('I', ''), emptyRow('I', '')]);
  const [company, setCompany]           = useState(isAdmin ? '' : (airlineName || ''));
  const [customCompany, setCustomCompany] = useState('');
  const [saving, setSaving]              = useState(false);
  const [results, setResults] = useState({});
  const [done, setDone]       = useState(false);
  const [showChecklist, setShowChecklist]     = useState(false);
  const [attendanceSheetId, setAttendanceSheetId] = useState(null);
  const [trackAttendance, setTrackAttendance] = useState(false);

  // ── Shared session fields (apply to ALL participants) ──
  const [shared, setShared] = useState({
    department_mode:   'same', // same | manual
    department:        '',
    training_type:     '',
    training_date:     '',
    end_date:          '',
    location:          '',
    modules:           [],
    ndg_mode:          'I',    // I = Initial, R = Recurrent, M = Mixed
    online_synchronous: false, // replaces location with 'Online Synchronous'
  });

  const setSharedField = (field, value) => {
    setShared(prev => ({ ...prev, [field]: value }));
    // Initial/Recurrent enforce one subtype for all rows; Mixed allows per-row toggle.
    if (field === 'ndg_mode' && value !== 'M') {
      setRows(prev => prev.map(r => ({ ...r, ndg_subtype: value })));
    }
    // If switching to same department mode, clear row-level departments.
    if (field === 'department_mode' && value === 'same') {
      setRows(prev => prev.map(r => ({ ...r, department: '' })));
    }
  };

  const toggleModule   = (mod) =>
    setShared(prev => ({
      ...prev,
      modules: prev.modules.includes(mod)
        ? prev.modules.filter(m => m !== mod)
        : [...prev.modules, mod],
    }));

  const addRow    = () => setRows(prev => [...prev, emptyRow(shared.ndg_mode === 'R' ? 'R' : 'I', '')]);
  const removeRow = (id) => {
    if (rows.length === 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
    setResults(prev => { const n = {...prev}; delete n[id]; return n; });
  };
  const updateRow = (id, field, value) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const effectiveCompany = company === '__other__' ? customCompany.trim() : company.trim();
    if (isAdmin && !effectiveCompany) { toast.error('Please enter the airline name'); return; }
    if (shared.department_mode === 'same' && !shared.department.trim()) {
      toast.error('Please choose the department');
      return;
    }
    if (!shared.training_type)      { toast.error('Please select a training type'); return; }
    if (!shared.training_date)      { toast.error('Please select a start date'); return; }

    const pending = rows.filter(r => results[r.id]?.status !== 'success');
    if (pending.length === 0) { toast.success('All participants already submitted!'); return; }

    const invalid = pending.filter(r => !r.first_name.trim() || !r.last_name.trim());
    if (invalid.length > 0) {
      toast.error(`${invalid.length} row${invalid.length > 1 ? 's are' : ' is'} missing a name`);
      setResults(prev => {
        const n = {...prev};
        invalid.forEach(r => { n[r.id] = { status: 'error', error: 'Name required' }; });
        return n;
      });
      return;
    }

    if (shared.department_mode === 'manual') {
      const missingDept = pending.filter(r => !String(r.department || '').trim());
      if (missingDept.length > 0) {
        toast.error(`${missingDept.length} row${missingDept.length > 1 ? 's are' : ' is'} missing a department`);
        setResults(prev => {
          const n = { ...prev };
          missingDept.forEach(r => {
            n[r.id] = { status: 'error', error: 'Department required' };
          });
          return n;
        });
        return;
      }
    }

    setSaving(true);
    let successCount = 0, failCount = 0;
    // Track saved participants in a plain local array (React state updates are async
    // and would not be readable immediately after the loop)
    const savedParticipants = [];

    for (const row of pending) {
      try {
        await createParticipant({
          first_name:         row.first_name.trim(),
          last_name:          row.last_name.trim(),
          email:              (row.email || '').trim(),
          company:            isAdmin ? effectiveCompany : airlineName,
          department:         shared.department_mode === 'manual' ? row.department.trim() : shared.department.trim(),
          training_type:      shared.training_type,
          training_date:      shared.training_date,
          end_date:           shared.end_date || null,
          location:           shared.online_synchronous ? null : (shared.location || null),
          modules:            shared.modules,
          ndg_subtype:        shared.ndg_mode === 'M' ? row.ndg_subtype : shared.ndg_mode,
          online_synchronous: shared.online_synchronous,
        });
        setResults(prev => ({ ...prev, [row.id]: { status: 'success' } }));
        // Record in local array so we can use it synchronously below
        savedParticipants.push({
          first_name: row.first_name.trim(),
          last_name:  row.last_name.trim(),
          department: shared.department_mode === 'manual' ? row.department.trim() : shared.department.trim(),
        });
        successCount++;
      } catch (err) {
        const msg = err.response?.data?.error || 'Submission failed';
        setResults(prev => ({ ...prev, [row.id]: { status: 'error', error: msg } }));
        failCount++;
      }
    }

    setSaving(false);

    // Send ONE confirmation email for all successfully saved participants (airline only)
    if (!isAdmin && savedParticipants.length > 0) {
      sendSubmissionConfirmation({
        participants: savedParticipants,
        trainingType: shared.training_type,
        trainingDate: shared.training_date,
        endDate:      shared.end_date || null,
      }).catch(() => {}); // silent — never block the UI
    }

    if (failCount === 0) {
      toast.success(`${successCount} participant${successCount > 1 ? 's' : ''} added successfully!`);
      setDone(true);
    } else if (successCount > 0) {
      toast.error(`${successCount} saved, ${failCount} failed. Fix errors and resubmit.`);
    } else {
      toast.error('All submissions failed. Please check the errors and try again.');
    }
  };

  const successCount = Object.values(results).filter(r => r.status === 'success').length;
  const pendingCount = rows.length - successCount;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Shared Training Details ── */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-primary-700 uppercase tracking-wider">Training Details <span className="text-primary-400 font-normal normal-case">(applies to all participants below)</span></h3>

        {/* Airline – admin only */}
        {isAdmin && (
          <div>
            <label className="label">Airline Name *</label>
            <Select value={company || undefined} onValueChange={setCompany}>
              <SelectTrigger className="max-w-sm"><SelectValue placeholder="Select airline" /></SelectTrigger>
              <SelectContent>
                {airlineOptions.map(a => (
                  <SelectItem key={a.airlineName} value={a.airlineName}>{a.airlineName}</SelectItem>
                ))}
                <SelectItem value="__other__">Other (type manually)</SelectItem>
              </SelectContent>
            </Select>
            {company === '__other__' && (
              <input
                value={customCompany}
                onChange={e => setCustomCompany(e.target.value)}
                className="input-field mt-2 max-w-sm"
                placeholder="Type airline name"
                autoFocus
              />
            )}
          </div>
        )}

        {/* Department + Training Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Department *</label>
            <Select value={shared.department_mode} onValueChange={v => setSharedField('department_mode', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="same">Single Department for All Participants</SelectItem>
                <SelectItem value="manual">Department per Participant</SelectItem>
              </SelectContent>
            </Select>

            {shared.department_mode === 'same' && (
              <div className="mt-2">
                <label className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider">Choose Department</label>
                <Select value={shared.department || undefined} onValueChange={v => setSharedField('department', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choose department" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {DEPARTMENT_OPTIONS.map(dep => (
                      <SelectItem key={dep} value={dep}>{dep}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {shared.department_mode === 'manual' && (
              <p className="text-[10px] text-primary-400 mt-1.5">Department will be selected beside each participant row.</p>
            )}
          </div>
          <div>
            <label className="label">Training Type *</label>
            <Select value={shared.training_type || undefined} onValueChange={v => setSharedField('training_type', v)}>
              <SelectTrigger><SelectValue placeholder="Select training type" /></SelectTrigger>
              <SelectContent>
                {TRAINING_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Start + End Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Start Date *</label>
            <DatePicker
              value={shared.training_date}
              onChange={val => setSharedField('training_date', val)}
              placeholder="mm/dd/yyyy"
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <DatePicker
              value={shared.end_date}
              onChange={val => setSharedField('end_date', val)}
              min={shared.training_date || undefined}
              placeholder="mm/dd/yyyy"
            />
            <p className="text-[10px] text-primary-400 mt-1">Completion date shown on certificate</p>
          </div>
        </div>

        {/* NDG subtype — Initial or Recurrent */}
        {shared.training_type === 'NDG' && (
          <div>
            <label className="label">NDG Training Type *</label>
            <div className="flex gap-3">
              {[{ val: 'I', label: 'I — Initial' }, { val: 'R', label: 'R — Recurrent' }, { val: 'M', label: 'Mixed' }].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setSharedField('ndg_mode', opt.val)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    shared.ndg_mode === opt.val
                      ? 'border-accent-500 bg-accent-50 text-accent-700'
                      : 'border-primary-200 text-primary-500 hover:border-primary-400'
                  }`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    shared.ndg_mode === opt.val ? 'border-accent-500' : 'border-primary-300'
                  }`}>
                    {shared.ndg_mode === opt.val && <div className="w-2.5 h-2.5 rounded-full bg-accent-500" />}
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-primary-400 mt-1.5">
              {shared.ndg_mode === 'M'
                ? 'Mixed selected: each participant row can choose I or R.'
                : 'Initial/Recurrent selected: all participants in this group will use the same NDG type.'}
            </p>
          </div>
        )}

        {/* Online Synchronous + Location */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button type="button"
              onClick={() => setShared(s => ({ ...s, online_synchronous: !s.online_synchronous, location: '' }))}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                shared.online_synchronous ? 'bg-accent-600 border-accent-600' : 'border-primary-300 hover:border-primary-500'
              }`}>
              {shared.online_synchronous && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className="text-sm font-medium text-primary-700">Online Synchronous</span>
            <span className="text-xs text-primary-400">(replaces location on certificate)</span>
          </div>
          {!shared.online_synchronous && (
            <div>
              <label className="label">Training Location</label>
              <input value={shared.location} onChange={e => setSharedField('location', e.target.value)}
                className="input-field" placeholder="e.g. Dubai, UAE" />
            </div>
          )}
          {shared.online_synchronous && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-accent-200 bg-accent-50">
              <span className="text-xs text-accent-700 font-medium">Certificate will show: <strong>Online Synchronous</strong></span>
            </div>
          )}
        </div>

        {/* Modules – FDR only */}
        {shared.training_type === 'FDR' && (
          <div>
            <label className="label">Training Modules</label>
            <p className="text-xs text-primary-400 mb-2">Select all modules completed during this recurrent training</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ALL_MODULES.map(mod => (
                <button key={mod} type="button" onClick={() => toggleModule(mod)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                    shared.modules.includes(mod)
                      ? 'border-accent-400 bg-accent-50 text-accent-700 font-medium'
                      : 'border-primary-200 text-primary-600 hover:border-primary-300'
                  }`}>
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
                    shared.modules.includes(mod) ? 'bg-accent-500' : 'border border-primary-300'
                  }`}>
                    {shared.modules.includes(mod) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {mod}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attendance tracking — optional */}
        <div className="pt-2 border-t border-primary-100 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
            <button
              type="button"
              onClick={() => setTrackAttendance(v => !v)}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                trackAttendance ? 'bg-accent-600 border-accent-600' : 'border-primary-300 hover:border-primary-500'
              }`}
            >
              {trackAttendance && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className="text-sm font-medium text-primary-700">Track Attendance</span>
            <span className="text-xs text-primary-400">(optional)</span>
          </label>
          {trackAttendance && (
            <button
              type="button"
              onClick={() => {
                if (!shared.training_date) { toast.error('Set a start date first'); return; }
                setShowChecklist(true);
              }}
              className="btn-outline flex items-center gap-1.5"
            >
              <HiOutlineClipboardList className="w-4 h-4" />
              Attendance Checklist
            </button>
          )}
        </div>
      </div>

      {/* ── Participant Names ── */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary-700 uppercase tracking-wider">Participants</h3>
          <span className="text-xs text-primary-400">{rows.length} name{rows.length !== 1 ? 's' : ''} added</span>
        </div>

        {/* Column header */}
        <div className="hidden sm:flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4">
          <div className="flex items-center gap-2 w-full sm:flex-1">
            <span className="w-6 text-center text-xs font-semibold text-transparent flex-shrink-0">#</span>
            <span className="flex-1 text-[10px] font-semibold text-primary-400 uppercase tracking-wider">First Name</span>
            <span className="flex-1 text-[10px] font-semibold text-primary-400 uppercase tracking-wider">Last Name</span>
            <span className="flex-1 text-[10px] font-semibold text-primary-400 uppercase tracking-wider">Email (Optional)</span>
          </div>

          {(shared.department_mode === 'manual' || shared.training_type === 'NDG') && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {shared.department_mode === 'manual' && (
                <span className="w-40 sm:w-44 text-[10px] font-semibold text-primary-400 uppercase tracking-wider">Department</span>
              )}
              {shared.training_type === 'NDG' && (
                <span className="flex items-center justify-center w-[84px] text-[10px] font-semibold text-primary-400 uppercase tracking-wider">NDG Type</span>
              )}
            </div>
          )}
          <span className="w-8 flex-shrink-0" />
        </div>

        <div className="overflow-y-auto max-h-72 space-y-2 pr-1">
          <AnimatePresence mode="popLayout">
            {rows.map((row, idx) => (
              <BulkRow
                key={row.id}
                row={row}
                idx={idx}
                onChange={updateRow}
                onRemove={removeRow}
                result={results[row.id]}
                isNDG={shared.training_type === 'NDG'}
                ndgMode={shared.ndg_mode}
                departmentMode={shared.department_mode}
              />
            ))}
          </AnimatePresence>
        </div>

        {!done && (
          <button type="button" onClick={addRow}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-primary-200 rounded-xl text-sm font-medium text-primary-400 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 transition-all">
            <HiOutlinePlusCircle className="w-4 h-4" />
            Add Row
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="flex items-start gap-2 p-3 rounded-lg border" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <span className="text-sm mt-0.5" style={{ color: '#0000ff' }}>ℹ</span>
          <p className="text-xs" style={{ color: '#3b4f9e' }}>
            Once submitted, records will be <strong>locked</strong>. Only IFOA administrators can edit or delete them.
          </p>
        </div>
      )}

      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-primary-600">
          {successCount > 0
            ? <span className="text-emerald-600 font-medium">{successCount} submitted · {pendingCount} pending</span>
            : <span>{rows.length} participant{rows.length !== 1 ? 's' : ''} to submit</span>}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onSuccess} className="btn-outline">{done ? 'Done' : 'Cancel'}</button>
          {!done && (
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? (
                <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</>
              ) : (
                <><HiOutlineCheckCircle className="w-4 h-4" />Submit {pendingCount > 0 ? `${pendingCount} ` : ''}Enrollment{pendingCount !== 1 ? 's' : ''}</>
              )}
            </button>
          )}
        </div>
      </div>

      {showChecklist && (
        <AttendanceChecklistModal
          participants={rows.map(r => ({ first_name: r.first_name, last_name: r.last_name }))}
          startDate={shared.training_date}
          endDate={shared.end_date}
          company={company === '__other__' ? customCompany.trim() : company}
          trainingType={shared.training_type}
          attendanceId={attendanceSheetId}
          onIdSaved={(id) => setAttendanceSheetId(id)}
          onClose={() => setShowChecklist(false)}
        />
      )}
    </form>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────
export default function AddParticipant() {
  const navigate = useNavigate();
  const { admin, isAdmin } = useAuth();
  const airlineName = admin?.airlineName || '';
  const [mode, setMode] = useState('bulk'); // 'single' | 'bulk'
  const [airlineOptions, setAirlineOptions] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    getAirlinesList()
      .then(res => setAirlineOptions(res.data || []))
      .catch(() => {}); // silently ignore — dropdown just shows empty
  }, [isAdmin]);

  const handleSuccess = () => navigate(isAdmin ? '/admin/airlines' : '/airline/submissions');

  const TABS = [
    { val: 'single', label: 'Single',   Icon: HiOutlineUser },
    { val: 'bulk',   label: 'Group Add', Icon: HiOutlineUserGroup },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="min-h-full">
      {/* ── Sticky Page Header Bar (Clean, balanced responsive design) ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-6 py-2.5 sm:py-3 shadow-2xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          {/* Left: Back button + Title + Subtitle */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button 
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 shadow-2xs hover:bg-slate-50 transition-all flex-shrink-0"
              title="Go back"
            >
              <HiOutlineArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-sm sm:text-xl font-bold text-slate-900 tracking-tight truncate">
                {isAdmin ? 'Add Participant' : 'New Enrollment'}
              </h1>
              <span className="hidden md:inline text-xs text-slate-400 truncate max-w-sm">
                {isAdmin ? 'Create training records' : 'Submit enrollments'}
              </span>
            </div>
          </div>

          {/* Right: Single / Group Add tabs */}
          <div className="flex items-center gap-0.5 sm:gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/60 flex-shrink-0">
            {TABS.map(({ val, label, Icon }) => (
              <button 
                key={val} 
                type="button" 
                onClick={() => setMode(val)}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all ${
                  mode === val 
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/50' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-slate-500" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content padded container */}
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <AnimatePresence mode="wait">
          {mode === 'single' && (
            <motion.div key="single" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <SingleForm isAdmin={isAdmin} airlineName={airlineName} airlineOptions={airlineOptions} onSuccess={handleSuccess} />
            </motion.div>
          )}
          {mode === 'bulk' && (
            <motion.div key="bulk" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <BulkForm isAdmin={isAdmin} airlineName={airlineName} airlineOptions={airlineOptions} onSuccess={handleSuccess} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

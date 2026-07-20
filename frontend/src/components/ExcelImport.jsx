/**
 * ExcelImport.jsx
 * Drag-and-drop / file-picker Excel import component.
 * Parses the uploaded .xlsx / .xls / .csv file using SheetJS,
 * maps columns to participant fields, shows a live preview table,
 * lets the user fix validation errors, then submits all rows.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineUpload,
  HiOutlineDocumentText,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineX,
  HiOutlineDownload,
  HiOutlineRefresh,
  HiOutlineTable,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { createParticipant, getAirlinesList } from '../api';

// ─── Constants ────────────────────────────────────────────────────────────────
const TRAINING_TYPES = ['FDI','FDR','FDA','FTL','NDG','HF','GD','TCD'];
const TRAINING_LABELS = {
  FDI: 'Flight Dispatch Initial',
  FDR: 'Flight Dispatch Recurrent',
  FDA: 'Flight Dispatch Advanced',
  FTL: 'Flight Time Limitations',
  NDG: 'Dangerous Goods No-Carry',
  HF:  'Human Factors for OCC',
  GD:  'Ground Operations',
  TCD: 'Training Competencies Development',
};

// Accepted column header aliases (case-insensitive)
// Add any column name your Excel might use here
const COL_MAP = {
  first_name:    ['first name', 'first_name', 'firstname', 'given name', 'given_name', 'fname', 'f name', 'name'],
  last_name:     ['last name', 'last_name', 'lastname', 'surname', 'family name', 'lname', 'l name'],
  department:    ['department', 'dept', 'division', 'dep'],
  training_type: ['training type', 'training_type', 'trainingtype', 'type', 'course', 'course type',
                  'training', 'program', 'programme', 'course name', 'coursename', 'training program'],
  training_date: ['start date', 'start_date', 'training date', 'training_date', 'trainingdate',
                  'from date', 'from', 'date', 'commencement date', 'start'],
  end_date:      ['end date', 'end_date', 'enddate', 'completion date', 'completion_date',
                  'to date', 'to', 'finish date', 'end', 'finish'],
  location:      ['location', 'venue', 'place', 'training location', 'training_location', 'city', 'center', 'centre'],
  modules:       ['modules', 'module', 'completed modules', 'subjects', 'topics'],
};

// ─── Utility: normalise a raw column header → field key ──────────────────────
function resolveColumn(raw) {
  // Strip non-alphanumeric chars and normalise whitespace for robust matching
  const lower = String(raw).toLowerCase().trim().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ');
  // 1. Exact alias match
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    if (aliases.includes(lower)) return field;
  }
  // 2. Partial contains match — handles typos, extra words, special chars
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    if (aliases.some(a => lower.includes(a) || a.includes(lower))) return field;
  }
  return null;
}

// ─── Utility: normalise a raw training type string → valid code ──────────────
function resolveTrainingType(raw) {
  if (!raw && raw !== 0) return '';
  const s     = String(raw).trim();
  const upper = s.toUpperCase();
  // Exact code match (FDI, FDR, etc.)
  if (TRAINING_TYPES.includes(upper)) return upper;
  // Full label match (case-insensitive)
  for (const [code, label] of Object.entries(TRAINING_LABELS)) {
    if (label.toLowerCase() === s.toLowerCase()) return code;
  }
  // Partial / contains match
  for (const [code, label] of Object.entries(TRAINING_LABELS)) {
    if (s.toLowerCase().includes(label.toLowerCase()) ||
        label.toLowerCase().includes(s.toLowerCase())) return code;
  }
  // Code embedded in longer string e.g. "FDI - Initial Training"
  for (const code of TRAINING_TYPES) {
    if (upper.startsWith(code) || upper.includes(` ${code}`) || upper.includes(`-${code}`)) return code;
  }
  return s; // return as-is; validation will flag it
}

// ─── Utility: parse Excel serial date or string date → YYYY-MM-DD ────────────
function resolveDate(raw) {
  if (!raw) return '';
  if (typeof raw === 'number') {
    const utc = (raw - 25569) * 86400 * 1000;
    const d = new Date(utc);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  if (raw instanceof Date && !isNaN(raw)) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const native = new Date(s);
  if (!isNaN(native)) return native.toISOString().slice(0, 10);
  return s;
}

// ─── Utility: validate a parsed row → array of error strings ─────────────────
function validateRow(row) {
  const errors = [];
  if (!row.first_name?.trim())  errors.push('First name missing');
  if (!row.last_name?.trim())   errors.push('Last name missing');
  if (!row.department?.trim())  errors.push('Department missing');
  if (!row.training_type)       errors.push('Training type missing — select from dropdown');
  else if (!TRAINING_TYPES.includes(row.training_type))
    errors.push(`"${row.training_type}" is not valid — select from dropdown`);
  if (!row.training_date)       errors.push('Start date missing');
  return errors;
}

// ─── Download sample template ─────────────────────────────────────────────────
async function downloadTemplate() {
  try {
    const XLSX = await import('xlsx');
    const headers = ['First Name', 'Last Name', 'Department', 'Training Type', 'Start Date', 'End Date', 'Location', 'Modules'];
    const sample = [
      ['Ahmed', 'Al Mansouri', 'Flight Operations', 'FDI', '2026-03-01', '2026-03-05', 'Dubai, UAE', ''],
      ['Sara',  'Al Rashidi',  'Safety Department', 'HF',  '2026-03-10', '2026-03-12', 'Abu Dhabi',  ''],
      ['John',  'Smith',       'Dispatch',          'FDR', '2026-04-01', '2026-04-03', 'London',     'Air Law,Navigation'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    ws['!cols'] = [18,18,20,16,14,14,18,30].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');
    XLSX.writeFile(wb, 'IFOA_Participants_Template.xlsx');
    toast.success('Template downloaded!');
  } catch {
    toast.error('Failed to generate template');
  }
}

// ─── Parse a file → array of row objects ─────────────────────────────────────
async function parseExcelFile(file) {
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (raw.length < 2) {
          reject(new Error('The file has no data rows (only a header was found).'));
          return;
        }

        const headerRow = raw[0].map(h => String(h).trim());
        const fieldMap  = headerRow.map(h => resolveColumn(h));

        // Log unmapped columns to browser console for debugging
        headerRow.forEach((h, i) => {
          if (h && !fieldMap[i]) console.warn(`[ExcelImport] Unmapped column: "${h}"`);
          else if (h)            console.log(`[ExcelImport] "${h}" → ${fieldMap[i]}`);
        });

        const rows = [];
        for (let i = 1; i < raw.length; i++) {
          const cells = raw[i];
          if (cells.every(c => c === '' || c === null || c === undefined)) continue;

          const obj = {};
          fieldMap.forEach((field, idx) => {
            if (field) obj[field] = cells[idx] ?? '';
          });

          obj.training_type = resolveTrainingType(obj.training_type);
          obj.training_date = resolveDate(obj.training_date);
          obj.end_date      = resolveDate(obj.end_date);
          obj.first_name    = String(obj.first_name  || '').trim();
          obj.last_name     = String(obj.last_name   || '').trim();
          obj.department    = String(obj.department  || '').trim();
          obj.location      = String(obj.location    || '').trim();
          obj.modules       = String(obj.modules     || '').trim();

          // Each row gets a guaranteed unique _id using random string
          rows.push({ ...obj, _rowNum: i + 1, _id: `row-${i}-${Math.random().toString(36).slice(2)}` });
        }

        if (rows.length === 0) {
          reject(new Error('No data rows found in the file.'));
          return;
        }

        resolve(rows);
      } catch (err) {
        reject(new Error(`Could not read file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the file.'));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ errors, submitted }) {
  if (submitted)
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <HiOutlineCheckCircle className="w-3 h-3" /> Saved
      </span>
    );
  if (errors.length)
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <HiOutlineExclamationCircle className="w-3 h-3" /> {errors.length} error{errors.length > 1 ? 's' : ''}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-500 bg-primary-50 border border-primary-200 px-2 py-0.5 rounded-full">
      Ready
    </span>
  );
}

// ─── Editable cell ────────────────────────────────────────────────────────────
function EditableCell({ value, onChange, type = 'text', options, hasError, disabled }) {
  const base = `w-full px-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400 transition-colors ${
    hasError ? 'border-red-300 bg-red-50' : 'border-primary-200 bg-white'
  } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`;

  if (options) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} className={base} disabled={disabled}>
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o} – {TRAINING_LABELS[o]}</option>)}
      </select>
    );
  }
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} className={base} disabled={disabled} />
  );
}

// ─── Main ExcelImport component ───────────────────────────────────────────────
export default function ExcelImport({ isAdmin, airlineName, company, onSuccess }) {
  const [stage, setStage]       = useState('idle');   // idle | parsing | preview | submitting | done
  const [rows, setRows]         = useState([]);
  const [statuses, setStatuses] = useState({});       // _id → { submitted, error }
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef            = useRef();

  // Airline selection for admin
  const [airlineOptions, setAirlineOptions] = useState([]);
  const [selectedAirline, setSelectedAirline] = useState(isAdmin ? '' : (airlineName || company || ''));
  const [customAirline, setCustomAirline] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    getAirlinesList()
      .then(res => setAirlineOptions(res.data || []))
      .catch(() => {});
  }, [isAdmin]);

  const effectiveCompany = isAdmin
    ? (selectedAirline === '__other__' ? customAirline.trim() : selectedAirline)
    : (company || airlineName);

  // Always-current refs so async handleSubmit never reads stale closure values
  const rowsRef     = useRef([]);
  const statusesRef = useRef({});
  useEffect(() => { rowsRef.current     = rows;     }, [rows]);
  useEffect(() => { statusesRef.current = statuses; }, [statuses]);

  // ── File handling ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls','csv'].includes(ext)) {
      toast.error('Please upload a .xlsx, .xls, or .csv file');
      return;
    }
    setFileName(file.name);
    setStage('parsing');
    try {
      const parsed = await parseExcelFile(file);
      setRows(parsed);
      setStatuses({});
      setStage('preview');
    } catch (err) {
      toast.error(err.message);
      setStage('idle');
    }
  }, []);

  const onDrop      = useCallback((e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }, [handleFile]);
  const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  // ── Update a single cell ─────────────────────────────────────────────────────
  const updateCell = (rowId, field, value) => {
    setRows(prev => prev.map(r => r._id === rowId ? { ...r, [field]: value } : r));
    // Clear error on edit
    setStatuses(prev => {
      if (prev[rowId]?.error) { const n = { ...prev }; delete n[rowId]; return n; }
      return prev;
    });
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    // Admin must pick an airline first
    if (isAdmin && !effectiveCompany) {
      toast.error('Please select an airline before importing');
      return;
    }

    // Use refs to always get latest state (avoids stale closure bug)
    const currentRows     = rowsRef.current;
    const currentStatuses = statusesRef.current;

    const pending = currentRows.filter(r => !currentStatuses[r._id]?.submitted);
    if (!pending.length) { toast.success('All rows already submitted!'); return; }

    // Split: valid rows get submitted now, invalid rows show errors
    const validRows   = [];
    const newStatuses = { ...currentStatuses };
    pending.forEach(row => {
      const errs = validateRow(row);
      if (errs.length) newStatuses[row._id] = { error: errs[0] };
      else validRows.push(row);
    });
    setStatuses(newStatuses);

    if (validRows.length === 0) {
      toast.error('All rows have errors — use the Training Type dropdown to fix the red rows');
      return;
    }

    setStage('submitting');
    let ok = 0, fail = 0;

    for (const row of validRows) {
      try {
        await createParticipant({
          first_name:    row.first_name,
          last_name:     row.last_name,
          company:       effectiveCompany,
          department:    row.department,
          training_type: row.training_type,
          training_date: row.training_date,
          end_date:      row.end_date   || null,
          location:      row.location   || null,
          modules:       row.modules    || null,
        });
        setStatuses(prev => ({ ...prev, [row._id]: { submitted: true } }));
        ok++;
      } catch (err) {
        const msg = err.response?.data?.error || 'Submission failed';
        setStatuses(prev => ({ ...prev, [row._id]: { error: msg } }));
        fail++;
      }
    }

    const invalidCount     = pending.length - validRows.length;
    const alreadySubmitted = currentRows.filter(r => currentStatuses[r._id]?.submitted).length;
    setStage((alreadySubmitted + ok) === currentRows.length ? 'done' : 'preview');

    if (fail === 0 && invalidCount === 0)
      toast.success(`${ok} participant${ok !== 1 ? 's' : ''} imported successfully!`);
    else if (ok > 0 && invalidCount > 0)
      toast.error(`${ok} saved — select the correct Training Type for the ${invalidCount} red row${invalidCount !== 1 ? 's' : ''} and resubmit`);
    else if (ok > 0 && fail > 0)
      toast.error(`${ok} saved, ${fail} failed — fix errors and resubmit`);
    else
      toast.error('All submissions failed — please check the errors');
  };

  // ── Reset ────────────────────────────────────────────────────────────────────
  const reset = () => {
    setStage('idle'); setRows([]); setStatuses({}); setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Derived counts ───────────────────────────────────────────────────────────
  const totalRows     = rows.length;
  const submittedRows = rows.filter(r => statuses[r._id]?.submitted).length;
  const errorRows     = rows.filter(r => statuses[r._id]?.error && !statuses[r._id]?.submitted).length;
  const pendingRows   = totalRows - submittedRows - errorRows;
  const allValid      = rows.every(r => validateRow(r).length === 0);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Help banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <HiOutlineTable className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-800">Import participants from Excel</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Upload a <strong>.xlsx</strong>, <strong>.xls</strong>, or <strong>.csv</strong> file with columns:
            <strong> First Name, Last Name, Department, Training Type, Start Date</strong> (required).
            Training Type must be one of: <strong>{TRAINING_TYPES.join(', ')}</strong>.
            If a row shows a red Training Type dropdown, just select the correct value and click Import again.
          </p>
        </div>
        <button type="button" onClick={downloadTemplate}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-lg transition-colors">
          <HiOutlineDownload className="w-3.5 h-3.5" /> Download Template
        </button>
      </div>

      {/* Airline selection for admin */}
      {isAdmin && (
        <div className="card p-4 space-y-2">
          <label className="label">Airline Name *</label>
          <select
            value={selectedAirline}
            onChange={e => setSelectedAirline(e.target.value)}
            className="input-field appearance-none cursor-pointer max-w-sm"
          >
            <option value="">Select airline</option>
            {airlineOptions.map(a => (
              <option key={a.airlineName} value={a.airlineName}>{a.airlineName}</option>
            ))}
            <option value="__other__">Other (type manually)</option>
          </select>
          {selectedAirline === '__other__' && (
            <input
              value={customAirline}
              onChange={e => setCustomAirline(e.target.value)}
              className="input-field mt-2 max-w-sm"
              placeholder="Type airline name"
              autoFocus
            />
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* Drop zone */}
        {(stage === 'idle' || stage === 'parsing') && (
          <motion.div key="dropzone" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => handleFile(e.target.files?.[0])} />
            <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
              onClick={() => stage === 'idle' && fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
                dragging ? 'border-accent-400 bg-accent-50 scale-[1.01]' :
                stage === 'parsing' ? 'border-primary-300 bg-primary-50 cursor-wait' :
                'border-primary-300 bg-white hover:border-accent-300 hover:bg-accent-50/30'
              }`}>
              {stage === 'parsing' ? (
                <>
                  <div className="w-8 h-8 border-2 border-primary-300 border-t-accent-500 rounded-full animate-spin" />
                  <p className="text-sm text-primary-500 font-medium">Reading {fileName}…</p>
                </>
              ) : (
                <>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${dragging ? 'bg-accent-100' : 'bg-primary-100'}`}>
                    <HiOutlineUpload className={`w-7 h-7 ${dragging ? 'text-accent-600' : 'text-primary-400'}`} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-primary-700">{dragging ? 'Drop to import' : 'Drag & drop your Excel file here'}</p>
                    <p className="text-xs text-primary-400 mt-1">or click to browse — .xlsx, .xls, .csv accepted</p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Preview table */}
        {(stage === 'preview' || stage === 'submitting' || stage === 'done') && (
          <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">

            {/* File info + reset */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <HiOutlineDocumentText className="w-4 h-4 text-accent-500" />
                <span className="text-sm font-medium text-primary-700">{fileName}</span>
                <span className="text-xs text-primary-400">— {totalRows} row{totalRows !== 1 ? 's' : ''} found</span>
              </div>
              <button type="button" onClick={reset} className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-700 transition-colors">
                <HiOutlineRefresh className="w-3.5 h-3.5" /> Change file
              </button>
            </div>

            {/* Stats bar */}
            {totalRows > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 bg-primary-50 rounded-xl border border-primary-200 text-xs">
                <span className="font-semibold text-primary-600">{totalRows} total</span>
                <span className="text-primary-300">·</span>
                <span className="text-emerald-600 font-medium">{submittedRows} saved</span>
                <span className="text-primary-300">·</span>
                <span className="text-amber-600 font-medium">{pendingRows} pending</span>
                {errorRows > 0 && (
                  <><span className="text-primary-300">·</span>
                  <span className="text-red-600 font-medium">{errorRows} need fixing</span></>
                )}
                {!allValid && (
                  <span className="ml-auto text-xs text-red-600 font-medium flex items-center gap-1">
                    <HiOutlineExclamationCircle className="w-3.5 h-3.5" />
                    Select Training Type from dropdown for red rows
                  </span>
                )}
              </div>
            )}

            {/* Table */}
            <div className="border border-primary-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-primary-800 text-white">
                      <th className="px-3 py-2.5 text-left font-semibold w-8">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold min-w-[110px]">First Name</th>
                      <th className="px-3 py-2.5 text-left font-semibold min-w-[110px]">Last Name</th>
                      <th className="px-3 py-2.5 text-left font-semibold min-w-[130px]">Department</th>
                      <th className="px-3 py-2.5 text-left font-semibold min-w-[170px]">Training Type</th>
                      <th className="px-3 py-2.5 text-left font-semibold min-w-[120px]">Start Date</th>
                      <th className="px-3 py-2.5 text-left font-semibold min-w-[120px]">End Date</th>
                      <th className="px-3 py-2.5 text-left font-semibold min-w-[120px]">Location</th>
                      <th className="px-3 py-2.5 text-left font-semibold min-w-[110px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const status     = statuses[row._id] || {};
                      const submitted  = !!status.submitted;
                      const error      = status.error;
                      const rowErrors  = validateRow(row);
                      const isDisabled = submitted || stage === 'submitting';
                      return (
                        <tr key={row._id} className={`border-t border-primary-100 transition-colors ${
                          submitted ? 'bg-emerald-50/50' : (error || rowErrors.length) ? 'bg-red-50/40' : idx % 2 ? 'bg-primary-50/40' : 'bg-white'
                        }`}>
                          <td className="px-3 py-2 text-primary-400 font-mono">{row._rowNum}</td>
                          <td className="px-2 py-1.5">
                            <EditableCell value={row.first_name} onChange={v => updateCell(row._id, 'first_name', v)}
                              hasError={!row.first_name?.trim()} disabled={isDisabled} />
                          </td>
                          <td className="px-2 py-1.5">
                            <EditableCell value={row.last_name} onChange={v => updateCell(row._id, 'last_name', v)}
                              hasError={!row.last_name?.trim()} disabled={isDisabled} />
                          </td>
                          <td className="px-2 py-1.5">
                            <EditableCell value={row.department} onChange={v => updateCell(row._id, 'department', v)}
                              hasError={!row.department?.trim()} disabled={isDisabled} />
                          </td>
                          <td className="px-2 py-1.5">
                            <EditableCell value={row.training_type} onChange={v => updateCell(row._id, 'training_type', v)}
                              options={TRAINING_TYPES} hasError={!TRAINING_TYPES.includes(row.training_type)} disabled={isDisabled} />
                          </td>
                          <td className="px-2 py-1.5">
                            <EditableCell type="date" value={row.training_date} onChange={v => updateCell(row._id, 'training_date', v)}
                              hasError={!row.training_date} disabled={isDisabled} />
                          </td>
                          <td className="px-2 py-1.5">
                            <EditableCell type="date" value={row.end_date} onChange={v => updateCell(row._id, 'end_date', v)} disabled={isDisabled} />
                          </td>
                          <td className="px-2 py-1.5">
                            <EditableCell value={row.location} onChange={v => updateCell(row._id, 'location', v)} disabled={isDisabled} />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <StatusBadge errors={error ? [error] : rowErrors} submitted={submitted} />
                              {(error || rowErrors[0]) && (
                                <span className="text-[10px] text-red-500 leading-tight">{error || rowErrors[0]}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action bar */}
      {(stage === 'preview' || stage === 'submitting' || stage === 'done') && (
        <div className="flex items-center justify-between gap-4 p-4 card">
          <div className="text-sm text-primary-600">
            {stage === 'done' ? (
              <span className="text-emerald-600 font-medium flex items-center gap-1.5">
                <HiOutlineCheckCircle className="w-4 h-4" />
                All {submittedRows} participant{submittedRows !== 1 ? 's' : ''} imported successfully
              </span>
            ) : (
              <span>Ready to import <strong>{totalRows - submittedRows}</strong> participant{(totalRows - submittedRows) !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {stage === 'done' ? (
              <>
                <button type="button" onClick={reset} className="btn-outline flex items-center gap-1.5">
                  <HiOutlineRefresh className="w-4 h-4" /> Import Another
                </button>
                <button type="button" onClick={onSuccess} className="btn-primary">Done</button>
              </>
            ) : (
              <>
                <button type="button" onClick={reset} className="btn-outline">Cancel</button>
                <button type="button" onClick={handleSubmit} disabled={stage === 'submitting' || totalRows === 0}
                  className="btn-primary flex items-center gap-2">
                  {stage === 'submitting' ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Importing…</>
                  ) : (
                    <><HiOutlineUpload className="w-4 h-4" />Import {totalRows - submittedRows > 0 ? `${totalRows - submittedRows} ` : ''}Participant{(totalRows - submittedRows) !== 1 ? 's' : ''}</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

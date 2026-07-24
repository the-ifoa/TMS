import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineClipboardList,
  HiOutlineSearch,
  HiOutlineChartBar,
  HiOutlineDocumentText,
  HiOutlineUsers,
  HiOutlineCheckCircle,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineX,
  HiOutlineDownload,
  HiOutlineEye,
  HiOutlineRefresh,
  HiOutlineAcademicCap,
  HiOutlineUpload,
  HiOutlineExclamationCircle,
  HiOutlineDocumentDownload,
  HiOutlineLockClosed,
  HiOutlineChevronDown,
  HiOutlineFilter,
} from 'react-icons/hi';
import { Clock, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getExamResults,
  createExamResult,
  updateExamResult,
  deleteExamResult,
  issueResultSheet,
  getExamBatches,
  parseExamResultsExcel,
  importExamResultsExcel,
  getExamResultPdf,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

// ── Constants ─────────────────────────────────────────────────────────────────
const COURSE_TYPES = [
  { value: 'FDI', label: 'FDI – Flight Dispatch Initial' },
  { value: 'FDR', label: 'FDR – Flight Dispatch Recurrent' },
  { value: 'FDA', label: 'FDA – Flight Dispatch Advanced' },
  { value: 'FTL', label: 'FTL – Flight Time Limitations' },
  { value: 'NDG', label: 'NDG – Dangerous Goods No-Carry' },
  { value: 'HF',  label: 'HF – Human Factors for OCC' },
  { value: 'GD',  label: 'GD – Ground Operations' },
  { value: 'TCD', label: 'TCD – Training Competencies Development' },
];

const DEFAULT_SUBJECTS = [
  { abbr: 'LAW', name: 'Air Law',                               max_marks: 100, marks_obtained: null },
  { abbr: 'SYS', name: 'Aircraft General Knowledge & Systems',  max_marks: 100, marks_obtained: null },
  { abbr: 'MON', name: 'Flight Monitoring',                     max_marks: 100, marks_obtained: null },
  { abbr: 'M&B', name: 'Mass & Balance',                        max_marks: 100, marks_obtained: null },
  { abbr: 'ATM', name: 'Air Traffic Management',                max_marks: 100, marks_obtained: null },
  { abbr: 'COM', name: 'Communication',                         max_marks: 100, marks_obtained: null },
  { abbr: 'NAV', name: 'Navigation',                            max_marks: 100, marks_obtained: null },
  { abbr: 'PER', name: 'Principles of Flight & Performance',    max_marks: 100, marks_obtained: null },
  { abbr: 'DRM', name: 'Dangerous Goods',                       max_marks: 100, marks_obtained: null },
  { abbr: 'MET', name: 'Meteorology',                           max_marks: 100, marks_obtained: null },
  { abbr: 'FPL', name: 'Flight Planning',                       max_marks: 100, marks_obtained: null },
  { abbr: 'HF',  name: 'Human Factors',                         max_marks: 100, marks_obtained: null },
];

const TABS = ['Overview', 'Student Results', 'Subject Analysis', 'Result Sheets'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function gradeFromMark(m) {
  if (m == null || m === '') return null;
  const n = Number(m);
  if (n > 95)  return 'OUTSTANDING';
  if (n >= 90) return 'DISTINCTION';
  if (n >= 76) return 'MERIT';
  if (n >= 75) return 'PASS';
  return 'FAILED';
}

function gradeBadge(grade) {
  if (!grade) return 'bg-slate-100 text-slate-500 border border-slate-200';
  if (grade === 'OUTSTANDING') return 'bg-purple-50 text-purple-700 border border-purple-200';
  if (grade === 'DISTINCTION') return 'bg-blue-50 text-blue-700 border border-blue-200';
  if (grade === 'MERIT')       return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (grade === 'PASS')        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  return 'bg-rose-50 text-rose-700 border border-rose-200';
}

function courseTypeBadge(type) {
  if (['FDI', 'FDA'].includes(type)) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (['FDR', 'FTL'].includes(type)) return 'bg-violet-50 text-violet-700 border border-violet-200';
  if (type === 'HF')  return 'bg-amber-50 text-amber-700 border border-amber-200';
  if (type === 'NDG') return 'bg-rose-50 text-rose-700 border border-rose-200';
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

function mergeSubjects(stored) {
  if (!stored || stored.length === 0) return DEFAULT_SUBJECTS.map(s => ({ ...s }));

  const byAbbr = {};
  stored.forEach(s => { byAbbr[s.abbr] = s; });

  const merged = DEFAULT_SUBJECTS.map(def => ({
    ...def,
    ...(byAbbr[def.abbr] || {}),
  }));

  stored.forEach(s => {
    if (!merged.find(m => m.abbr === s.abbr)) merged.push(s);
  });

  const withMarks    = merged.filter(s => s.marks_obtained != null);
  const withoutMarks = merged.filter(s => s.marks_obtained == null);
  return [...withMarks, ...withoutMarks];
}

function emptyForm() {
  return {
    first_name: '', last_name: '', batch_name: '', course_name: '',
    result_header_text: '',
    course_type: 'FDI', training_mode: 'HYBRID',
    start_date: '', end_date: '', company: '',
    lead_instructor: '', instructors: '',
    subjects: DEFAULT_SUBJECTS.map(s => ({ ...s })),
    final_exam_score: '', final_marks: '', sheet_issued: false, sheet_date: '',
  };
}

async function downloadPdf(id, name) {
  try {
    const res = await getExamResultPdf(id);
    const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href     = url;
    link.download = `IFOA_ExamResult_${name.replace(/\s+/g, '_')}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('PDF downloaded.');
  } catch (err) {
    const msg = err?.response?.data?.error || err.message || 'Failed to download PDF.';
    toast.error(msg);
  }
}

async function viewPdf(id) {
  try {
    const res = await getExamResultPdf(id);
    const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    const msg = err?.response?.data?.error || err.message || 'Failed to open PDF.';
    toast.error(msg);
  }
}

// ── Import Excel Modal ────────────────────────────────────────────────────────
function ImportExcelModal({ onClose, onImported }) {
  const fileRef  = useRef(null);
  const [step, setStep]             = useState('upload');
  const [file, setFile]             = useState(null);
  const [dragOver, setDragOver]     = useState(false);
  const [parsing, setParsing]       = useState(false);
  const [parseError, setParseError] = useState('');
  const [batchMeta, setBatchMeta]   = useState(null);
  const [students, setStudents]     = useState([]);
  const [batchName,  setBatchName]  = useState('');
  const [courseType, setCourseType] = useState('FDI');
  const [company,    setCompany]    = useState('');
  const [resultHeaderText, setResultHeaderText] = useState('');
  const [parsedResultHeaderText, setParsedResultHeaderText] = useState('');
  const [importResult, setImportResult] = useState(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.match(/\.xlsx?$/i)) { toast.error('Please select an Excel file (.xlsx or .xls)'); return; }
    setFile(f);
    setParseError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setParseError('');
    try {
      const res = await parseExamResultsExcel(file);
      const { batchMeta: meta, students: rows } = res.data;
      setBatchMeta(meta);
      const parsedHeader = meta.resultHeaderText || meta.courseTitle || '';
      setResultHeaderText(parsedHeader);
      setParsedResultHeaderText(parsedHeader);
      setStudents(rows.map(s => ({ ...s, subjects: mergeSubjects(s.subjects) })));
      const titleUpper = (meta.courseTitle || '').toUpperCase();
      const batchGuess = titleUpper.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z\-\/\s]*\d{4}\b/);
      setBatchName(batchGuess ? batchGuess[0].replace(/\s+/g, '-') : '');
      setStep('preview');
    } catch (err) {
      setParseError(err?.response?.data?.error || err.message || 'Failed to parse Excel file.');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!batchName.trim()) { toast.error('Please enter a Batch Name before importing.'); return; }
    setStep('importing');
    try {
      const payload = {
        batch_name: batchName.trim(),
        course_type: courseType,
        company: company.trim(),
      };

      const currentHeader = resultHeaderText.trim();
      const parsedHeader  = parsedResultHeaderText.trim();
      if (currentHeader && currentHeader !== parsedHeader) {
        payload.result_header_text = currentHeader;
      }

      const res = await importExamResultsExcel(file, payload);
      setImportResult(res.data);
      setStep('done');
      onImported();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Import failed.');
      setStep('preview');
    }
  };

  const reset = () => {
    setStep('upload'); setFile(null); setBatchMeta(null); setStudents([]);
    setBatchName(''); setResultHeaderText(''); setParsedResultHeaderText(''); setParseError(''); setImportResult(null);
  };

  return (
    <>
      <div className="fixed -inset-20 z-50 bg-slate-900/40 backdrop-blur-sm pointer-events-none" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl border border-slate-200/80 w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
              <HiOutlineUpload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Import Exam Results from Excel</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 'upload'    && 'Upload your IFOA exam results workbook'}
                {step === 'preview'   && `${students.length} student${students.length !== 1 ? 's' : ''} found — review before importing`}
                {step === 'importing' && 'Saving records to database…'}
                {step === 'done'      && 'Import complete'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><HiOutlineX className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-0 px-6 pt-4 pb-2 flex-shrink-0">
          {['Upload', 'Preview', 'Import'].map((label, i) => {
            const stepIdx = { upload: 0, preview: 1, importing: 2, done: 2 }[step];
            const done = i < stepIdx, active = i === stepIdx;
            return (
              <div key={label} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                    ${done ? 'bg-emerald-600 text-white' : active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-semibold ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
                </div>
                {i < 2 && <div className="w-8 h-px bg-slate-200 mx-3" />}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-5">
              <div className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors
                ${dragOver ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50/50'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-800">
                  <HiOutlineUpload className="w-7 h-7" />
                </div>
                {file ? (
                  <div><p className="text-sm font-bold text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p></div>
                ) : (
                  <div><p className="text-sm font-bold text-slate-800">Drop your Excel file here</p>
                    <p className="text-xs text-slate-400 mt-1">or click to browse · .xlsx / .xls · max 10 MB</p></div>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80">
                <p className="text-xs font-bold text-slate-800 mb-2">Expected workbook format</p>
                <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                  <li><strong>Sheet 1</strong> — Summary sheet with course metadata and a student score table</li>
                  <li><strong>Sheets 2+</strong> — Individual student result sheets</li>
                  <li>Matches the standard IFOA Exam Results Report workbook</li>
                  <li>Leave any subject column blank or enter <strong>NA</strong> to mark it as N/A on the result sheet</li>
                </ul>
              </div>
              {parseError && (
                <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl p-4">
                  <HiOutlineExclamationCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-700 font-medium">{parseError}</p>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && batchMeta && (
            <div className="space-y-5">
              <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs border border-slate-200/80">
                <div><p className="text-slate-400 font-medium mb-0.5">Course Title</p><p className="text-slate-900 font-bold">{batchMeta.courseTitle}</p></div>
                <div><p className="text-slate-400 font-medium mb-0.5">Training Mode</p><p className="text-slate-900 font-bold">{batchMeta.trainingMode}</p></div>
                <div><p className="text-slate-400 font-medium mb-0.5">Date Range</p><p className="text-slate-900 font-bold">{batchMeta.startDate} → {batchMeta.endDate}</p></div>
                <div><p className="text-slate-400 font-medium mb-0.5">Lead Instructor</p><p className="text-slate-900 font-bold">{batchMeta.leadInstructor || '–'}</p></div>
                <div className="col-span-2"><p className="text-slate-400 font-medium mb-0.5">Other Instructors</p><p className="text-slate-900 font-bold">{batchMeta.instructors.join(', ') || '–'}</p></div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Import Settings</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Name <span className="text-rose-500">*</span></label>
                    <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                      placeholder="e.g. NOV-DEC 2024" value={batchName} onChange={e => setBatchName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Course Type</label>
                    <Select value={courseType} onValueChange={setCourseType}>
                      <SelectTrigger className="text-xs font-semibold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COURSE_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Airline</label>
                    <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                      placeholder="Optional" value={company} onChange={e => setCompany(e.target.value)} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">PDF Header Text (shown below "EXAM RESULTS")</label>
                    <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                      placeholder="e.g. 4-Weeks Flight Dispatch Initial Course Promotion NOV-DEC 2024 / 04 November - 06 December 2024"
                      value={resultHeaderText}
                      onChange={e => setResultHeaderText(e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Students to Import ({students.length})</p>
                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">#</th>
                        <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Name</th>
                        {students[0]?.subjects?.map(s => (
                          <th key={s.abbr} className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-center">{s.abbr}</th>
                        ))}
                        <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-center">Exam</th>
                        <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-center">Avg</th>
                        <th className="px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-center">Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((s, i) => {
                        const grade = gradeFromMark(s.final_marks);
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-400 font-bold">{i + 1}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{s.first_name} {s.last_name}</td>
                            {s.subjects?.map(sub => (
                              <td key={sub.abbr} className="px-3 py-2 text-center text-slate-700 font-medium">
                                {sub.marks_obtained != null ? sub.marks_obtained : <span className="text-slate-300">N/A</span>}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-center text-slate-700 font-medium">{s.final_exam_score ?? <span className="text-slate-300">–</span>}</td>
                            <td className="px-3 py-2 text-center font-bold text-slate-900">{s.final_marks != null ? Number(s.final_marks).toFixed(2) : '–'}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${gradeBadge(grade)}`}>{grade || '–'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-3 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-600">Saving {students.length} student record{students.length !== 1 ? 's' : ''} to database…</p>
            </div>
          )}

          {step === 'done' && importResult && (
            <div className="space-y-5">
              <div className={`rounded-xl p-5 flex items-center gap-4 ${importResult.failCount === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${importResult.failCount === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                  {importResult.failCount === 0
                    ? <HiOutlineCheckCircle className="w-7 h-7" />
                    : <HiOutlineExclamationCircle className="w-7 h-7" />}
                </div>
                <div>
                  <p className={`font-bold text-sm ${importResult.failCount === 0 ? 'text-emerald-900' : 'text-amber-900'}`}>
                    {importResult.successCount} of {importResult.successCount + importResult.failCount} records imported successfully
                  </p>
                  <p className={`text-xs mt-0.5 ${importResult.failCount === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {importResult.failCount === 0 ? 'All student exam results have been added to the database.' : `${importResult.failCount} record(s) failed — see details below.`}
                  </p>
                </div>
              </div>
              {importResult.saved?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Imported</p>
                  <div className="space-y-1">
                    {importResult.saved.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <HiOutlineCheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />{s.participant_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {importResult.failed?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2">Failed</p>
                  <div className="space-y-1">
                    {importResult.failed.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 rounded-lg p-2.5 border border-rose-100">
                        <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span><strong>{f.participant_name}</strong>: {f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4 flex justify-between gap-3 flex-shrink-0">
          <div>
            {step === 'preview' && (
              <button onClick={reset} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">← Back</button>
            )}
          </div>
          <div className="flex gap-2.5">
            <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
              {step === 'done' ? 'Close' : 'Cancel'}
            </button>
            {step === 'upload' && (
              <button onClick={handleParse} disabled={!file || parsing}
                className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 shadow-2xs">
                {parsing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {parsing ? 'Parsing…' : 'Parse File →'}
              </button>
            )}
            {step === 'preview' && (
              <button onClick={handleImport} disabled={!batchName.trim()}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 shadow-2xs">
                <HiOutlineDownload className="w-4 h-4" />
                Import {students.length} Record{students.length !== 1 ? 's' : ''}
              </button>
            )}
            {step === 'done' && importResult?.failCount > 0 && (
              <button onClick={reset} className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 shadow-2xs">
                Import Another File
              </button>
            )}
          </div>
        </div>
        </motion.div>
      </div>
    </>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
function ResultFormModal({ initial, onSave, onClose, batches = [] }) {
  const [form, setForm] = useState(() => {
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

  const handleBatchNameChange = (val) => {
    set('batch_name', val);
    if (val.trim().length === 0) {
      setBatchSuggestions([]);
      setShowBatchDropdown(false);
      return;
    }
    const lower = val.trim().toLowerCase();
    const matched = existingBatchNames.filter(name =>
      name.toLowerCase().includes(lower)
    );
    setBatchSuggestions(matched);
    setShowBatchDropdown(matched.length > 0);
  };

  const selectBatchSuggestion = (name) => {
    setForm(f => ({ ...f, batch_name: name }));
    setBatchSuggestions([]);
    setShowBatchDropdown(false);
  };

  const setSubject = (i, v) => {
    const isNA = v === '' || v === null || v === undefined;
    if (!isNA) {
      const num = Number(v);
      if (num < 0 || num > 100) {
        toast.error('Subject score must be between 0 and 100.');
        return;
      }
    }
    const subs = [...form.subjects];
    subs[i] = { ...subs[i], marks_obtained: isNA ? null : Number(v) };

    const withMarks    = subs.filter(s => s.marks_obtained != null);
    const withoutMarks = subs.filter(s => s.marks_obtained == null);
    set('subjects', [...withMarks, ...withoutMarks]);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.batch_name || !form.course_name || !form.start_date || !form.end_date) {
      toast.error('Please fill in all required fields.');
      return;
    }
    for (const s of form.subjects) {
      if (s.marks_obtained != null && (s.marks_obtained < 0 || s.marks_obtained > 100)) {
        toast.error(`${s.abbr} score must be between 0 and 100.`);
        return;
      }
    }
    const fe = form.final_exam_score !== '' ? Number(form.final_exam_score) : null;
    const fm = form.final_marks !== '' ? Number(form.final_marks) : null;
    if (fe != null && (fe < 0 || fe > 100)) {
      toast.error('Final Exam Score must be between 0 and 100.');
      return;
    }
    if (fm != null && (fm < 0 || fm > 100)) {
      toast.error('Overall Average / Final Marks must be between 0 and 100.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
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
          <h2 className="text-base font-bold text-slate-900">{initial ? 'Edit Exam Result' : 'Add Exam Result'}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><HiOutlineX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Student Information</h3>
            <div className="grid grid-cols-2 gap-3">
              {[{ label: 'First Name *', key: 'first_name' }, { label: 'Last Name *', key: 'last_name' }].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
                  <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                    value={form[key]} onChange={e => set(key, e.target.value)} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Airline</label>
                <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  value={form.company} onChange={e => set('company', e.target.value)} />
              </div>
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
                  onBlur={() => setTimeout(() => setShowBatchDropdown(false), 200)}
                  autoComplete="off"
                />
                {showBatchDropdown && batchSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Existing batch — add to it?</p>
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
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">Subject Scores</h3>
            <p className="text-xs text-slate-400 mb-3 font-medium">Leave blank to mark as N/A on result sheet. N/A subjects always appear last.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-4">
              {form.subjects.map((s, i) => {
                const isOver = s.marks_obtained != null && s.marks_obtained > 100;
                return (
                  <div key={s.abbr} className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-700 mb-1 min-h-[2rem] flex items-end leading-tight">
                      <span>{s.abbr} – {s.name}</span>
                    </label>
                    <input type="number" min="0" max="100"
                      className={`w-full border rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 ${
                        isOver
                          ? 'border-rose-400 bg-rose-50 focus:ring-rose-400 text-rose-700'
                          : 'border-slate-200 focus:ring-slate-900/10 focus:border-slate-900'
                      }`}
                      placeholder="Leave blank = N/A"
                      value={s.marks_obtained ?? ''}
                      onChange={e => setSubject(i, e.target.value)} />
                    {isOver && (
                      <p className="text-[10px] text-rose-500 mt-0.5 font-bold">Max 100</p>
                    )}
                  </div>
                );
              })}
            </div>
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
                  onChange={e => set('final_exam_score', e.target.value)} />
                {form.final_exam_score !== '' && Number(form.final_exam_score) > 100 && (
                  <p className="text-[10px] text-rose-500 mt-0.5 font-bold">Max 100</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Overall Average / Final Marks</label>
                <input type="number" min="0" max="100"
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 ${
                    form.final_marks !== '' && Number(form.final_marks) > 100
                      ? 'border-rose-400 bg-rose-50 focus:ring-rose-400 text-rose-700'
                      : 'border-slate-200 focus:ring-slate-900/10 focus:border-slate-900'
                  }`}
                  value={form.final_marks}
                  onChange={e => set('final_marks', e.target.value)} />
                {form.final_marks !== '' && Number(form.final_marks) > 100 && (
                  <p className="text-[10px] text-rose-500 mt-0.5 font-bold">Max 100</p>
                )}
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

// ── Student Detail Modal ──────────────────────────────────────────────────────
function StudentDetailModal({ student, onClose, onIssueSheet, onRevokeSheet, onRefresh }) {
  const [issuing,      setIssuing]      = useState(false);
  const [revoking,     setRevoking]     = useState(false);
  const [downloading,  setDownloading]  = useState(false);
  const [viewingPdf,   setViewingPdf]   = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  const id   = student._id || student.id;
  const name = student.participant_name || `${student.first_name} ${student.last_name}`;

  const handleIssue = async () => {
    setIssuing(true);
    try {
      await onIssueSheet(id);
      toast.success('Result sheet issued successfully.');
      onRefresh();
      onClose();
    } catch {
      toast.error('Failed to update sheet status.');
    } finally {
      setIssuing(false);
    }
  };

  const handleRevoke = async () => {
    const ok = await confirm('Revoke this result sheet? It will return to Pending status and the student will lose PDF access.', { title: 'Revoke result sheet', confirmLabel: 'Revoke' });
    if (!ok) return;
    setRevoking(true);
    try {
      await onRevokeSheet(id);
      toast.success('Result sheet revoked — status is now Pending.');
      onRefresh();
      onClose();
    } catch {
      toast.error('Failed to revoke sheet.');
    } finally {
      setRevoking(false);
    }
  };

  const handleView = async () => {
    setViewingPdf(true);
    try { await viewPdf(id); }
    finally { setViewingPdf(false); }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try { await downloadPdf(id, name); }
    finally { setDownloading(false); }
  };

  return (
    <>
      <div className="fixed -inset-20 z-50 bg-slate-900/40 backdrop-blur-sm pointer-events-none" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl border border-slate-200/80 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">{name}</h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{student.batch_name} · {student.course_type}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><HiOutlineX className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-200/60">
              <p className="text-2xl font-black text-slate-900">{student.final_marks != null ? Number(student.final_marks).toFixed(2) : '–'}</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">Final Marks</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-200/60">
              <p className="text-2xl font-black text-slate-900">{student.final_exam_score ?? '–'}</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">Exam Score</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-200/60">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${gradeBadge(student.overall_grade)}`}>
                {student.overall_grade || 'N/A'}
              </span>
              <p className="text-xs font-semibold text-slate-500 mt-1">Grade</p>
            </div>
          </div>

          {student.subjects?.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Subject Scores</h3>
              <div className="grid grid-cols-2 gap-2">
                {mergeSubjects(student.subjects).map((s) => (
                  <div key={s.abbr} className="flex items-center justify-between p-3 bg-slate-50/70 rounded-xl border border-slate-200/60">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{s.abbr}</p>
                      <p className="text-[10px] font-medium text-slate-400">{s.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{s.marks_obtained ?? <span className="text-slate-400 text-xs font-normal">N/A</span>}</p>
                      {s.grade && s.grade !== 'N/A' && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${gradeBadge(s.grade)}`}>{s.grade}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50/50 p-4 rounded-xl border border-slate-200/60">
            {[
              ['Company',         student.company || '–'],
              ['Mode',            student.training_mode],
              ['Start Date',      student.start_date],
              ['End Date',        student.end_date],
              ['Lead Instructor', student.lead_instructor || '–'],
              ['Sheet Date',      student.sheet_date || '–'],
            ].map(([label, val]) => (
              <div key={label}><span className="text-slate-400 font-medium">{label}: </span><span className="font-semibold text-slate-800">{val}</span></div>
            ))}
          </div>

          <div className={`rounded-xl p-4 ${student.sheet_issued ? 'bg-emerald-50/80 border border-emerald-200' : 'bg-amber-50/80 border border-amber-200'}`}>
            <div className="flex items-start gap-3">
              <HiOutlineDocumentText className={`w-6 h-6 flex-shrink-0 mt-0.5 ${student.sheet_issued ? 'text-emerald-700' : 'text-amber-700'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${student.sheet_issued ? 'text-emerald-900' : 'text-amber-900'}`}>
                  {student.sheet_issued ? 'Result Sheet Issued' : 'Result Sheet Pending Issue'}
                </p>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  {student.sheet_issued
                    ? `Issued on ${student.sheet_date || 'recorded date'} — PDF report is available`
                    : 'Issue this sheet to generate student PDF record.'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {!student.sheet_issued && (
                    <button onClick={handleIssue} disabled={issuing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-2xs">
                      {issuing
                        ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <HiOutlineCheckCircle className="w-3.5 h-3.5" />}
                      {issuing ? 'Issuing…' : 'Issue Sheet'}
                    </button>
                  )}
                  {student.sheet_issued && (
                    <>
                      <button onClick={handleView} disabled={viewingPdf}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-2xs">
                        {viewingPdf
                          ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <HiOutlineEye className="w-3.5 h-3.5" />}
                        {viewingPdf ? 'Opening…' : 'View PDF'}
                      </button>
                      <button onClick={handleDownload} disabled={downloading}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs">
                        {downloading
                          ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                          : <HiOutlineDocumentDownload className="w-3.5 h-3.5" />}
                        {downloading ? 'Downloading…' : 'Download PDF'}
                      </button>
                      <button onClick={handleRevoke} disabled={revoking}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 disabled:opacity-50 transition-colors shadow-2xs">
                        {revoking
                          ? <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                          : <HiOutlineRefresh className="w-3.5 h-3.5" />}
                        {revoking ? 'Revoking…' : 'Revoke Sheet'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        </motion.div>
      </div>
      {ConfirmDialog}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExamResults() {
  const { isAdmin } = useAuth();
  const [results, setResults]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState(0);
  const [search, setSearch]           = useState('');
  const [filterType, setFilterType]   = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterSheet, setFilterSheet] = useState('');
  const [batches, setBatches]         = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [viewStudent, setViewStudent] = useState(null);

  const [selected, setSelected]       = useState(new Set());
  const [bulkIssuing, setBulkIssuing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRevoking, setBulkRevoking] = useState(false);
  const [revokingSheetId, setRevokingSheetId] = useState(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const toggleSelect = (id) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(selected.size === results.length ? new Set() : new Set(results.map(r => r._id || r.id)));

  const handleBulkDelete = async () => {
    const ok = await confirm(`Delete ${selected.size} selected result(s)? This cannot be undone.`, { title: 'Delete results', confirmLabel: 'Delete' });
    if (!ok) return;
    setBulkDeleting(true);
    let count = 0;
    for (const id of selected) {
      try { await deleteExamResult(id); count++; } catch {}
    }
    toast.success(`${count} result(s) deleted.`);
    setSelected(new Set());
    setBulkDeleting(false);
    fetchAll();
  };

  const handleBulkIssue = async () => {
    const toIssue = results.filter(r => selected.has(r._id || r.id) && !r.sheet_issued);
    if (!toIssue.length) { toast('All selected sheets are already issued.'); return; }
    const ok = await confirm(`Issue result sheets for ${toIssue.length} student(s)?`, { title: 'Issue result sheets', confirmLabel: 'Issue' });
    if (!ok) return;
    setBulkIssuing(true);
    let count = 0;
    for (const r of toIssue) {
      try { await issueResultSheet(r._id || r.id); count++; } catch {}
    }
    toast.success(`${count} sheet(s) issued successfully.`);
    setSelected(new Set());
    setBulkIssuing(false);
    fetchAll();
  };

  const handleBulkRevoke = async () => {
    const toRevoke = results.filter(r => selected.has(r._id || r.id) && r.sheet_issued);
    if (!toRevoke.length) { toast('No issued sheets in selected records.'); return; }
    const ok = await confirm(`Revoke result sheets for ${toRevoke.length} student(s)?`, { title: 'Revoke result sheets', confirmLabel: 'Revoke' });
    if (!ok) return;
    setBulkRevoking(true);
    let count = 0;
    for (const r of toRevoke) {
      try {
        await updateExamResult(r._id || r.id, { sheet_issued: false, sheet_date: null });
        count++;
      } catch {}
    }
    toast.success(`${count} sheet(s) revoked successfully.`);
    setSelected(new Set());
    setBulkRevoking(false);
    fetchAll();
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType)  params.course_type = filterType;
      if (filterBatch) params.batch_name  = filterBatch;
      if (search)      params.search      = search;
      const [rRes, bRes] = await Promise.all([getExamResults(params), getExamBatches()]);
      setResults(rRes.data);
      setBatches(bRes.data);
    } catch {
      toast.error('Failed to load exam results.');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterBatch, search]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const passCount  = results.filter(r => r.overall_grade && r.overall_grade !== 'FAILED').length;
  const passRate   = results.length ? Math.round((passCount / results.length) * 100) : 0;
  const avgMark    = results.length ? Math.round(results.reduce((acc, r) => acc + (r.final_marks ?? 0), 0) / results.length * 10) / 10 : 0;
  const sheetCount = results.filter(r => r.sheet_issued).length;

  const subjectAverages = (() => {
    const map = {};
    results.forEach(r => {
      (r.subjects || []).forEach(s => {
        if (s.marks_obtained != null) {
          if (!map[s.abbr]) map[s.abbr] = { name: s.name, abbr: s.abbr, total: 0, count: 0 };
          map[s.abbr].total += s.marks_obtained;
          map[s.abbr].count += 1;
        }
      });
    });
    return Object.values(map).map(v => ({ ...v, avg: Math.round((v.total / v.count) * 10) / 10 }));
  })();

  const handleSave = async (payload) => {
    try {
      if (editTarget) {
        await updateExamResult(editTarget._id || editTarget.id, payload);
        toast.success('Exam result updated.');
      } else {
        await createExamResult(payload);
        toast.success('Exam result added.');
      }
      setShowForm(false);
      setEditTarget(null);
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save exam result.');
      throw err;
    }
  };

  const handleDelete = async (id, name) => {
    if (!(await confirm(`Delete result for ${name}?`, { title: 'Delete result', confirmLabel: 'Delete' }))) return;
    try {
      await deleteExamResult(id);
      toast.success('Result deleted.');
      fetchAll();
    } catch {
      toast.error('Failed to delete result.');
    }
  };

  const handleIssueSheet = async (id) => {
    await issueResultSheet(id);
    fetchAll();
  };

  const handleRevokeSheet = async (id) => {
    await updateExamResult(id, { sheet_issued: false, sheet_date: null });
    fetchAll();
  };

  const handleRevokeSheetWithConfirm = async (id) => {
    const ok = await confirm('Revoke this sheet? It will return to Pending.', { title: 'Revoke sheet', confirmLabel: 'Revoke' });
    if (!ok) return;
    setRevokingSheetId(id);
    try {
      await handleRevokeSheet(id);
      toast.success('Sheet revoked.');
    } catch {
      toast.error('Failed to revoke.');
    } finally {
      setRevokingSheetId(null);
    }
  };

  const openAdd  = ()     => { setEditTarget(null); setShowForm(true); };
  const openEdit = (item) => { setEditTarget(item); setShowForm(true); };

  const handleQuickIssueAndView = async (r) => {
    const id = r._id || r.id;
    try {
      await issueResultSheet(id);
      fetchAll();
      toast.success('Sheet issued.');
      await viewPdf(id);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to issue sheet.');
    }
  };

  const filteredResults = filterSheet === ''
    ? results
    : filterSheet === 'pending'
      ? results.filter(r => !r.sheet_issued)
      : results.filter(r => r.sheet_issued);

  return (
    <div className="w-full space-y-4">
      {/* Top Card Header (Full Width Edge-to-Edge) */}
      <div className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight truncate">Exam Results &amp; Sheets</h1>
            <span className="hidden xs:inline-block px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] sm:text-[11px] font-bold text-slate-700 flex-shrink-0">
              Suite
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 hidden sm:block mt-0.5">
            Manage student scores, grades, and issue official result sheets
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowImport(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-all shadow-2xs">
              <HiOutlineUpload className="w-4 h-4 text-slate-500" />
              <span>Import</span>
            </button>
            <button onClick={openAdd}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-2xs">
              <HiOutlinePlus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>
        )}
      </div>

      {/* Page Content */}
      <div className="px-4 sm:px-6 lg:px-8 space-y-6">

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        {[
          { label: 'Total Students', value: results.length,  Icon: HiOutlineUsers,       bg: 'bg-slate-100 text-slate-700 border-slate-200' },
          { label: 'Batch Average',  value: `${avgMark}%`,   Icon: HiOutlineChartBar,     bg: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
          { label: 'Pass Rate',      value: `${passRate}%`,  Icon: HiOutlineCheckCircle,  bg: 'bg-violet-50 text-violet-600 border-violet-200' },
          { label: 'Sheets Issued',  value: sheetCount,      Icon: HiOutlineDocumentText, bg: 'bg-amber-50 text-amber-600 border-amber-200' },
        ].map(({ label, value, Icon, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${bg} border flex items-center justify-center flex-shrink-0 shadow-2xs`}>
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-none">{value}</p>
              <p className="text-[11px] sm:text-xs font-semibold text-slate-500 mt-1 truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {/* Merged Header & Filter Bar */}
        <div className="px-4 py-3 border-b border-slate-200/80 bg-white space-y-3">
          {/* Top Header Row: Navigation Tabs */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              {TABS.map((tab, i) => (
                <button key={tab} onClick={() => setActiveTab(i)}
                  className={`flex-shrink-0 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                    activeTab === i
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/80'
                  }`}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Merged Filter Controls Bar */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1 lg:justify-end">
              {/* Search */}
              <div className="relative flex-1 sm:flex-initial sm:w-60 min-w-[180px]">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
                  placeholder="Search student, batch, company…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>

              {/* Course Type Dropdown */}
              <Select value={filterType || 'all'} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-44 text-xs font-semibold bg-slate-50 border-slate-200/90 h-8.5 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Course Types</SelectItem>
                  {COURSE_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.value}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Batch Dropdown */}
              <Select value={filterBatch || 'all'} onValueChange={v => setFilterBatch(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-40 text-xs font-semibold bg-slate-50 border-slate-200/90 h-8.5 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  {batches.filter(b => b._id?.batch_name).map(b => <SelectItem key={b._id.batch_name} value={b._id.batch_name}>{b._id.batch_name}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1 bg-slate-100/80 rounded-xl p-1 border border-slate-200/60">
                <button onClick={() => setFilterSheet('')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterSheet === '' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                  All
                </button>
                <button onClick={() => setFilterSheet('pending')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterSheet === 'pending' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                  <Clock className="w-3.5 h-3.5" />
                  Pending
                </button>
                <button onClick={() => setFilterSheet('generated')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterSheet === 'generated' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Generated
                </button>
              </div>

              {/* Refresh Button */}
              <button onClick={fetchAll} className="p-2 bg-slate-50 border border-slate-200/90 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors shadow-2xs" title="Refresh">
                <HiOutlineRefresh className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isAdmin && activeTab === 0 && selected.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl">
                {selected.size} selected
              </span>
              <button onClick={handleBulkIssue} disabled={bulkIssuing || bulkDeleting || bulkRevoking || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-2xs">
                {bulkIssuing
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <HiOutlineCheckCircle className="w-3.5 h-3.5" />}
                {bulkIssuing ? 'Issuing…' : 'Issue Selected'}
              </button>
              <button onClick={handleBulkRevoke} disabled={bulkRevoking || bulkIssuing || bulkDeleting || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 disabled:opacity-50 transition-colors shadow-2xs">
                {bulkRevoking
                  ? <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                  : <HiOutlineRefresh className="w-3.5 h-3.5" />}
                {bulkRevoking ? 'Revoking…' : 'Revoke'}
              </button>
              <button onClick={handleBulkDelete} disabled={bulkDeleting || bulkIssuing || bulkRevoking || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-2xs">
                {bulkDeleting
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <HiOutlineTrash className="w-3.5 h-3.5" />}
                {bulkDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
              <span className="text-sm font-medium">Loading exam results…</span>
            </div>
          ) : (
            <>
              {/* TAB 0 — Overview table */}
              {activeTab === 0 && (
                filteredResults.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <HiOutlineClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
                    <p className="text-sm font-medium text-slate-500">No exam results found.</p>
                    {isAdmin && (
                      <button onClick={() => setShowImport(true)}
                        className="mt-3 text-xs font-bold text-slate-900 hover:underline inline-flex items-center gap-1">
                        <HiOutlineUpload className="w-4 h-4" /> Import from Excel
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200/80 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          {isAdmin && (
                            <th className="px-4 py-3">
                              <Checkbox
                                checked={selected.size === filteredResults.length && filteredResults.length > 0 ? true : selected.size > 0 ? 'indeterminate' : false}
                                onCheckedChange={toggleAll}
                                title={selected.size === filteredResults.length ? 'Deselect all' : 'Select all'}
                              />
                            </th>
                          )}
                          {['#','Student','Batch','Type','Final Marks','Grade','Sheet Status', isAdmin && 'Actions'].filter(Boolean).map(h => (
                            <th key={h} className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredResults.map((r, i) => {
                          const rid = r._id || r.id;
                          const isSelected = selected.has(rid);
                          return (
                          <tr key={rid} className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-slate-50' : ''}`}>
                            {isAdmin && (
                              <td className="px-4 py-3">
                                <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(rid)} />
                              </td>
                            )}
                            <td className="px-4 py-3 text-slate-400 font-bold">{i + 1}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => setViewStudent(r)} className="font-bold text-slate-900 hover:text-slate-600 text-left">
                                {r.participant_name || `${r.first_name} ${r.last_name}`}
                              </button>
                              {r.company && <p className="text-[11px] font-medium text-slate-400">{r.company}</p>}
                            </td>
                            <td className="px-4 py-3 text-slate-700 font-semibold">{r.batch_name}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${courseTypeBadge(r.course_type)}`}>{r.course_type}</span>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900">{r.final_marks != null ? Number(r.final_marks).toFixed(2) : '–'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${gradeBadge(r.overall_grade)}`}>{r.overall_grade || '–'}</span>
                            </td>
                            <td className="px-4 py-3">
                              {r.sheet_issued
                                ? <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><HiOutlineCheckCircle className="w-3.5 h-3.5" /> Issued</span>
                                : <span className="text-xs text-amber-600 font-bold flex items-center gap-1"><HiOutlineLockClosed className="w-3.5 h-3.5" /> Pending</span>}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setViewStudent(r)} title="View" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900">
                                    <HiOutlineEye className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900">
                                    <HiOutlinePencil className="w-4 h-4" />
                                  </button>
                                  {r.sheet_issued && (
                                    <button onClick={() => viewPdf(rid)} title="View PDF" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900">
                                      <HiOutlineDocumentText className="w-4 h-4" />
                                    </button>
                                  )}
                                  {r.sheet_issued && (
                                    <button
                                      onClick={() => handleRevokeSheetWithConfirm(rid)}
                                      title="Revoke Sheet"
                                      disabled={revokingSheetId === rid}
                                      className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 disabled:opacity-50"
                                    >
                                      {revokingSheetId === rid
                                        ? <div className="w-4 h-4 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                                        : <HiOutlineRefresh className="w-4 h-4" />}
                                    </button>
                                  )}
                                  <button onClick={() => handleDelete(r._id || r.id, r.participant_name || `${r.first_name} ${r.last_name}`)} title="Delete"
                                    className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600">
                                    <HiOutlineTrash className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )
              )}

              {/* TAB 1 — Student cards */}
              {activeTab === 1 && (
                filteredResults.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <HiOutlineAcademicCap className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
                    <p className="text-sm font-medium text-slate-500">No results to display.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredResults.map(r => (
                      <div key={r._id || r.id}
                        className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-shadow cursor-pointer space-y-3"
                        onClick={() => setViewStudent(r)}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm">{r.participant_name || `${r.first_name} ${r.last_name}`}</h3>
                            <p className="text-xs font-medium text-slate-400">{r.company || r.batch_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.sheet_issued && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <HiOutlineCheckCircle className="w-3 h-3" /> Issued
                              </span>
                            )}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeBadge(r.overall_grade)}`}>{r.overall_grade || '–'}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { val: r.final_marks != null ? Number(r.final_marks).toFixed(2) : '–', label: 'Avg' },
                            { val: r.final_exam_score ?? '–', label: 'Exam' },
                            { val: r.subjects?.filter(s => s.marks_obtained != null).length ?? 0, label: 'Subjects' },
                          ].map(({ val, label }) => (
                            <div key={label} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                              <p className="text-base font-extrabold text-slate-900">{val}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* TAB 2 — Subject analysis */}
              {activeTab === 2 && (
                subjectAverages.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <HiOutlineChartBar className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
                    <p className="text-sm font-medium text-slate-500">No subject scores recorded yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {subjectAverages.sort((a, b) => b.avg - a.avg).map(s => {
                      const grade = gradeFromMark(s.avg);
                      return (
                        <div key={s.abbr} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-base font-bold text-slate-900">{s.abbr}</p>
                              <p className="text-xs font-medium text-slate-400">{s.name}</p>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeBadge(grade)}`}>{grade || '–'}</span>
                          </div>
                          <div className="flex items-end gap-2">
                            <p className="text-3xl font-black text-slate-900">{s.avg}</p>
                            <p className="text-xs font-medium text-slate-400 mb-1">/ 100 · {s.count} students</p>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-slate-900 transition-all" style={{ width: `${s.avg}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* TAB 3 — Result Sheets */}
              {activeTab === 3 && (
                filteredResults.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <HiOutlineDocumentText className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
                    <p className="text-sm font-medium text-slate-500">No result sheets available.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          {['#','Student','Batch','Sheet Date','Status','Actions'].map(h => (
                            <th key={h} className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredResults.map((r, i) => {
                          const id   = r._id || r.id;
                          const name = r.participant_name || `${r.first_name} ${r.last_name}`;
                          return (
                            <tr key={id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-3 text-slate-400 font-bold">{i + 1}</td>
                              <td className="px-4 py-3 font-bold text-slate-900">{name}</td>
                              <td className="px-4 py-3 text-slate-700 font-semibold">{r.batch_name}</td>
                              <td className="px-4 py-3 text-slate-600 font-medium">{r.sheet_date || '–'}</td>
                              <td className="px-4 py-3">
                                {r.sheet_issued
                                  ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                                      <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Issued
                                    </span>
                                  : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                                      <HiOutlineLockClosed className="w-3 h-3" /> Pending
                                    </span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <button onClick={() => setViewStudent(r)}
                                    className="flex items-center gap-1 text-xs font-bold text-slate-900 hover:underline">
                                    <HiOutlineEye className="w-3.5 h-3.5" /> View
                                  </button>
                                  {r.sheet_issued ? (
                                    <>
                                      <button onClick={() => viewPdf(id)}
                                        className="flex items-center gap-1 text-xs font-bold text-slate-900 hover:underline">
                                        <HiOutlineDocumentText className="w-3.5 h-3.5" /> PDF
                                      </button>
                                      <button onClick={() => downloadPdf(id, name)}
                                        className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline">
                                        <HiOutlineDocumentDownload className="w-3.5 h-3.5" /> Download
                                      </button>
                                      {isAdmin && (
                                        <button
                                          onClick={() => handleRevokeSheetWithConfirm(id)}
                                          disabled={revokingSheetId === id}
                                          className="flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
                                        >
                                          {revokingSheetId === id
                                            ? <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                                            : <HiOutlineRefresh className="w-3.5 h-3.5" />} Revoke
                                        </button>
                                      )}
                                    </>
                                  ) : isAdmin ? (
                                    <button onClick={() => handleQuickIssueAndView(r)}
                                      className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline">
                                      <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Issue & View
                                    </button>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs text-slate-400">
                                      <HiOutlineLockClosed className="w-3 h-3" /> PDF locked
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showImport && (
          <ImportExcelModal onClose={() => setShowImport(false)} onImported={() => { fetchAll(); }} />
        )}
        {showForm && (
          <ResultFormModal initial={editTarget} onSave={handleSave} batches={batches}
            onClose={() => { setShowForm(false); setEditTarget(null); }} />
        )}
        {viewStudent && (
          <StudentDetailModal
            student={viewStudent}
            onClose={() => setViewStudent(null)}
            onIssueSheet={handleIssueSheet}
            onRevokeSheet={handleRevokeSheet}
            onRefresh={fetchAll}
          />
        )}
      </AnimatePresence>
      {ConfirmDialog}
      </div>
    </div>
  );
}

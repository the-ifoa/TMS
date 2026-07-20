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

// All 12 subjects — Human Factors (HF) is always last; if left empty it shows as N/A
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
  { abbr: 'HF',  name: 'Human Factors',                         max_marks: 100, marks_obtained: null }, // always last; null = N/A
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
  if (!grade) return 'bg-gray-100 text-gray-500';
  if (grade === 'OUTSTANDING') return 'bg-purple-100 text-purple-700';
  if (grade === 'DISTINCTION') return 'bg-blue-100 text-blue-700';
  if (grade === 'MERIT')       return 'bg-emerald-100 text-emerald-700';
  if (grade === 'PASS')        return 'bg-green-100 text-green-700';
  return 'bg-red-100 text-red-700';
}

function courseTypeBadge(type) {
  if (['FDI', 'FDA'].includes(type)) return 'bg-emerald-100 text-emerald-700';
  if (['FDR', 'FTL'].includes(type)) return 'bg-violet-100 text-violet-700';
  if (type === 'HF')  return 'bg-amber-100 text-amber-700';
  if (type === 'NDG') return 'bg-red-100 text-red-700';
  return 'bg-blue-100 text-blue-700';
}

/**
 * Merge stored subjects with DEFAULT_SUBJECTS so all 12 always appear.
 * N/A subjects (null marks) are pushed to the end.
 */
function mergeSubjects(stored) {
  if (!stored || stored.length === 0) return DEFAULT_SUBJECTS.map(s => ({ ...s }));

  const byAbbr = {};
  stored.forEach(s => { byAbbr[s.abbr] = s; });

  const merged = DEFAULT_SUBJECTS.map(def => ({
    ...def,
    ...(byAbbr[def.abbr] || {}),
  }));

  // Subjects present in stored but not in DEFAULT_SUBJECTS (e.g. from old data)
  stored.forEach(s => {
    if (!merged.find(m => m.abbr === s.abbr)) merged.push(s);
  });

  // N/A (null marks) subjects go last
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

// ── PDF download helper ───────────────────────────────────────────────────────
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

// Open PDF in a new browser tab instead of downloading
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
      // Ensure every student has all 12 subjects (N/A last)
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
      <div className="fixed -inset-20 z-50 bg-black/40 backdrop-blur-sm pointer-events-none" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <HiOutlineUpload className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Import Exam Results from Excel</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {step === 'upload'    && 'Upload your IFOA exam results workbook'}
                {step === 'preview'   && `${students.length} student${students.length !== 1 ? 's' : ''} found — review before importing`}
                {step === 'importing' && 'Saving records to database…'}
                {step === 'done'      && 'Import complete'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><HiOutlineX className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-0 px-6 pt-4 pb-2 flex-shrink-0">
          {['Upload', 'Preview', 'Import'].map((label, i) => {
            const stepIdx = { upload: 0, preview: 1, importing: 2, done: 2 }[step];
            const done = i < stepIdx, active = i === stepIdx;
            return (
              <div key={label} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                    ${done ? 'bg-emerald-500 text-white' : active ? 'bg-[#0000ff] text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                </div>
                {i < 2 && <div className="w-8 h-px bg-gray-200 mx-3" />}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-5">
              <div className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors
                ${dragOver ? 'border-[#0000ff] bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <HiOutlineUpload className="w-7 h-7 text-emerald-500" />
                </div>
                {file ? (
                  <div><p className="text-sm font-semibold text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p></div>
                ) : (
                  <div><p className="text-sm font-semibold text-gray-700">Drop your Excel file here</p>
                    <p className="text-xs text-gray-400 mt-1">or click to browse · .xlsx / .xls · max 10 MB</p></div>
                )}
              </div>
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-700 mb-2">Expected workbook format</p>
                <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
                  <li><strong>Sheet 1</strong> — Summary sheet with course metadata and a student score table</li>
                  <li><strong>Sheets 2+</strong> — Individual student result sheets</li>
                  <li>Matches the standard IFOA Exam Results Report workbook</li>
                  <li>Leave any subject column blank or enter <strong>NA</strong> to mark it as N/A on the result sheet</li>
                </ul>
              </div>
              {parseError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                  <HiOutlineExclamationCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{parseError}</p>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && batchMeta && (
            <div className="space-y-5">
              <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div><p className="text-gray-400 font-medium mb-0.5">Course Title</p><p className="text-gray-800 font-semibold">{batchMeta.courseTitle}</p></div>
                <div><p className="text-gray-400 font-medium mb-0.5">Training Mode</p><p className="text-gray-800 font-semibold">{batchMeta.trainingMode}</p></div>
                <div><p className="text-gray-400 font-medium mb-0.5">Date Range</p><p className="text-gray-800 font-semibold">{batchMeta.startDate} → {batchMeta.endDate}</p></div>
                <div><p className="text-gray-400 font-medium mb-0.5">Lead Instructor</p><p className="text-gray-800 font-semibold">{batchMeta.leadInstructor || '–'}</p></div>
                <div className="col-span-2"><p className="text-gray-400 font-medium mb-0.5">Other Instructors</p><p className="text-gray-800 font-semibold">{batchMeta.instructors.join(', ') || '–'}</p></div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Import Settings</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Batch Name <span className="text-red-500">*</span></label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. NOV-DEC 2024" value={batchName} onChange={e => setBatchName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Course Type</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={courseType} onChange={e => setCourseType(e.target.value)}>
                      {COURSE_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Company / Airline</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional" value={company} onChange={e => setCompany(e.target.value)} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">PDF Header Text (shown below "EXAM RESULTS")</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. 4-Weeks Flight Dispatch Initial Course Promotion NOV-DEC 2024 / 04 November - 06 December 2024"
                      value={resultHeaderText}
                      onChange={e => setResultHeaderText(e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Students to Import ({students.length})</p>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2.5 font-semibold text-gray-600 uppercase tracking-wide">#</th>
                        <th className="px-3 py-2.5 font-semibold text-gray-600 uppercase tracking-wide">Name</th>
                        {students[0]?.subjects?.map(s => (
                          <th key={s.abbr} className="px-3 py-2.5 font-semibold text-gray-600 uppercase tracking-wide text-center">{s.abbr}</th>
                        ))}
                        <th className="px-3 py-2.5 font-semibold text-gray-600 uppercase tracking-wide text-center">Exam</th>
                        <th className="px-3 py-2.5 font-semibold text-gray-600 uppercase tracking-wide text-center">Avg</th>
                        <th className="px-3 py-2.5 font-semibold text-gray-600 uppercase tracking-wide text-center">Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {students.map((s, i) => {
                        const grade = gradeFromMark(s.final_marks);
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.first_name} {s.last_name}</td>
                            {s.subjects?.map(sub => (
                              <td key={sub.abbr} className="px-3 py-2 text-center text-gray-700">
                                {sub.marks_obtained != null ? sub.marks_obtained : <span className="text-gray-300">N/A</span>}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-center text-gray-700">{s.final_exam_score ?? <span className="text-gray-300">–</span>}</td>
                            <td className="px-3 py-2 text-center font-semibold text-gray-900">{s.final_marks != null ? Number(s.final_marks).toFixed(2) : '–'}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full font-semibold ${gradeBadge(grade)}`}>{grade || '–'}</span>
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
              <div className="w-12 h-12 border-4 border-blue-100 border-t-[#0000ff] rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-600">Saving {students.length} student record{students.length !== 1 ? 's' : ''} to the database…</p>
            </div>
          )}

          {step === 'done' && importResult && (
            <div className="space-y-5">
              <div className={`rounded-xl p-5 flex items-center gap-4 ${importResult.failCount === 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${importResult.failCount === 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                  {importResult.failCount === 0
                    ? <HiOutlineCheckCircle className="w-7 h-7 text-emerald-600" />
                    : <HiOutlineExclamationCircle className="w-7 h-7 text-amber-600" />}
                </div>
                <div>
                  <p className={`font-semibold text-sm ${importResult.failCount === 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {importResult.successCount} of {importResult.successCount + importResult.failCount} records imported successfully
                  </p>
                  <p className={`text-xs mt-0.5 ${importResult.failCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {importResult.failCount === 0 ? 'All student exam results have been added to the database.' : `${importResult.failCount} record(s) failed — see details below.`}
                  </p>
                </div>
              </div>
              {importResult.saved?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Imported</p>
                  <div className="space-y-1">
                    {importResult.saved.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <HiOutlineCheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />{s.participant_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {importResult.failed?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Failed</p>
                  <div className="space-y-1">
                    {importResult.failed.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-2">
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

        <div className="border-t border-gray-100 p-4 flex justify-between gap-3 flex-shrink-0">
          <div>
            {step === 'preview' && (
              <button onClick={reset} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">← Back</button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              {step === 'done' ? 'Close' : 'Cancel'}
            </button>
            {step === 'upload' && (
              <button onClick={handleParse} disabled={!file || parsing}
                className="px-5 py-2 text-sm font-semibold text-white bg-[#0000ff] rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {parsing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {parsing ? 'Parsing…' : 'Parse File →'}
              </button>
            )}
            {step === 'preview' && (
              <button onClick={handleImport} disabled={!batchName.trim()}
                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                <HiOutlineDownload className="w-4 h-4" />
                Import {students.length} Record{students.length !== 1 ? 's' : ''}
              </button>
            )}
            {step === 'done' && importResult?.failCount > 0 && (
              <button onClick={reset} className="px-5 py-2 text-sm font-semibold text-white bg-[#0000ff] rounded-lg hover:bg-blue-700">
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
      // Ensure all 12 subjects present; N/A last
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

  // Deduplicated sorted list of all existing batch names (case-insensitive dedup)
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

  // Batch name autocomplete — filter existing batches by what the admin has typed
  const handleBatchNameChange = (val) => {
    set('batch_name', val);
    if (val.trim().length === 0) {
      setBatchSuggestions([]);
      setShowBatchDropdown(false);
      return;
    }
    const lower = val.trim().toLowerCase();
    // Show any batch whose name CONTAINS what was typed, even exact match
    // (exact match still shown so admin can confirm they mean that batch)
    const matched = existingBatchNames.filter(name =>
      name.toLowerCase().includes(lower)
    );
    setBatchSuggestions(matched);
    setShowBatchDropdown(matched.length > 0);
  };

  const selectBatchSuggestion = (name) => {
    // Directly update form state — bypasses handleBatchNameChange to avoid
    // re-triggering suggestions after a deliberate selection
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

    // Re-sort: subjects with marks first, N/A last
    const withMarks    = subs.filter(s => s.marks_obtained != null);
    const withoutMarks = subs.filter(s => s.marks_obtained == null);
    set('subjects', [...withMarks, ...withoutMarks]);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.batch_name || !form.course_name || !form.start_date || !form.end_date) {
      toast.error('Please fill in all required fields.');
      return;
    }
    // Validate subject scores
    for (const s of form.subjects) {
      if (s.marks_obtained != null && (s.marks_obtained < 0 || s.marks_obtained > 100)) {
        toast.error(`${s.abbr} score must be between 0 and 100.`);
        return;
      }
    }
    // Validate final scores
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
      <div className="fixed -inset-20 z-50 bg-black/40 backdrop-blur-sm pointer-events-none" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{initial ? 'Edit Exam Result' : 'Add Exam Result'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><HiOutlineX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Student Information</h3>
            <div className="grid grid-cols-2 gap-3">
              {[{ label: 'First Name *', key: 'first_name' }, { label: 'Last Name *', key: 'last_name' }].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form[key]} onChange={e => set(key, e.target.value)} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Company / Airline</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.company} onChange={e => set('company', e.target.value)} />
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Batch & Course</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">Batch Name *</label>
                <input
                  ref={batchInputRef}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. NOV-DEC 2024"
                  value={form.batch_name}
                  onChange={e => handleBatchNameChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowBatchDropdown(false), 200)}
                  autoComplete="off"
                />
                {showBatchDropdown && batchSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-blue-100 rounded-xl shadow-lg overflow-hidden">
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-blue-500 uppercase tracking-wider">Existing batch — add to it?</p>
                    {batchSuggestions.map(name => (
                      <button
                        key={name}
                        type="button"
                        onMouseDown={() => selectBatchSuggestion(name)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
                      >
                        {name}
                        <span className="ml-auto text-[10px] text-gray-400">Use existing</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Course Type *</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.course_type} onChange={e => set('course_type', e.target.value)}>
                  {COURSE_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Course Name *</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Flight Dispatch Initial Training / Promotion"
                  value={form.course_name} onChange={e => set('course_name', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">PDF Header Text (below "EXAM RESULTS")</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 4-Weeks Flight Dispatch Initial Course Promotion NOV-DEC 2024 / 04 November - 06 December 2024"
                  value={form.result_header_text || ''} onChange={e => set('result_header_text', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End Date *</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Training Mode</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.training_mode} onChange={e => set('training_mode', e.target.value)}>
                  {['HYBRID','ONLINE','IN-PERSON'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lead Instructor</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.lead_instructor} onChange={e => set('lead_instructor', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Other Instructors (comma-separated)</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. John Smith, Jane Doe" value={form.instructors} onChange={e => set('instructors', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Subject scores — all 12, empty = N/A (shown last in PDF) */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Subject Scores</h3>
            <p className="text-xs text-gray-400 mb-3">Leave blank to mark as N/A on the result sheet. N/A subjects always appear last.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-4">
              {form.subjects.map((s, i) => {
                const isOver = s.marks_obtained != null && s.marks_obtained > 100;
                return (
                  <div key={s.abbr} className="flex flex-col">
                    <label className="text-xs font-medium text-gray-600 mb-1 min-h-[2rem] flex items-end leading-tight">
                      <span>{s.abbr} – {s.name}</span>
                    </label>
                    <input type="number" min="0" max="100"
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                        isOver
                          ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-700'
                          : 'border-gray-200 focus:ring-blue-500'
                      }`}
                      placeholder="Leave blank = N/A"
                      value={s.marks_obtained ?? ''}
                      onChange={e => setSubject(i, e.target.value)} />
                    {isOver && (
                      <p className="text-[10px] text-red-500 mt-0.5">Max 100</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Final Marks & Sheet</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Final Exam Score</label>
                <input type="number" min="0" max="100"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    form.final_exam_score !== '' && Number(form.final_exam_score) > 100
                      ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-700'
                      : 'border-gray-200 focus:ring-blue-500'
                  }`}
                  value={form.final_exam_score}
                  onChange={e => set('final_exam_score', e.target.value)} />
                {form.final_exam_score !== '' && Number(form.final_exam_score) > 100 && (
                  <p className="text-[10px] text-red-500 mt-0.5">Max 100</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Overall Average / Final Marks</label>
                <input type="number" min="0" max="100"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    form.final_marks !== '' && Number(form.final_marks) > 100
                      ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-700'
                      : 'border-gray-200 focus:ring-blue-500'
                  }`}
                  value={form.final_marks}
                  onChange={e => set('final_marks', e.target.value)} />
                {form.final_marks !== '' && Number(form.final_marks) > 100 && (
                  <p className="text-[10px] text-red-500 mt-0.5">Max 100</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sheet Date</label>
                <input type="date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.sheet_date} onChange={e => set('sheet_date', e.target.value)} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.sheet_issued} onChange={e => set('sheet_issued', e.target.checked)} />
                  Sheet Already Issued
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0000ff] rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
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
    if (!window.confirm('Revoke this result sheet? It will return to Pending status and the student will lose PDF access.')) return;
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
      <div className="fixed -inset-20 z-50 bg-black/40 backdrop-blur-sm pointer-events-none" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{student.batch_name} · {student.course_type}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><HiOutlineX className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Score overview */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{student.final_marks != null ? Number(student.final_marks).toFixed(2) : '–'}</p>
              <p className="text-xs text-gray-500 mt-1">Final Marks</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{student.final_exam_score ?? '–'}</p>
              <p className="text-xs text-gray-500 mt-1">Exam Score</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${gradeBadge(student.overall_grade)}`}>
                {student.overall_grade || 'N/A'}
              </span>
              <p className="text-xs text-gray-500 mt-1">Grade</p>
            </div>
          </div>

          {/* Subject scores */}
          {student.subjects?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Subject Scores</h3>
              <div className="grid grid-cols-2 gap-2">
                {mergeSubjects(student.subjects).map((s) => (
                  <div key={s.abbr} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">{s.abbr}</p>
                      <p className="text-[10px] text-gray-400">{s.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{s.marks_obtained ?? <span className="text-gray-400 text-xs">N/A</span>}</p>
                      {s.grade && s.grade !== 'N/A' && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${gradeBadge(s.grade)}`}>{s.grade}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Company',         student.company || '–'],
              ['Mode',            student.training_mode],
              ['Start',           student.start_date],
              ['End',             student.end_date],
              ['Lead Instructor', student.lead_instructor || '–'],
              ['Sheet Date',      student.sheet_date || '–'],
            ].map(([label, val]) => (
              <div key={label}><span className="text-gray-500">{label}: </span><span className="font-medium text-gray-800">{val}</span></div>
            ))}
          </div>

          {/* Result Sheet status card */}
          <div className={`rounded-xl p-4 ${student.sheet_issued ? 'bg-green-50 border border-green-100' : 'bg-amber-50 border border-amber-100'}`}>
            <div className="flex items-start gap-3">
              <HiOutlineDocumentText className={`w-6 h-6 flex-shrink-0 mt-0.5 ${student.sheet_issued ? 'text-green-600' : 'text-amber-600'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${student.sheet_issued ? 'text-green-700' : 'text-amber-700'}`}>
                  {student.sheet_issued ? 'Result Sheet Issued' : 'Result Sheet Not Yet Issued'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {student.sheet_issued
                    ? `Issued on ${student.sheet_date || 'unknown date'} — PDF is now available`
                    : 'The admin must issue this sheet before the PDF becomes available.'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {!student.sheet_issued && (
                    <button onClick={handleIssue} disabled={issuing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
                      {issuing
                        ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <HiOutlineCheckCircle className="w-3.5 h-3.5" />}
                      {issuing ? 'Issuing…' : 'Issue Sheet'}
                    </button>
                  )}
                  {student.sheet_issued && (
                    <>
                      <button onClick={handleView} disabled={viewingPdf}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0000ff] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {viewingPdf
                          ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <HiOutlineEye className="w-3.5 h-3.5" />}
                        {viewingPdf ? 'Opening…' : 'View PDF'}
                      </button>
                      <button onClick={handleDownload} disabled={downloading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                        {downloading
                          ? <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                          : <HiOutlineDocumentDownload className="w-3.5 h-3.5" />}
                        {downloading ? 'Downloading…' : 'Download PDF'}
                      </button>
                      {/* ── Revoke Sheet button ── */}
                      <button onClick={handleRevoke} disabled={revoking}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                        {revoking
                          ? <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                          : <HiOutlineRefresh className="w-3.5 h-3.5" />}
                        {revoking ? 'Revoking…' : 'Revoke Sheet'}
                      </button>
                    </>
                  )}
                  {!student.sheet_issued && (
                    <p className="flex items-center gap-1 text-xs text-gray-400 ml-1">
                      <HiOutlineLockClosed className="w-3 h-3" />
                      PDF locked until issued
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        </motion.div>
      </div>
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
  const [filterSheet, setFilterSheet] = useState(''); // '' | 'pending' | 'generated'
  const [batches, setBatches]         = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [viewStudent, setViewStudent] = useState(null);

  // ── Multi-select ──────────────────────────────────────────────────────────
  const [selected, setSelected]       = useState(new Set());
  const [bulkIssuing, setBulkIssuing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRevoking, setBulkRevoking] = useState(false);
  const [revokingSheetId, setRevokingSheetId] = useState(null);

  const toggleSelect = (id) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(selected.size === results.length ? new Set() : new Set(results.map(r => r._id || r.id)));

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} selected result(s)? This cannot be undone.`)) return;
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
    if (!window.confirm(`Issue result sheets for ${toIssue.length} student(s)?`)) return;
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
    if (!window.confirm(`Revoke result sheets for ${toRevoke.length} student(s)?`)) return;
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
    if (!window.confirm(`Delete result for ${name}?`)) return;
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

  // Revoke sheet — revert back to pending by calling updateExamResult with sheet_issued: false
  const handleRevokeSheet = async (id) => {
    await updateExamResult(id, { sheet_issued: false, sheet_date: null });
    fetchAll();
  };

  const handleRevokeSheetWithConfirm = async (id) => {
    if (!window.confirm('Revoke this sheet? It will return to Pending.')) return;
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

  // Apply local sheet filter on top of server results
  const filteredResults = filterSheet === ''
    ? results
    : filterSheet === 'pending'
      ? results.filter(r => !r.sheet_issued)
      : results.filter(r => r.sheet_issued);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <HiOutlineClipboardList className="w-5 h-5 text-[#0000ff]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Exam Results & Result Sheets</h1>
            <p className="text-sm text-gray-500">Manage scores, grades, and issue result sheets</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors">
              <HiOutlineUpload className="w-4 h-4" />Import Excel
            </button>
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-[#0000ff] text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
              <HiOutlinePlus className="w-4 h-4" />Add Result
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Students', value: results.length,  Icon: HiOutlineUsers,       color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-100'    },
          { label: 'Batch Average',  value: `${avgMark}%`,   Icon: HiOutlineChartBar,     color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
          { label: 'Pass Rate',      value: `${passRate}%`,  Icon: HiOutlineCheckCircle,  color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-100'  },
          { label: 'Sheets Issued',  value: sheetCount,      Icon: HiOutlineDocumentText, color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-100'   },
        ].map(({ label, value, Icon, color, bg, border }) => (
          <div key={label} className="bg-white rounded-2xl border border-primary-100 p-5 shadow-sm flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl ${bg} border ${border} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-primary-800 leading-tight">{value}</p>
              <p className="text-xs text-primary-400 mt-0.5 font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible">
        {/* Tab bar — sticky */}
        <div className="sticky top-0 z-30 bg-white flex border-b border-gray-100 overflow-x-auto rounded-t-2xl">
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)}
              className={['flex-shrink-0 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === i ? 'border-[#0000ff] text-[#0000ff]' : 'border-transparent text-gray-500 hover:text-gray-700'].join(' ')}>
              {tab}
            </button>
          ))}
        </div>

        {/* Filter bar — sticky below tabs */}
        <div className="sticky top-[53px] z-20 flex flex-wrap items-center gap-2 p-4 border-b border-gray-50 bg-white/95 backdrop-blur-sm">
          <div className="relative w-full sm:w-64 md:w-72 lg:w-80">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search student, batch, company…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Course Types</option>
            {COURSE_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.value}</option>)}
          </select>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterBatch} onChange={e => setFilterBatch(e.target.value)}>
            <option value="">All Batches</option>
            {batches.map(b => <option key={b._id?.batch_name} value={b._id?.batch_name}>{b._id?.batch_name}</option>)}
          </select>

          {/* ── Sheet status filter with Lucide icons ── */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Show:</span>
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              <button onClick={() => setFilterSheet('')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterSheet === '' ? 'bg-[#0000ff] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                All
              </button>
              <button onClick={() => setFilterSheet('pending')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterSheet === 'pending' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Clock className="w-3.5 h-3.5" />
                Pending
              </button>
              <button onClick={() => setFilterSheet('generated')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterSheet === 'generated' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Generated
              </button>
            </div>
          </div>

          <button onClick={fetchAll} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500" title="Refresh">
            <HiOutlineRefresh className="w-4 h-4" />
          </button>

          {isAdmin && activeTab === 0 && selected.size > 0 && (
            <>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded-lg">
                {selected.size} selected
              </span>
              <button onClick={handleBulkIssue} disabled={bulkIssuing || bulkDeleting || bulkRevoking || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#0000ff] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {bulkIssuing
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <HiOutlineCheckCircle className="w-3.5 h-3.5" />}
                {bulkIssuing ? 'Issuing…' : `Issue Certificates${selected.size > 0 ? ` (${selected.size})` : ''}`}
              </button>
              <button onClick={handleBulkRevoke} disabled={bulkRevoking || bulkIssuing || bulkDeleting || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {bulkRevoking
                  ? <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                  : <HiOutlineRefresh className="w-3.5 h-3.5" />}
                {bulkRevoking ? 'Revoking…' : `Revoke Selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
              </button>
              <button onClick={handleBulkDelete} disabled={bulkDeleting || bulkIssuing || bulkRevoking || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {bulkDeleting
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <HiOutlineTrash className="w-3.5 h-3.5" />}
                {bulkDeleting ? 'Deleting…' : `Delete Selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
              </button>
            </>
          )}
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-blue-200 border-t-[#0000ff] rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* TAB 0 — Overview table */}
              {activeTab === 0 && (
                filteredResults.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <HiOutlineClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No exam results found.</p>
                    {isAdmin && (
                      <button onClick={() => setShowImport(true)}
                        className="mt-3 text-sm font-semibold text-emerald-600 hover:underline flex items-center gap-1 mx-auto">
                        <HiOutlineUpload className="w-4 h-4" /> Import from Excel
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 text-left">
                          {isAdmin && (
                            <th className="px-4 py-3 bg-gray-50">
                              <input type="checkbox"
                                checked={selected.size === filteredResults.length && filteredResults.length > 0}
                                onChange={toggleAll}
                                className="rounded border-gray-300 text-[#0000ff] focus:ring-blue-500 cursor-pointer"
                                title={selected.size === filteredResults.length ? 'Deselect all' : 'Select all'}
                              />
                            </th>
                          )}
                          {['#','Student','Batch','Type','Final Marks','Grade','Sheet', isAdmin && 'Actions'].filter(Boolean).map(h => (
                            <th key={h} className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide bg-gray-50">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredResults.map((r, i) => {
                          const rid = r._id || r.id;
                          const isSelected = selected.has(rid);
                          return (
                          <tr key={rid} className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}>
                            {isAdmin && (
                              <td className="px-4 py-3">
                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(rid)}
                                  className="rounded border-gray-300 text-[#0000ff] focus:ring-blue-500 cursor-pointer" />
                              </td>
                            )}
                            <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => setViewStudent(r)} className="font-medium text-gray-900 hover:text-[#0000ff] text-left">
                                {r.participant_name || `${r.first_name} ${r.last_name}`}
                              </button>
                              {r.company && <p className="text-xs text-gray-400">{r.company}</p>}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{r.batch_name}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${courseTypeBadge(r.course_type)}`}>{r.course_type}</span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-900">{r.final_marks != null ? Number(r.final_marks).toFixed(2) : '–'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${gradeBadge(r.overall_grade)}`}>{r.overall_grade || '–'}</span>
                            </td>
                            <td className="px-4 py-3">
                              {r.sheet_issued
                                ? <span className="text-xs text-green-600 font-medium flex items-center gap-1"><HiOutlineCheckCircle className="w-3.5 h-3.5" /> Issued</span>
                                : <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><HiOutlineLockClosed className="w-3 h-3" /> Pending</span>}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setViewStudent(r)} title="View" className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-[#0000ff]">
                                    <HiOutlineEye className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-[#0000ff]">
                                    <HiOutlinePencil className="w-4 h-4" />
                                  </button>
                                  {r.sheet_issued && (
                                    <button onClick={() => viewPdf(rid)} title="View PDF" className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-[#0000ff]">
                                      <HiOutlineDocumentText className="w-4 h-4" />
                                    </button>
                                  )}
                                  {r.sheet_issued && (
                                    <button
                                      onClick={() => handleRevokeSheetWithConfirm(rid)}
                                      title="Revoke Sheet"
                                      disabled={revokingSheetId === rid}
                                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-50"
                                    >
                                      {revokingSheetId === rid
                                        ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                                        : <HiOutlineRefresh className="w-4 h-4" />}
                                    </button>
                                  )}
                                  <button onClick={() => handleDelete(r._id || r.id, r.participant_name || `${r.first_name} ${r.last_name}`)} title="Delete"
                                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600">
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
                  <div className="text-center py-16 text-gray-400">
                    <HiOutlineAcademicCap className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No results to display.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredResults.map(r => (
                      <div key={r._id || r.id}
                        className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => setViewStudent(r)}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm">{r.participant_name || `${r.first_name} ${r.last_name}`}</h3>
                            <p className="text-xs text-gray-400">{r.company || r.batch_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.sheet_issued && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                <HiOutlineCheckCircle className="w-3 h-3" /> Issued
                              </span>
                            )}
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${gradeBadge(r.overall_grade)}`}>{r.overall_grade || '–'}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { val: r.final_marks != null ? Number(r.final_marks).toFixed(2) : '–', label: 'Avg' },
                            { val: r.final_exam_score ?? '–', label: 'Exam' },
                            { val: r.subjects?.filter(s => s.marks_obtained != null).length ?? 0, label: 'Subjects' },
                          ].map(({ val, label }) => (
                            <div key={label} className="bg-gray-50 rounded-lg p-2">
                              <p className="text-base font-bold text-gray-900">{val}</p>
                              <p className="text-[10px] text-gray-400">{label}</p>
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
                  <div className="text-center py-16 text-gray-400">
                    <HiOutlineChartBar className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No subject scores recorded yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {subjectAverages.sort((a, b) => b.avg - a.avg).map(s => {
                      const grade = gradeFromMark(s.avg);
                      return (
                        <div key={s.abbr} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-base font-bold text-gray-900">{s.abbr}</p>
                              <p className="text-xs text-gray-400">{s.name}</p>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${gradeBadge(grade)}`}>{grade || '–'}</span>
                          </div>
                          <div className="flex items-end gap-2 mt-2">
                            <p className="text-3xl font-bold text-gray-900">{s.avg}</p>
                            <p className="text-xs text-gray-400 mb-1">/ 100 · {s.count} students</p>
                          </div>
                          <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-[#0000ff] transition-all" style={{ width: `${s.avg}%` }} />
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
                  <div className="text-center py-16 text-gray-400">
                    <HiOutlineDocumentText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No result sheets available.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left sticky top-0 z-10">
                          {['#','Student','Batch','Sheet Date','Status','Actions'].map(h => (
                            <th key={h} className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide bg-gray-50">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredResults.map((r, i) => {
                          const id   = r._id || r.id;
                          const name = r.participant_name || `${r.first_name} ${r.last_name}`;
                          return (
                            <tr key={id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{name}</td>
                              <td className="px-4 py-3 text-gray-600">{r.batch_name}</td>
                              <td className="px-4 py-3 text-gray-600">{r.sheet_date || '–'}</td>
                              <td className="px-4 py-3">
                                {r.sheet_issued
                                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                                      <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Issued
                                    </span>
                                  : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                                      <HiOutlineLockClosed className="w-3 h-3" /> Pending
                                    </span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <button onClick={() => setViewStudent(r)}
                                    className="flex items-center gap-1 text-xs font-medium text-[#0000ff] hover:underline">
                                    <HiOutlineEye className="w-3.5 h-3.5" /> View
                                  </button>
                                  {r.sheet_issued ? (
                                    <>
                                      <button onClick={() => viewPdf(id)}
                                        className="flex items-center gap-1 text-xs font-medium text-[#0000ff] hover:underline">
                                        <HiOutlineDocumentText className="w-3.5 h-3.5" /> PDF
                                      </button>
                                      <button onClick={() => downloadPdf(id, name)}
                                        className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:underline">
                                        <HiOutlineDocumentDownload className="w-3.5 h-3.5" /> Download
                                      </button>
                                      {isAdmin && (
                                        <button
                                          onClick={() => handleRevokeSheetWithConfirm(id)}
                                          disabled={revokingSheetId === id}
                                          className="flex items-center gap-1 text-xs font-medium text-red-500 hover:underline disabled:opacity-50"
                                        >
                                          {revokingSheetId === id
                                            ? <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                                            : <HiOutlineRefresh className="w-3.5 h-3.5" />} Revoke
                                        </button>
                                      )}
                                    </>
                                  ) : isAdmin ? (
                                    <button onClick={() => handleQuickIssueAndView(r)}
                                      className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline">
                                      <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Issue & View
                                    </button>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs text-gray-400">
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
    </div>
  );
}

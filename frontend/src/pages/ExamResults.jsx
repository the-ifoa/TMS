import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
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
  HiOutlineReply,
} from 'react-icons/hi';
import { Clock, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getExamResults,
  createExamResult,
  bulkCreateExamResults,
  updateExamResult,
  deleteExamResult,
  issueResultSheet,
  getExamBatches,
  parseExamResultsExcel,
  importExamResultsExcel,
  getAirlinesList,
  getParticipants,
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

// A stored sheet keeps exactly its own courses (so removed courses stay removed);
// only a sheet with no courses at all starts from the default list.
function mergeSubjects(stored) {
  if (!stored || stored.length === 0) return DEFAULT_SUBJECTS.map(s => ({ ...s }));
  const withMarks    = stored.filter(s => s.marks_obtained != null);
  const withoutMarks = stored.filter(s => s.marks_obtained == null);
  return [...withMarks, ...withoutMarks].map(s => ({ max_marks: 100, ...s }));
}

// Mean of recorded scores as a % of each course's max marks (N/A ignored).
// Mirrors averageOfSubjects() in the backend controller.
function averageOfSubjects(subjects) {
  const pcts = (subjects || [])
    .filter(s => s.marks_obtained != null && s.marks_obtained !== '')
    .map(s => (Number(s.marks_obtained) / (Number(s.max_marks) || 100)) * 100);
  if (!pcts.length) return null;
  return Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 1000) / 1000;
}

// Fields restored when an edit is undone.
const RESTORE_FIELDS = ['first_name','last_name','batch_name','course_name','course_type',
  'result_header_text','training_mode','start_date','end_date','company','lead_instructor',
  'instructors','subjects','final_exam_score','final_marks','sheet_date','sheet_issued'];
const pickRestore = (r) => {
  const o = {};
  RESTORE_FIELDS.forEach(k => { if (r[k] !== undefined) o[k] = JSON.parse(JSON.stringify(r[k])); });
  return o;
};

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
// ── Airline dropdown (lists airlines registered on the admin side, with logo) ──
function AirlineLogo({ logoUrl, name }) {
  return (
    <span className="inline-flex w-5 h-5 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 align-middle">
      {logoUrl
        ? <img src={logoUrl} alt="" className="w-full h-full object-contain bg-white" />
        : <span className="text-[9px] font-bold text-slate-600">{(name || '?').trim().charAt(0).toUpperCase()}</span>}
    </span>
  );
}

function AirlineSelect({ value, onChange }) {
  const [airlines, setAirlines] = useState([]);
  useEffect(() => {
    getAirlinesList()
      .then(res => {
        // one entry per airline name (accounts can share a name); keep a logo if any has one
        const byName = new Map();
        (res.data || []).forEach(a => {
          if (!a.airlineName) return;
          const cur = byName.get(a.airlineName);
          if (!cur || (!cur.logo_url && a.logo_url)) byName.set(a.airlineName, { airlineName: a.airlineName, logo_url: a.logo_url || null });
        });
        setAirlines([...byName.values()]);
      })
      .catch(() => {});
  }, []);
  // keep a pre-existing value (e.g. imported / typed earlier) selectable
  const options = value && !airlines.some(a => a.airlineName === value)
    ? [{ airlineName: value, logo_url: null }, ...airlines]
    : airlines;
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="text-xs font-semibold"><SelectValue placeholder="Select airline" /></SelectTrigger>
      <SelectContent>
        {options.map(a => (
          <SelectItem key={a.airlineName} value={a.airlineName}>
            <span className="flex items-center gap-2">
              <AirlineLogo logoUrl={a.logo_url} name={a.airlineName} />
              {a.airlineName}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
                    <AirlineSelect value={company} onChange={setCompany} />
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
function ResultFormModal({ initial, prefill = null, onSave, onClose, batches = [] }) {
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
                          : airlineParticipants.length ? 'Select participant' : 'No participants — enter below'
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
                      <p className="px-3 py-2 text-xs text-slate-400">No batches yet — type a name to create one.</p>
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
              <p className="text-xs text-slate-400 font-medium py-3">No courses on this sheet — add one below.</p>
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

// ── Edit Batch Modal ──────────────────────────────────────────────────────────
// Edits every student of one batch in a single pass: the shared batch / course
// details, the course list, and a students × courses score grid. Only students
// whose data actually changed are sent; the whole save can be undone.
function BatchEditModal({ group, onSave, onClose }) {
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
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">Batch details <span className="normal-case font-medium text-slate-400">— applied to every student</span></h3>
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
  const [prefill, setPrefill]         = useState(null); // add-student-to-batch defaults
  const [batchEdit, setBatchEdit]     = useState(null); // group being bulk-edited
  const [undoStack, setUndoStack]     = useState([]);   // [{ label, run }] — newest last
  const [viewStudent, setViewStudent] = useState(null);

  const [selected, setSelected]       = useState(new Set());
  const [sort, setSort] = useState({ key: null, dir: 'asc' }); // Overview sorting
  const [openGroups, setOpenGroups] = useState(new Set()); // Overview accordion — batches start collapsed
  const [bulkIssuing, setBulkIssuing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRevoking, setBulkRevoking] = useState(false);
  const [revokingSheetId, setRevokingSheetId] = useState(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const toggleSelect = (id) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(selected.size === results.length ? new Set() : new Set(results.map(r => r._id || r.id)));

  // ── Undo history ──────────────────────────────────────────────────────────
  // Every destructive / modifying action pushes { label, run }; run() reverses it.
  const pushUndo = (label, run) => setUndoStack(st => [...st.slice(-19), { label, run }]);

  const handleUndo = async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setUndoStack(st => st.slice(0, -1));
    try {
      await entry.run();
      toast.success(`Undone: ${entry.label}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || `Could not undo: ${entry.label}`);
    }
    fetchAll();
  };

  // Ctrl/Cmd+Z undoes the last page-level action (ignored while typing in a field,
  // so it never fights the browser's own text undo or the form modal's undo).
  const undoRef = useRef(handleUndo);
  undoRef.current = handleUndo;
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      undoRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleBulkDelete = async () => {
    const ok = await confirm(`Delete ${selected.size} selected result(s)? This cannot be undone.`, { title: 'Delete results', confirmLabel: 'Delete' });
    if (!ok) return;
    setBulkDeleting(true);
    let count = 0;
    const deletedRows = [];
    for (const id of selected) {
      const snap = results.find(r => (r._id || r.id) === id);
      try {
        await deleteExamResult(id);
        count++;
        if (snap) deletedRows.push(pickRestore(snap));
      } catch {}
    }
    if (deletedRows.length) {
      pushUndo(`delete ${deletedRows.length} result(s)`, () => bulkCreateExamResults(deletedRows));
    }
    toast.success(`${count} result(s) deleted. Press Undo to restore.`);
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
        const id = editTarget._id || editTarget.id;
        const before = pickRestore(editTarget);
        const name = editTarget.participant_name || `${editTarget.first_name} ${editTarget.last_name}`;
        await updateExamResult(id, payload);
        pushUndo(`edit ${name}`, () => updateExamResult(id, before));
        toast.success('Exam result updated.');
      } else {
        const res = await createExamResult(payload);
        const newId = res?.data?.id || res?.data?._id;
        if (newId) pushUndo(`add ${payload.first_name} ${payload.last_name}`, () => deleteExamResult(newId));
        toast.success('Exam result added.');
      }
      setShowForm(false);
      setEditTarget(null);
      setPrefill(null);
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save exam result.');
      throw err;
    }
  };

  // Save a whole-batch edit: one update per changed student, undone as one step.
  const handleBatchSave = async (updates) => {
    const results = await Promise.allSettled(updates.map(u => updateExamResult(u.id, u.payload)));
    const okUpdates = updates.filter((_, i) => results[i].status === 'fulfilled');
    const failed = updates.length - okUpdates.length;
    if (okUpdates.length) {
      pushUndo(`edit batch (${okUpdates.length} student${okUpdates.length === 1 ? '' : 's'})`,
        () => Promise.all(okUpdates.map(u => updateExamResult(u.id, u.before))));
      toast.success(`${okUpdates.length} student${okUpdates.length === 1 ? '' : 's'} updated.`);
    }
    if (failed) toast.error(`${failed} update${failed === 1 ? '' : 's'} failed.`);
    if (!failed) setBatchEdit(null);
    fetchAll();
  };

  const handleDelete = async (id, name) => {
    if (!(await confirm(`Delete result for ${name}?`, { title: 'Delete result', confirmLabel: 'Delete' }))) return;
    try {
      const snap = results.find(r => (r._id || r.id) === id);
      await deleteExamResult(id);
      if (snap) {
        const row = pickRestore(snap);
        pushUndo(`delete ${name}`, () => createExamResult(row));
      }
      toast.success('Result deleted. Press Undo to restore.');
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

  const openAdd  = ()     => { setEditTarget(null); setPrefill(null); setShowForm(true); };
  // Add one student to an existing batch — batch / course details and the course
  // list are copied from the batch, scores start blank.
  const openAddToBatch = (g) => {
    const t = g.items[0] || {};
    setEditTarget(null);
    setPrefill({
      batch_name: g.batch_name, course_type: g.course_type,
      course_name: t.course_name || '', result_header_text: t.result_header_text || '',
      training_mode: t.training_mode || 'HYBRID',
      start_date: t.start_date || '', end_date: t.end_date || '',
      company: t.company || '', lead_instructor: t.lead_instructor || '',
      instructors: t.instructors || [], sheet_date: t.sheet_date || t.end_date || '',
      subjects: t.subjects || [],
    });
    setShowForm(true);
  };
  const openEdit = (item) => { setEditTarget(item); setPrefill(null); setShowForm(true); };

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

  // Overview: one section per batch + course type + airline (e.g. "OCT-2026 · FDI · DHL Bahrain")
  const overviewGroups = (() => {
    const map = new Map();
    filteredResults.forEach(r => {
      const company = (r.company || '').trim();
      const key = `${r.batch_name}||${r.course_type}||${company.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { key, batch_name: r.batch_name, course_type: r.course_type, company, items: [] });
      map.get(key).items.push(r);
    });
    const GRADE_RANK = { OUTSTANDING: 5, DISTINCTION: 4, MERIT: 3, PASS: 2, FAILED: 1 };
    const val = {
      student: r => (r.participant_name || `${r.first_name} ${r.last_name}`).toLowerCase(),
      marks:   r => (r.final_marks != null ? Number(r.final_marks) : -1),
      grade:   r => GRADE_RANK[r.overall_grade] || 0,
      status:  r => (r.sheet_issued ? 1 : 0),
    };
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const sign = sort.dir === 'asc' ? 1 : -1;
    const groupsArr = [...map.values()];
    if (sort.key === 'batch') {
      groupsArr.sort((a, b) => sign * cmp(a.batch_name.toLowerCase(), b.batch_name.toLowerCase()));
    } else if (val[sort.key]) {
      groupsArr.forEach(g => g.items.sort((a, b) => sign * cmp(val[sort.key](a), val[sort.key](b))));
    }
    return groupsArr;
  })();
  const toggleSort = (key) =>
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

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
            <button onClick={handleUndo} disabled={undoStack.length === 0}
              title={undoStack.length ? `Undo: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)` : 'Nothing to undo'}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-all shadow-2xs disabled:opacity-40 disabled:hover:bg-white">
              <HiOutlineReply className="w-4 h-4 text-slate-500" />
              <span>Undo{undoStack.length > 0 && ` (${undoStack.length})`}</span>
            </button>
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
                    <div className="overflow-auto max-h-[calc(100vh-13rem)] min-h-[28rem]">
                    <table className="w-full min-w-[900px] table-fixed text-xs">
                      <colgroup>
                        {isAdmin && <col style={{ width: '3.5rem' }} />}
                        <col style={{ width: '3.5rem' }} />
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '13%' }} />
                        {isAdmin && <col />}
                      </colgroup>
                      <thead className="sticky top-0 z-10">
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
                          {[
                            ['#'], ['Student', 'student'], ['Batch', 'batch'], ['Type'],
                            ['Final Marks', 'marks'], ['Grade', 'grade'], ['Sheet Status', 'status'],
                            isAdmin && ['Actions'],
                          ].filter(Boolean).map(([h, key]) => (
                            <th key={h} className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                              {key ? (
                                <button type="button" onClick={() => toggleSort(key)}
                                  className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sort.key === key ? 'text-slate-900' : ''}`}>
                                  {h}
                                  <span className="text-[10px] leading-none">
                                    {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                                  </span>
                                </button>
                              ) : h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {overviewGroups.map(g => {
                          const gIds = g.items.map(r => r._id || r.id);
                          const gAll = gIds.every(id => selected.has(id));
                          const gSome = gIds.some(id => selected.has(id));
                          const gCompanies = g.company ? [g.company] : [];
                          const gIssued = g.items.filter(r => r.sheet_issued).length;
                          const gOpen = openGroups.has(g.key);
                          const toggleG = () => setOpenGroups(prev => {
                            const n = new Set(prev);
                            n.has(g.key) ? n.delete(g.key) : n.add(g.key);
                            return n;
                          });
                          return (
                          <Fragment key={g.key}>
                          <tr className="bg-slate-100/70 hover:bg-slate-100 cursor-pointer select-none" onClick={toggleG}>
                            {isAdmin && (
                              <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                                <Checkbox
                                  checked={gAll ? true : gSome ? 'indeterminate' : false}
                                  onCheckedChange={() => setSelected(prev => {
                                    const n = new Set(prev);
                                    gIds.forEach(id => (gAll ? n.delete(id) : n.add(id)));
                                    return n;
                                  })}
                                  title="Select batch"
                                />
                              </td>
                            )}
                            <td colSpan={isAdmin ? 8 : 7} className="px-4 py-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <HiOutlineChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${gOpen ? '' : '-rotate-90'}`} />
                                <span className="text-xs font-extrabold text-slate-900">{g.batch_name}</span>
                                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${courseTypeBadge(g.course_type)}`}>{g.course_type}</span>
                                {gCompanies.length > 0 && <span className="text-[11px] font-medium text-slate-500">{gCompanies.join(', ')}</span>}
                                {isAdmin && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setBatchEdit(g); }}
                                    title={`Edit all students in ${g.batch_name} at once`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors">
                                    <HiOutlinePencil className="w-3 h-3" /> Edit batch
                                  </button>
                                )}
                                {isAdmin && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); openAddToBatch(g); }}
                                    title={`Add a student to ${g.batch_name}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors">
                                    <HiOutlinePlus className="w-3 h-3" /> Add student
                                  </button>
                                )}
                                <span className="ml-auto text-[11px] font-semibold text-slate-500">
                                  {g.items.length} student{g.items.length > 1 ? 's' : ''} · {gIssued} sheet{gIssued !== 1 ? 's' : ''} issued
                                </span>
                              </div>
                            </td>
                          </tr>
                          {gOpen && g.items.map((r, i) => {
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
                          </Fragment>
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
          <ResultFormModal initial={editTarget} prefill={prefill} onSave={handleSave} batches={batches}
            onClose={() => { setShowForm(false); setEditTarget(null); setPrefill(null); }} />
        )}
        {batchEdit && (
          <BatchEditModal group={batchEdit} onSave={handleBatchSave} onClose={() => setBatchEdit(null)} />
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

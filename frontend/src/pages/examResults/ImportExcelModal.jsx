import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { HiOutlineCheckCircle, HiOutlineX, HiOutlineDownload, HiOutlineUpload, HiOutlineExclamationCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { parseExamResultsExcel, importExamResultsExcel } from '../../api';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { COURSE_TYPES, gradeFromMark, gradeBadge, mergeSubjects } from './helpers';
import { AirlineSelect } from './AirlineSelect';

// ── Import Excel Modal ────────────────────────────────────────────────────────

export function ImportExcelModal({ onClose, onImported }) {
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
                {step === 'preview'   && `${students.length} student${students.length !== 1 ? 's' : ''} found. Review before importing`}
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
                  <li><strong>Sheet 1</strong>: Summary sheet with course metadata and a student score table</li>
                  <li><strong>Sheets 2+</strong>: Individual student result sheets</li>
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
                    {importResult.failCount === 0 ? 'All student exam results have been added to the database.' : `${importResult.failCount} record(s) failed. See details below.`}
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

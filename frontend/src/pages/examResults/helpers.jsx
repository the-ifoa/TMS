import toast from 'react-hot-toast';
import { getExamResultPdf } from '../../api';

// ── Constants ─────────────────────────────────────────────────────────────────
export const COURSE_TYPES = [
  { value: 'FDI', label: 'FDI – Flight Dispatch Initial' },
  { value: 'FDR', label: 'FDR – Flight Dispatch Recurrent' },
  { value: 'FDA', label: 'FDA – Flight Dispatch Advanced' },
  { value: 'FTL', label: 'FTL – Flight Time Limitations' },
  { value: 'NDG', label: 'NDG – Dangerous Goods No-Carry' },
  { value: 'HF',  label: 'HF – Human Factors for OCC' },
  { value: 'GD',  label: 'GD – Ground Operations' },
  { value: 'TCD', label: 'TCD – Training Competencies Development' },
];

export const DEFAULT_SUBJECTS = [
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

export const TABS = ['Overview', 'Student Results', 'Subject Analysis', 'Result Sheets'];

// ── Helpers ───────────────────────────────────────────────────────────────────
export function gradeFromMark(m) {
  if (m == null || m === '') return null;
  const n = Number(m);
  if (n > 95)  return 'OUTSTANDING';
  if (n >= 90) return 'DISTINCTION';
  if (n >= 76) return 'MERIT';
  if (n >= 75) return 'PASS';
  return 'FAILED';
}

export function gradeBadge(grade) {
  if (!grade) return 'bg-slate-100 text-slate-500 border border-slate-200';
  if (grade === 'OUTSTANDING') return 'bg-purple-50 text-purple-700 border border-purple-200';
  if (grade === 'DISTINCTION') return 'bg-blue-50 text-blue-700 border border-blue-200';
  if (grade === 'MERIT')       return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (grade === 'PASS')        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  return 'bg-rose-50 text-rose-700 border border-rose-200';
}

export function courseTypeBadge(type) {
  if (['FDI', 'FDA'].includes(type)) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (['FDR', 'FTL'].includes(type)) return 'bg-violet-50 text-violet-700 border border-violet-200';
  if (type === 'HF')  return 'bg-amber-50 text-amber-700 border border-amber-200';
  if (type === 'NDG') return 'bg-rose-50 text-rose-700 border border-rose-200';
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

// A stored sheet keeps exactly its own courses (so removed courses stay removed);
// only a sheet with no courses at all starts from the default list.
export function mergeSubjects(stored) {
  if (!stored || stored.length === 0) return DEFAULT_SUBJECTS.map(s => ({ ...s }));
  const withMarks    = stored.filter(s => s.marks_obtained != null);
  const withoutMarks = stored.filter(s => s.marks_obtained == null);
  return [...withMarks, ...withoutMarks].map(s => ({ max_marks: 100, ...s }));
}

// Mean of recorded scores as a % of each course's max marks (N/A ignored).
// Mirrors averageOfSubjects() in the backend controller.
export function averageOfSubjects(subjects) {
  const pcts = (subjects || [])
    .filter(s => s.marks_obtained != null && s.marks_obtained !== '')
    .map(s => (Number(s.marks_obtained) / (Number(s.max_marks) || 100)) * 100);
  if (!pcts.length) return null;
  return Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 1000) / 1000;
}

// Fields restored when an edit is undone.
export const RESTORE_FIELDS = ['first_name','last_name','batch_name','course_name','course_type',
  'result_header_text','training_mode','start_date','end_date','company','lead_instructor',
  'instructors','subjects','final_exam_score','final_marks','sheet_date','sheet_issued'];
export const pickRestore = (r) => {
  const o = {};
  RESTORE_FIELDS.forEach(k => { if (r[k] !== undefined) o[k] = JSON.parse(JSON.stringify(r[k])); });
  return o;
};

export function emptyForm() {
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

export async function downloadPdf(id, name) {
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

export async function viewPdf(id) {
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

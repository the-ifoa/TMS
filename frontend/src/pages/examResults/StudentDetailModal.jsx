import { useState } from 'react';
import { motion } from 'framer-motion';
import { HiOutlineDocumentText, HiOutlineCheckCircle, HiOutlineX, HiOutlineEye, HiOutlineRefresh, HiOutlineDocumentDownload } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { gradeBadge, mergeSubjects, downloadPdf, viewPdf } from './helpers';

// ── Student Detail Modal ──────────────────────────────────────────────────────
export function StudentDetailModal({ student, onClose, onIssueSheet, onRevokeSheet, onRefresh }) {
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

import { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineSearch,
  HiOutlinePlusCircle,
  HiOutlineFilter,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineAcademicCap,
  HiOutlineUsers,
  HiOutlineCheckCircle,
  HiOutlineEye,
  HiOutlineDocumentDownload,
  HiOutlineDocumentText,
  HiOutlineX,
  HiOutlineClipboardList,
  HiOutlineClock,
  HiOutlineSelector,
  HiOutlineLockClosed,
  HiOutlineMail,
  HiOutlineCheck,
  HiOutlineChartBar,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { getParticipants, deleteParticipant, downloadIssuedCertificate, downloadDhlCertificate, listAttendanceSheets, getAttendanceSheet, updateParticipantEmail, API_BASE } from '../api';
import AttendanceChecklistModal from '../components/AttendanceChecklistModal';
import { buildAttendanceMap, generateAttendancePdf } from '../utils/generateAttendancePdf';
import { useConfirm } from '@/hooks/use-confirm';

const TRAINING_TYPES = [
  { value: 'FDI', label: 'Flight Dispatch Initial',      color: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold' },
  { value: 'FDR', label: 'Flight Dispatch Recurrent',    color: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold' },
  { value: 'FDA', label: 'Flight Dispatch Advanced',     color: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold' },
  { value: 'FTL', label: 'Flight Time Limitations',      color: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold' },
  { value: 'NDG', label: 'Dangerous Goods No-Carry',     color: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold' },
  { value: 'HF',  label: 'Human Factors for OCC',        color: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold' },
  { value: 'GD',  label: 'Ground Operations',            color: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold' },
  { value: 'TCD', label: 'Training Competencies Dev.',   color: 'bg-slate-100 text-slate-800 border-slate-300/80 font-bold' },
];
const TYPE_MAP = Object.fromEntries(TRAINING_TYPES.map(t => [t.value, t]));

function typeBadge(type) {
  const t = TYPE_MAP[type] || { color: 'bg-slate-50 text-slate-600 border-slate-100' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${t.color}`}>
      {type}
    </span>
  );
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name = '') {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Custom dropdown (native <select> can't be styled — replaces it for a themeable, animated menu) ──
function DropdownItem({ item, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center justify-between gap-3 transition-colors duration-150 cursor-pointer ${
        active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50 hover:text-blue-600'
      }`}
    >
      <span className="truncate flex-1">{item.label}</span>
      {active && <HiOutlineCheckCircle className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
    </button>
  );
}

function SelectDropdown({ icon: Icon, value, options, onChange, placeholder, minWidth = '180px', align = 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const flatItems = options.flatMap(o => (o.items ? o.items : [o]));
  const selected = flatItems.find(o => o.value === value);
  const isFiltered = value !== '' && value !== 'submitted_desc';

  return (
    <div className="relative w-full sm:w-auto flex-shrink-0 min-w-0 sm:min-w-[170px]" style={{ minWidth: typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : minWidth }} ref={ref}>
      {Icon && <Icon className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10 ${isFiltered ? 'text-blue-600' : 'text-slate-400'}`} />}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 pl-9 pr-3 py-2 border rounded-xl text-xs sm:text-sm font-medium text-left focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer ${
          isFiltered 
            ? 'bg-blue-50/70 border-blue-200/90 text-blue-800 font-semibold hover:bg-blue-100/70' 
            : 'bg-slate-50/70 border-slate-200/90 text-slate-700 hover:bg-slate-100/70'
        }`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <HiOutlineChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0 ${isFiltered ? 'text-blue-600' : 'text-slate-400'} ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-30 mt-1.5 w-full sm:w-max min-w-full sm:min-w-[210px] sm:max-w-[320px] bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 max-h-80 overflow-y-auto ${
              align === 'right' ? 'right-0 sm:right-0 sm:left-auto' : 'left-0 sm:left-0 sm:right-auto'
            }`}
          >
            {options.map((opt, gi) =>
              opt.items ? (
                <div key={opt.group} className={gi > 0 ? 'mt-1 pt-1 border-t border-slate-100' : ''}>
                  <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{opt.group}</p>
                  {opt.items.map(item => (
                    <DropdownItem key={item.value} item={item} active={item.value === value} onSelect={() => { onChange(item.value); setOpen(false); }} />
                  ))}
                </div>
              ) : (
                <DropdownItem key={opt.value} item={opt} active={opt.value === value} onSelect={() => { onChange(opt.value); setOpen(false); }} />
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Collapsible group used in airline view ───────────────────────────────────

// Inline add/edit for a participant's exam-invite email (airline-allowed).
function EmailInlineEditor({ rec }) {
  const [email, setEmail] = useState(rec.email || '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rec.email || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const val = draft.trim();
    setSaving(true);
    try {
      await updateParticipantEmail(rec.id || rec._id, val);
      setEmail(val);
      rec.email = val; // keep the shared record in sync for the send flow
      setEditing(false);
      toast.success(val ? 'Email saved' : 'Email cleared');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save email');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus type="email" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(email); setEditing(false); } }}
          placeholder="candidate@email.com"
          className="w-44 px-2 py-1 text-[11px] border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25"
        />
        <button onClick={save} disabled={saving} className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
          <HiOutlineCheck className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => { setDraft(email); setEditing(false); }} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
          <HiOutlineX className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setDraft(email); setEditing(true); }}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all border ${
        email
          ? 'bg-blue-50/80 border-blue-200/80 text-blue-700 hover:bg-blue-100/80'
          : 'bg-slate-50 border-dashed border-slate-300 text-slate-500 hover:bg-slate-100'
      }`}
      title={email ? 'Edit email' : 'Add email for exam invitations'}
    >
      <HiOutlineMail className="w-3.5 h-3.5" />
      <span className="max-w-[160px] truncate">{email || 'Add email'}</span>
    </button>
  );
}

function SubmissionGroup({ groupKey, records, open, onToggle, focusId, attendanceSheets = [], onViewSheet, onAddSheet, bulkEmail = false, emailDrafts = {}, onEmailDraft }) {
  const [downloading, setDownloading] = useState(null);
  const [preview, setPreview]       = useState(null);
  const [downloadingDhl, setDownloadingDhl] = useState(null);
  const [dhlPreview, setDhlPreview] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [previewingSheet, setPreviewingSheet] = useState(null);
  const rowRefs = useRef({});
  const first    = records[0];

  useEffect(() => {
    if (!open || !focusId) return;
    const timer = setTimeout(() => {
      const el = rowRefs.current[focusId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('notif-highlight');
        el.addEventListener('animationend', () => el.classList.remove('notif-highlight'), { once: true });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, focusId]);
  const typeInfo = TYPE_MAP[first.training_type] || {};

  const handlePreviewPdf = async (sheet) => {
    try {
      setPreviewingSheet(sheet._id);
      const res  = await getAttendanceSheet(sheet._id);
      const full = res.data;
      const parts = full.participants || sheet.participants || [];
      const attendanceMap = buildAttendanceMap(full.records || [], parts.length);
      generateAttendancePdf({
        participants:  parts,
        startDate:     full.start_date,
        endDate:       full.end_date,
        company:       full.company,
        trainingType:  full.training_type,
        attendance:    attendanceMap,
        mode:          'preview',
      });
    } catch {
      toast.error('Failed to generate PDF preview');
    } finally {
      setPreviewingSheet(null);
    }
  };

  const handleDownload = async (rec) => {
    try {
      setDownloading(rec.id || rec._id);
      const res  = await downloadIssuedCertificate(rec.id || rec._id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = `Certificate_${(rec.participant_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Certificate downloaded');
    } catch {
      toast.error('Failed to download certificate');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadDhl = async (rec) => {
    try {
      setDownloadingDhl(rec.id || rec._id);
      const res  = await downloadDhlCertificate(rec.id || rec._id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = `DHL_ST001_${(rec.participant_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('DHL certificate downloaded');
    } catch {
      toast.error('Failed to download DHL certificate');
    } finally {
      setDownloadingDhl(null);
    }
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all duration-300 ${
      open ? 'overflow-x-hidden overflow-y-auto max-h-[480px] border-slate-300' : 'overflow-hidden'
    }`}>
      {/* Group header — click to collapse */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4 text-left transition-all duration-200 group ${
          open ? 'bg-slate-100/90 sticky top-0 z-10 border-b border-slate-200/80 backdrop-blur-sm' : 'bg-white hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Chevron */}
            <span className="text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0">
              {open
                ? <HiOutlineChevronDown className="w-4 h-4 text-slate-700" />
                : <HiOutlineChevronRight className="w-4 h-4" />}
            </span>

            {/* Title */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 text-slate-600 group-hover:text-slate-900 transition-colors shadow-2xs">
                <HiOutlineAcademicCap className="w-4 h-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-slate-900 transition-colors truncate">
                {first.training_type} — {typeInfo.label || first.training_type}
              </span>
            </div>
          </div>

          {/* Mobile count pill */}
          <span className="inline-flex sm:hidden items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold flex-shrink-0 shadow-2xs">
            <HiOutlineUsers className="w-3 h-3 text-slate-500" />
            {records.length}
          </span>
        </div>

        {/* Metadata info */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 sm:gap-3 flex-1 min-w-0 pl-7 sm:pl-0">
          {/* Date range */}
          <span className="text-[11px] sm:text-xs text-slate-600 font-semibold flex-shrink-0">
            {fmtDate(first.training_date)}
            {first.end_date && first.end_date !== first.training_date ? ` – ${fmtDate(first.end_date)}` : ''}
          </span>

          {/* Submitted timestamp */}
          {first.created_at && (
            <span className="text-[10px] text-slate-500 font-medium hidden md:block flex-shrink-0">
              Submitted {new Date(first.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}

          {/* Desktop count pill */}
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold flex-shrink-0 shadow-2xs">
            <HiOutlineUsers className="w-3.5 h-3.5 text-slate-500" />
            {records.length} participant{records.length !== 1 ? 's' : ''}
          </span>
        </div>
      </button>

      {/* Collapsible participant list */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.2, ease: 'easeOut' }, opacity: { duration: 0.15 } }}
            style={{ overflow: 'hidden' }}
          >
            {/* Shared details bar — location & modules are batch-level */}
            {(first.location || first.modules) && (
              <div className="px-4 sm:px-5 py-2.5 bg-slate-50/40 border-b border-slate-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                {first.location && <span><span className="font-semibold text-slate-700">Location:</span> {first.location}</span>}
                {first.modules  && <span><span className="font-semibold text-slate-700">Modules:</span> {first.modules}</span>}
              </div>
            )}

            {/* Attendance sheets for this group */}
            {(attendanceSheets.length > 0 || onAddSheet) && (
              <div className="px-4 sm:px-5 py-3 bg-emerald-50/30 border-b border-emerald-100/70">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Attendance</span>
                  {onAddSheet && (
                    <button
                      type="button"
                      onClick={() => onAddSheet(records)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs"
                    >
                      <HiOutlinePlusCircle className="w-3.5 h-3.5" />
                      Add Attendance
                    </button>
                  )}
                </div>
                {attendanceSheets.length === 0 ? (
                  <p className="text-[11px] text-emerald-700/70 font-medium">No attendance checklist yet for this batch.</p>
                ) : (
                <div className="flex flex-wrap gap-2">
                  {attendanceSheets.map(sheet => (
                    <div key={sheet._id} className="flex items-center justify-between sm:justify-start gap-2 bg-white border border-emerald-150 rounded-xl px-3 py-1.5 shadow-2xs w-full sm:w-auto">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <HiOutlineClipboardList className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className="text-xs text-emerald-800 font-semibold truncate">
                          {sheet.start_date}{sheet.end_date && sheet.end_date !== sheet.start_date ? ` – ${sheet.end_date}` : ''}
                          <span className="text-emerald-500 font-normal ml-1 hidden sm:inline">· {sheet.participants?.length ?? 0} participants</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreviewPdf(sheet)}
                          disabled={previewingSheet === sheet._id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[11px] sm:text-xs font-semibold bg-slate-50 border border-slate-200/80 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                        >
                          {previewingSheet === sheet._id
                            ? <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                            : <HiOutlineDocumentText className="w-3.5 h-3.5" />}
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => onViewSheet(sheet)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[11px] sm:text-xs font-semibold bg-emerald-50 border border-emerald-200/80 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <HiOutlineEye className="w-3.5 h-3.5" />
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            )}

            {/* Participant rows */}
            <div className="divide-y divide-slate-100">
              {records.map((rec, i) => (
                <div key={rec.id || rec._id}
                  ref={el => { rowRefs.current[String(rec.id || rec._id)] = el; }}
                  onClick={() => setDetailRecord(rec)}
                  className="flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4 px-4 sm:px-5 py-3 hover:bg-slate-50/50 transition-colors justify-between cursor-pointer group/row"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Number */}
                    <span className="w-4 text-xs font-semibold text-slate-400 flex-shrink-0">{i + 1}</span>

                    {/* Avatar + Name */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover/row:bg-blue-50 group-hover/row:text-blue-600 transition-colors">
                        <span className="text-[10px] font-bold text-slate-600">{initials(rec.participant_name)}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs sm:text-sm font-bold text-slate-800 truncate block">{rec.participant_name}</span>
                        <span className="text-[11px] text-slate-400 mt-0.5 block truncate">
                          {rec.department && <>{rec.department} &middot; </>}
                          {fmtDate(rec.training_date)}
                          {rec.end_date && <> → {fmtDate(rec.end_date)}</>}
                        </span>
                        {rec.owner_label && (
                          <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            rec.owner_is_department
                              ? 'bg-violet-50 text-violet-700 border-violet-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            {rec.owner_label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons row - sleek compact inline layout for mobile & desktop */}
                  <div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap pl-7 md:pl-0 pt-1 md:pt-0" onClick={e => e.stopPropagation()}>
                    {bulkEmail ? (
                      <input
                        type="email"
                        value={emailDrafts[rec.id || rec._id] ?? (rec.email || '')}
                        onChange={(e) => onEmailDraft(rec.id || rec._id, e.target.value)}
                        placeholder="candidate@email.com"
                        className="w-48 px-2.5 py-1 text-[11px] border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25 bg-blue-50/30"
                      />
                    ) : (
                      <EmailInlineEditor rec={rec} />
                    )}
                    {rec.cert_released ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPreview(rec)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-blue-200/80 bg-blue-50/80 text-[11px] font-semibold text-blue-700 hover:bg-blue-100/80 transition-all"
                        >
                          <HiOutlineEye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>
                        <button
                          onClick={() => handleDownload(rec)}
                          disabled={downloading === (rec.id || rec._id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-emerald-200/80 bg-emerald-50/80 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100/80 disabled:opacity-60 transition-all"
                        >
                          {downloading === (rec.id || rec._id) ? (
                            <div className="w-3 h-3 border-2 border-emerald-300 border-t-emerald-700 rounded-full animate-spin" />
                          ) : (
                            <HiOutlineDocumentDownload className="w-3.5 h-3.5" />
                          )}
                          <span>PDF</span>
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600 border border-amber-200/60">
                        <HiOutlineClock className="w-3 h-3" /> Pending
                      </span>
                    )}

                    {rec.dhl_cert_released && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDhlPreview(rec)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-purple-200/80 bg-purple-50/80 text-[11px] font-semibold text-purple-700 hover:bg-purple-100/80 transition-all"
                        >
                          <HiOutlineEye className="w-3.5 h-3.5" />
                          <span>DHL Preview</span>
                        </button>
                        <button
                          onClick={() => handleDownloadDhl(rec)}
                          disabled={downloadingDhl === (rec.id || rec._id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-purple-200/80 bg-purple-50/80 text-[11px] font-semibold text-purple-700 hover:bg-purple-100/80 disabled:opacity-60 transition-all"
                        >
                          {downloadingDhl === (rec.id || rec._id) ? (
                            <div className="w-3 h-3 border-2 border-purple-300 border-t-purple-700 rounded-full animate-spin" />
                          ) : (
                            <HiOutlineDocumentDownload className="w-3.5 h-3.5" />
                          )}
                          <span>DHL PDF</span>
                        </button>
                      </div>
                    )}

                    {/* Locked badge */}
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 border border-slate-200/80 text-slate-600">
                      <HiOutlineLockClosed className="w-3 h-3 text-slate-400" /> Locked
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Participant detail modal */}
      <ParticipantModal record={detailRecord} onClose={() => setDetailRecord(null)} />

      {/* Certificate preview modal */}
      <AnimatePresence>
        {preview && (() => {
          const token = localStorage.getItem('token') || '';
          const pid   = preview.id || preview._id;
          const src   = `${API_BASE}/certificates/preview/${pid}?token=${encodeURIComponent(token)}`;
          return (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm"
                onClick={() => setPreview(null)}
              />
              <div
                key="layout"
                className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 pointer-events-none"
              >
                <motion.div
                  key="card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden pointer-events-auto"
                  onClick={e => e.stopPropagation()}
                >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-800 truncate">Certificate — {preview.participant_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{preview.training_type}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDownload(preview)}
                      disabled={downloading === pid}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
                    >
                      {downloading === pid
                        ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <HiOutlineDocumentDownload className="w-4 h-4" />}
                      {downloading === pid ? 'Downloading…' : 'Download PDF'}
                    </button>
                    <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                      <HiOutlineX className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="bg-slate-50 relative" style={{ height: '65vh' }}>
                  <iframe src={src} title="Certificate Preview" className="w-full h-full border-0" />
                  <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-1.5 text-[10px] text-slate-400">
                    If blank, click Download PDF
                  </div>
                </div>
                </motion.div>
              </div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* DHL FORM ST-001 preview modal */}
      <AnimatePresence>
        {dhlPreview && (() => {
          const token = localStorage.getItem('token') || '';
          const pid   = dhlPreview.id || dhlPreview._id;
          const src   = `${API_BASE}/certificates/dhl-preview/${pid}?token=${encodeURIComponent(token)}`;
          return (
            <>
              <motion.div
                key="dhl-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm"
                onClick={() => setDhlPreview(null)}
              />
              <div
                key="dhl-layout"
                className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 pointer-events-none"
              >
                <motion.div
                  key="dhl-card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden pointer-events-auto"
                  onClick={e => e.stopPropagation()}
                >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-800 truncate">DHL Certificate — {dhlPreview.participant_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">DHL FORM ST-{String(dhlPreview.dhl_cert_sequence).padStart(3, '0')}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDownloadDhl(dhlPreview)}
                      disabled={downloadingDhl === pid}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-60 transition-colors"
                    >
                      {downloadingDhl === pid
                        ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <HiOutlineDocumentDownload className="w-4 h-4" />}
                      {downloadingDhl === pid ? 'Downloading…' : 'Download PDF'}
                    </button>
                    <button onClick={() => setDhlPreview(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                      <HiOutlineX className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="bg-slate-50 relative" style={{ height: '65vh' }}>
                  <iframe src={src} title="DHL Certificate Preview" className="w-full h-full border-0" />
                  <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-1.5 text-[10px] text-slate-400">
                    If blank, click Download PDF
                  </div>
                </div>
                </motion.div>
              </div>
            </>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
// ─── Participant detail modal ─────────────────────────────────────────────────────────
function ParticipantModal({ record, onClose }) {
  if (!record) return null;
  const rows = [
    { label: 'Full Name',      value: record.participant_name },
    { label: 'First Name',     value: record.first_name },
    { label: 'Last Name',      value: record.last_name },
    { label: 'Airline',        value: record.company },
    { label: 'Department',     value: record.department },
    { label: 'Training Type',  value: record.training_type },
    { label: 'Start Date',     value: fmtDate(record.training_date) },
    { label: 'End Date',       value: record.end_date ? fmtDate(record.end_date) : '—' },
    { label: 'Location',       value: record.online_synchronous ? 'Online Synchronous' : (record.location || '—') },
    { label: 'NDG Subtype',    value: record.training_type === 'NDG' ? (record.ndg_subtype === 'R' ? 'Recurrent' : 'Initial') : null },
    { label: 'NDG Score',      value: record.training_type === 'NDG' && record.ndg_score != null ? `${record.ndg_score}%` : null },
    { label: 'Modules',        value: record.modules || null },
    { label: 'Certificate No', value: record.cert_sequence ? `${record.training_type}-${String(record.cert_sequence).padStart(5,'0')}` : 'Not yet generated' },
    { label: 'Status',         value: record.locked ? 'Locked' : 'Draft' },
  ].filter(r => r.value !== null && r.value !== undefined);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        key="layout"
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none"
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-100">
            <div className="w-11 h-11 rounded-full bg-slate-150 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-slate-600">{initials(record.participant_name)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-slate-800 truncate">{record.participant_name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{record.company} · {record.department}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          {/* Details */}
          <div className="px-5 py-4 space-y-1 max-h-[60vh] overflow-y-auto">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-slate-50 last:border-0">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-shrink-0 w-28">{label}</span>
                <span className="text-sm text-slate-800 text-right break-words max-w-[200px]">{value}</span>
              </div>
            ))}
          </div>
          {/* Footer */}
          <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex justify-end">
            <button onClick={onClose} className="btn-primary text-sm">Close</button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default function Participants() {
  const { isAdmin } = useAuth();
  const [records, setRecords]               = useState([]);
  const [attendanceSheets, setAttendanceSheets] = useState([]);
  const [activeSheet, setActiveSheet]       = useState(null);
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus') || null;
  const [search, setSearch]       = useState(searchParams.get('search') || '');
  const [filterType, setFilterType] = useState('');
  const [filterCompany, setFilterCompany] = useState(''); // admin: filter table by airline/company
  const [filterOwner, setFilterOwner]     = useState(''); // airline: filter by which account submitted (main vs a department)
  const [sortKey, setSortKey]       = useState('submitted_desc');
  const [loading, setLoading]       = useState(true);
  const [openGroups, setOpenGroups] = useState({});
  const [openAttGroups, setOpenAttGroups] = useState({}); // admin attendance tab: airline accordion
  const { confirm, ConfirmDialog } = useConfirm();
  const [activeTab, setActiveTab] = useState('participants'); // 'participants' | 'attendance'
  const [attSearch, setAttSearch] = useState('');
  const [attFilterType, setAttFilterType] = useState('');
  const [attFilterCompany, setAttFilterCompany] = useState('');
  // Bulk email entry (airline): edit every candidate's exam-invite email inline, save all at once.
  const [bulkEmail, setBulkEmail] = useState(false);
  const [emailDrafts, setEmailDrafts] = useState({});
  const [savingEmails, setSavingEmails] = useState(false);

  const enterBulkEmail = () => {
    const d = {};
    records.forEach((r) => { d[r.id || r._id] = r.email || ''; });
    setEmailDrafts(d);
    setBulkEmail(true);
  };
  const setEmailDraft = (id, val) => setEmailDrafts((p) => ({ ...p, [id]: val }));

  const saveAllEmails = async () => {
    const changed = records.filter((r) => {
      const id = r.id || r._id;
      return emailDrafts[id] !== undefined && (emailDrafts[id].trim() || '') !== (r.email || '');
    });
    if (changed.length === 0) { setBulkEmail(false); toast('No email changes to save.', { icon: 'ℹ️' }); return; }
    setSavingEmails(true);
    let ok = 0, fail = 0;
    for (const r of changed) {
      const id = r.id || r._id;
      try { await updateParticipantEmail(id, emailDrafts[id].trim()); r.email = emailDrafts[id].trim(); ok++; }
      catch { fail++; }
    }
    setSavingEmails(false);
    setBulkEmail(false);
    fetchRecords({ silent: true });
    if (fail === 0) toast.success(`${ok} email${ok !== 1 ? 's' : ''} saved.`);
    else toast.error(`${ok} saved, ${fail} failed.`);
  };

  const fetchRecords = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (filterType) params.training_type = filterType;
      const [recRes, sheetRes] = await Promise.all([
        getParticipants(params),
        listAttendanceSheets(),
      ]);

      const sorted = recRes.data.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : Infinity;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : Infinity;
        return dateA - dateB;
      });

      setRecords(sorted);
      setAttendanceSheets(sheetRes.data || []);
    } catch {
      toast.error('Failed to load records');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchRecords(); }, [filterType, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id, name) => {
    if (!(await confirm(`Delete record for "${name}"?`, { title: 'Delete record', confirmLabel: 'Delete' }))) return;
    try {
      await deleteParticipant(id);
      toast.success('Record deleted');
      fetchRecords({ silent: true });
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Distinct submitting accounts present in the airline's own records
  // (main account + any departments) — powers the "Submitted by" filter.
  const ownerOptions = useMemo(() => {
    const seen = new Map();
    records.forEach(r => {
      if (r.owner_id && !seen.has(r.owner_id)) seen.set(r.owner_id, r.owner_label || 'Unknown');
    });
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [records]);

  const groups = useMemo(() => {
    if (isAdmin) return null;
    const map = {};
    records
      .filter(r => !filterOwner || String(r.owner_id) === filterOwner)
      .forEach(r => {
        const key = `${r.training_type || 'Unknown'}||${r.training_date || ''}`;
        if (!map[key]) map[key] = [];
        map[key].push(r);
      });
    const entries = Object.entries(map);
    const ts = str => str ? new Date(str).getTime() : 0;
    return entries.sort(([, a], [, b]) => {
      switch (sortKey) {
        case 'submitted_desc': return Math.max(...b.map(r => ts(r.created_at))) - Math.max(...a.map(r => ts(r.created_at)));
        case 'submitted_asc':  return Math.max(...a.map(r => ts(r.created_at))) - Math.max(...b.map(r => ts(r.created_at)));
        case 'start_desc':     return ts(b[0].training_date) - ts(a[0].training_date);
        case 'start_asc':      return ts(a[0].training_date) - ts(b[0].training_date);
        case 'end_desc':       return ts(b[0].end_date || b[0].training_date) - ts(a[0].end_date || a[0].training_date);
        case 'end_asc':        return ts(a[0].end_date || a[0].training_date) - ts(b[0].end_date || b[0].training_date);
        case 'type_asc':       return (a[0].training_type || '').localeCompare(b[0].training_type || '');
        case 'type_desc':      return (b[0].training_type || '').localeCompare(a[0].training_type || '');
        case 'count_desc':     return b.length - a.length;
        case 'count_asc':      return a.length - b.length;
        default:               return 0;
      }
    });
  }, [records, isAdmin, sortKey, filterOwner]);

  // Admin: distinct airline/company names present in the current record set
  const companyOptions = useMemo(() => {
    const set = new Set();
    records.forEach(r => { const c = (r.company || '').trim(); if (c) set.add(c); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [records]);

  const attCompanyOptions = useMemo(() => {
    const set = new Set();
    attendanceSheets.forEach(s => { const c = ((s.airline_name || s.company) || '').trim(); if (c) set.add(c); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [attendanceSheets]);

  // Admin: records shown in the table after the client-side airline filter
  const visibleRecords = useMemo(
    () => (filterCompany ? records.filter(r => (r.company || '').trim() === filterCompany) : records),
    [records, filterCompany],
  );

  useEffect(() => {
    if (!focusId || !groups) return;
    const match = groups.find(([, recs]) => recs.some(r => String(r.id || r._id) === focusId));
    if (match) {
      setOpenGroups(prev => (prev[match[0]] === undefined ? { ...prev, [match[0]]: true } : prev));
    }
  }, [focusId, groups]);

  const [detailRecord, setDetailRecord] = useState(null);

  // Airline: open a fresh attendance checklist for a whole training batch.
  // Dates come from the batch itself; the modal creates the sheet on save
  // (backend attributes it to this airline account).
  const handleAddSheetForGroup = (recs) => {
    const first = recs[0] || {};
    setActiveSheet({
      _id: undefined,
      participants: recs.map(r => {
        const nameParts = (r.participant_name || '').trim().split(/\s+/);
        return {
          first_name: r.first_name || nameParts[0] || '',
          last_name:  r.last_name  || nameParts.slice(1).join(' ') || '',
        };
      }),
      start_date: (first.training_date || '').slice(0, 10),
      end_date:   (first.end_date || '').slice(0, 10) || null,
      company:    first.company || first.airline_name || '',
      training_type: first.training_type || '',
      readOnly: false,
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // AIRLINE VIEW — grouped collapsible layout
  // ─────────────────────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {activeSheet && (
          <AttendanceChecklistModal
            participants={activeSheet.participants || []}
            startDate={activeSheet.start_date}
            endDate={activeSheet.end_date}
            company={activeSheet.airline_name || activeSheet.company}
            trainingType={activeSheet.training_type}
            attendanceId={activeSheet._id}
            readOnly={activeSheet.readOnly}
            onClose={() => { setActiveSheet(null); fetchRecords({ silent: true }); }}
          />
        )}
        {/* Page Header (Full width header banner) */}
        <div className="-mx-3 sm:-mx-6 -mt-3 sm:-mt-6 bg-white border-b border-slate-200/80 px-7 pt-6 pb-4 sm:px-12 sm:pt-8 sm:pb-5 shadow-2xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight break-words leading-tight">My Submissions</h1>
            <p className="text-xs font-medium text-slate-500 hidden sm:block mt-0.5">
              Your training enrollment records, organized and grouped by training batch
            </p>
          </div>
          <Link 
            to="/airline/enrollment/new" 
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all font-semibold text-xs shadow-sm whitespace-nowrap flex-shrink-0"
          >
            <HiOutlinePlusCircle className="w-4 h-4" />
            <span>New Enrollment</span>
          </Link>
        </div>

        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">

        {/* Search + filter + sort bar (no outer card box) */}
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            {/* Search input with clear icon */}
            <div className="flex-1 relative w-full">
              <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or department…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200 shadow-2xs rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                  title="Clear search"
                >
                  <HiOutlineX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdown */}
            <SelectDropdown
              icon={HiOutlineFilter}
              value={filterType}
              onChange={setFilterType}
              minWidth="180px"
              options={[
                { value: '', label: 'All Training Types' },
                ...TRAINING_TYPES.map(t => ({ value: t.value, label: `${t.value} – ${t.label}` })),
              ]}
            />

            {/* Submitted-by filter — only when >1 account has submitted (main + departments) */}
            {ownerOptions.length > 1 && (
              <SelectDropdown
                icon={HiOutlineFilter}
                value={filterOwner}
                onChange={setFilterOwner}
                minWidth="190px"
                options={[
                  { value: '', label: 'Submitted by: Anyone' },
                  ...ownerOptions.map(o => ({ value: o.value, label: o.label })),
                ]}
              />
            )}

            {/* Sort Dropdown */}
            <SelectDropdown
              icon={HiOutlineSelector}
              value={sortKey}
              onChange={setSortKey}
              align="right"
              minWidth="200px"
              options={[
                { group: 'Submission Date', items: [
                  { value: 'submitted_desc', label: 'Submitted: Newest First' },
                  { value: 'submitted_asc',  label: 'Submitted: Oldest First' },
                ] },
                { group: 'Training Start Date', items: [
                  { value: 'start_desc', label: 'Start Date: Newest First' },
                  { value: 'start_asc',  label: 'Start Date: Oldest First' },
                ] },
                { group: 'Training End Date', items: [
                  { value: 'end_desc', label: 'End Date: Newest First' },
                  { value: 'end_asc',  label: 'End Date: Oldest First' },
                ] },
                { group: 'Training Type', items: [
                  { value: 'type_asc',  label: 'Training Type: A → Z' },
                  { value: 'type_desc', label: 'Training Type: Z → A' },
                ] },
                { group: 'Participants', items: [
                  { value: 'count_desc', label: 'Most Participants First' },
                  { value: 'count_asc',  label: 'Fewest Participants First' },
                ] },
              ]}
            />

            {/* Bulk email manager — airline only */}
            {!isAdmin && (
              bulkEmail ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={saveAllEmails}
                    disabled={savingEmails}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-all disabled:opacity-60 whitespace-nowrap"
                  >
                    <HiOutlineCheck className="w-4 h-4" />
                    {savingEmails ? 'Saving…' : 'Save All Emails'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkEmail(false)}
                    disabled={savingEmails}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={enterBulkEmail}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-2xs transition-all whitespace-nowrap flex-shrink-0"
                >
                  <HiOutlineMail className="w-4 h-4 text-slate-500" />
                  Manage Emails
                </button>
              )
            )}
          </div>

          {/* Active Filters Summary Bar */}
          {(search || filterType || filterOwner || sortKey !== 'submitted_desc') && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-400 font-medium mr-0.5">Active:</span>
                {search && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-200/60">
                    Search: "{search}"
                    <button onClick={() => setSearch('')} className="hover:text-blue-900"><HiOutlineX className="w-3 h-3" /></button>
                  </span>
                )}
                {filterType && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-200/60">
                    Type: {filterType}
                    <button onClick={() => setFilterType('')} className="hover:text-blue-900"><HiOutlineX className="w-3 h-3" /></button>
                  </span>
                )}
                {filterOwner && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-200/60">
                    By: {ownerOptions.find(o => o.value === filterOwner)?.label || 'account'}
                    <button onClick={() => setFilterOwner('')} className="hover:text-blue-900"><HiOutlineX className="w-3 h-3" /></button>
                  </span>
                )}
                {sortKey !== 'submitted_desc' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium border border-slate-200/80">
                    Sorted
                    <button onClick={() => setSortKey('submitted_desc')} className="hover:text-slate-900"><HiOutlineX className="w-3 h-3" /></button>
                  </span>
                )}
              </div>

              <button
                onClick={() => { setSearch(''); setFilterType(''); setFilterOwner(''); setSortKey('submitted_desc'); }}
                className="text-[11px] text-slate-500 hover:text-red-600 font-semibold transition-colors ml-auto"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading submissions…</span>
          </div>
        ) : groups && groups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-sm text-slate-400 font-medium">No submissions found.</div>
        ) : (
          <div
            className="space-y-3.5 max-h-[calc(100vh-260px)] sm:max-h-[calc(100vh-240px)] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200"
            onWheel={e => {
              const el = e.currentTarget;
              const atTop = el.scrollTop === 0;
              const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
              if (!(atTop && e.deltaY < 0) && !(atBottom && e.deltaY > 0)) e.stopPropagation();
            }}
          >
            {groups && groups.map(([key, recs]) => {
              const [groupType, groupDate] = key.split('||');
              const groupSheets = attendanceSheets.filter(s =>
                s.training_type === groupType &&
                (!groupDate || s.start_date === groupDate)
              );
              return (
                <SubmissionGroup
                  key={key}
                  groupKey={key}
                  records={recs}
                  open={bulkEmail ? true : (openGroups[key] ?? false)}
                  onToggle={() => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))}
                  focusId={focusId}
                  attendanceSheets={groupSheets}
                  onViewSheet={sheet => setActiveSheet({ ...sheet, readOnly: false })}
                  onAddSheet={handleAddSheetForGroup}
                  bulkEmail={bulkEmail}
                  emailDrafts={emailDrafts}
                  onEmailDraft={setEmailDraft}
                />
              );
            })}
          </div>
        )}

        {/* Footer count */}
        {!loading && records.length > 0 && (() => {
          const shown = (groups || []).reduce((n, [, recs]) => n + recs.length, 0);
          return (
            <p className="text-xs text-slate-400 text-right font-medium">
              {shown} record{shown !== 1 ? 's' : ''} across {groups?.length} submission{groups?.length !== 1 ? 's' : ''}
              {filterOwner && shown !== records.length ? ` (of ${records.length})` : ''}
            </p>
          );
        })()}
        </div>
      </motion.div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN VIEW — flat table
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="px-4 sm:px-6 pt-5 pb-6 space-y-5">
      <ParticipantModal record={detailRecord} onClose={() => setDetailRecord(null)} />
      {activeSheet && (
        <AttendanceChecklistModal
          participants={activeSheet.participants || []}
          startDate={activeSheet.start_date}
          endDate={activeSheet.end_date}
          company={activeSheet.airline_name || activeSheet.company}
          trainingType={activeSheet.training_type}
          attendanceId={activeSheet._id}
          readOnly={false}
          onClose={() => setActiveSheet(null)}
        />
      )}

      {/* ── Sticky Top Header & Control Bar ── */}
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md -mx-4 sm:-mx-6 -mt-5 px-4 sm:px-6 pt-0 pb-3 space-y-3 border-b border-slate-200/80">
        {/* Page Header (Full width) */}
        <div className="-mx-4 sm:-mx-6 bg-white border-b border-slate-200/80 px-4 sm:px-6 py-3 sm:py-3.5 shadow-2xs flex flex-row items-center justify-between gap-2.5">
          <div className="min-w-0 flex items-center gap-2.5">
            <h1 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight truncate">Participants</h1>
            <span className="hidden xs:inline-block px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] sm:text-[11px] font-bold text-slate-700 flex-shrink-0">Roster</span>
            {records.length > 0 && (
              <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200/70 text-[10px] sm:text-[11px] font-bold text-blue-700 flex-shrink-0">
                {records.filter(r => r.email).length}/{records.length} with email
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {activeTab === 'participants' && (
              bulkEmail ? (
                <>
                  <button
                    type="button"
                    onClick={saveAllEmails}
                    disabled={savingEmails}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-60 whitespace-nowrap"
                  >
                    <HiOutlineCheck className="w-4 h-4" />
                    {savingEmails ? 'Saving…' : 'Save All Emails'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkEmail(false)}
                    disabled={savingEmails}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={enterBulkEmail}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-xs transition-all whitespace-nowrap"
                >
                  <HiOutlineMail className="w-4 h-4 text-slate-500" />
                  <span>Manage Emails</span>
                </button>
              )
            )}
            <Link
              to="/admin/participants/add"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all font-semibold text-xs shadow-xs whitespace-nowrap"
            >
              <HiOutlinePlusCircle className="w-4 h-4" />
              <span>Add Participant</span>
            </Link>
          </div>
        </div>

        {/* Tab Toggle (Natural width pill layout) */}
        <div className="inline-flex items-center gap-1 bg-white border border-slate-200/80 rounded-xl p-1 shadow-2xs">
          <button
            onClick={() => setActiveTab('participants')}
            className={`inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === 'participants'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <HiOutlineUsers className="w-3.5 h-3.5" />
            <span>Participants</span>
            {records.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                activeTab === 'participants' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>{records.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={`inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <HiOutlineClipboardList className="w-3.5 h-3.5" />
            <span>Attendance</span>
            {attendanceSheets.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                activeTab === 'attendance' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'
              }`}>{attendanceSheets.length}</span>
            )}
          </button>
        </div>

        {/* Search + filter bar — participants tab */}
        {activeTab === 'participants' && (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <div className="flex-1 relative w-full">
                <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, company, or department..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200 shadow-2xs rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <SelectDropdown
                icon={HiOutlineFilter}
                value={filterType}
                onChange={setFilterType}
                minWidth="190px"
                options={[
                  { value: '', label: 'All Training Types' },
                  ...TRAINING_TYPES.map(t => ({ value: t.value, label: `${t.value} – ${t.label}` })),
                ]}
              />
              <SelectDropdown
                icon={HiOutlineFilter}
                value={filterCompany}
                onChange={setFilterCompany}
                align="right"
                minWidth="190px"
                options={[
                  { value: '', label: 'All Airlines' },
                  ...companyOptions.map(c => ({ value: c, label: c })),
                ]}
              />
            </div>
            {(search || filterType || filterCompany) && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-400 font-medium mr-0.5">Active:</span>
                  {search && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-200/60">
                      Search: "{search}"
                      <button onClick={() => setSearch('')} className="hover:text-blue-900"><HiOutlineX className="w-3 h-3" /></button>
                    </span>
                  )}
                  {filterType && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-200/60">
                      Type: {filterType}
                      <button onClick={() => setFilterType('')} className="hover:text-blue-900"><HiOutlineX className="w-3 h-3" /></button>
                    </span>
                  )}
                  {filterCompany && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-200/60">
                      Airline: {filterCompany}
                      <button onClick={() => setFilterCompany('')} className="hover:text-blue-900"><HiOutlineX className="w-3 h-3" /></button>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setSearch(''); setFilterType(''); setFilterCompany(''); }}
                  className="text-[11px] text-slate-500 hover:text-red-600 font-semibold transition-colors ml-auto"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search + filter bar — attendance tab */}
        {activeTab === 'attendance' && (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <div className="flex-1 relative w-full">
                <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by company name..."
                  value={attSearch}
                  onChange={e => setAttSearch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200 shadow-2xs rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
                {attSearch && (
                  <button
                    type="button"
                    onClick={() => setAttSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <SelectDropdown
                icon={HiOutlineFilter}
                value={attFilterType}
                onChange={setAttFilterType}
                minWidth="190px"
                options={[
                  { value: '', label: 'All Training Types' },
                  ...TRAINING_TYPES.map(t => ({ value: t.value, label: `${t.value} – ${t.label}` })),
                ]}
              />
              <SelectDropdown
                icon={HiOutlineFilter}
                value={attFilterCompany}
                onChange={setAttFilterCompany}
                align="right"
                minWidth="190px"
                options={[
                  { value: '', label: 'All Airlines' },
                  ...attCompanyOptions.map(c => ({ value: c, label: c })),
                ]}
              />
            </div>
            {(attSearch || attFilterType || attFilterCompany) && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-400 font-medium mr-0.5">Active:</span>
                  {attSearch && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-200/60">
                      Search: "{attSearch}"
                      <button onClick={() => setAttSearch('')} className="hover:text-emerald-900"><HiOutlineX className="w-3 h-3" /></button>
                    </span>
                  )}
                  {attFilterType && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-200/60">
                      Type: {attFilterType}
                      <button onClick={() => setAttFilterType('')} className="hover:text-emerald-900"><HiOutlineX className="w-3 h-3" /></button>
                    </span>
                  )}
                  {attFilterCompany && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-200/60">
                      Airline: {attFilterCompany}
                      <button onClick={() => setAttFilterCompany('')} className="hover:text-emerald-900"><HiOutlineX className="w-3 h-3" /></button>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setAttSearch(''); setAttFilterType(''); setAttFilterCompany(''); }}
                  className="text-[11px] text-slate-500 hover:text-red-600 font-semibold transition-colors ml-auto"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tab Panels ── */}
      <AnimatePresence mode="wait">

        {/* PARTICIPANTS TABLE */}
        {activeTab === 'participants' && (
          <motion.div
            key="participants"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col"
          >
            <div
              className="overflow-x-auto max-h-[520px] overflow-y-auto"
              onWheel={e => {
                const el = e.currentTarget;
                const atTop = el.scrollTop === 0;
                const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                if (!(atTop && e.deltaY < 0) && !(atBottom && e.deltaY > 0)) e.stopPropagation();
              }}
            >
              <table className="w-full min-w-[760px] border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200/90 shadow-2xs">
                  <tr>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3 bg-slate-50">Participant Name</th>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell bg-slate-50">Company</th>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3 hidden md:table-cell bg-slate-50">Department</th>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3 bg-slate-50">Training</th>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell bg-slate-50">Date</th>
                    <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3 bg-slate-50">Email</th>
                    <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3 bg-slate-50">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-400">
                          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                          <span className="text-sm font-medium">Loading records…</span>
                        </div>
                      </td>
                    </tr>
                  ) : visibleRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400 font-medium">No records found.</td>
                    </tr>
                  ) : (
                    visibleRecords.map(record => (
                      <tr key={record.id} onClick={() => setDetailRecord(record)}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors">
                              <span className="text-[10px] font-bold text-slate-600">{initials(record.participant_name)}</span>
                            </div>
                            <span className="text-sm font-semibold text-slate-800 truncate max-w-[120px] sm:max-w-none">{record.participant_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-600 hidden sm:table-cell">{record.company}</td>
                        <td className="px-5 py-3.5 text-sm text-slate-600 hidden md:table-cell">{record.department}</td>
                        <td className="px-5 py-3.5">{typeBadge(record.training_type)}</td>
                        <td className="px-5 py-3.5 text-sm text-slate-600 hidden sm:table-cell font-medium">{fmtDate(record.training_date)}</td>
                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                          {bulkEmail ? (
                            <input
                              type="email"
                              value={emailDrafts[record.id || record._id] ?? (record.email || '')}
                              onChange={e => setEmailDraft(record.id || record._id, e.target.value)}
                              placeholder="candidate@email.com"
                              className="w-48 px-2.5 py-1 text-[11px] border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25"
                            />
                          ) : (
                            <EmailInlineEditor rec={record} />
                          )}
                        </td>
                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Link to={`/admin/participants/${record.id}/performance`}
                              className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 transition-all" title="Exam Performance">
                              <HiOutlineChartBar className="w-3.5 h-3.5" />
                            </Link>
                            <Link to={`/admin/participants/edit/${record.id}`}
                              className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-all" title="Edit">
                              <HiOutlinePencil className="w-3.5 h-3.5" />
                            </Link>
                            <button onClick={() => handleDelete(record.id, record.participant_name)}
                              className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-500 hover:text-red-600 transition-all" title="Delete">
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {visibleRecords.length > 0 && (
              <div className="px-6 py-3 bg-slate-50/70 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500">
                  Showing {visibleRecords.length} record{visibleRecords.length !== 1 ? 's' : ''}
                  {filterCompany && records.length !== visibleRecords.length ? ` of ${records.length}` : ''}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* ATTENDANCE RECORDS */}
        {activeTab === 'attendance' && (() => {
          const filtered = attendanceSheets.filter(s => {
            const name = (s.airline_name || s.company || '');
            const matchesSearch = !attSearch || name.toLowerCase().includes(attSearch.toLowerCase());
            const matchesType = !attFilterType || s.training_type === attFilterType;
            const matchesCompany = !attFilterCompany || name.trim() === attFilterCompany;
            return matchesSearch && matchesType && matchesCompany;
          });
          // Group sheets by airline for the accordion layout
          const attGroups = (() => {
            const map = new Map();
            filtered.forEach(s => {
              const name = ((s.airline_name || s.company || '').trim()) || 'Unknown';
              if (!map.has(name)) map.set(name, []);
              map.get(name).push(s);
            });
            for (const arr of map.values()) {
              arr.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
            }
            return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
          })();
          const attFiltering = !!(attSearch || attFilterType || attFilterCompany);
          return (
            <motion.div
              key="attendance"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden"
            >
              {filtered.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <HiOutlineClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 font-medium">
                    {attendanceSheets.length === 0 ? 'No attendance records found.' : 'No sheets match your search.'}
                  </p>
                  {attFiltering && (
                    <button
                      onClick={() => { setAttSearch(''); setAttFilterType(''); setAttFilterCompany(''); }}
                      className="mt-2 text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div
                  className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto"
                  onWheel={e => {
                    const el = e.currentTarget;
                    const atTop = el.scrollTop === 0;
                    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                    if (!(atTop && e.deltaY < 0) && !(atBottom && e.deltaY > 0)) e.stopPropagation();
                  }}
                >
                  {attGroups.map(([airlineName, sheets]) => {
                    const open = openAttGroups[airlineName] ?? attFiltering;
                    const totalParticipants = sheets.reduce((n, s) => n + (s.participants?.length ?? 0), 0);
                    return (
                      <div key={airlineName}>
                        <button
                          type="button"
                          onClick={() => setOpenAttGroups(prev => ({ ...prev, [airlineName]: !(prev[airlineName] ?? attFiltering) }))}
                          className="w-full flex items-center gap-2.5 px-5 py-3 bg-slate-50/70 hover:bg-slate-100/70 transition-colors text-left"
                        >
                          {open
                            ? <HiOutlineChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                            : <HiOutlineChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                          <span className="text-sm font-bold text-slate-800 truncate">{airlineName}</span>
                          <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5 flex-shrink-0">
                            {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-[11px] text-slate-400 flex-shrink-0 hidden sm:inline">
                            {totalParticipants} participant{totalParticipants !== 1 ? 's' : ''}
                          </span>
                        </button>
                        {open && sheets.map(sheet => (
                          <div key={sheet._id} className="flex items-center justify-between gap-3 pl-11 pr-5 py-3.5 border-t border-slate-100 hover:bg-slate-50/70 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-700">{sheet.airline_name || sheet.company}</span>
                                {typeBadge(sheet.training_type)}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 font-medium flex items-center gap-1.5">
                                <span>{sheet.start_date}{sheet.end_date && sheet.end_date !== sheet.start_date ? ` – ${sheet.end_date}` : ''}</span>
                                <span className="text-slate-300">•</span>
                                <span>{sheet.participants?.length ?? 0} participant{(sheet.participants?.length ?? 0) !== 1 ? 's' : ''}</span>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveSheet(sheet)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 border border-emerald-200/70 text-emerald-700 hover:bg-emerald-100 transition-colors flex-shrink-0 shadow-2xs"
                            >
                              <HiOutlineClipboardList className="w-3.5 h-3.5" />
                              View / Edit
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="px-6 py-3 bg-slate-50/70 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500">
                  {attFiltering ? `${filtered.length} of ${attendanceSheets.length}` : attendanceSheets.length} sheet{attendanceSheets.length !== 1 ? 's' : ''}
                  {attFiltering ? ' matched' : ' total'}
                </p>
              </div>
            </motion.div>
          );
        })()}

      </AnimatePresence>
      {ConfirmDialog}
    </motion.div>
  );
}


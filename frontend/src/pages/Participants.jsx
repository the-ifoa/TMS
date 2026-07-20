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
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { getParticipants, deleteParticipant, generateCertificateBlob, downloadIssuedCertificate, listAttendanceSheets, getAttendanceSheet, API_BASE } from '../api';
import AttendanceChecklistModal from '../components/AttendanceChecklistModal';
import { buildAttendanceMap, generateAttendancePdf } from '../utils/generateAttendancePdf';

const TRAINING_TYPES = [
  { value: 'FDI', label: 'Flight Dispatch Initial',      color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'FDR', label: 'Flight Dispatch Recurrent',    color: 'bg-violet-100 text-violet-700 border-violet-200'   },
  { value: 'FDA', label: 'Flight Dispatch Advanced',     color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'FTL', label: 'Flight Time Limitations',      color: 'bg-violet-100 text-violet-700 border-violet-200'   },
  { value: 'NDG', label: 'Dangerous Goods No-Carry',     color: 'bg-red-100 text-red-700 border-red-200'            },
  { value: 'HF',  label: 'Human Factors for OCC',        color: 'bg-amber-100 text-amber-700 border-amber-200'      },
  { value: 'GD',  label: 'Ground Operations',            color: 'bg-blue-100 text-blue-700 border-blue-200'         },
  { value: 'TCD', label: 'Training Competencies Dev.',   color: 'bg-sky-100 text-sky-700 border-sky-200'            },
];
const TYPE_MAP = Object.fromEntries(TRAINING_TYPES.map(t => [t.value, t]));

function typeBadge(type) {
  const t = TYPE_MAP[type] || { color: 'bg-primary-100 text-primary-600 border-primary-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${t.color}`}>
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

// ─── Collapsible group used in airline view ───────────────────────────────────

function SubmissionGroup({ groupKey, records, defaultOpen = false, focusId, attendanceSheets = [], onViewSheet }) {
  const [open, setOpen]             = useState(defaultOpen);
  const [downloading, setDownloading] = useState(null);
  const [preview, setPreview]       = useState(null);
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

  // Airlines always use /download/:id — read-only, cert_sequence must already exist
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

  return (
    <div className="card overflow-hidden">
      {/* Group header — click to collapse */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-4 transition-colors text-left"
        style={{ background: open ? '#f9fafb' : '#ffffff' }}
        onMouseEnter={e => e.currentTarget.style.background='#f3f4f6'}
        onMouseLeave={e => e.currentTarget.style.background=open ? '#f9fafb' : '#ffffff'}
      >
        <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Chevron */}
            <span className="text-primary-400 flex-shrink-0">
              {open
                ? <HiOutlineChevronDown className="w-4 h-4" />
                : <HiOutlineChevronRight className="w-4 h-4" />}
            </span>

            {/* Training type badge */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border truncate ${
              typeInfo.color || 'bg-primary-100 text-primary-600 border-primary-200'
            }`}>
              <HiOutlineAcademicCap className="w-3.5 h-3.5" />
              {first.training_type} — {typeInfo.label || first.training_type}
            </span>
          </div>

          {/* Mobile count pill */}
          <span className="inline-flex sm:hidden items-center gap-1 px-2 py-0.5 rounded-full bg-primary-200 text-primary-600 text-[10px] font-semibold flex-shrink-0">
            <HiOutlineUsers className="w-3 h-3" />
            {records.length}
          </span>
        </div>

        {/* Metadata info */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 flex-1 min-w-0 pl-6 sm:pl-0">
          {/* Date range */}
          <span className="text-xs text-primary-500 flex-shrink-0">
            {fmtDate(first.training_date)}
            {first.end_date && first.end_date !== first.training_date ? ` – ${fmtDate(first.end_date)}` : ''}
          </span>

          {/* Submitted timestamp */}
          {first.created_at && (
            <span className="text-[10px] text-primary-400 hidden sm:block flex-shrink-0">
              Submitted {new Date(first.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}

          {/* Desktop count pill */}
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-200 text-primary-600 text-[11px] font-semibold flex-shrink-0">
            <HiOutlineUsers className="w-3 h-3" />
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
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {/* Shared details bar — location & modules are batch-level */}
            {(first.location || first.modules) && (
              <div className="px-5 py-2.5 bg-white border-b border-primary-100 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-primary-500">
                {first.location && <span><span className="font-medium text-primary-700">Location:</span> {first.location}</span>}
                {first.modules  && <span><span className="font-medium text-primary-700">Modules:</span> {first.modules}</span>}
              </div>
            )}

            {/* Attendance sheets for this group */}
            {attendanceSheets.length > 0 && (
              <div className="px-5 py-3 bg-emerald-50/60 border-b border-emerald-100">
                <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block mb-2">Attendance</span>
                <div className="flex flex-wrap gap-2">
                  {attendanceSheets.map(sheet => (
                    <div key={sheet._id} className="flex items-center gap-1.5 bg-white border border-emerald-200 rounded-lg px-3 py-1.5">
                      <HiOutlineClipboardList className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span className="text-[11px] text-emerald-800 font-medium">
                        {sheet.start_date}{sheet.end_date && sheet.end_date !== sheet.start_date ? ` – ${sheet.end_date}` : ''}
                        <span className="text-emerald-500 ml-1">· {sheet.participants?.length ?? 0} participants</span>
                      </span>
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          type="button"
                          onClick={() => handlePreviewPdf(sheet)}
                          disabled={previewingSheet === sheet._id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-primary-50 border border-primary-200 text-primary-600 hover:bg-primary-100 transition-colors disabled:opacity-50"
                        >
                          {previewingSheet === sheet._id
                            ? <div className="w-2.5 h-2.5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                            : <HiOutlineDocumentText className="w-3 h-3" />}
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => onViewSheet(sheet)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <HiOutlineEye className="w-3 h-3" />
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Participant rows */}
            <div className="divide-y divide-primary-100">
              {records.map((rec, i) => (
                <div key={rec.id || rec._id}
                  ref={el => { rowRefs.current[String(rec.id || rec._id)] = el; }}
                  onClick={() => setDetailRecord(rec)}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-primary-50/60 transition-colors justify-between flex-wrap sm:flex-nowrap cursor-pointer">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Number */}
                    <span className="w-5 text-[11px] font-semibold text-primary-400 flex-shrink-0">{i + 1}</span>

                    {/* Avatar + Name */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-primary-600">{initials(rec.participant_name)}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-primary-800 truncate block">{rec.participant_name}</span>
                        <span className="text-[10px] text-primary-400">
                          {rec.department && <>{rec.department} &middot; </>}
                          {fmtDate(rec.training_date)}
                          {rec.end_date && <> → {fmtDate(rec.end_date)}</>}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                    {rec.cert_released ? (
                      // cert_released = true means admin has explicitly released this certificate
                      <>
                        <button
                          onClick={() => setPreview(rec)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                          style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#0000ff' }}
                        >
                          <HiOutlineEye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Preview</span>
                        </button>
                        <button
                          onClick={() => handleDownload(rec)}
                          disabled={downloading === (rec.id || rec._id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 transition-colors"
                        >
                          {downloading === (rec.id || rec._id) ? (
                            <div className="w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                          ) : (
                            <HiOutlineDocumentDownload className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">PDF</span>
                        </button>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200"><HiOutlineClock className="w-3 h-3" /> Pending</span>
                    )}

                    {/* Locked badge */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#0000ff' }}>
                      🔒 Locked
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
                className="fixed -inset-20 z-50 bg-black/50 backdrop-blur-sm pointer-events-none"
              />
              <div
                key="layout"
                className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
                onClick={() => setPreview(null)}
              >
                <motion.div
                  key="card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-primary-200">
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-bold text-primary-800 truncate">Certificate — {preview.participant_name}</p>
                    <p className="text-xs text-primary-400 mt-0.5">{preview.training_type}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDownload(preview)}
                      disabled={downloading === pid}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-800 text-white text-xs font-semibold hover:bg-primary-900 disabled:opacity-60 transition-colors"
                    >
                      {downloading === pid
                        ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <HiOutlineDocumentDownload className="w-4 h-4" />}
                      {downloading === pid ? 'Downloading…' : 'Download PDF'}
                    </button>
                    <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400">
                      <HiOutlineX className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="bg-primary-50 relative" style={{ height: '65vh' }}>
                  <iframe src={src} title="Certificate Preview" className="w-full h-full border-0" />
                  <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-1.5 text-[10px] text-primary-400">
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
        className="fixed -inset-20 z-50 bg-black/50 backdrop-blur-sm pointer-events-none"
      />
      <div
        key="layout"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-4 px-5 py-4 border-b border-primary-100">
            <div className="w-11 h-11 rounded-full bg-primary-200 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary-600">{initials(record.participant_name)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-primary-800 truncate">{record.participant_name}</h2>
              <p className="text-xs text-primary-400 mt-0.5">{record.company} · {record.department}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400 flex-shrink-0">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          {/* Details */}
          <div className="px-5 py-4 space-y-1 max-h-[60vh] overflow-y-auto">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-primary-50 last:border-0">
                <span className="text-xs font-semibold text-primary-400 uppercase tracking-wide flex-shrink-0 w-28">{label}</span>
                <span className="text-sm text-primary-800 text-right break-words max-w-[200px]">{value}</span>
              </div>
            ))}
          </div>
          {/* Footer */}
          <div className="px-5 py-3 bg-primary-50/50 border-t border-primary-100 flex justify-end">
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
  const [sortKey, setSortKey]       = useState('submitted_desc');
  const [loading, setLoading]       = useState(true);

  const fetchRecords = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => { fetchRecords(); }, [filterType, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete record for "${name}"?`)) return;
    try {
      await deleteParticipant(id);
      toast.success('Record deleted');
      fetchRecords();
    } catch {
      toast.error('Failed to delete');
    }
  };

  // ── Group by training_type + training_date — one group per submission batch
  const groups = useMemo(() => {
    if (isAdmin) return null;
    const map = {};
    records.forEach(r => {
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
  }, [records, isAdmin, sortKey]);

  const [detailRecord, setDetailRecord] = useState(null);

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
            company={activeSheet.company}
            trainingType={activeSheet.training_type}
            attendanceId={activeSheet._id}
            readOnly={activeSheet.readOnly}
            onClose={() => setActiveSheet(null)}
          />
        )}
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-primary-800">My Submissions</h1>
            <p className="text-sm text-primary-400 mt-1">Your training enrollment records, grouped by training batch</p>
          </div>
          <Link to="/airline/enrollment/new" className="btn-primary flex items-center gap-2 whitespace-nowrap">
            <HiOutlinePlusCircle className="w-4 h-4" />
            New Enrollment
          </Link>
        </div>

        {/* Search + filter + sort */}
        <div className="card p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <input
                type="text"
                placeholder="Search by name or department…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            <div className="relative">
              <HiOutlineFilter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="input-field pl-10 pr-8 appearance-none cursor-pointer min-w-[180px]"
              >
                <option value="">All Training Types</option>
                {TRAINING_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.value} – {t.label}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <HiOutlineSelector className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value)}
                className="input-field pl-10 pr-8 appearance-none cursor-pointer min-w-[210px]"
              >
                <optgroup label="Submission Date">
                  <option value="submitted_desc">Submitted: Newest First</option>
                  <option value="submitted_asc">Submitted: Oldest First</option>
                </optgroup>
                <optgroup label="Training Start Date">
                  <option value="start_desc">Start Date: Newest First</option>
                  <option value="start_asc">Start Date: Oldest First</option>
                </optgroup>
                <optgroup label="Training End Date">
                  <option value="end_desc">End Date: Newest First</option>
                  <option value="end_asc">End Date: Oldest First</option>
                </optgroup>
                <optgroup label="Training Type">
                  <option value="type_asc">Training Type: A → Z</option>
                  <option value="type_desc">Training Type: Z → A</option>
                </optgroup>
                <optgroup label="Participants">
                  <option value="count_desc">Most Participants First</option>
                  <option value="count_asc">Fewest Participants First</option>
                </optgroup>
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-primary-400">
            <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            <span className="text-sm">Loading submissions…</span>
          </div>
        ) : groups && groups.length === 0 ? (
          <div className="card p-12 text-center text-sm text-primary-400">No submissions found.</div>
        ) : (
          <div className="space-y-3">
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
                  defaultOpen={focusId ? recs.some(r => String(r.id || r._id) === focusId) : false}
                  focusId={focusId}
                  attendanceSheets={groupSheets}
                  onViewSheet={sheet => setActiveSheet({ ...sheet, readOnly: true })}
                />
              );
            })}
          </div>
        )}

        {/* Footer count */}
        {!loading && records.length > 0 && (
          <p className="text-xs text-primary-400 text-right">
            {records.length} total record{records.length !== 1 ? 's' : ''} across {groups?.length} submission{groups?.length !== 1 ? 's' : ''}
          </p>
        )}
      </motion.div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN VIEW — flat table
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <ParticipantModal record={detailRecord} onClose={() => setDetailRecord(null)} />
      {activeSheet && (
        <AttendanceChecklistModal
          participants={activeSheet.participants || []}
          startDate={activeSheet.start_date}
          endDate={activeSheet.end_date}
          company={activeSheet.company}
          trainingType={activeSheet.training_type}
          attendanceId={activeSheet._id}
          readOnly={false}
          onClose={() => setActiveSheet(null)}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary-800">Participants</h1>
          <p className="text-sm text-primary-400 mt-1">Manage training participant records</p>
        </div>
        <Link to="/admin/participants/add" className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <HiOutlinePlusCircle className="w-4 h-4" />
          Add Participant
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <input
              type="text"
              placeholder="Search by name, company, or department..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <div className="relative">
            <HiOutlineFilter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="input-field pl-10 pr-8 appearance-none cursor-pointer min-w-[180px]"
            >
              <option value="">All Training Types</option>
              {TRAINING_TYPES.map(t => <option key={t.value} value={t.value}>{t.value} – {t.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Attendance Records (admin) ── */}
      {attendanceSheets.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-primary-100 flex items-center gap-2">
            <HiOutlineClipboardList className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-primary-700">Attendance Records</h2>
            <span className="text-[11px] text-primary-400 ml-1">{attendanceSheets.length} sheet{attendanceSheets.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-primary-50">
            {attendanceSheets.map(sheet => (
              <div key={sheet._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 hover:bg-emerald-50/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-primary-800">{sheet.company}</span>
                    {typeBadge(sheet.training_type)}
                  </div>
                  <p className="text-xs text-primary-400 mt-1">
                    {sheet.start_date}{sheet.end_date && sheet.end_date !== sheet.start_date ? ` – ${sheet.end_date}` : ''}
                    {' · '}{sheet.participants?.length ?? 0} participant{(sheet.participants?.length ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSheet(sheet)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors w-full sm:w-auto"
                >
                  <HiOutlineClipboardList className="w-3.5 h-3.5" />
                  View / Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="bg-primary-50 border-b border-primary-200">
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 sm:px-6 py-3">Participant Name</th>
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 sm:px-6 py-3 hidden sm:table-cell">Company</th>
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 sm:px-6 py-3 hidden md:table-cell">Department</th>
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 sm:px-6 py-3">Training</th>
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 sm:px-6 py-3 hidden sm:table-cell">Date</th>
                <th className="text-right text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 sm:px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-primary-400">
                    <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                    <span className="text-sm">Loading records…</span>
                  </div>
                </td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-primary-400">No records found.</td></tr>
              ) : (
                records.map(record => (
                  <tr key={record.id}
                    onClick={() => setDetailRecord(record)}
                    className="border-b border-primary-100 last:border-0 hover:bg-primary-50/50 transition-colors cursor-pointer">
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary-600">{initials(record.participant_name)}</span>
                        </div>
                        <span className="text-sm font-medium text-primary-800 truncate max-w-[100px] sm:max-w-none">{record.participant_name}</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-primary-600 hidden sm:table-cell">{record.company}</td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-primary-600 hidden md:table-cell">{record.department}</td>
                    <td className="px-4 sm:px-6 py-4">{typeBadge(record.training_type)}</td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-primary-500 hidden sm:table-cell">{fmtDate(record.training_date)}</td>
                    <td className="px-4 sm:px-6 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/admin/participants/edit/${record.id}`}
                          className="p-1.5 rounded-lg hover:bg-primary-100 transition-colors text-primary-400 hover:text-primary-600" title="Edit">
                          <HiOutlinePencil className="w-4 h-4" />
                        </Link>
                        <button onClick={() => handleDelete(record.id, record.participant_name)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-primary-400 hover:text-red-500" title="Delete">
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {records.length > 0 && (
          <div className="px-6 py-3 bg-primary-50/50 border-t border-primary-200">
            <p className="text-xs text-primary-400">Showing {records.length} record{records.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

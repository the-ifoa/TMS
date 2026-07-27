import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineClipboardCheck,
  HiOutlineCalendar,
  HiOutlineUsers,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlinePencilAlt,
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineDocumentText,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { listAttendanceSheets, getAttendanceSheet, getContractAirlines } from '../api';
import AttendanceChecklistModal from '../components/AttendanceChecklistModal';
import { buildAttendanceMap, generateAttendancePdf } from '../utils/generateAttendancePdf';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { airlineInitials } from '../components/AirlineLogo';

const TRAINING_TYPES = [
  { value: 'FDI', label: 'Flight Dispatch Initial',    color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'FDR', label: 'Flight Dispatch Recurrent',  color: 'bg-violet-50 text-violet-700 border-violet-200'   },
  { value: 'FDA', label: 'Flight Dispatch Advanced',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'FTL', label: 'Flight Time Limitations',    color: 'bg-violet-50 text-violet-700 border-violet-200'   },
  { value: 'NDG', label: 'Dangerous Goods No-Carry',   color: 'bg-rose-50 text-rose-700 border-rose-200'         },
  { value: 'HF',  label: 'Human Factors for OCC',      color: 'bg-amber-50 text-amber-700 border-amber-200'      },
  { value: 'GD',  label: 'Ground Operations',          color: 'bg-blue-50 text-blue-700 border-blue-200'         },
  { value: 'TCD', label: 'Training Competencies Dev.', color: 'bg-sky-50 text-sky-700 border-sky-200'            },
];
const TYPE_MAP = Object.fromEntries(TRAINING_TYPES.map(t => [t.value, t]));

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function SheetCard({ sheet, onEdit, onPreview, previewing, forceOpen }) {
  const [open, setOpen] = useState(false);
  const isOpen = Boolean(open || forceOpen);
  const typeInfo = TYPE_MAP[sheet.training_type] || {};
  const parts    = sheet.participants || [];
  const isLoading = previewing === sheet._id;

  return (
    <div className={`bg-white rounded-xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-shadow${isOpen ? ' overflow-x-hidden overflow-y-auto max-h-[480px]' : ' overflow-hidden'}`}>

      {/* ── Header ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
        className={`flex items-center gap-3 px-4 sm:px-5 py-3.5 cursor-pointer select-none transition-colors ${isOpen ? 'sticky top-0 z-10 bg-slate-100/90 border-b border-slate-200/80 shadow-2xs' : 'bg-white hover:bg-slate-50'}`}
      >
        {/* Chevron */}
        <span className="flex-shrink-0 text-slate-400">
          {isOpen ? <HiOutlineChevronDown className="w-4 h-4" /> : <HiOutlineChevronRight className="w-4 h-4" />}
        </span>

        {/* Badge + meta stacked */}
        <div className="flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${typeInfo.color || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
            {sheet.training_type} — {typeInfo.label || sheet.training_type}
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
              <HiOutlineCalendar className="w-3 h-3 flex-shrink-0 text-slate-400" />
              {fmtDate(sheet.start_date)}{sheet.end_date && sheet.end_date !== sheet.start_date ? ` – ${fmtDate(sheet.end_date)}` : ''}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
              <HiOutlineUsers className="w-3 h-3 flex-shrink-0 text-slate-400" />
              {parts.length} participant{parts.length !== 1 ? 's' : ''}
            </span>
            {sheet.created_at && (
              <span className="hidden lg:block text-[10px] text-slate-400">
                Submitted {fmtDateTime(sheet.created_at)}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {/* Mobile: icon only */}
          <button type="button" onClick={() => onPreview(sheet)} disabled={isLoading} title="Preview PDF"
            className="sm:hidden p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50">
            {isLoading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" /> : <HiOutlineDocumentText className="w-4 h-4" />}
          </button>
          <button type="button" onClick={() => onEdit(sheet)} title="Edit"
            className="sm:hidden p-2 rounded-lg bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 transition-colors">
            <HiOutlinePencilAlt className="w-4 h-4" />
          </button>
          {/* Desktop: labeled */}
          <button type="button" onClick={() => onPreview(sheet)} disabled={isLoading}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-2xs">
            {isLoading ? <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" /> : <HiOutlineDocumentText className="w-3.5 h-3.5 text-slate-500" />}
            Preview PDF
          </button>
          <button type="button" onClick={() => onEdit(sheet)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-2xs">
            <HiOutlinePencilAlt className="w-3.5 h-3.5" /> Edit
          </button>
        </div>
      </div>

      {/* ── Expandable body ── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div key="body"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ height: { duration: 0.2, ease: 'easeOut' }, opacity: { duration: 0.15 } }}>
            <div className="border-t border-slate-100">
              {/* Meta grid */}
              <div className="px-4 sm:px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50/50 border-b border-slate-100">
                {[
                  ['Airline', sheet.company || '—'],
                  ['Training Type', null],
                  ['Training Period', `${fmtDate(sheet.start_date)}${sheet.end_date && sheet.end_date !== sheet.start_date ? ` – ${fmtDate(sheet.end_date)}` : ''}`],
                  ['Date Submitted', fmtDateTime(sheet.created_at)],
                ].map(([label, val], i) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    {i === 1
                      ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${typeInfo.color || 'bg-slate-100 text-slate-700 border-slate-200'}`}>{sheet.training_type}</span>
                      : <p className="text-xs sm:text-sm font-semibold text-slate-800">{val}</p>}
                  </div>
                ))}
              </div>
              {/* Participants */}
              <div>
                <div className="px-4 sm:px-5 py-2 border-b border-slate-100 bg-white">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Participants ({parts.length})</p>
                </div>
                {parts.length > 0 ? (
                  <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    {parts.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-slate-50 transition-colors">
                        <span className="w-5 text-[11px] font-bold text-slate-400 flex-shrink-0 text-right">{i + 1}</span>
                        <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-slate-700">
                            {((p.first_name?.[0] || '') + (p.last_name?.[0] || '')).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs sm:text-sm text-slate-800 font-semibold truncate">{p.first_name} {p.last_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 sm:px-5 py-4 text-xs text-slate-400 italic">No participant data stored.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Airline group section ──────────────────────────────────────────────────────
function AirlineGroup({ airlineName, logoUrl, sheets, onEdit, onPreview, previewing, forceOpen }) {
  const [collapsed, setCollapsed] = useState(false);
  const isOpen = Boolean(!collapsed || forceOpen);

  return (
    <div className="rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden bg-white">
      {/* Group header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center gap-3 px-5 py-4 transition-colors text-left ${isOpen ? 'bg-slate-100/90 border-b border-slate-200/80' : 'bg-white hover:bg-slate-50'}`}
      >
        <LogoAvatar logoUrl={logoUrl} name={airlineName} initials={airlineInitials(airlineName)} size="w-9 h-9" textSize="text-xs" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{airlineName}</p>
          <p className="text-xs font-medium text-slate-500">
            {sheets.length} attendance record{sheets.length !== 1 ? 's' : ''}
          </p>
        </div>

        <span className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          <HiOutlineChevronDown className="w-4 h-4 text-slate-400" />
        </span>
      </button>

      {/* Sheets under this airline */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
              {sheets.map(sheet => (
                <SheetCard
                  key={sheet._id}
                  sheet={sheet}
                  onEdit={onEdit}
                  onPreview={onPreview}
                  previewing={previewing}
                  forceOpen={forceOpen}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AttendanceSheets() {
  const [sheets, setSheets]           = useState([]);
  const [airlineMap, setAirlineMap]   = useState({});  // name → { logoUrl }
  const [loading, setLoading]         = useState(true);
  const [activeSheet, setActiveSheet] = useState(null);
  const [previewing, setPreviewing]   = useState(null);
  const [search, setSearch]           = useState('');
  const [filterType, setFilterType]   = useState('');

  const fetchSheets = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType) params.training_type = filterType;
      const res = await listAttendanceSheets(params);
      setSheets(res.data || []);
    } catch {
      toast.error('Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getContractAirlines()
      .then(res => {
        const map = {};
        (res.data || []).forEach(a => {
          map[a.airlineName] = { logoUrl: a.logoUrl || null };
        });
        setAirlineMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchSheets(); }, [filterType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreview = async (sheet) => {
    try {
      setPreviewing(sheet._id);
      const res = await getAttendanceSheet(sheet._id);
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
      setPreviewing(null);
    }
  };

  const filtered = sheets.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.company || '').toLowerCase().includes(q) ||
      (s.training_type || '').toLowerCase().includes(q) ||
      (s.participants || []).some(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
      )
    );
  });

  const groups = filtered.reduce((acc, sheet) => {
    const key = sheet.company || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(sheet);
    return acc;
  }, {});
  const sortedGroups = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="w-full space-y-4">
      {activeSheet && (
        <AttendanceChecklistModal
          participants={activeSheet.participants || []}
          startDate={activeSheet.start_date}
          endDate={activeSheet.end_date}
          company={activeSheet.company}
          trainingType={activeSheet.training_type}
          attendanceId={activeSheet._id}
          readOnly={false}
          onClose={() => { setActiveSheet(null); fetchSheets(); }}
        />
      )}

      {/* Header Card (Full Width Edge-to-Edge) */}
      <div className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight truncate">Attendance Records</h1>
            <span className="hidden xs:inline-block px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] sm:text-[11px] font-bold text-slate-700 flex-shrink-0">
              Overview
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 hidden sm:block mt-0.5">
            View and edit attendance sheets submitted by contract airlines
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] sm:text-xs font-bold text-slate-700 shadow-2xs">
            {sortedGroups.length} airline{sortedGroups.length !== 1 ? 's' : ''}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] sm:text-xs font-bold shadow-2xs">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Sticky Search & Filter Bar */}
      <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-2.5 border-b border-slate-200/60 shadow-2xs transition-all">
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs space-y-2.5 sm:space-y-0">
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="flex-1 relative w-full">
              <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by airline, training type, or participant name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 shadow-2xs rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
              />
            </div>
            <div className="relative w-full sm:w-auto">
              <HiOutlineFilter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
              <Select value={filterType || 'all'} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-64 pl-10 font-semibold text-slate-700 text-xs sm:text-sm py-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Training Types</SelectItem>
                  {TRAINING_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.value} – {t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-4">

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading attendance records…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-sm font-medium text-slate-500 shadow-2xs">
            {sheets.length === 0 ? 'No attendance records submitted yet.' : 'No records match your search.'}
          </div>
        ) : (
          <div className="space-y-5">
            {sortedGroups.map(([airlineName, airlineSheets]) => (
              <AirlineGroup
                key={airlineName}
                airlineName={airlineName}
                logoUrl={airlineMap[airlineName]?.logoUrl || null}
                sheets={airlineSheets}
                forceOpen={Boolean(search.trim() || filterType)}
                onEdit={setActiveSheet}
                onPreview={handlePreview}
                previewing={previewing}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

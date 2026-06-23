import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineClipboardCheck,
  HiOutlineOfficeBuilding,
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

const TRAINING_TYPES = [
  { value: 'FDI', label: 'Flight Dispatch Initial',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'FDR', label: 'Flight Dispatch Recurrent',  color: 'bg-violet-100 text-violet-700 border-violet-200'   },
  { value: 'FDA', label: 'Flight Dispatch Advanced',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'FTL', label: 'Flight Time Limitations',    color: 'bg-violet-100 text-violet-700 border-violet-200'   },
  { value: 'NDG', label: 'Dangerous Goods No-Carry',   color: 'bg-red-100 text-red-700 border-red-200'            },
  { value: 'HF',  label: 'Human Factors for OCC',      color: 'bg-amber-100 text-amber-700 border-amber-200'      },
  { value: 'GD',  label: 'Ground Operations',          color: 'bg-blue-100 text-blue-700 border-blue-200'         },
  { value: 'TCD', label: 'Training Competencies Dev.', color: 'bg-sky-100 text-sky-700 border-sky-200'            },
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

function SheetCard({ sheet, onEdit, onPreview, previewing }) {
  const [open, setOpen] = useState(false);
  const typeInfo = TYPE_MAP[sheet.training_type] || {};
  const parts    = sheet.participants || [];

  return (
    <div className="bg-white rounded-xl border border-primary-150 shadow-sm overflow-hidden hover:shadow-md transition-shadow">

      {/* Clickable header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
        style={{ background: open ? '#f0f5ff' : '#fafbff' }}
      >
        <span className="text-primary-400 flex-shrink-0 transition-transform duration-200">
          {open
            ? <HiOutlineChevronDown className="w-4 h-4 text-primary-500" />
            : <HiOutlineChevronRight className="w-4 h-4" />}
        </span>

        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border flex-shrink-0 ${
          typeInfo.color || 'bg-primary-100 text-primary-600 border-primary-200'
        }`}>
          {sheet.training_type} — {typeInfo.label || sheet.training_type}
        </span>

        <span className="flex items-center gap-1 text-xs text-primary-500 flex-shrink-0">
          <HiOutlineCalendar className="w-3.5 h-3.5" />
          {fmtDate(sheet.start_date)}
          {sheet.end_date && sheet.end_date !== sheet.start_date ? ` – ${fmtDate(sheet.end_date)}` : ''}
        </span>

        <span className="flex items-center gap-1 text-xs text-primary-400 flex-shrink-0">
          <HiOutlineUsers className="w-3.5 h-3.5" />
          {parts.length} participant{parts.length !== 1 ? 's' : ''}
        </span>

        <span className="flex-1" />

        <span className="text-[10px] text-primary-400 hidden lg:block flex-shrink-0">
          {sheet.created_at ? `Submitted ${fmtDateTime(sheet.created_at)}` : ''}
        </span>

        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onPreview(sheet)}
            disabled={previewing === sheet._id}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 border border-primary-200 text-primary-600 hover:bg-primary-100 transition-colors disabled:opacity-50"
          >
            {previewing === sheet._id
              ? <div className="w-3 h-3 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
              : <HiOutlineDocumentText className="w-3.5 h-3.5" />}
            Preview PDF
          </button>
          <button
            type="button"
            onClick={() => onEdit(sheet)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-50 border border-accent-200 text-accent-700 hover:bg-accent-100 hover:border-accent-400 transition-colors"
          >
            <HiOutlinePencilAlt className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>
      </div>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-primary-100">
              <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-primary-50/40 text-xs border-b border-primary-100">
                <div>
                  <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider mb-1">Airline</p>
                  <p className="text-sm font-semibold text-primary-800">{sheet.company || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider mb-1">Training Type</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                    typeInfo.color || 'bg-primary-100 text-primary-600 border-primary-200'
                  }`}>{sheet.training_type}</span>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider mb-1">Training Period</p>
                  <p className="text-sm text-primary-700">
                    {fmtDate(sheet.start_date)}
                    {sheet.end_date && sheet.end_date !== sheet.start_date ? ` – ${fmtDate(sheet.end_date)}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider mb-1">Date Submitted</p>
                  <p className="text-sm text-primary-700">{fmtDateTime(sheet.created_at)}</p>
                </div>
              </div>

              <div>
                <div className="px-5 py-2 border-b border-primary-100 bg-white">
                  <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider">
                    Participants ({parts.length})
                  </p>
                </div>
                {parts.length > 0 ? (
                  <div className="divide-y divide-primary-50 max-h-56 overflow-y-auto">
                    {parts.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-primary-50/40 transition-colors">
                        <span className="w-5 text-[11px] font-semibold text-primary-300 flex-shrink-0 text-right">{i + 1}</span>
                        <div className="w-7 h-7 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-primary-600">
                            {((p.first_name?.[0] || '') + (p.last_name?.[0] || '')).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm text-primary-800 font-medium">{p.first_name} {p.last_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-5 py-4 text-sm text-primary-400 italic">No participant data stored.</p>
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
function AirlineGroup({ airlineName, logoUrl, sheets, onEdit, onPreview, previewing }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="space-y-2">
      {/* Group header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-primary-150 shadow-sm hover:bg-primary-50/60 transition-colors text-left"
      >
        {/* Logo or fallback */}
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary-100 border border-primary-200 flex items-center justify-center overflow-hidden">
          {logoUrl
            ? <img src={logoUrl} alt={airlineName} className="w-full h-full object-contain p-0.5" />
            : <HiOutlineOfficeBuilding className="w-5 h-5 text-primary-500" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-primary-800 truncate">{airlineName}</p>
          <p className="text-[11px] text-primary-400">
            {sheets.length} attendance record{sheets.length !== 1 ? 's' : ''}
          </p>
        </div>

        <span className={`flex-shrink-0 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}>
          <HiOutlineChevronDown className="w-4 h-4 text-primary-400" />
        </span>
      </button>

      {/* Sheets under this airline */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="pl-4 space-y-2">
              {sheets.map(sheet => (
                <SheetCard
                  key={sheet._id}
                  sheet={sheet}
                  onEdit={onEdit}
                  onPreview={onPreview}
                  previewing={previewing}
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

  // Fetch airlines once to get logos — match by airlineName
  useEffect(() => {
    getContractAirlines()
      .then(res => {
        const map = {};
        (res.data || []).forEach(a => {
          map[a.airlineName] = { logoUrl: a.logoUrl || null };
        });
        setAirlineMap(map);
      })
      .catch(() => {}); // logo fetch failure is non-critical
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

  // Group by airline name, sorted alphabetically
  const groups = filtered.reduce((acc, sheet) => {
    const key = sheet.company || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(sheet);
    return acc;
  }, {});
  const sortedGroups = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

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
          readOnly={false}
          onClose={() => { setActiveSheet(null); fetchSheets(); }}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary-800 flex items-center gap-2">
            <HiOutlineClipboardCheck className="w-6 h-6 text-accent-500" />
            Attendance Records
          </h1>
          <p className="text-sm text-primary-400 mt-0.5">
            View and edit attendance sheets submitted by airlines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-primary-500 bg-primary-100 px-3 py-1.5 rounded-lg font-medium">
            {sortedGroups.length} airline{sortedGroups.length !== 1 ? 's' : ''}
          </span>
          <span className="text-sm text-primary-500 bg-primary-100 px-3 py-1.5 rounded-lg font-medium">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Search + filter */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <input
              type="text"
              placeholder="Search by airline, training type, or participant name…"
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
              className="input-field pl-10 pr-8 appearance-none cursor-pointer min-w-[200px]"
            >
              <option value="">All Training Types</option>
              {TRAINING_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.value} – {t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-primary-400">
          <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
          <span className="text-sm">Loading attendance records…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-sm text-primary-400">
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
              onEdit={setActiveSheet}
              onPreview={handlePreview}
              previewing={previewing}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

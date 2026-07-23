import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineDocumentDownload,
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineEye,
  HiOutlineShieldCheck,
  HiOutlineCheckCircle,
  HiOutlineLockClosed,
  HiOutlineClock,
  HiOutlineX,
  HiOutlineDocumentText,
  HiOutlineTrash,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import {
  getParticipants,
  generateCertificateBlob,
  generateCertificateWithModules,
  revokeCertificateById,
  API_BASE,
} from '../api';
import { useAuth } from '../context/AuthContext';
import ModuleSelector from '../components/ModuleSelector';
import { useConfirm } from '@/hooks/use-confirm';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

const TRAINING_TYPES = [
  { value: 'FDI', label: 'FDI – Flight Dispatch Initial' },
  { value: 'FDR', label: 'FDR – Flight Dispatch Recurrent' },
  { value: 'FDA', label: 'FDA – Flight Dispatch Advanced' },
  { value: 'FTL', label: 'FTL – Flight Time Limitations' },
  { value: 'NDG', label: 'NDG – Dangerous Goods No-Carry' },
  { value: 'HF',  label: 'HF – Human Factors for OCC' },
  { value: 'GD',  label: 'GD – Ground Operations' },
  { value: 'TCD', label: 'TCD – Training Competencies Development' },
];

function trainingBadgeClass(type) {
  if (['FDI', 'FDA'].includes(type)) return 'bg-emerald-100 text-emerald-700';
  if (['FDR', 'FTL'].includes(type)) return 'bg-violet-100 text-violet-700';
  if (type === 'HF')  return 'bg-amber-100 text-amber-700';
  if (type === 'NDG') return 'bg-red-100 text-red-700';
  return 'bg-blue-100 text-blue-700';
}

// ─── Result modal: shown after a certificate has been generated ───────────────
function CertResultModal({ results, onClose }) {
  if (!results || results.length === 0) return null;

  const handleDownload = (item) => {
    const link = document.createElement('a');
    link.href = item.blobUrl;
    link.download = item.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = (item) => {
    window.open(item.blobUrl, '_blank');
  };

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed -inset-20 z-50 bg-black/40 backdrop-blur-sm pointer-events-none"
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
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-primary-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                <HiOutlineCheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-primary-800">Certificates Generated</h2>
                <p className="text-xs text-primary-400">{results.length} certificate{results.length !== 1 ? 's' : ''} ready</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400 hover:text-primary-600 transition-colors"
            >
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>

          {/* Certificate list */}
          <div className="divide-y divide-primary-100 max-h-[60vh] overflow-y-auto">
            {results.map((item) => (
              <div key={item.id} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <HiOutlineDocumentText className="w-4 h-4 sm:w-5 sm:h-5 text-primary-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary-800 truncate">{item.name}</p>
                  <p className="text-[11px] text-primary-400 mt-0.5">{item.trainingType} &bull; {item.certId}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handlePreview(item)}
                    className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg border border-primary-200 hover:bg-primary-50 text-xs font-medium text-primary-600 transition-colors"
                  >
                    <HiOutlineEye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                  <button
                    onClick={() => handleDownload(item)}
                    className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg bg-primary-700 hover:bg-primary-800 text-xs font-medium text-white transition-colors"
                  >
                    <HiOutlineDocumentDownload className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-primary-50/50 border-t border-primary-100 flex justify-end">
            <button onClick={onClose} className="btn-primary text-sm">
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default function Certificates() {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus') || null;
  const rowRefs = useRef({});

  const [records, setRecords]         = useState([]);
  const [search, setSearch]           = useState('');
  const [filterType, setFilterType]   = useState('');
  const [sortBy, setSortBy]           = useState('creation'); // 'creation' | 'name' | 'training_date'
  const [sortDir, setSortDir]         = useState('asc'); // 'asc' | 'desc'
  const [loading, setLoading]         = useState(true);
  const [moduleModal, setModuleModal] = useState({ open: false, record: null });
  const [selected, setSelected]         = useState(new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  // certResults: array of { id, name, trainingType, certId, blobUrl, filename }
  const [certResults, setCertResults]   = useState(null);
  // Per-row preview + download (only for already-issued certs)
  const [rowPreview, setRowPreview]     = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (filterType) params.training_type = filterType;
      const res = await getParticipants(params);
      
      // Sort records based on sortBy and sortDir
      let sorted = [...res.data];
      sorted.sort((a, b) => {
        let aVal, bVal;
        
        if (sortBy === 'creation') {
          aVal = a.created_at ? new Date(a.created_at).getTime() : Infinity;
          bVal = b.created_at ? new Date(b.created_at).getTime() : Infinity;
        } else if (sortBy === 'name') {
          aVal = (a.participant_name || '').toLowerCase();
          bVal = (b.participant_name || '').toLowerCase();
        } else if (sortBy === 'training_date') {
          aVal = a.training_date ? new Date(a.training_date).getTime() : Infinity;
          bVal = b.training_date ? new Date(b.training_date).getTime() : Infinity;
        }
        
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === 'asc' ? comparison : -comparison;
      });
      
      setRecords(sorted);
    } catch {
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRecords(); setSelected(new Set()); }, [filterType, search, sortBy, sortDir]);

  useEffect(() => {
    if (!focusId || loading || records.length === 0) return;
    setTimeout(() => {
      const el = rowRefs.current[focusId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('notif-highlight');
        el.addEventListener('animationend', () => el.classList.remove('notif-highlight'), { once: true });
      }
    }, 300);
  }, [focusId, loading, records.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === records.length && records.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map(r => r.id)));
    }
  };

  // Core generate: calls API, returns a result item (no download triggered)
  const generateOne = async (record, modulesOverride) => {
    try {
      let res;
      if (modulesOverride) {
        res = await generateCertificateWithModules(record.id, modulesOverride);
      } else {
        res = await generateCertificateBlob(record.id);
      }
      const blob    = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      const suffix  = modulesOverride ? '_Recurrent' : '';
      const filename = `Certificate_${record.participant_name.replace(/\s+/g, '_')}${suffix}.pdf`;

      // Extract cert ID from content-disposition header if available, else placeholder
      const disposition = res.headers?.['content-disposition'] || '';
      const certIdMatch = disposition.match(/filename="[^"]*"/);
      const certId = record.cert_sequence
        ? `${record.training_type}-${String(record.cert_sequence).padStart(5,'0')}`
        : 'Assigned';

      return { id: record.id, name: record.participant_name, trainingType: record.training_type, certId, blobUrl, filename };
    } catch {
      toast.error(`Failed to generate certificate for ${record.participant_name}`);
      return null;
    }
  };

  // FDR without modules: open module picker, then generate
  const pendingFdrRecord = useRef(null);

  const handleBulkGenerate = async () => {
    // Only generate participants that are not already released
    let toGenerate = records.filter(r => selected.has(r.id) && !r.cert_released);
    if (!toGenerate.length) {
      toast('All selected participants already have released certificates.', { icon: '\u2705', duration: 4000 });
      return;
    }

    // Sort by creation date (ascending) so first-entered participants get lowest cert numbers
    toGenerate = toGenerate.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : Infinity;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : Infinity;
      return dateA - dateB;
    });

    // If any FDR record has no modules, open module picker for the first one only
    const fdrNeedsModules = toGenerate.find(r => r.training_type === 'FDR' && !r.modules);
    if (fdrNeedsModules) {
      pendingFdrRecord.current = { record: fdrNeedsModules, rest: toGenerate.filter(r => r.id !== fdrNeedsModules.id) };
      setModuleModal({ open: true, record: fdrNeedsModules });
      return;
    }

    await runBulkGenerate(toGenerate, {});
  };

  const runBulkGenerate = async (toGenerate, modulesMap) => {
    setBulkGenerating(true);
    const results = [];
    for (const record of toGenerate) {
      const result = await generateOne(record, modulesMap[record.id] || null);
      if (result) results.push(result);
    }
    setBulkGenerating(false);
    setSelected(new Set());
    fetchRecords();
    if (results.length > 0) setCertResults(results);
  };

  const handleModuleConfirm = async (modules) => {
    const pending = pendingFdrRecord.current;
    pendingFdrRecord.current = null;
    setModuleModal({ open: false, record: null });

    if (!pending) return;

    const modulesMap = { [pending.record.id]: modules };
    let allRecords = [pending.record, ...(pending.rest || [])];
    
    // Sort by creation date (ascending) to maintain entry order for cert numbering
    allRecords = allRecords.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : Infinity;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : Infinity;
      return dateA - dateB;
    });
    
    await runBulkGenerate(allRecords, modulesMap);
  };

  const closeResults = () => {
    if (certResults) certResults.forEach(r => window.URL.revokeObjectURL(r.blobUrl));
    setCertResults(null);
  };

  // ── Per-row download for already-issued certificates ──────────────────────────
  const handleDownloadIssued = async (record) => {
    try {
      setDownloadingId(record.id);
      const res  = await generateCertificateBlob(record.id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Certificate_${record.participant_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Certificate downloaded');
    } catch {
      toast.error('Failed to download certificate');
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Revoke an issued certificate (frees the cert number for reuse) ──────────────
  const handleRevoke = async (record) => {
    const ok = await confirm(
      `Revoke certificate #${record.cert_sequence} for "${record.participant_name}"?\n\nThe certificate number will become available for reassignment.`,
      { title: 'Revoke certificate', confirmLabel: 'Revoke' }
    );
    if (!ok) return;
    try {
      await revokeCertificateById(record.id);
      toast.success(`Certificate #${record.cert_sequence} revoked. Number is now available for reuse.`);
      fetchRecords();
    } catch (err) {
      toast.error(`Failed to revoke certificate: ${err.response?.data?.error || err.message}`);
    }
  };

  // Airlines should never reach this page (blocked in router) but show a guard just in case
  if (!isAdmin) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center">
          <HiOutlineShieldCheck className="w-8 h-8 text-primary-400" />
        </div>
        <h2 className="text-xl font-bold text-primary-800">Admin Access Required</h2>
        <p className="text-sm text-primary-400 max-w-sm text-center">
          Certificate generation is restricted to IFOA administrators only.
          Please contact your administrator to obtain certificates.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Module selector (FDR only) */}
      <ModuleSelector
        isOpen={moduleModal.open}
        onClose={() => { setModuleModal({ open: false, record: null }); pendingFdrRecord.current = null; }}
        onConfirm={handleModuleConfirm}
        initialModules={
          moduleModal.record?.modules
            ? moduleModal.record.modules.split(',').map((m) => m.trim())
            : []
        }
      />

      {/* Certificate result modal (bulk generate) */}
      <CertResultModal results={certResults} onClose={closeResults} />

      {/* Per-row preview modal (issued certs only) */}
      <AnimatePresence>
        {rowPreview && (() => {
          const token = localStorage.getItem('token') || '';
          const src   = `${API_BASE}/certificates/preview/${rowPreview.id}?token=${encodeURIComponent(token)}`;
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
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                onClick={() => setRowPreview(null)}
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
                <div className="flex items-center justify-between px-6 py-4 border-b border-primary-200">
                  <div>
                    <p className="text-base font-bold text-primary-800">Certificate — {rowPreview.participant_name}</p>
                    <p className="text-xs text-primary-400 mt-0.5">{rowPreview.training_type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadIssued(rowPreview)}
                      disabled={downloadingId === rowPreview.id}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary-800 text-white text-xs font-semibold rounded-lg hover:bg-primary-900 transition-colors disabled:opacity-60"
                    >
                      {downloadingId === rowPreview.id
                        ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <HiOutlineDocumentDownload className="w-4 h-4" />}
                      {downloadingId === rowPreview.id ? 'Downloading…' : 'Download PDF'}
                    </button>
                    <button onClick={() => setRowPreview(null)} className="p-2 rounded-lg hover:bg-primary-100 text-primary-400 hover:text-primary-600 transition-colors">
                      <HiOutlineX className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="bg-primary-50 relative" style={{ height: '70vh' }}>
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

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary-800">Certificates</h1>
          <p className="text-sm text-primary-400 mt-1">Select participants, then generate their certificates</p>
        </div>
        <button
          onClick={handleBulkGenerate}
          disabled={selected.size === 0 || bulkGenerating}
          className="btn-primary flex items-center gap-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {bulkGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <HiOutlineCheckCircle className="w-4 h-4" />
              {selected.size > 0 ? `Generate Certificates (${selected.size})` : 'Generate Certificates'}
            </>
          )}
        </button>
      </div>

      {/* Info banner */}
      <div className="card p-4 bg-accent-50/50 border-accent-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-accent-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <HiOutlineDocumentDownload className="w-4 h-4 text-accent-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-accent-800">How to generate certificates</p>
            <p className="text-xs text-accent-600 mt-0.5">
              <strong>1.</strong> Tick the checkboxes next to the participants you want. &nbsp;
              <strong>2.</strong> Click <strong>"Generate Certificates"</strong> at the top. &nbsp;
              <strong>3.</strong> A panel will appear — choose <strong>Preview</strong> or <strong>Download PDF</strong> for each certificate. Unique certificate numbers are only assigned at this step.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={(e) => { e.preventDefault(); fetchRecords(); }} className="flex-1 relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <input
              type="text"
              placeholder="Search participants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-10"
            />
          </form>
          <div className="relative">
            <HiOutlineFilter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <Select value={filterType || 'all'} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
              <SelectTrigger className="pl-10 min-w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Training Types</SelectItem>
                {TRAINING_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Sort Controls */}
          <div className="flex gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="min-w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="creation">Sort: Upload Time</SelectItem>
                  <SelectItem value="name">Sort: Name</SelectItem>
                  <SelectItem value="training_date">Sort: Training Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 rounded-lg border border-primary-200 hover:bg-primary-50 text-primary-600 text-sm font-medium transition-colors"
              title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="bg-primary-50 border-b border-primary-200">
                <th className="px-4 py-3 w-10">
                  <Checkbox
                    checked={selected.size === records.length && records.length > 0 ? true : selected.size > 0 ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 py-3">Participant Name</th>
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Airline</th>
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Department</th>
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 py-3">Training</th>
                <th className="text-left text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Date</th>
                <th className="text-center text-[10px] font-semibold text-primary-500 uppercase tracking-wider px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-primary-400">
                      <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                      <span className="text-sm">Loading...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-primary-400">
                    No records found.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={record.id}
                    ref={el => { rowRefs.current[record.id] = el; }}
                    className={`border-b border-primary-100 last:border-0 transition-colors ${
                      selected.has(record.id) ? 'bg-primary-50' : 'hover:bg-primary-50/50'
                    }`}
                  >
                    <td className="px-4 py-4">
                      <Checkbox
                        checked={selected.has(record.id)}
                        onCheckedChange={() => toggleSelect(record.id)}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-200 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary-600">
                            {record.participant_name.split(' ').map((n) => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-primary-800">{record.participant_name}</span>
                          {record.cert_released ? (
                            <p className="text-[10px] text-emerald-600 font-medium mt-0.5 inline-flex items-center gap-1">
                              <HiOutlineCheckCircle className="w-3 h-3" />
                              Released
                            </p>
                          ) : record.cert_sequence ? (
                            <p className="text-[10px] text-blue-500 font-medium mt-0.5 inline-flex items-center gap-1">
                              <HiOutlineLockClosed className="w-3 h-3" />
                              Generated - not released
                            </p>
                          ) : (
                            <p className="text-[10px] text-amber-500 mt-0.5 inline-flex items-center gap-1">
                              <HiOutlineClock className="w-3 h-3" />
                              Pending generation
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-primary-600 hidden sm:table-cell">{record.company}</td>
                    <td className="px-4 py-4 text-sm text-primary-600 hidden md:table-cell">{record.department}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${trainingBadgeClass(record.training_type)}`}>
                        {record.training_type}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-primary-500 hidden sm:table-cell">
                      {new Date(record.training_date).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {record.cert_released ? (
                          // Released — show Preview + Download
                          <>
                            <button
                              onClick={() => setRowPreview(record)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-accent-200 text-xs font-medium text-accent-700 bg-accent-50 hover:bg-accent-100 transition-colors"
                            >
                              <HiOutlineEye className="w-3.5 h-3.5" />
                              Preview
                            </button>
                            <button
                              onClick={() => handleDownloadIssued(record)}
                              disabled={downloadingId === record.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 transition-colors"
                            >
                              {downloadingId === record.id ? (
                                <div className="w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                              ) : (
                                <HiOutlineDocumentDownload className="w-3.5 h-3.5" />
                              )}
                              PDF
                            </button>
                            <button
                              onClick={() => handleRevoke(record)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                              title="Revoke certificate and free the number for reuse"
                            >
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                              Revoke
                            </button>
                          </>
                        ) : record.cert_sequence ? (
                          // Generated but not released (revoked state)
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                            <HiOutlineLockClosed className="w-3.5 h-3.5" />
                            Not Released
                          </span>
                        ) : (
                          // Never generated
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                            <HiOutlineClock className="w-3.5 h-3.5" />
                            Pending
                          </span>
                        )}
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
        <p className="text-xs text-primary-400">
        {records.length} record{records.length !== 1 ? 's' : ''}
        {' — '}{records.filter(r => r.cert_released).length} released
          {records.filter(r => r.cert_sequence && !r.cert_released).length > 0 &&
              ` — ${records.filter(r => r.cert_sequence && !r.cert_released).length} generated not released`}
              {selected.size > 0 && <span className="ml-2 font-medium text-primary-600">&bull; {selected.size} selected</span>}
            </p>
          </div>
        )}
      </div>
      {ConfirmDialog}
    </motion.div>
  );
}


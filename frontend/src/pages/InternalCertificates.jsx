import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineDocumentText, HiOutlineSearch, HiOutlineEye, HiOutlineDownload, HiOutlineTrash,
} from 'react-icons/hi';
import { listAllInternalCertificates, deleteInternalCertificate } from '../api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import { openInternalCertificate } from '../components/InternalCertificatesDialog';
import ValidityBadge from '../components/ValidityBadge';
import { internalCertExpiry } from '../utils/certValidity';

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Every internal certificate the caller can see, across all candidates.
// Department → its own candidates; main airline → its own + every department's.
export default function InternalCertificates() {
  const { can, isDepartment, admin } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const canManage = can('internalCerts.manage');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    listAllInternalCertificates()
      .then((res) => setRows(res.data.certificates || []))
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load certificates'))
      .finally(() => setLoading(false));
  }, []);

  const owners = useMemo(
    () => [...new Set(rows.map((r) => r.participant?.owner_name).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (owner && r.participant?.owner_name !== owner) return false;
      if (!q) return true;
      return [r.title, r.original_name, r.participant?.participant_name, r.participant?.email]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [rows, search, owner]);

  const open = async (c, download) => {
    setBusyId(c.id);
    try {
      await openInternalCertificate(c, download);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not open certificate');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c) => {
    if (!(await confirm(`Delete "${c.title || c.original_name}"? The PDF is removed permanently.`, {
      title: 'Delete certificate', confirmLabel: 'Delete',
    }))) return;
    setBusyId(c.id);
    try {
      await deleteInternalCertificate(c.id);
      setRows((prev) => prev.filter((x) => x.id !== c.id));
      toast.success('Certificate deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const canDeleteCert = (c) => canManage && (!isDepartment || String(c.uploaded_by) === String(admin?._id || admin?.id));

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="w-full max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs flex-shrink-0">
              <HiOutlineDocumentText className="w-4 h-4" />
            </div>
            <h1 className="text-sm font-extrabold text-slate-900 tracking-tight leading-none">Certificates</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold flex-shrink-0">
              {rows.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Every internal certificate uploaded for your {isDepartment ? 'team' : 'candidates and departments'}.
            Upload new ones from a candidate&apos;s Certificates button.
          </p>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by candidate, email or certificate title…"
              className="w-full pl-8 pr-3 h-9 bg-white border border-slate-200/80 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          </div>
          {owners.length > 1 && (
            <select value={owner} onChange={(e) => setOwner(e.target.value)}
              className="h-9 px-3 bg-white border border-slate-200/80 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
              <option value="">All departments</option>
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 py-16 text-center text-sm text-slate-400 font-medium">
            {rows.length === 0 ? 'No certificates uploaded yet.' : 'No matches.'}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
            {filtered.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0 text-[10px] font-extrabold">PDF</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{c.title || c.original_name}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {c.participant?.participant_name || 'Unknown candidate'}
                    {c.participant?.email && <span className="text-slate-400"> · {c.participant.email}</span>}
                    {!isDepartment && c.participant?.owner_name && <span className="text-slate-400"> · {c.participant.owner_name}</span>}
                  </p>
                </div>
                <div className="hidden sm:block w-28 shrink-0 text-[11px] text-slate-500">
                  <p>Issued {fmtDate(c.issued_on)}</p>
                </div>
                <div className="w-36 shrink-0">
                  <ValidityBadge expiry={internalCertExpiry(c)}
                    fallback={<span className="text-[11px] text-slate-400">No expiry set</span>} />
                </div>
                <div className="hidden md:block w-32 shrink-0 text-[11px] text-slate-400 truncate">
                  <p className="truncate">{c.uploaded_by_name || '—'}</p>
                  <p>{fmtDate(c.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => open(c, false)} disabled={busyId === c.id} title="View"
                    className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 disabled:opacity-50">
                    <HiOutlineEye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => open(c, true)} disabled={busyId === c.id} title="Download"
                    className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 disabled:opacity-50">
                    <HiOutlineDownload className="w-3.5 h-3.5" />
                  </button>
                  {canDeleteCert(c) && (
                    <button onClick={() => remove(c)} disabled={busyId === c.id} title="Delete"
                      className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-500 hover:text-red-600 disabled:opacity-50">
                      <HiOutlineTrash className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <p className="text-xs text-slate-400 text-right font-medium">{filtered.length} of {rows.length}</p>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineDocumentText, HiOutlineUpload, HiOutlineEye, HiOutlineDownload, HiOutlineTrash,
} from 'react-icons/hi';
import {
  listAllInternalCertificates, listInternalCertificates, uploadInternalCertificate,
  getInternalCertificateFile, deleteInternalCertificate,
} from '../api';
import ValidityBadge from './ValidityBadge';
import { internalCertExpiry, soonestExpiry } from '../utils/certValidity';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

const MAX_BYTES = 10 * 1024 * 1024;

function fmtDate(v) {
  if (!v) return null;
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtSize(n) {
  if (!n) return '';
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Open a stored certificate PDF in a new tab, or save it (download = true).
export async function openInternalCertificate(c, download) {
  const res = await getInternalCertificateFile(c.id);
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = c.original_name || `${c.title || 'certificate'}.pdf`;
    a.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// { [participantId]: count } of uploaded certificates, plus `bump(id, delta)`
// to adjust after an upload/delete without refetching. Third element:
// { [participantId]: validity } of the certificate expiring soonest, and
// fourth `reload()` to refetch (needed to refresh validities).
export function useInternalCertCounts(enabled) {
  const [counts, setCounts] = useState({});
  const [expiries, setExpiries] = useState({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    listAllInternalCertificates()
      .then((res) => {
        const next = {};
        const byParticipant = {};
        (res.data.certificates || []).forEach((c) => {
          const id = c.participant?.id;
          if (!id) return;
          next[id] = (next[id] || 0) + 1;
          (byParticipant[id] ||= []).push(internalCertExpiry(c));
        });
        setCounts(next);
        setExpiries(Object.fromEntries(Object.entries(byParticipant).map(([id, list]) => [id, soonestExpiry(list)])));
      })
      .catch(() => {});
  }, [enabled, tick]);
  const bump = (id, delta) => setCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));
  const reload = () => setTick((t) => t + 1);
  return [counts, bump, expiries, reload];
}

// Per-candidate internal certificates: the airline's own PDFs, uploaded (not
// generated) and kept in Cloudflare R2. Two modes:
//   'upload' — just the upload form (needs `internalCerts.manage`)
//   'view'   — the previously uploaded PDFs (view / download / delete)
// `onChange(participantId, delta)` reports uploads (+1) and deletes (-1) so the
// caller can keep its per-row counts in sync.
export default function InternalCertificatesDialog({ participant, mode = 'view', onClose, onChange }) {
  const { can, isDepartment, admin } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const canManage = can('internalCerts.manage');
  const participantId = participant ? (participant.id || participant._id) : null;

  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({ title: '', issued_on: '', expires_on: '', no_expiry: false });
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const fileRef = useRef(null);

  const isUpload = mode === 'upload';

  useEffect(() => {
    if (!participantId) return;
    setCerts([]);
    setFile(null);
    setMeta({ title: '', issued_on: '', expires_on: '', no_expiry: false });
    if (isUpload) return;
    setLoading(true);
    listInternalCertificates(participantId)
      .then((res) => setCerts(res.data.certificates || []))
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load certificates'))
      .finally(() => setLoading(false));
  }, [participantId, isUpload]);

  const pickFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.type !== 'application/pdf') { toast.error('Only PDF files are allowed'); e.target.value = ''; return; }
    if (f.size > MAX_BYTES) { toast.error('PDF must be 10 MB or smaller'); e.target.value = ''; return; }
    setFile(f);
    if (!meta.title) setMeta((m) => ({ ...m, title: f.name.replace(/\.pdf$/i, '') }));
  };

  const upload = async () => {
    if (!file) { toast.error('Choose a PDF first'); return; }
    if (!meta.no_expiry && meta.issued_on && meta.expires_on && meta.expires_on < meta.issued_on) {
      toast.error('Expiry date cannot be before the issue date'); return;
    }
    setUploading(true);
    try {
      await uploadInternalCertificate(participantId, file, {
        ...meta,
        expires_on: meta.no_expiry ? '' : meta.expires_on,
        no_expiry: meta.no_expiry ? 'true' : '',
      });
      toast.success('Certificate uploaded');
      onChange?.(participantId, 1);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

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
      setCerts((prev) => prev.filter((x) => x.id !== c.id));
      toast.success('Certificate deleted');
      onChange?.(participantId, -1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  // A department can only delete what it uploaded; the main airline any in its tree.
  const canDeleteCert = (c) => canManage && (!isDepartment || String(c.uploaded_by) === String(admin?._id || admin?.id));

  const inputCls = 'w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

  return (
    <Dialog open={!!participant} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
              {isUpload ? <HiOutlineUpload className="w-5 h-5 text-white" /> : <HiOutlineDocumentText className="w-5 h-5 text-white" />}
            </div>
            <div className="min-w-0 pr-6">
              <DialogTitle className="text-base font-bold text-slate-900 tracking-tight">
                {isUpload ? 'Upload Certificate' : 'Uploaded Certificates'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5 truncate">
                <strong className="text-slate-700 font-semibold">{participant?.participant_name || 'Candidate'}</strong> — {isUpload
                  ? "add one of your airline's own certificate PDFs."
                  : "your airline's own certificate PDFs."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Upload Mode Form */}
        {isUpload && canManage && (
          <div className="p-6 space-y-4">
            <label className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400 text-slate-600 cursor-pointer transition-all group">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-2.5 shadow-2xs group-hover:scale-105 transition-transform text-slate-700">
                <HiOutlineUpload className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-800">
                {file ? file.name : 'Click to choose PDF'}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">
                {file ? fmtSize(file.size) : 'Maximum file size: 10 MB'}
              </span>
              <input ref={fileRef} type="file" accept="application/pdf" onChange={pickFile} className="hidden" />
            </label>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Certificate Title
                </label>
                <input
                  value={meta.title}
                  onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
                  placeholder="e.g. Recurrent Training 2026"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white hover:border-slate-300 transition-all shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Issued On
                  </label>
                  <input
                    type="date"
                    value={meta.issued_on}
                    onChange={(e) => setMeta((m) => ({ ...m, issued_on: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white hover:border-slate-300 transition-all shadow-2xs"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Expires On
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={meta.no_expiry}
                        onChange={(e) => setMeta((m) => ({ ...m, no_expiry: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded border-slate-300 accent-slate-900 cursor-pointer"
                      />
                      Unlimited
                    </label>
                  </div>
                  {meta.no_expiry ? (
                    <div className="w-full h-[38px] flex items-center border border-slate-200 rounded-xl px-3.5 text-xs sm:text-sm font-semibold text-slate-500 bg-slate-50">
                      Never expires
                    </div>
                  ) : (
                    <input
                      type="date"
                      value={meta.expires_on}
                      min={meta.issued_on || undefined}
                      onChange={(e) => setMeta((m) => ({ ...m, expires_on: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white hover:border-slate-300 transition-all shadow-2xs"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-all shadow-2xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={upload}
                disabled={uploading || !file}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs active:scale-[0.98] disabled:opacity-50 inline-flex items-center gap-2 transition-all cursor-pointer"
              >
                <HiOutlineUpload className="w-4 h-4" />
                {uploading ? 'Uploading…' : 'Upload Certificate'}
              </button>
            </div>
          </div>
        )}

        {/* View Mode List */}
        {!isUpload && (
          <div className="p-6 max-h-[65vh] overflow-y-auto">
            {loading ? (
              <div className="py-12 flex justify-center text-slate-400">
                <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              </div>
            ) : certs.length === 0 ? (
              <div className="py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 text-center">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5 shadow-2xs">
                  <HiOutlineDocumentText className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No certificates uploaded</p>
                <p className="text-xs text-slate-400 mt-0.5">No internal certificate PDFs have been uploaded for this candidate yet.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {certs.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-2xs transition-all flex items-center gap-3.5 group"
                  >
                    {/* PDF Badge */}
                    <div className="w-10 h-10 rounded-xl bg-red-50/90 text-red-600 border border-red-100 flex flex-col items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                      <HiOutlineDocumentText className="w-4 h-4 text-red-600" />
                      <span className="text-[8px] font-black tracking-widest text-red-700 leading-none mt-0.5">PDF</span>
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm font-bold text-slate-900 truncate" title={c.title || c.original_name}>
                        {c.title || c.original_name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium truncate flex-wrap">
                        {c.issued_on && (
                          <span className="text-slate-600">Issued {fmtDate(c.issued_on)}</span>
                        )}
                        {c.uploaded_by_name && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span>by {c.uploaded_by_name}</span>
                          </>
                        )}
                        {c.size && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span>{fmtSize(c.size)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <ValidityBadge expiry={internalCertExpiry(c)} className="flex-shrink-0 items-end"
                      fallback={<span className="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0">No expiry set</span>} />

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => open(c, false)}
                        disabled={busyId === c.id}
                        title="Preview PDF"
                        className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-600 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        <HiOutlineEye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => open(c, true)}
                        disabled={busyId === c.id}
                        title="Download PDF"
                        className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-600 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        <HiOutlineDownload className="w-3.5 h-3.5" />
                      </button>
                      {canDeleteCert(c) && (
                        <button
                          type="button"
                          onClick={() => remove(c)}
                          disabled={busyId === c.id}
                          title="Delete certificate"
                          className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:bg-rose-600 hover:text-white hover:border-rose-600 text-slate-500 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                        >
                          <HiOutlineTrash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {ConfirmDialog}
      </DialogContent>
    </Dialog>
  );
}

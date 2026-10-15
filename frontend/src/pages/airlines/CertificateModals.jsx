import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineDocumentDownload, HiOutlineEye, HiOutlineCheckCircle, HiOutlineX, HiOutlineDocumentText } from 'react-icons/hi';
import { Checkbox } from '@/components/ui/checkbox';
import { Spin } from './helpers';

// ─── Template Variant Modal ───────────────────────────────────────────────────
export const VALIDITY_OPTIONS = [
  { val: '12',        label: '12 Months' },
  { val: '24',        label: '24 Months' },
  { val: '36',        label: '36 Months' },
  { val: 'Unlimited', label: 'Unlimited' },
];

export function VariantModal({ open, variant, setVariant, validity, setValidity, onConfirm, onClose, count, dhlEligibleCount, includeDhl, setIncludeDhl }) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="fixed inset-0 z-50 bg-slate-900/60 pointer-events-none"
      />
      <div
        key="layout"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, scale: 0.96, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden will-change-transform"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-primary-100">
            <div>
              <h2 className="text-base font-bold text-primary-800">Certificate Settings</h2>
              <p className="text-xs text-primary-400 mt-0.5">Generating {count} certificate{count !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
          </div>
          <div className="p-5 space-y-4">
            {/* Template */}
            <div>
              <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-2">Template</p>
              <div className="space-y-2">
                {[
                  { val: 'default', label: 'IFOA', sub: 'Standard green certificate', color: 'emerald', abbr: 'IFOA' },
                  { val: 'india',   label: 'IFOA INDIA', sub: 'Orange variant for India region', color: 'orange', abbr: 'INDIA' },
                ].map(opt => (
                  <button key={opt.val} onClick={() => setVariant(opt.val)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      variant === opt.val ? `border-${opt.color}-400 bg-${opt.color}-50` : 'border-primary-200 hover:border-primary-300 bg-white'
                    }`}>
                    <div className={`w-9 h-9 rounded-xl bg-${opt.color}-100 flex items-center justify-center flex-shrink-0`}>
                      <span className={`text-[9px] font-bold text-${opt.color}-700`}>{opt.abbr}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-primary-800">{opt.label}</p>
                      <p className="text-xs text-primary-400">{opt.sub}</p>
                    </div>
                    {variant === opt.val && <HiOutlineCheckCircle className={`w-5 h-5 text-${opt.color}-500 flex-shrink-0`} />}
                  </button>
                ))}
              </div>
            </div>
            {/* Validity */}
            <div>
              <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-2">Certificate Validity</p>
              <div className="flex gap-2 flex-wrap">
                {VALIDITY_OPTIONS.map(opt => (
                  <button key={opt.val} onClick={() => setValidity(opt.val)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      validity === opt.val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-primary-200 text-primary-500 hover:border-primary-400'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-primary-400 mt-1.5">Printed on certificate. Default: 36 Months.</p>
            </div>
            {/* DHL extra cert — only offered when the selection includes an eligible (DHL Bahrain, FDR) record */}
            {dhlEligibleCount > 0 && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl border-2 border-blue-200 bg-blue-50 cursor-pointer">
                <Checkbox checked={includeDhl} onCheckedChange={c => setIncludeDhl(!!c)} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-bold text-blue-700">Also generate DHL Extra Certificate</span>
                  <span className="block text-xs text-blue-500 mt-0.5">{dhlEligibleCount} of the selected candidate{dhlEligibleCount > 1 ? 's are' : ' is'} eligible (DHL Bahrain, FDR) — generates a DHL FORM ST-XXX certificate for {dhlEligibleCount > 1 ? 'each' : 'it'}, alongside the normal certificate.</span>
                </span>
              </label>
            )}
          </div>
          <div className="px-5 pb-5 flex gap-3">
            <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
            <button onClick={onConfirm} className="btn-primary flex-1">Generate</button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Certificate Result Modal ─────────────────────────────────────────────────
export function CertResultModal({ results, onClose }) {
  if (!results?.length) return null;
  const dl = item => { const a = document.createElement('a'); a.href = item.blobUrl; a.download = item.filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="fixed inset-0 z-50 bg-slate-900/60 pointer-events-none"
      />
      <div
        key="layout"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, scale: 0.96, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden will-change-transform"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-primary-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                <HiOutlineCheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-primary-800">Certificates Generated</h2>
                <p className="text-xs text-primary-400">{results.length} certificate{results.length !== 1 ? 's' : ''} ready</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
          </div>
          <div className="divide-y divide-primary-100 max-h-[55vh] overflow-y-auto">
            {results.map(item => (
              <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <HiOutlineDocumentText className="w-4 h-4 text-primary-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary-800 truncate">{item.name}</p>
                  <p className="text-[11px] text-primary-400 mt-0.5">{item.trainingType} · {item.certId}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => window.open(item.blobUrl, '_blank')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary-200 hover:bg-primary-50 text-xs font-medium text-primary-600">
                    <HiOutlineEye className="w-3.5 h-3.5" /><span className="hidden sm:inline">Preview</span>
                  </button>
                  <button onClick={() => dl(item)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-700 hover:bg-primary-800 text-xs font-medium text-white">
                    <HiOutlineDocumentDownload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-primary-50/50 border-t border-primary-100 flex justify-end">
            <button onClick={onClose} className="btn-primary text-sm">Done</button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// Every type has its own independent counter — no sharing.
export const TYPE_TO_BUCKET = {
  FDI: 'FDI', FDA: 'FDA', GD: 'GD', TCD: 'TCD',
  HF:  'HF',  NDG: 'NDG',
  FDR: 'FDR', FTL: 'FTL',
};

// ─── Counter Reset Modal ──────────────────────────────────────────────────────
export function CounterResetModal({ open, onClose, counters, ALL_TYPES, resetting, onReset, onResetAll }) {
  if (!open) return null;
  return (
    <AnimatePresence>
      {/* Backdrop overlay */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="fixed inset-0 z-50 bg-slate-900/60 pointer-events-none"
      />
      {/* Layout wrapper */}
      <div
        key="layout"
        className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto py-8 px-8"
        onClick={onClose}
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, scale: 0.96, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col my-auto will-change-transform"
          onClick={e => e.stopPropagation()}
        >

          {/* ── Sticky header ── */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-primary-100 flex-shrink-0">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-primary-800">Reset Certificate Counters</h2>
              <p className="text-xs text-primary-400 mt-0.5">Reset to 0 — admin must regenerate all certificates</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400 flex-shrink-0"><HiOutlineX className="w-5 h-5" /></button>
          </div>

          {/* ── Warning banner ── */}
          <div className="mx-4 sm:mx-5 mt-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 flex-shrink-0">
            <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-red-700">
              <strong>Reset to 0</strong> clears ALL certificate numbers for that type.
              Certificates become invalid — admin must regenerate each one.
            </p>
          </div>

          {/* ── Scrollable counter list ── */}
          <div className="px-4 sm:px-5 py-4 space-y-2 overflow-y-auto max-h-[45vh] sm:max-h-[50vh]">
            {ALL_TYPES.map(type => {
              // Look up by canonical bucket
              const bucket  = TYPE_TO_BUCKET[type] || type;
              const counter = counters.find(c => c.training_type === bucket);
              // Show 'active' = highest cert_sequence on a live participant right now.
              // Falls back to high_water if active is not yet returned by the API.
              // This number decreases when certs are revoked or participants deleted.
              const current = counter?.active ?? counter?.high_water ?? 0;
              const certCount = counter?.activeCount ?? null;
              return (
                <div key={type} className="flex items-center justify-between px-3 sm:px-4 py-3 rounded-xl bg-primary-50 border border-primary-100">
                  <div>
                    <span className="text-sm font-bold text-primary-800">{type}</span>
                    <span className="ml-2 text-xs text-primary-400">#{String(current).padStart(5, '0')}</span>
                    {certCount !== null && certCount > 0 && (
                      <span className="ml-1.5 text-[10px] text-primary-400">({certCount} active)</span>
                    )}
                    {certCount === 0 && (
                      <span className="ml-1.5 text-[10px] text-emerald-500">(none active)</span>
                    )}
                  </div>
                  <button onClick={() => onReset(type)} disabled={resetting === type || resetting === 'ALL'}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap">
                    {resetting === type
                      ? <Spin cls="w-3 h-3 border-2 border-red-300 border-t-red-600" />
                      : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    }
                    Reset to 0
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Sticky footer buttons — always visible ── */}
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-3 border-t border-primary-100 flex gap-3 flex-shrink-0">
            <button onClick={onClose} className="btn-outline flex-1">Close</button>
            <button onClick={onResetAll} disabled={resetting === 'ALL'}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors">
              {resetting === 'ALL' && <Spin />}
              Reset All to 0
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

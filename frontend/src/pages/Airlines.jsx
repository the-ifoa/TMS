import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle2 } from 'lucide-react';
import LogoAvatar from '../components/LogoAvatar';
import {
  HiOutlineOfficeBuilding,
  HiOutlineUsers,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineMail,
  HiOutlineDocumentDownload,
  HiOutlineEye,
  HiOutlineLockClosed,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineX,
  HiOutlineDocumentText,
  HiOutlinePlusCircle,
  HiOutlineSelector,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import {
  getParticipantsByAirline, deleteParticipant, deleteAirlineData, deleteAirlineById,
  generateCertificateBlob, generateCertificateWithModules,
  updateFullCertId, getCertCounters, resetCertCounter, resetAllCertCounters,
  updateNdgScore, updateFdrHours, revokeCertificate, updateValidity, updateAirline,
  generateDhlCertificateBlob, revokeDhlCertificate, downloadDhlCertificate,
  API_BASE,
} from '../api';
import ModuleSelector from '../components/ModuleSelector';
import { useConfirm } from '@/hooks/use-confirm';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

const TRAINING_LABELS = {
  FDI: 'Flight Dispatch Initial',
  FDR: 'Flight Dispatch Recurrent',
  FDA: 'Flight Dispatch Advanced',
  FTL: 'Flight Time Limitations',
  NDG: 'Dangerous Goods No-Carry',
  HF:  'Human Factors for OCC',
  GD:  'Ground Operations',
  TCD: 'Training Competencies Dev.',
};

const TRAINING_TYPES = Object.entries(TRAINING_LABELS).map(([v, l]) => ({ value: v, label: `${v} - ${l}` }));

function badgeStyle() {
  return { background: '#eff6ff', color: '#0000ff', border: '1px solid #bfdbfe' };
}
function mkInitials(name = '') {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
}
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spin({ cls = 'w-3.5 h-3.5 border-2 border-white/30 border-t-white' }) {
  return <div className={`${cls} rounded-full animate-spin`} />;
}

// ─── Template Variant Modal ───────────────────────────────────────────────────
const VALIDITY_OPTIONS = [
  { val: '12',        label: '12 Months' },
  { val: '24',        label: '24 Months' },
  { val: '36',        label: '36 Months' },
  { val: 'Unlimited', label: 'Unlimited' },
];

function VariantModal({ open, variant, setVariant, validity, setValidity, onConfirm, onClose, count, dhlEligibleCount, includeDhl, setIncludeDhl }) {
  if (!open) return null;
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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
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
function CertResultModal({ results, onClose }) {
  if (!results?.length) return null;
  const dl = item => { const a = document.createElement('a'); a.href = item.blobUrl; a.download = item.filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
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
const TYPE_TO_BUCKET = {
  FDI: 'FDI', FDA: 'FDA', GD: 'GD', TCD: 'TCD',
  HF:  'HF',  NDG: 'NDG',
  FDR: 'FDR', FTL: 'FTL',
};

// ─── Counter Reset Modal ──────────────────────────────────────────────────────
function CounterResetModal({ open, onClose, counters, ALL_TYPES, resetting, onReset, onResetAll }) {
  if (!open) return null;
  return (
    <AnimatePresence>
      {/* Backdrop overlay */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed -inset-20 z-50 bg-black/40 backdrop-blur-sm pointer-events-none"
      />
      {/* Layout wrapper */}
      <div
        key="layout"
        className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto py-8 px-8"
        onClick={onClose}
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col my-auto"
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

// ─── Mobile participant card (replaces table row on small screens) ─────────────
function ParticipantCard({ p, checked, onCheck, onPreview, onDownload, onEdit, onDelete, downloadingId, certEdits, onStartEdit, onCancelEdit, onSaveEdit, setCertEdits, ndgScores, setNdgScores, onNdgScoreSave, fdrHours, setFdrHours, onFdrHoursSave, onFdrHoursToggle }) {
  const pid      = p.id || p._id;
  const fullName = p.participant_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
  const isCk     = checked.has(pid);
  const edit     = certEdits[pid];
  const displayYear = p.cert_year_override ||
    (() => { const d = p.end_date || p.training_date || ''; return d ? new Date(d.slice(0, 10)).getFullYear() : ''; })();

  return (
    <div className={`p-3 rounded-xl border transition-colors ${isCk ? 'bg-blue-50 border-blue-200' : 'bg-white border-primary-100'}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div onClick={() => onCheck(pid)}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer flex-shrink-0 mt-0.5 transition-colors ${isCk ? 'bg-primary-800 border-primary-800' : 'border-primary-300'}`}>
          {isCk && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>

        {/* Avatar + name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary-200 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary-600">{mkInitials(fullName)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary-800 truncate">{fullName}</p>
            <p className="text-xs text-primary-400 whitespace-normal break-words">{p.department}</p>
          </div>
        </div>
      </div>

      {/* Details row */}
      <div className="mt-2.5 ml-8 flex flex-wrap gap-x-4 gap-y-1 text-xs text-primary-500">
        <span><span style={badgeStyle()} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mr-1">{p.training_type}</span></span>
        <span>Start: {fmtDate(p.training_date)}</span>
        {p.end_date && <span>End: {fmtDate(p.end_date)}</span>}
      </div>

      {/* Cert ID or pending */}
      <div className="mt-2 ml-8">
        {p.cert_sequence ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              p.templateVariant === 'india' ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'
            }`}>{p.templateVariant === 'india' ? 'IFOA INDIA' : 'IFOA'}</span>
            <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              p.cert_released ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-600 bg-amber-50 border-amber-200'
            }`}>{p.cert_released ? <><HiOutlineCheckCircle className="w-2.5 h-2.5" />Released</> : <><HiOutlineClock className="w-2.5 h-2.5" />Not Released</>}</span>
            {edit?.editing ? (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-primary-400">{p.training_type}-</span>
                <input type="number" min="1" value={edit.seq}
                  onChange={e => setCertEdits(prev => ({ ...prev, [pid]: { ...prev[pid], seq: e.target.value, error: null } }))}
                  onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(pid); if (e.key === 'Escape') onCancelEdit(pid); }}
                  className="w-16 px-1.5 py-0.5 text-[11px] border border-primary-300 rounded focus:outline-none" disabled={edit.saving} autoFocus />
                <span className="text-[10px] text-primary-400">-</span>
                <input type="number" min="2000" max="2100" value={edit.year}
                  onChange={e => setCertEdits(prev => ({ ...prev, [pid]: { ...prev[pid], year: e.target.value, error: null } }))}
                  onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(pid); if (e.key === 'Escape') onCancelEdit(pid); }}
                  className="w-14 px-1.5 py-0.5 text-[11px] border border-primary-300 rounded focus:outline-none" disabled={edit.saving} />
                <button onClick={() => onSaveEdit(pid)} disabled={edit.saving} className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{edit.saving ? '...' : 'save'}</button>
                <button onClick={() => onCancelEdit(pid)} className="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-500 rounded">cancel</button>
                {edit.error && <p className="w-full text-[10px] text-red-500">! {edit.error}</p>}
              </div>
            ) : (
              <button onClick={() => onStartEdit(pid, p)} className="flex items-center gap-1 group">
                <span className="text-[10px] font-mono text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded group-hover:bg-primary-100">
                  {p.training_type}-{String(p.cert_sequence).padStart(5, '0')}-{displayYear}
                </span>
                <HiOutlinePencil className="w-2.5 h-2.5 text-primary-300 group-hover:text-primary-500" />
              </button>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-600 border border-amber-200"><HiOutlineClock className="w-3 h-3" /> Pending generation</span>
        )}
      </div>

      {/* NDG Score widget (mobile) */}
      {p.training_type === 'NDG' && (() => {
        const scoreEntry = ndgScores?.[pid];
        const currentVal = scoreEntry !== undefined ? scoreEntry.value : (p.ndg_score != null ? String(p.ndg_score) : '');
        const saving     = scoreEntry?.saving || false;
        const saved      = scoreEntry?.saved  || false;
        return (
          <div className="mt-2 ml-8 flex items-center gap-1.5">
            <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
              <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">Score</span>
              <input
                type="number" min="0" max="100"
                placeholder="0-100"
                value={currentVal}
                onChange={e => setNdgScores(prev => ({ ...prev, [pid]: { value: e.target.value, saving: false, saved: false } }))}
                onKeyDown={e => { if (e.key === 'Enter') onNdgScoreSave(pid); }}
                className="w-[4.5rem] pl-1.5 pr-4 py-0 text-[11px] bg-transparent border-none outline-none text-blue-800 font-semibold placeholder-blue-300"
                disabled={saving}
              />
              <span className="text-[10px] text-blue-500">%</span>
            </div>
            <button
              onClick={() => onNdgScoreSave(pid)}
              disabled={saving || !currentVal}
              className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold bg-[#0000ff] hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? <Spin cls="w-3 h-3 border-2 border-white/40 border-t-white" /> : saved ? '✓ Saved' : 'Save Score'}
            </button>
          </div>
        );
      })()}

      {/* FDR hours widget (mobile) */}
      {p.training_type === 'FDR' && (() => {
        const entry      = fdrHours?.[pid];
        const enabled    = entry?.enabled ?? (p.fdr_hours != null);
        const currentVal = entry !== undefined ? entry.value : (p.fdr_hours != null ? String(p.fdr_hours) : '');
        const saving     = entry?.saving || false;
        const saved      = entry?.saved  || false;
        return (
          <div className="mt-2 ml-8">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-primary-500 cursor-pointer w-fit">
              <Checkbox checked={enabled} onCheckedChange={c => onFdrHoursToggle(pid, !!c)} className="h-3.5 w-3.5" />
              Add Hours
            </label>
            {enabled && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                  <input
                    type="number" min="0" step="0.5"
                    placeholder="e.g. 40"
                    value={currentVal}
                    onChange={e => setFdrHours(prev => ({ ...prev, [pid]: { enabled: true, value: e.target.value, saving: false, saved: false } }))}
                    onKeyDown={e => { if (e.key === 'Enter') onFdrHoursSave(pid); }}
                    className="w-[4.5rem] pl-1.5 pr-4 py-0 text-[11px] bg-transparent border-none outline-none text-blue-800 font-semibold placeholder-blue-300"
                    disabled={saving}
                  />
                  <span className="text-[10px] text-blue-500">hrs</span>
                </div>
                <button
                  onClick={() => onFdrHoursSave(pid)}
                  disabled={saving || !currentVal}
                  className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold bg-[#0000ff] hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
                >
                  {saving ? <Spin cls="w-3 h-3 border-2 border-white/40 border-t-white" /> : saved ? '✓ Saved' : 'Save Hours'}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Action buttons */}
      <div className="mt-3 ml-8 flex flex-wrap gap-1.5">
        {!p.cert_sequence ? null : !p.cert_released ? (
          /* Generated but not released */
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            Generated — Pending Release
          </span>
        ) : (
          /* Generated + released */
          <>
            <button onClick={() => onPreview(p)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors"
              style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#0000ff' }}>
              <HiOutlineEye className="w-3.5 h-3.5" /> Preview
            </button>
            <button onClick={() => onDownload(p)} disabled={downloadingId === pid}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60">
              {downloadingId === pid ? <Spin cls="w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-600" /> : <HiOutlineDocumentDownload className="w-3.5 h-3.5" />}
              PDF
            </button>
          </>
        )}
        <Link to={`/admin/participants/edit/${pid}`}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs font-medium text-primary-600 hover:bg-primary-100">
          <HiOutlinePencil className="w-3.5 h-3.5" /> Edit
        </Link>
        <button onClick={() => onDelete(pid, fullName)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-500 hover:bg-red-50">
          <HiOutlineTrash className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

// ─── DHL FORM ST-001 extra certificate — DHL Bahrain / DHL Air (Bahrain), FDR only ──
const DHL_BAHRAIN_NAMES = ['dhl bahrain', 'dhl air (bahrain)'];
const isDhlBahrainAirline = (name) => DHL_BAHRAIN_NAMES.includes(String(name || '').trim().toLowerCase());
const eligibleForDhlExtra = (p) => p.training_type === 'FDR' && isDhlBahrainAirline(p.airline_name);

const airlineKey = (airline) => {
  if (!airline) return null;
  const id = airline.id || airline._id;
  if (!id) return null;
  return String(id);
};

// ─── Individual Airline Accordion Card Component ─────────────────────────────
const AirlineCardGroup = React.memo(function AirlineCardGroup({
  airline,
  participants,
  aKey,
  checkedAirlines,
  toggleAirline,
  openEditAirline,
  checked,
  toggleOne,
  setRowPreview,
  handleDownloadIssued,
  handleDelete,
  downloadingId,
  certEdits,
  startCertEdit,
  cancelCertEdit,
  saveCertEdit,
  setCertEdits,
  ndgScores,
  setNdgScores,
  handleNdgScoreSave,
  fdrHours,
  setFdrHours,
  handleFdrHoursSave,
  handleFdrHoursToggle,
  updateValidity,
  fetchData,
  eligibleForDhlExtra,
  setDhlRowPreview,
  handleDownloadDhlIssued,
  downloadingDhlId,
  filterKey,
  initialOpen,
  airlineCardRefs,
  participantRowRefs,
}) {
  const isFilterActive = Boolean(filterKey && filterKey !== '__');
  const [open, setOpen] = useState(() => initialOpen);

  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (filterKey !== prevFilterKey.current) {
      setOpen(false);
      prevFilterKey.current = filterKey;
    }
  }, [filterKey]);

  const isCardOpen = open;

  const INITIAL_LIMIT = 15;
  const [displayLimit, setDisplayLimit] = useState(() => (initialOpen ? participants.length : INITIAL_LIMIT));

  useEffect(() => {
    if (isCardOpen) {
      if (displayLimit < participants.length) {
        const timer = setTimeout(() => {
          setDisplayLimit(participants.length);
        }, 280);
        return () => clearTimeout(timer);
      }
    } else {
      setDisplayLimit(INITIAL_LIMIT);
    }
  }, [isCardOpen, participants.length, displayLimit]);

  const visibleParticipants = isCardOpen
    ? (displayLimit < participants.length ? participants.slice(0, displayLimit) : participants)
    : [];

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try {
        const stored = JSON.parse(sessionStorage.getItem('airlines_expanded') || '{}');
        stored[aKey] = next;
        sessionStorage.setItem('airlines_expanded', JSON.stringify(stored));
      } catch {}
      return next;
    });
  };

  return (
    <div
      ref={el => { if (airlineCardRefs.current) airlineCardRefs.current[aKey] = el; }}
      className={`bg-white rounded-2xl border border-slate-200/80 shadow-2xs transition-all duration-300 mb-3.5 overflow-hidden ${
        isCardOpen ? 'shadow-md border-slate-300' : 'hover:border-slate-300'
      }`}
    >
      {/* ── Airline header ── */}
      <div className={`flex items-center gap-2 px-3.5 sm:px-6 py-3.5 sm:py-4 flex-wrap overflow-visible transition-colors ${isCardOpen ? 'bg-slate-100/90 border-b border-slate-200/80' : 'bg-white hover:bg-slate-50'}`}>
        {/* Airline checkbox */}
        <div onClick={e => { e.stopPropagation(); toggleAirline(aKey); }}
          className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center cursor-pointer flex-shrink-0 transition-colors ${checkedAirlines.has(aKey) ? 'bg-red-600 border-red-600' : 'border-slate-300 hover:border-red-400'}`}>
          {checkedAirlines.has(aKey) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>

        {/* Airline info — clickable to expand */}
        <button type="button" onClick={toggle} className="flex items-center gap-3 flex-1 text-left min-w-0">
          <LogoAvatar logoUrl={airline.logo_url} name={airline.airlineName} initials={mkInitials(airline.airlineName)} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm sm:text-base font-bold text-slate-900 truncate tracking-tight">{airline.airlineName}</p>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80">
                <HiOutlineUsers className="w-3 h-3 text-slate-400" />{participants.length}
              </span>
            </div>
            {airline.email && (
              <div className="flex items-center gap-1 mt-0.5">
                <HiOutlineMail className="w-3 h-3 text-slate-400" />
                <p className="text-[11px] font-medium text-slate-500 truncate">{airline.email}</p>
              </div>
            )}
          </div>
        </button>

        {/* Airline action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={() => openEditAirline(airline)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs">
            <HiOutlinePencil className="w-3.5 h-3.5 text-slate-500" /> Edit
          </button>
          <button type="button" onClick={toggle} className="p-1.5 rounded-xl hover:bg-slate-100 transition-all">
            <HiOutlineChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ease-out ${isCardOpen ? 'rotate-180 text-slate-800' : 'rotate-0'}`} />
          </button>
        </div>
      </div>

      {/* ── Participants ── */}
      <AnimatePresence initial={false}>
        {isCardOpen && participants.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.35, ease: [0.25, 1, 0.5, 1] }, opacity: { duration: 0.25 } }}
            className="overflow-hidden bg-white"
          >
            <div
              className="border-t border-slate-100 max-h-[460px] overflow-y-auto overflow-x-hidden"
              onWheel={e => {
                const el = e.currentTarget;
                const atTop    = el.scrollTop === 0;
                const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                if (!(atTop && e.deltaY < 0) && !(atBottom && e.deltaY > 0)) {
                  e.stopPropagation();
                }
              }}
            >
              {/* Mobile: cards */}
              <div className="sm:hidden p-3 space-y-2">
                {visibleParticipants.map(p => (
                  <div key={p.id || p._id} ref={el => { if (participantRowRefs.current) participantRowRefs.current[String(p.id || p._id)] = el; }}>
                    <ParticipantCard p={p} checked={checked} onCheck={toggleOne}
                      onPreview={setRowPreview} onDownload={handleDownloadIssued} onEdit={() => {}}
                      onDelete={handleDelete} downloadingId={downloadingId}
                      certEdits={certEdits} onStartEdit={startCertEdit}
                      onCancelEdit={cancelCertEdit} onSaveEdit={saveCertEdit}
                      setCertEdits={setCertEdits}
                      ndgScores={ndgScores} setNdgScores={setNdgScores} onNdgScoreSave={handleNdgScoreSave}
                      fdrHours={fdrHours} setFdrHours={setFdrHours} onFdrHoursSave={handleFdrHoursSave} onFdrHoursToggle={handleFdrHoursToggle} />
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block">
                <table className="w-full min-w-[850px] border-collapse">
                  <colgroup>
                    <col className="w-10" />
                    <col className="w-[24%]" />
                    <col className="w-[12%]" />
                    <col className="w-[16%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[28%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-primary-50/60 border-b border-primary-100">
                      <th className="px-3 py-2.5 text-center" />
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Participant</th>
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Dept</th>
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Training</th>
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Start</th>
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">End</th>
                      <th className="text-center text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleParticipants.map(p => {
                      const pid      = p.id || p._id;
                      const fullName = p.participant_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
                      const isCk     = checked.has(pid);
                      const edit     = certEdits[pid];
                      const displayYear = p.cert_year_override || (() => { const d = p.end_date || p.training_date || ''; return d ? new Date(d.slice(0, 10)).getFullYear() : ''; })();

                      return (
                        <tr key={pid} ref={el => { if (participantRowRefs.current) participantRowRefs.current[String(pid)] = el; }} className={`border-t border-primary-100 transition-colors ${isCk ? 'bg-blue-50/40' : 'hover:bg-primary-50/40'}`}>
                          <td className="px-3 py-3.5 align-middle w-10">
                            <div onClick={() => toggleOne(pid)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${isCk ? 'bg-primary-800 border-primary-800' : 'border-primary-300 hover:border-primary-600'}`}>
                              {isCk && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                          </td>
                          <td className="px-3 py-3.5 align-middle">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-primary-200 flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-bold text-primary-600">{mkInitials(fullName)}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-primary-800">{fullName}</p>
                                {p.cert_sequence && (
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${p.templateVariant === 'india' ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
                                      {p.templateVariant === 'india' ? 'IFOA INDIA' : 'IFOA'}
                                    </span>
                                    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                      p.cert_released
                                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                        : 'text-amber-600 bg-amber-50 border-amber-200'
                                    }`}>
                                      {p.cert_released ? <><HiOutlineCheckCircle className="inline w-2.5 h-2.5 mr-0.5" />Released</> : <><HiOutlineClock className="inline w-2.5 h-2.5 mr-0.5" />Not Released</>}
                                    </span>
                                    <select
                                      value={p.cert_validity || '36'}
                                      onChange={async e => {
                                        const v = e.target.value;
                                        try {
                                          await updateValidity(pid, v);
                                          toast.success('Validity updated');
                                          fetchData({ silent: true });
                                        } catch { toast.error('Failed to update validity'); }
                                      }}
                                      onClick={e => e.stopPropagation()}
                                      className="text-[9px] font-semibold border border-primary-200 rounded px-1.5 py-0.5 text-primary-600 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-400"
                                    >
                                      {VALIDITY_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                                    </select>
                                  </div>
                                )}
                                {p.cert_sequence && (
                                  edit?.editing ? (
                                    <div className="mt-0.5 space-y-1">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="text-[10px] text-primary-400">{p.training_type}-</span>
                                        <input type="number" min="1" value={edit.seq}
                                          onChange={e => setCertEdits(prev => ({ ...prev, [pid]: { ...prev[pid], seq: e.target.value, error: null } }))}
                                          onKeyDown={e => { if (e.key === 'Enter') saveCertEdit(pid); if (e.key === 'Escape') cancelCertEdit(pid); }}
                                          className="w-16 px-1.5 py-0.5 text-[11px] border border-primary-300 rounded focus:outline-none focus:ring-1 focus:ring-accent-400"
                                          disabled={edit.saving} autoFocus />
                                        <span className="text-[10px] text-primary-400">-</span>
                                        <input type="number" min="2000" max="2100" value={edit.year}
                                          onChange={e => setCertEdits(prev => ({ ...prev, [pid]: { ...prev[pid], year: e.target.value, error: null } }))}
                                          onKeyDown={e => { if (e.key === 'Enter') saveCertEdit(pid); if (e.key === 'Escape') cancelCertEdit(pid); }}
                                          className="w-14 px-1.5 py-0.5 text-[11px] border border-primary-300 rounded focus:outline-none focus:ring-1 focus:ring-accent-400"
                                          disabled={edit.saving} />
                                        <button onClick={() => saveCertEdit(pid)} disabled={edit.saving} className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 disabled:opacity-60">{edit.saving ? '…' : 'save'}</button>
                                        <button onClick={() => cancelCertEdit(pid)} className="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-500 rounded hover:bg-primary-200">cancel</button>
                                      </div>
                                      {edit.error && <p className="text-[10px] text-red-500 font-medium">! {edit.error}</p>}
                                    </div>
                                  ) : (
                                    <button onClick={() => startCertEdit(pid, p)} className="flex items-center gap-1 mt-0.5 group">
                                      <span className="text-[10px] font-mono text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded group-hover:bg-primary-100">
                                        {p.training_type}-{String(p.cert_sequence).padStart(5, '0')}-{displayYear}
                                      </span>
                                      <HiOutlinePencil className="w-2.5 h-2.5 text-primary-300 group-hover:text-primary-500" />
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 align-middle text-xs font-medium text-primary-700 leading-snug whitespace-normal break-words">{p.department || '—'}</td>
                          <td className="px-3 py-3.5 align-middle">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={badgeStyle()}>{p.training_type}</span>
                            <p className="text-[10px] mt-0.5 text-primary-400">{TRAINING_LABELS[p.training_type] || p.training_type}</p>
                            {p.training_type === 'NDG' && (() => {
                              const scoreEntry = ndgScores[pid];
                              const currentVal = scoreEntry !== undefined ? scoreEntry.value : (p.ndg_score != null ? String(p.ndg_score) : '');
                              const saving     = scoreEntry?.saving || false;
                              const saved      = scoreEntry?.saved  || false;
                              return (
                                <div className="mt-1.5 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-1.5 py-1">
                                    <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">Score</span>
                                    <input
                                      type="number" min="0" max="100"
                                      placeholder="0-100"
                                      value={currentVal}
                                      onChange={e => setNdgScores(prev => ({ ...prev, [pid]: { value: e.target.value, saving: false, saved: false } }))}
                                      onKeyDown={e => { if (e.key === 'Enter') handleNdgScoreSave(pid); }}
                                      className="w-[4.5rem] pl-1.5 pr-4 py-0 text-[11px] bg-transparent border-none outline-none text-blue-800 font-semibold placeholder-blue-300"
                                      disabled={saving}
                                    />
                                    <span className="text-[10px] text-blue-500">%</span>
                                  </div>
                                  <button
                                    onClick={() => handleNdgScoreSave(pid)}
                                    disabled={saving || !currentVal}
                                    className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[10px] font-semibold bg-[#0000ff] hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
                                  >
                                    {saving ? <Spin cls="w-3 h-3 border-2 border-white/40 border-t-white" /> : saved ? '✓' : 'Save'}
                                  </button>
                                </div>
                              );
                            })()}
                            {p.training_type === 'FDR' && (() => {
                              const entry      = fdrHours[pid];
                              const enabled    = entry?.enabled ?? (p.fdr_hours != null);
                              const currentVal = entry !== undefined ? entry.value : (p.fdr_hours != null ? String(p.fdr_hours) : '');
                              const saving     = entry?.saving || false;
                              const saved      = entry?.saved  || false;
                              return (
                                <div className="mt-1.5" onClick={e => e.stopPropagation()}>
                                  <label className="flex items-center gap-1 text-[10px] font-semibold text-primary-500 cursor-pointer w-fit">
                                    <Checkbox checked={enabled} onCheckedChange={c => handleFdrHoursToggle(pid, !!c)} className="h-3 w-3" />
                                    Add Hours
                                  </label>
                                  {enabled && (
                                    <div className="mt-1 flex items-center gap-1">
                                      <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-1.5 py-1">
                                        <input
                                          type="number" min="0" step="0.5"
                                          placeholder="e.g. 40"
                                          value={currentVal}
                                          onChange={e => setFdrHours(prev => ({ ...prev, [pid]: { enabled: true, value: e.target.value, saving: false, saved: false } }))}
                                          onKeyDown={e => { if (e.key === 'Enter') handleFdrHoursSave(pid); }}
                                          className="w-[4.5rem] pl-1.5 pr-4 py-0 text-[11px] bg-transparent border-none outline-none text-blue-800 font-semibold placeholder-blue-300"
                                          disabled={saving}
                                        />
                                        <span className="text-[10px] text-blue-500">hrs</span>
                                      </div>
                                      <button
                                        onClick={() => handleFdrHoursSave(pid)}
                                        disabled={saving || !currentVal}
                                        className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[10px] font-semibold bg-[#0000ff] hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
                                      >
                                        {saving ? <Spin cls="w-3 h-3 border-2 border-white/40 border-t-white" /> : saved ? '✓' : 'Save'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-3.5 align-middle text-xs font-medium text-primary-600 whitespace-nowrap">{fmtDate(p.training_date)}</td>
                          <td className="px-3 py-3.5 align-middle text-xs font-medium text-primary-600 whitespace-nowrap">{fmtDate(p.end_date)}</td>
                          <td className="px-3 py-3.5 align-middle">
                            <div className="flex items-center justify-end gap-1.5 flex-nowrap whitespace-nowrap">
                              {!p.cert_sequence ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-600 border border-amber-200"><HiOutlineClock className="w-3 h-3" /> Pending</span>
                              ) : !p.cert_released ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                  Generated — Pending Release
                                </span>
                              ) : (
                                <>
                                  <button onClick={() => setRowPreview(p)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium"
                                    style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#0000ff' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#eff6ff'}>
                                    <HiOutlineEye className="w-3.5 h-3.5" /> Preview
                                  </button>
                                  <button onClick={() => handleDownloadIssued(p)} disabled={downloadingId === pid}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60">
                                    {downloadingId === pid ? <Spin cls="w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-600" /> : <HiOutlineDocumentDownload className="w-3.5 h-3.5" />}
                                    PDF
                                  </button>
                                </>
                              )}
                              {eligibleForDhlExtra(p) && p.dhl_cert_released && (
                                <>
                                  <button onClick={() => setDhlRowPreview(p)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-violet-200 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100">
                                    <HiOutlineEye className="w-3.5 h-3.5" /> DHL ST-{String(p.dhl_cert_sequence).padStart(3, '0')}
                                  </button>
                                  <button onClick={() => handleDownloadDhlIssued(p)} disabled={downloadingDhlId === pid}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-violet-200 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-60">
                                    {downloadingDhlId === pid ? <Spin cls="w-3.5 h-3.5 border-2 border-violet-300 border-t-violet-600" /> : <HiOutlineDocumentDownload className="w-3.5 h-3.5" />}
                                    PDF
                                  </button>
                                </>
                              )}
                              <Link to={`/admin/participants/edit/${pid}`}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs font-medium text-primary-600 hover:bg-primary-100">
                                <HiOutlinePencil className="w-3.5 h-3.5" /> Edit
                              </Link>
                              <button onClick={() => handleDelete(pid, fullName)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-500 hover:bg-red-50">
                                <HiOutlineTrash className="w-3.5 h-3.5" /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isCardOpen && participants.length === 0 && (
        <div className="border-t border-primary-100 px-5 py-6 text-center text-sm text-primary-400">
          No participants submitted by this airline yet.
        </div>
      )}
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Airlines() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus') || null;
  const pendingCertsMode = searchParams.get('pendingCerts') === '1';
  const airlineCardRefs    = useRef({});
  const participantRowRefs = useRef({});

  const [data, setData]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('');
  // Persist which airline cards are open across navigation (e.g. Edit → Back)
  // so the accordion doesn't collapse when the page remounts.
  const [expanded, setExpanded]     = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('airlines_expanded') || '{}'); }
    catch { return {}; }
  });
  const [openedCards, setOpenedCards] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('airlines_expanded') || '{}'); }
    catch { return {}; }
  });
  const [checked, setChecked]       = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [certResults, setCertResults]   = useState(null);
  const [rowPreview, setRowPreview]     = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const [variantModal, setVariantModal]       = useState(false);
  const [templateVariant, setTemplateVariant] = useState('default');
  const [includeDhlExtra, setIncludeDhlExtra] = useState(false);
  const [revokingDhlBulk, setRevokingDhlBulk] = useState(false);
  const [bulkValidity, setBulkValidity]       = useState('36'); // default 36 months
  const pendingGenerate = useRef(null);

  const [moduleModal, setModuleModal] = useState({ open: false, record: null });
  const pendingFdrRecord = useRef(null);

  const [certEdits, setCertEdits]   = useState({});
  const [ndgScores, setNdgScores]   = useState({}); // { [pid]: { value, saving, saved } }
  const [fdrHours, setFdrHours]     = useState({}); // { [pid]: { enabled, value, saving, saved } }
  const [savingAllNdgScores, setSavingAllNdgScores] = useState(false); // Track bulk save progress
  const [savingAllFdrHours, setSavingAllFdrHours] = useState(false);
  const [counterModal, setCounterModal] = useState(false);
  const [counters, setCounters]     = useState([]);
  const [resetting, setResetting]   = useState(null);
  const [filterCertStatus, setFilterCertStatus] = useState(''); // '' | 'pending' | 'generated'
  const [sortKey, setSortKey] = useState('name_asc');
  const [checkedAirlines, setCheckedAirlines] = useState(new Set());
  const [deletingAirlines, setDeletingAirlines] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [generatingDhl, setGeneratingDhl] = useState(false);
  const [revokingDhlId, setRevokingDhlId] = useState(null);
  const [downloadingDhlId, setDownloadingDhlId] = useState(null);
  const [dhlRowPreview, setDhlRowPreview] = useState(null);
  // Admin edit-airline modal: { open, id, airlineName, address }
  const [editAirline, setEditAirline] = useState({ open: false, id: null, airlineName: '', address: '' });
  const [savingAirline, setSavingAirline] = useState(false);
  const [controlBarOpen, setControlBarOpen] = useState(false);

  const ALL_TYPES = ['FDI', 'FDR', 'FDA', 'FTL', 'HF', 'NDG', 'GD', 'TCD'];

  // ── Data fetch ───────────────────────────────────────────────────────────────
  // Unique key for an airline — always prefer _id (guaranteed unique),
  // fall back to email (also unique), never use airlineName alone.
  // Use airline.id (plain string) or airline._id — both are now guaranteed strings from
  // the backend toJSON(). Fall back to email (unique) only if somehow both are missing.
  // Always use MongoDB _id as the unique key — never airlineName alone
  // (two airlines can share a name but never an _id).
  // The fake 'Other / Unassigned' entry has no _id so it is also excluded.
  const airlineKey = (airline) => {
    const id = airline.id || airline._id;
    if (!id) return null; // no real _id — pseudo-entry, skip
    return String(id);
  };

  // `silent` skips the loading flag — used for background refreshes after an
  // in-place action (revoke, delete, generate, ...) so the already-rendered
  // list doesn't unmount/remount, which was collapsing expanded cards and
  // resetting scroll position back to the top of the page on every update.
  const fetchData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await getParticipantsByAirline();
      
      // Sort participants within each airline group by creation date (oldest/first entered first)
      const sortedData = res.data.map(({ airline, participants }) => ({
        airline,
        participants: participants.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : Infinity;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : Infinity;
          return dateA - dateB;
        }),
      }));
      
      setData(sortedData);
      setExpanded(prev => {
        const init = {};
        sortedData.forEach(({ airline }) => {
          const key = airlineKey(airline);
          if (key) init[key] = prev[key] ?? false;
        });
        return init;
      });
    } catch { toast.error('Failed to load airline data'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Keep the open-cards state in sessionStorage so it survives page remounts.
  useEffect(() => {
    try { sessionStorage.setItem('airlines_expanded', JSON.stringify(expanded)); } catch { /* ignore */ }
  }, [expanded]);

  const hasProcessedFocus = useRef(false);
  useEffect(() => {
    if (!focusId || loading || data.length === 0 || hasProcessedFocus.current) return;
    // Check if focusId is an airline _id
    let match = data.find(({ airline }) => String(airline._id || airline.id) === focusId);
    let isParticipantFocus = false;
    if (!match) {
      // Check if focusId is a participant _id — find the airline group containing it
      match = data.find(({ participants }) => participants.some(p => String(p.id || p._id) === focusId));
      isParticipantFocus = !!match;
    }
    if (!match) return;
    const aKey = airlineKey(match.airline);
    if (!aKey) return;
    hasProcessedFocus.current = true;
    setExpanded(prev => ({ ...prev, [aKey]: true }));
    setTimeout(() => {
      if (isParticipantFocus) {
        const el = participantRowRefs.current[focusId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('notif-highlight');
          el.addEventListener('animationend', () => el.classList.remove('notif-highlight'), { once: true });
        }
      } else {
        const el = airlineCardRefs.current[aKey];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('notif-highlight');
          el.addEventListener('animationend', () => el.classList.remove('notif-highlight'), { once: true });
        }
      }
    }, 350);
  }, [focusId, loading, data]);

  // Highlight + expand every airline that has a participant still awaiting
  // certificate generation — entry point for the "Certificates Pending"
  // notification / dashboard quick-link, which isn't tied to one record.
  const hasProcessedPendingCerts = useRef(false);
  useEffect(() => {
    if (!pendingCertsMode || loading || data.length === 0 || hasProcessedPendingCerts.current) return;
    const pendingKeys = [];
    data.forEach(({ airline, participants }) => {
      const aKey = airlineKey(airline);
      if (aKey && participants.some(p => !p.cert_sequence)) pendingKeys.push(aKey);
    });
    if (pendingKeys.length === 0) return;
    hasProcessedPendingCerts.current = true;
    setExpanded(prev => {
      const next = { ...prev };
      pendingKeys.forEach(k => { next[k] = true; });
      return next;
    });
    setTimeout(() => {
      pendingKeys.forEach(k => {
        const el = airlineCardRefs.current[k];
        if (el) {
          el.classList.add('notif-highlight');
          el.addEventListener('animationend', () => el.classList.remove('notif-highlight'), { once: true });
        }
      });
      const firstEl = airlineCardRefs.current[pendingKeys[0]];
      if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
  }, [pendingCertsMode, loading, data]);

  // ── Counter reset ────────────────────────────────────────────────────────────
  const openCounterModal = async () => {
    try { const res = await getCertCounters(); setCounters(res.data); } catch { setCounters([]); }
    setCounterModal(true);
  };

  const handleResetCounter = async (type) => {
    const ok = await confirm(
      `Reset "${type}" to 0?\n\nThis will:\n• Clear ALL certificate numbers for ${type} participants\n• Existing certificates become invalid\n• You must regenerate every ${type} certificate\n\nThe page will reload after reset.`,
      { title: `Reset ${type} counter`, confirmLabel: 'Reset' }
    );
    if (!ok) return;
    setResetting(type);
    try {
      await resetCertCounter(type, 0);
      toast.success(`${type} reset. All ${type} certificates must be regenerated.`, { duration: 4000 });
      setCounterModal(false);
      await fetchData({ silent: true });                 // ← reload page data immediately
    } catch { toast.error('Failed to reset'); }
    setResetting(null);
  };

  const handleResetAll = async () => {
    const ok = await confirm(
      'Reset ALL counters to 0?\n\nThis will:\n• Clear certificate numbers for EVERY participant\n• All existing certificates become invalid\n• You must regenerate ALL certificates\n\nThe page will reload after reset.',
      { title: 'Reset ALL counters', confirmLabel: 'Reset All' }
    );
    if (!ok) return;
    setResetting('ALL');
    try {
      await resetAllCertCounters(0);
      toast.success('All counters reset. All certificates must be regenerated.', { duration: 4000 });
      setCounterModal(false);
      await fetchData({ silent: true });                 // ← reload page data immediately
    } catch { toast.error('Failed to reset'); }
    setResetting(null);
  };

  // ── Cert ID editing ──────────────────────────────────────────────────────────
  const startCertEdit = (pid, p) => {
    const d = p.end_date || p.training_date || '';
    const y = p.cert_year_override || (d ? new Date(d.slice(0, 10)).getFullYear() : new Date().getFullYear());
    setCertEdits(prev => ({ ...prev, [pid]: { editing: true, seq: String(p.cert_sequence || ''), year: String(y), saving: false, error: null } }));
  };
  const cancelCertEdit = (pid) => setCertEdits(prev => { const n = { ...prev }; delete n[pid]; return n; });
  const saveCertEdit = async (pid) => {
    const edit = certEdits[pid];
    if (!edit) return;
    const seq = Number(edit.seq), year = Number(edit.year);
    if (!seq || seq <= 0)                  { setCertEdits(p => ({ ...p, [pid]: { ...p[pid], error: 'Invalid sequence' } })); return; }
    if (!year || year < 2000 || year > 2100) { setCertEdits(p => ({ ...p, [pid]: { ...p[pid], error: 'Invalid year' } })); return; }
    setCertEdits(prev => ({ ...prev, [pid]: { ...prev[pid], saving: true, error: null } }));
    try {
      await updateFullCertId(pid, seq, year);
      toast.success('Certificate ID updated');
      setCertEdits(prev => { const n = { ...prev }; delete n[pid]; return n; });
      fetchData({ silent: true });
    } catch (err) {
      setCertEdits(prev => ({ ...prev, [pid]: { ...prev[pid], saving: false, error: err.response?.data?.error || 'Failed' } }));
    }
  };

  // ── NDG Score handler — updates score in-place without reloading the page ───
  const handleNdgScoreSave = async (pid) => {
    const entry = ndgScores[pid];
    if (!entry) return;
    const val = Number(entry.value);
    if (isNaN(val) || val < 0 || val > 100) { toast.error('Score must be 0–100'); return; }
    setNdgScores(prev => ({ ...prev, [pid]: { ...prev[pid], saving: true } }));
    try {
      await updateNdgScore(pid, val);
      toast.success('NDG score saved');
      // Update the score in local state only — NO full page reload
      setNdgScores(prev => ({ ...prev, [pid]: { value: String(val), saving: false, saved: true } }));
      // Patch the in-memory data so the displayed value stays consistent
      setData(prev => prev.map(({ airline, participants }) => ({
        airline,
        participants: participants.map(p =>
          (p.id || p._id) === pid ? { ...p, ndg_score: val } : p
        ),
      })));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save score');
      setNdgScores(prev => ({ ...prev, [pid]: { ...prev[pid], saving: false } }));
    }
  };

  // ── Save all NDG scores at once ────────────────────────────────────────────
  const handleSaveAllNdgScores = async () => {
    // Collect all modified NDG scores that need saving
    const toSave = Object.entries(ndgScores)
      .filter(([, entry]) => entry && entry.value && !entry.saving)
      .map(([pid, entry]) => ({ pid, val: Number(entry.value) }))
      .filter(({ val }) => !isNaN(val) && val >= 0 && val <= 100);

    if (toSave.length === 0) {
      toast.error('No NDG scores to save');
      return;
    }

    setSavingAllNdgScores(true);
    let successCount = 0;
    let failCount = 0;

    for (const { pid, val } of toSave) {
      try {
        setNdgScores(prev => ({ ...prev, [pid]: { ...prev[pid], saving: true } }));
        await updateNdgScore(pid, val);
        
        // Update local state
        setNdgScores(prev => ({ ...prev, [pid]: { value: String(val), saving: false, saved: true } }));
        setData(prev => prev.map(({ airline, participants }) => ({
          airline,
          participants: participants.map(p =>
            (p.id || p._id) === pid ? { ...p, ndg_score: val } : p
          ),
        })));
        successCount++;
      } catch (err) {
        setNdgScores(prev => ({ ...prev, [pid]: { ...prev[pid], saving: false } }));
        failCount++;
      }
    }

    setSavingAllNdgScores(false);
    
    if (failCount === 0) {
      toast.success(`${successCount} NDG score${successCount !== 1 ? 's' : ''} saved successfully`);
    } else if (successCount > 0) {
      toast.error(`${successCount} saved, ${failCount} failed`);
    } else {
      toast.error('Failed to save NDG scores');
    }
  };

  // ── FDR hours — optional, admin-toggled figure shown on the FDR certificate ──
  const handleFdrHoursSave = async (pid) => {
    const entry = fdrHours[pid];
    if (!entry || entry.value === '') return;
    const val = Number(entry.value);
    if (isNaN(val) || val < 0) { toast.error('Hours must be 0 or more'); return; }
    setFdrHours(prev => ({ ...prev, [pid]: { ...prev[pid], saving: true } }));
    try {
      await updateFdrHours(pid, val);
      toast.success('Hours saved');
      setFdrHours(prev => ({ ...prev, [pid]: { enabled: true, value: String(val), saving: false, saved: true } }));
      setData(prev => prev.map(({ airline, participants }) => ({
        airline,
        participants: participants.map(p =>
          (p.id || p._id) === pid ? { ...p, fdr_hours: val } : p
        ),
      })));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save hours');
      setFdrHours(prev => ({ ...prev, [pid]: { ...prev[pid], saving: false } }));
    }
  };

  // Unchecking the "Add Hours" box clears and persists immediately, so the
  // certificate line reverts to its plain form without a manual save step.
  const handleFdrHoursToggle = async (pid, checked) => {
    if (checked) {
      setFdrHours(prev => ({ ...prev, [pid]: { enabled: true, value: prev[pid]?.value ?? '', saving: false, saved: false } }));
      return;
    }
    setFdrHours(prev => ({ ...prev, [pid]: { enabled: false, value: '', saving: true, saved: false } }));
    try {
      await updateFdrHours(pid, null);
      setData(prev => prev.map(({ airline, participants }) => ({
        airline,
        participants: participants.map(p =>
          (p.id || p._id) === pid ? { ...p, fdr_hours: null } : p
        ),
      })));
      setFdrHours(prev => ({ ...prev, [pid]: { enabled: false, value: '', saving: false, saved: false } }));
    } catch {
      toast.error('Failed to remove hours');
      setFdrHours(prev => ({ ...prev, [pid]: { enabled: true, value: prev[pid]?.value ?? '', saving: false, saved: false } }));
    }
  };

  // ── Save all FDR hours at once ─────────────────────────────────────────────
  const handleSaveAllFdrHours = async () => {
    const toSave = Object.entries(fdrHours)
      .filter(([, entry]) => entry?.enabled && entry.value && !entry.saving)
      .map(([pid, entry]) => ({ pid, val: Number(entry.value) }))
      .filter(({ val }) => !isNaN(val) && val >= 0);

    if (toSave.length === 0) {
      toast.error('No hours to save');
      return;
    }

    setSavingAllFdrHours(true);
    let successCount = 0;
    let failCount = 0;

    for (const { pid, val } of toSave) {
      try {
        setFdrHours(prev => ({ ...prev, [pid]: { ...prev[pid], saving: true } }));
        await updateFdrHours(pid, val);
        setFdrHours(prev => ({ ...prev, [pid]: { enabled: true, value: String(val), saving: false, saved: true } }));
        setData(prev => prev.map(({ airline, participants }) => ({
          airline,
          participants: participants.map(p =>
            (p.id || p._id) === pid ? { ...p, fdr_hours: val } : p
          ),
        })));
        successCount++;
      } catch (err) {
        setFdrHours(prev => ({ ...prev, [pid]: { ...prev[pid], saving: false } }));
        failCount++;
      }
    }

    setSavingAllFdrHours(false);

    if (failCount === 0) {
      toast.success(`${successCount} hour${successCount !== 1 ? 's entry' : ' entry'} saved successfully`);
    } else if (successCount > 0) {
      toast.error(`${successCount} saved, ${failCount} failed`);
    } else {
      toast.error('Failed to save hours');
    }
  };

  // ── Selection helpers ────────────────────────────────────────────────────────
  const allParticipants = data.flatMap(({ participants }) => participants);
  const allIds          = allParticipants.map(p => p.id || p._id);
  const allChecked      = allIds.length > 0 && allIds.every(id => checked.has(id));
  const toggleSelectAll = () => allChecked ? setChecked(new Set()) : setChecked(new Set(allIds));
  const toggleOne       = id => setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroupAll  = participants => {
    const ids = participants.map(p => p.id || p._id);
    const all = ids.every(id => checked.has(id));
    setChecked(prev => { const n = new Set(prev); all ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id)); return n; });
  };
  // Always use airlineKey() — never raw airlineName — so two accounts with the
  // same airline name are never treated as the same entry.
  const allAirlinesChecked = data.length > 0 && data.every(({ airline }) => checkedAirlines.has(airlineKey(airline)));
  const toggleAllAirlines = () => {
    if (allAirlinesChecked) {
      // Deselect all airlines AND all participants
      setCheckedAirlines(new Set());
      setChecked(new Set());
    } else {
      // Select all airlines AND all their participants
      setCheckedAirlines(new Set(data.map(({ airline }) => airlineKey(airline))));
      setChecked(new Set(data.flatMap(({ participants }) => participants.map(p => p.id || p._id))));
    }
  };
  const toggleAirline = key => {
    // Toggle the airline checkbox
    setCheckedAirlines(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    // Also select / deselect all participants belonging to that airline
    const group = data.find(d => airlineKey(d.airline) === key);
    if (!group) return;
    const ids = group.participants.map(p => p.id || p._id);
    setChecked(prev => {
      const n = new Set(prev);
      const alreadyIn = ids.every(id => n.has(id));
      alreadyIn ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id));
      return n;
    });
  };
  const toggle = useCallback((key) => {
    setExpanded(prev => {
      const isOpening = !prev[key];
      if (isOpening) {
        setOpenedCards(o => ({ ...o, [key]: true }));
        requestAnimationFrame(() => {
          const card = airlineCardRefs.current[key];
          if (!card) return;
          const rect = card.getBoundingClientRect();
          const STICKY_TOP = 120;
          if (rect.top < STICKY_TOP) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      }
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  // ── Delete helpers ───────────────────────────────────────────────────────────
  const handleDelete = async (id, name) => {
    if (!(await confirm(`Delete record for "${name}"?`, { title: 'Delete record', confirmLabel: 'Delete' }))) return;
    try { await deleteParticipant(id); toast.success('Record deleted'); setChecked(prev => { const n = new Set(prev); n.delete(id); return n; }); fetchData({ silent: true }); }
    catch { toast.error('Failed to delete'); }
  };

  const handleDeleteSelected = async () => {
    if (checked.size === 0) { toast.error('Select at least one participant'); return; }
    const confirmed = await confirm(`Delete ${checked.size} record(s)?`, { title: 'Delete records', confirmLabel: 'Delete' });
    if (!confirmed) return;
    setDeletingSelected(true);
    let ok = 0, fail = 0;
    for (const id of checked) { try { await deleteParticipant(id); ok++; } catch { fail++; } }
    setDeletingSelected(false);
    setChecked(new Set());
    fetchData({ silent: true });
    fail === 0 ? toast.success(`${ok} record${ok !== 1 ? 's' : ''} deleted`) : toast.error(`${ok} deleted, ${fail} failed`);
  };

  // Revoke certificates — sets cert_sequence back to null (Pending state)
  const handleRevokeSelected = async () => {
    const withCerts = allParticipants.filter(p => checked.has(p.id || p._id) && p.cert_sequence);
    if (withCerts.length === 0) {
      toast.error('None of the selected participants have a certificate to revoke'); return;
    }
    const confirmed = await confirm(
      `Revoke certificates for ${withCerts.length} participant${withCerts.length > 1 ? 's' : ''}?\n\n` +
      `This will set them back to Pending status.\n` +
      `The airline will immediately lose access to download/preview.\n\n` +
      `You can regenerate them at any time.`,
      { title: 'Revoke certificates', confirmLabel: 'Revoke' }
    );
    if (!confirmed) return;
    setRevoking(true);
    let ok = 0, fail = 0;
    for (const p of withCerts) {
      try { await revokeCertificate(p.id || p._id); ok++; }
      catch (err) { console.error('Revoke failed:', err.response?.data?.error); fail++; }
    }
    setRevoking(false);
    fetchData({ silent: true });
    if (fail === 0) toast.success(`${ok} certificate${ok > 1 ? 's' : ''} revoked — now Pending`);
    else toast.error(`${ok} revoked, ${fail} failed`);
  };

  // ── Admin edit airline (name + address) ──────────────────────────────────────
  const openEditAirline = (airline) => {
    setEditAirline({
      open: true,
      id: airline._id || airline.id,
      airlineName: airline.airlineName || '',
      address: airline.address || '',
    });
  };
  const closeEditAirline = () => setEditAirline({ open: false, id: null, airlineName: '', address: '' });
  const saveEditAirline = async () => {
    const name = editAirline.airlineName.trim();
    if (!name) { toast.error('Airline name cannot be empty'); return; }
    setSavingAirline(true);
    try {
      const res = await updateAirline(editAirline.id, { airlineName: name, address: editAirline.address.trim() });
      const updated = res.data.airline;
      // Patch in-memory data so the change shows immediately without a full reload
      setData(prev => prev.map(d =>
        airlineKey(d.airline) === String(editAirline.id)
          ? { ...d, airline: { ...d.airline, airlineName: updated.airlineName, address: updated.address } }
          : d
      ));
      toast.success('Airline updated');
      closeEditAirline();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update airline');
    } finally {
      setSavingAirline(false);
    }
  };

  const handleDeleteAirlineData = async (airline, count) => {
    const aKey        = airlineKey(airline);
    const airlineId   = airline._id;
    const airlineName = airline.airlineName;
    const confirmed = await confirm(
      `Remove all submissions for "${airlineName}"?\n\nThis deletes ${count} participant record(s) from the admin view.\nThe airline account and login remain intact. Cannot be undone.`,
      { title: 'Remove all submissions', confirmLabel: 'Remove' }
    );
    if (!confirmed) return;
    try {
      const res = await deleteAirlineById(airlineId);
      toast.success(res.data.message || `"${airlineName}" deleted`);
      // Remove ONLY this exact airline by its unique key — others with the same name stay
      setData(prev => prev.filter(d => airlineKey(d.airline) !== aKey));
      setChecked(prev => {
        const n = new Set(prev);
        data.find(d => airlineKey(d.airline) === aKey)?.participants.forEach(p => n.delete(p.id || p._id));
        return n;
      });
      setCheckedAirlines(prev => { const n = new Set(prev); n.delete(aKey); return n; });
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  const handleDeleteSelectedAirlines = async () => {
    if (checkedAirlines.size === 0) { toast.error('Select at least one airline'); return; }
    const confirmed = await confirm(
      `Remove all submissions for ${checkedAirlines.size} airline(s)?\n\nThis deletes their participant records from the admin view.\nAll airline accounts and logins remain intact. Cannot be undone.`,
      { title: 'Remove all submissions', confirmLabel: 'Remove' }
    );
    if (!confirmed) return;
    setDeletingAirlines(true);
    const deletedIds = new Set(); let fail = 0;
    for (const airlineId of checkedAirlines) {
      try { await deleteAirlineById(airlineId); deletedIds.add(airlineId); } catch { fail++; }
    }
    setDeletingAirlines(false);
    // Remove only the exact airlines whose key was deleted — others with same name are unaffected
    setData(prev => prev.filter(d => !deletedIds.has(airlineKey(d.airline))));
    setCheckedAirlines(new Set());
    setChecked(prev => {
      const n = new Set(prev);
      data.forEach(({ airline, participants }) => {
        if (deletedIds.has(airlineKey(airline))) participants.forEach(p => n.delete(p.id || p._id));
      });
      return n;
    });
    fail === 0 ? toast.success(`${deletedIds.size} airline${deletedIds.size > 1 ? 's' : ''} deleted`) : toast.error(`${deletedIds.size} deleted, ${fail} failed`);
  };

  // ── Certificate generation ───────────────────────────────────────────────────
  const generateOneWithVariant = async (p, modulesOverride, variant, validity = '36') => {
    const pid = p.id || p._id;
    try {
      // Save validity to DB before generating so it's baked into the PDF
      await updateValidity(pid, validity);
      const res = modulesOverride
        ? await generateCertificateWithModules(pid, modulesOverride, variant)
        : await generateCertificateBlob(pid, { variant });
      const blob    = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      const certId  = p.cert_sequence ? `${p.training_type}-${String(p.cert_sequence).padStart(5, '0')}` : 'Assigned';
      return { id: pid, name: p.participant_name, trainingType: p.training_type, certId, blobUrl, filename: `Certificate_${(p.participant_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf` };
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Unknown error';
      console.error('Certificate generation failed:', msg);
      toast.error(`Failed for ${p.participant_name}: ${msg}`);
      return null;
    }
  };

  // Generates the DHL extra cert for each eligible participant in `list`,
  // returning result entries (for CertResultModal) — does not touch loading
  // state or toasts, so it can be reused by both the standalone DHL bulk
  // action and the "also generate" checkbox inside the normal generate flow.
  const generateDhlForParticipants = async (list) => {
    const results = [];
    for (const p of list) {
      const pid = p.id || p._id;
      try {
        const res     = await generateDhlCertificateBlob(pid);
        const blob    = new Blob([res.data], { type: 'application/pdf' });
        const blobUrl = window.URL.createObjectURL(blob);
        results.push({ id: `dhl-${pid}`, name: p.participant_name, trainingType: 'DHL ST-001', certId: 'DHL', blobUrl, filename: `DHL_ST001_${(p.participant_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf` });
      } catch (err) {
        const msg = err.response?.data?.error || err.message || 'Unknown error';
        toast.error(`DHL cert failed for ${p.participant_name}: ${msg}`);
      }
    }
    return results;
  };

  const runBulkGenerate = async (toGenerate, modulesMap, variant = 'default', validity = '36', alsoDhl = false) => {
    setGenerating(true);
    const results = [];
    for (const p of toGenerate) {
      const r = await generateOneWithVariant(p, modulesMap[p.id || p._id] || null, variant, validity);
      if (r) results.push(r);
    }
    if (alsoDhl) {
      const eligible = toGenerate.filter(eligibleForDhlExtra);
      if (eligible.length) results.push(...(await generateDhlForParticipants(eligible)));
    }
    setGenerating(false);
    fetchData({ silent: true });
    if (results.length) setCertResults(results);
  };

  const handleGenerateSelected = async () => {
    if (checked.size === 0) { toast.error('Select at least one participant'); return; }

    // Only generate participants that don't have a released certificate yet
    const toGenerate = allParticipants.filter(p => checked.has(p.id || p._id) && !p.cert_released);
    if (toGenerate.length === 0) {
      toast('All selected participants already have released certificates.', { icon: '✅', duration: 4000 });
      return;
    }

    const fdrNeedsModules = toGenerate.find(p => p.training_type === 'FDR' && !p.modules);
    if (fdrNeedsModules) {
      pendingFdrRecord.current = { record: fdrNeedsModules, rest: toGenerate.filter(p => (p.id || p._id) !== (fdrNeedsModules.id || fdrNeedsModules._id)) };
      setModuleModal({ open: true, record: fdrNeedsModules });
      return;
    }
    pendingGenerate.current = { toGenerate, modulesMap: {} };
    setIncludeDhlExtra(false);
    setVariantModal(true);
  };

  // Extra DHL FORM ST-001 certificate — DHL Bahrain / DHL Air (Bahrain), FDR only.
  // Fully separate from the normal generate flow above: own endpoint, own numbering.
  const handleGenerateDhlSelected = async () => {
    const selected   = allParticipants.filter(p => checked.has(p.id || p._id));
    const alreadyHas = selected.filter(p => eligibleForDhlExtra(p) && p.dhl_cert_released);
    const eligible   = selected.filter(p => eligibleForDhlExtra(p) && !p.dhl_cert_released);
    const skipped    = selected.length - eligible.length - alreadyHas.length;

    if (eligible.length === 0) {
      if (alreadyHas.length > 0) {
        toast.error(
          alreadyHas.length === 1
            ? `${alreadyHas[0].participant_name} already has a DHL certificate.`
            : `All ${alreadyHas.length} selected participants already have a DHL certificate.`
        );
      } else {
        toast.error('None of the selected participants are eligible (DHL Bahrain / DHL Air (Bahrain), FDR training only).');
      }
      return;
    }
    setGeneratingDhl(true);
    const results = await generateDhlForParticipants(eligible);
    setGeneratingDhl(false);
    fetchData({ silent: true });
    if (alreadyHas.length > 0) {
      toast(`${alreadyHas.length} selected participant${alreadyHas.length > 1 ? 's' : ''} skipped — already has a DHL certificate.`, { icon: 'ℹ️' });
    }
    if (skipped > 0) toast(`${skipped} selected participant${skipped > 1 ? 's' : ''} skipped (not eligible).`, { icon: 'ℹ️' });
    if (results.length) setCertResults(results);
  };

  const handleRevokeDhlCert = async (p) => {
    const pid = p.id || p._id;
    setRevokingDhlId(pid);
    try {
      await revokeDhlCertificate(pid);
      toast.success('DHL certificate revoked');
      fetchData({ silent: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to revoke DHL certificate');
    } finally {
      setRevokingDhlId(null);
    }
  };

  // Bulk revoke — clears the DHL extra cert for every checked+released participant
  const handleRevokeDhlSelected = async () => {
    const withDhl = allParticipants.filter(p => checked.has(p.id || p._id) && p.dhl_cert_released);
    if (withDhl.length === 0) { toast.error('None of the selected participants have a DHL certificate to revoke'); return; }
    const confirmed = await confirm(`Revoke DHL certificates for ${withDhl.length} participant${withDhl.length > 1 ? 's' : ''}?`, { title: 'Revoke DHL certificates', confirmLabel: 'Revoke' });
    if (!confirmed) return;
    setRevokingDhlBulk(true);
    let ok = 0, fail = 0;
    for (const p of withDhl) {
      try { await revokeDhlCertificate(p.id || p._id); ok++; }
      catch { fail++; }
    }
    setRevokingDhlBulk(false);
    fetchData({ silent: true });
    if (fail === 0) toast.success(`${ok} DHL certificate${ok > 1 ? 's' : ''} revoked`);
    else toast.error(`${ok} revoked, ${fail} failed`);
  };

  const handleModuleConfirm = modules => {
    const pending = pendingFdrRecord.current;
    pendingFdrRecord.current = null;
    setModuleModal({ open: false, record: null });
    if (!pending) return;
    pendingGenerate.current = { toGenerate: [pending.record, ...(pending.rest || [])], modulesMap: { [pending.record.id || pending.record._id]: modules } };
    setVariantModal(true);
  };

  const handleVariantConfirm = async () => {
    setVariantModal(false);
    const { toGenerate, modulesMap } = pendingGenerate.current || {};
    pendingGenerate.current = null;
    if (!toGenerate) return;
    await runBulkGenerate(toGenerate, modulesMap, templateVariant, bulkValidity, includeDhlExtra);
  };

  const closeResults = () => { if (certResults) certResults.forEach(r => window.URL.revokeObjectURL(r.blobUrl)); setCertResults(null); };

  const handleDownloadIssued = async p => {
    const pid = p.id || p._id;
    try {
      setDownloadingId(pid);
      const res  = await generateCertificateBlob(pid);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `Certificate_${(p.participant_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Certificate downloaded');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Download failed';
      toast.error(msg);
    }
    finally { setDownloadingId(null); }
  };

  const handleDownloadDhlIssued = async p => {
    const pid = p.id || p._id;
    try {
      setDownloadingDhlId(pid);
      const res  = await downloadDhlCertificate(pid);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `DHL_ST001_${(p.participant_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('DHL certificate downloaded');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Download failed';
      toast.error(msg);
    }
    finally { setDownloadingDhlId(null); }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return data.map(({ airline, participants }) => {
      // Search also matches the airline / organization name + address, so admins can
      // find an airline directly. When the airline name matches, keep all its rows.
      const q = search.toLowerCase();
      const airlineMatch = !!search && [airline.airlineName, airline.address, airline.email]
        .some(s => (s || '').toLowerCase().includes(q));
      return {
        airline,
        participants: participants.filter(p => {
          const nm = !search || airlineMatch || [p.participant_name, p.first_name, p.last_name, p.department].some(s => (s || '').toLowerCase().includes(search.toLowerCase()));
          const typeMatch   = !filterType || p.training_type === filterType;
          const statusMatch = !filterCertStatus
            || (filterCertStatus === 'pending'   && !p.cert_released)
            || (filterCertStatus === 'generated' &&  p.cert_released);
          return nm && typeMatch && statusMatch;
        }),
      };
    }).filter(({ participants }) => participants.length > 0).sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':   return (a.airline.airlineName || '').localeCompare(b.airline.airlineName || '');
        case 'name_desc':  return (b.airline.airlineName || '').localeCompare(a.airline.airlineName || '');
        case 'count_desc': return b.participants.length - a.participants.length;
        case 'count_asc':  return a.participants.length - b.participants.length;
        default:           return 0;
      }
    });
  }, [data, search, filterType, filterCertStatus, sortKey]);

  const totalParticipants = allParticipants.length;
  const totalAirlines     = data.length;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col">

      {/* Modals */}
      <ModuleSelector isOpen={moduleModal.open} onClose={() => { setModuleModal({ open: false, record: null }); pendingFdrRecord.current = null; }} onConfirm={handleModuleConfirm} initialModules={moduleModal.record?.modules ? moduleModal.record.modules.split(',').map(m => m.trim()) : []} />
      <VariantModal open={variantModal} variant={templateVariant} setVariant={setTemplateVariant} validity={bulkValidity} setValidity={setBulkValidity} onConfirm={handleVariantConfirm} onClose={() => { setVariantModal(false); pendingGenerate.current = null; }} count={pendingGenerate.current?.toGenerate?.length || checked.size}
        dhlEligibleCount={(pendingGenerate.current?.toGenerate || []).filter(eligibleForDhlExtra).length}
        includeDhl={includeDhlExtra} setIncludeDhl={setIncludeDhlExtra} />
      <CertResultModal results={certResults} onClose={closeResults} />

      {/* ── Admin: Edit Airline Modal ── */}
      <AnimatePresence>
        {editAirline.open && (
          <>
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
              onClick={closeEditAirline}
            >
              <motion.div
                key="card"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
              <div className="flex items-center justify-between px-5 py-4 border-b border-primary-100">
                <h2 className="text-base font-bold text-primary-800">Edit Airline</h2>
                <button onClick={closeEditAirline} className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-primary-500 uppercase tracking-wider mb-1.5">Organization / Airline Name</label>
                  <input type="text" value={editAirline.airlineName}
                    onChange={e => setEditAirline(prev => ({ ...prev, airlineName: e.target.value }))}
                    className="w-full border border-primary-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                    placeholder="Airline name" autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-primary-500 uppercase tracking-wider mb-1.5">Address</label>
                  <textarea value={editAirline.address} rows={3}
                    onChange={e => setEditAirline(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full border border-primary-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-y"
                    placeholder="Airline address" />
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-3">
                <button onClick={closeEditAirline} className="btn-outline flex-1">Cancel</button>
                <button onClick={saveEditAirline} disabled={savingAirline}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60">
                  {savingAirline && <Spin />}
                  {savingAirline ? 'Saving…' : 'Save'}
                </button>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      <CounterResetModal open={counterModal} onClose={() => setCounterModal(false)} counters={counters} ALL_TYPES={ALL_TYPES} resetting={resetting} onReset={handleResetCounter} onResetAll={handleResetAll} />

      {/* Per-row preview modal */}
      <AnimatePresence>
        {rowPreview && (() => {
          const token = localStorage.getItem('token') || '';
          const pid   = rowPreview.id || rowPreview._id;
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
                onClick={() => setRowPreview(null)}
              >
                <motion.div
                  key="card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-primary-200">
                  <div className="min-w-0 mr-3">
                    <p className="text-sm sm:text-base font-bold text-primary-800 truncate">Certificate — {rowPreview.participant_name}</p>
                    <p className="text-xs text-primary-400 mt-0.5 truncate">{TRAINING_LABELS[rowPreview.training_type] || rowPreview.training_type}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleDownloadIssued(rowPreview)} disabled={downloadingId === (rowPreview.id || rowPreview._id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary-800 text-white text-xs font-semibold rounded-lg hover:bg-primary-900 disabled:opacity-60">
                      {downloadingId === (rowPreview.id || rowPreview._id) ? <Spin /> : <HiOutlineDocumentDownload className="w-4 h-4" />}
                      <span className="hidden sm:inline">{downloadingId === (rowPreview.id || rowPreview._id) ? 'Downloading…' : 'Download PDF'}</span>
                    </button>
                    <button onClick={() => setRowPreview(null)} className="p-2 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
                  </div>
                </div>
                <div className="bg-primary-50 relative" style={{ height: '65vh' }}>
                  <iframe src={src} title="Certificate Preview" className="w-full h-full border-0" />
                  <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-1.5 text-[10px] text-primary-400">If blank, click Download PDF</div>
                </div>
                </motion.div>
              </div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* Per-row DHL FORM ST-001 preview modal */}
      <AnimatePresence>
        {dhlRowPreview && (() => {
          const token = localStorage.getItem('token') || '';
          const pid   = dhlRowPreview.id || dhlRowPreview._id;
          const src   = `${API_BASE}/certificates/dhl-preview/${pid}?token=${encodeURIComponent(token)}`;
          return (
            <>
              <motion.div
                key="dhl-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed -inset-20 z-50 bg-black/50 backdrop-blur-sm pointer-events-none"
              />
              <div
                key="dhl-layout"
                className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
                onClick={() => setDhlRowPreview(null)}
              >
                <motion.div
                  key="dhl-card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-primary-200">
                  <div className="min-w-0 mr-3">
                    <p className="text-sm sm:text-base font-bold text-primary-800 truncate">DHL Certificate — {dhlRowPreview.participant_name}</p>
                    <p className="text-xs text-primary-400 mt-0.5 truncate">DHL FORM ST-{String(dhlRowPreview.dhl_cert_sequence).padStart(3, '0')}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleDownloadDhlIssued(dhlRowPreview)} disabled={downloadingDhlId === pid}
                      className="flex items-center gap-1.5 px-3 py-2 bg-violet-700 text-white text-xs font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-60">
                      {downloadingDhlId === pid ? <Spin /> : <HiOutlineDocumentDownload className="w-4 h-4" />}
                      <span className="hidden sm:inline">{downloadingDhlId === pid ? 'Downloading…' : 'Download PDF'}</span>
                    </button>
                    <button onClick={() => setDhlRowPreview(null)} className="p-2 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
                  </div>
                </div>
                <div className="bg-primary-50 relative" style={{ height: '65vh' }}>
                  <iframe src={src} title="DHL Certificate Preview" className="w-full h-full border-0" />
                  <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-1.5 text-[10px] text-primary-400">If blank, click Download PDF</div>
                </div>
                </motion.div>
              </div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* ── Page Header (Full Width Edge-to-Edge) ── */}
      <div className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-xl font-bold text-primary-800 tracking-tight truncate">Airlines &amp; Submissions</h1>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              <span>{totalAirlines} Airlines</span>
              <span>•</span>
              <span>{totalParticipants} Participants</span>
            </div>
          </div>
          <p className="text-xs text-primary-400 mt-0.5 hidden sm:block">View airline submissions, generate and manage certificates</p>
        </div>
        <Link to="/admin/participants/add" className="btn-primary flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 sm:px-4 sm:py-2 whitespace-nowrap flex-shrink-0">
          <HiOutlinePlusCircle className="w-4 h-4" />
          <span>Add</span>
        </Link>
      </div>

      {/* ── Page content (padded) ── */}
      <div className="px-3.5 sm:px-6 lg:px-8 py-4 space-y-3 sm:space-y-5">

      {/* ── Unified Compact Control & Filter Bar ── */}
      {(() => {
        const hasSelection = checked.size > 0 || checkedAirlines.size > 0;
        const hasNdg = Object.values(ndgScores).some(e => e?.value);
        const hasFdrHours = Object.values(fdrHours).some(e => e?.enabled && e?.value);

        return (
          <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-md py-1.5 -mx-3.5 px-3.5 sm:-mx-6 sm:px-6 transition-all mb-3">
            <div className="bg-white rounded-xl border border-slate-200/80 p-2 sm:p-3 shadow-2xs space-y-2">
              {/* ── Row 1: Selection Checkboxes + Actions Dropdown Button ── */}
              <div className="flex items-center justify-between gap-2">
                {/* Left: Checkboxes */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <div onClick={toggleSelectAll}
                      className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors flex-shrink-0 ${allChecked ? 'bg-slate-900 border-slate-900' : 'border-slate-300 hover:border-slate-500'}`}>
                      {allChecked && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      {!allChecked && checked.size > 0 && <div className="w-1.5 h-0.5 bg-slate-700 rounded" />}
                    </div>
                    <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                      Candidates {checked.size > 0 && <span className="ml-1 px-1 rounded bg-slate-100 text-slate-900 text-[10px] font-bold border border-slate-200">{checked.size}</span>}
                    </span>
                  </label>

                  <div className="w-px h-3 bg-slate-200 flex-shrink-0" />

                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <div onClick={toggleAllAirlines}
                      className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors flex-shrink-0 ${allAirlinesChecked ? 'bg-slate-900 border-slate-900' : 'border-slate-300 hover:border-slate-500'}`}>
                      {allAirlinesChecked && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      {!allAirlinesChecked && checkedAirlines.size > 0 && <div className="w-1.5 h-0.5 bg-slate-700 rounded" />}
                    </div>
                    <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                      Airlines {checkedAirlines.size > 0 && <span className="ml-1 px-1 rounded bg-slate-100 text-slate-900 text-[10px] font-bold border border-slate-200">{checkedAirlines.size}</span>}
                    </span>
                  </label>
                </div>

                {/* Right: Quick Action Buttons (Outside when screen has space) + Actions Dropdown */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto flex-wrap sm:flex-nowrap justify-end">
                  {/* 1. Generate Selected Certs (Visible on sm+ screens) */}
                  {checked.size > 0 && (
                    <button
                      onClick={handleGenerateSelected}
                      disabled={generating}
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-2xs disabled:opacity-50 flex-shrink-0"
                    >
                      {generating ? <Spin /> : <HiOutlineDocumentDownload className="w-4 h-4" />}
                      <span>{generating ? 'Generating…' : `Generate (${checked.size})`}</span>
                    </button>
                  )}

                  {/* 2. Revoke Selected Certs (Visible on md+ screens) */}
                  {checked.size > 0 && (
                    <button
                      onClick={handleRevokeSelected}
                      disabled={revoking}
                      className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 transition-all shadow-2xs disabled:opacity-50 flex-shrink-0"
                    >
                      {revoking ? <Spin cls="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600" /> : <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
                      <span>{revoking ? 'Revoking…' : 'Revoke Certs'}</span>
                    </button>
                  )}

                  {/* 3. Generate DHL Extra Cert (Visible on lg+ screens) */}
                  {allParticipants.some(p => checked.has(p.id || p._id) && eligibleForDhlExtra(p) && !p.dhl_cert_released) && (
                    <button
                      onClick={handleGenerateDhlSelected}
                      disabled={generatingDhl}
                      className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition-all shadow-2xs disabled:opacity-50 flex-shrink-0"
                    >
                      {generatingDhl ? <Spin cls="w-3.5 h-3.5 border-2 border-violet-200 border-t-white" /> : <HiOutlineDocumentDownload className="w-4 h-4" />}
                      <span>{generatingDhl ? 'Generating…' : 'Generate DHL Extra'}</span>
                    </button>
                  )}

                  {/* 4. Revoke DHL Extra Cert (Visible on lg+ screens) */}
                  {allParticipants.some(p => checked.has(p.id || p._id) && p.dhl_cert_released) && (
                    <button
                      onClick={handleRevokeDhlSelected}
                      disabled={revokingDhlBulk}
                      className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200/80 hover:bg-violet-100 transition-all shadow-2xs disabled:opacity-50 flex-shrink-0"
                    >
                      {revokingDhlBulk ? <Spin cls="w-3.5 h-3.5 border-2 border-violet-300 border-t-violet-600" /> : <HiOutlineX className="w-4 h-4 text-violet-600" />}
                      <span>{revokingDhlBulk ? 'Revoking…' : 'Revoke DHL Extra'}</span>
                    </button>
                  )}

                  {/* 5. Save All NDG Scores (Visible on xl+ screens) */}
                  {hasNdg && (
                    <button
                      onClick={handleSaveAllNdgScores}
                      disabled={savingAllNdgScores}
                      className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-2xs disabled:opacity-50 flex-shrink-0"
                    >
                      {savingAllNdgScores ? <Spin cls="w-3.5 h-3.5 border-2 border-blue-200 border-t-white" /> : <HiOutlineCheckCircle className="w-4 h-4" />}
                      <span>{savingAllNdgScores ? 'Saving…' : 'Save NDG Scores'}</span>
                    </button>
                  )}

                  {/* 6. Save All FDR Hours (Visible on xl+ screens) */}
                  {hasFdrHours && (
                    <button
                      onClick={handleSaveAllFdrHours}
                      disabled={savingAllFdrHours}
                      className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-2xs disabled:opacity-50 flex-shrink-0"
                    >
                      {savingAllFdrHours ? <Spin cls="w-3.5 h-3.5 border-2 border-blue-200 border-t-white" /> : <HiOutlineCheckCircle className="w-4 h-4" />}
                      <span>{savingAllFdrHours ? 'Saving…' : 'Save FDR Hours'}</span>
                    </button>
                  )}

                  {/* Actions Dropdown Button */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-900 sm:bg-white text-white sm:text-slate-900 sm:border sm:border-slate-200/90 hover:bg-slate-800 sm:hover:bg-slate-50 transition-all shadow-2xs flex-shrink-0"
                      >
                        <span>Actions</span>
                        {(checked.size + checkedAirlines.size) > 0 && (
                          <span className="bg-white sm:bg-slate-900 text-slate-900 sm:text-white text-[10px] px-1.5 rounded-full font-extrabold">{checked.size + checkedAirlines.size}</span>
                        )}
                        <HiOutlineChevronDown className="w-3.5 h-3.5 text-slate-300 sm:text-slate-500" />
                      </button>
                    </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Batch Actions</DropdownMenuLabel>
                    
                    <DropdownMenuItem className="sm:hidden" onClick={handleGenerateSelected} disabled={checked.size === 0 || generating}>
                      <HiOutlineDocumentDownload className="w-4 h-4 text-slate-500" />
                      <span>{generating ? 'Generating…' : checked.size > 0 ? `Generate (${checked.size}) Certs` : 'Generate Selected'}</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem className="md:hidden" onClick={handleRevokeSelected} disabled={checked.size === 0 || revoking}>
                      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      <span>{revoking ? 'Revoking…' : 'Revoke Certificates'}</span>
                    </DropdownMenuItem>

                    {allParticipants.some(p => checked.has(p.id || p._id) && eligibleForDhlExtra(p) && !p.dhl_cert_released) && (
                      <DropdownMenuItem className="lg:hidden" onClick={handleGenerateDhlSelected} disabled={generatingDhl}>
                        <HiOutlineDocumentDownload className="w-4 h-4 text-violet-600" />
                        <span>{generatingDhl ? 'Generating…' : 'Generate DHL Extra Cert'}</span>
                      </DropdownMenuItem>
                    )}

                    {allParticipants.some(p => checked.has(p.id || p._id) && p.dhl_cert_released) && (
                      <DropdownMenuItem className="lg:hidden" onClick={handleRevokeDhlSelected} disabled={revokingDhlBulk}>
                        <HiOutlineX className="w-4 h-4 text-violet-600" />
                        <span>{revokingDhlBulk ? 'Revoking…' : 'Revoke DHL Extra Cert'}</span>
                      </DropdownMenuItem>
                    )}

                    {hasNdg && (
                      <DropdownMenuItem className="xl:hidden" onClick={handleSaveAllNdgScores} disabled={savingAllNdgScores}>
                        <HiOutlineCheckCircle className="w-4 h-4 text-blue-600" />
                        <span>{savingAllNdgScores ? 'Saving…' : 'Save All NDG Scores'}</span>
                      </DropdownMenuItem>
                    )}

                    {hasFdrHours && (
                      <DropdownMenuItem className="xl:hidden" onClick={handleSaveAllFdrHours} disabled={savingAllFdrHours}>
                        <HiOutlineCheckCircle className="w-4 h-4 text-blue-600" />
                        <span>{savingAllFdrHours ? 'Saving…' : 'Save All FDR Hours'}</span>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    {checked.size > 0 && (
                      <DropdownMenuItem onClick={handleDeleteSelected} disabled={deletingSelected} danger>
                        <HiOutlineTrash className="w-4 h-4" />
                        <span>{deletingSelected ? 'Deleting…' : `Delete (${checked.size}) Candidates`}</span>
                      </DropdownMenuItem>
                    )}

                    {checkedAirlines.size > 0 && (
                      <DropdownMenuItem onClick={handleDeleteSelectedAirlines} disabled={deletingAirlines} danger>
                        <HiOutlineTrash className="w-4 h-4" />
                        <span>{deletingAirlines ? 'Deleting…' : `Delete (${checkedAirlines.size}) Airlines`}</span>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    <DropdownMenuItem onClick={openCounterModal}>
                      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Reset Cert Counters</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

              {/* ── Row 2: Search Input + 3 Filter Select Dropdowns ── */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
                {/* Search */}
                <div className="flex-1 min-w-0 relative">
                  <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all shadow-2xs"
                  />
                </div>

                {/* 3 Dropdown Filters Grid on mobile / flex on desktop */}
                <div className="grid grid-cols-3 sm:flex items-center gap-1.5 flex-shrink-0">
                  {/* 1. Status Filter Select */}
                  <div className="w-full sm:w-[110px]">
                    <Select value={filterCertStatus || 'all'} onValueChange={v => setFilterCertStatus(v === 'all' ? '' : v)}>
                      <SelectTrigger className="px-2 text-xs py-1 h-7 font-semibold text-slate-700 rounded-lg bg-white border border-slate-200 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="generated">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 2. Training Type Filter Select */}
                  <div className="w-full sm:w-[130px]">
                    <Select value={filterType || 'all'} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
                      <SelectTrigger className="px-2 text-xs py-1 h-7 font-semibold text-slate-700 rounded-lg bg-white border border-slate-200 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {TRAINING_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 3. Sort Key Select */}
                  <div className="w-full sm:w-[125px]">
                    <Select value={sortKey} onValueChange={setSortKey}>
                      <SelectTrigger className="px-2 text-xs py-1 h-7 font-semibold text-slate-700 rounded-lg bg-white border border-slate-200 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Airline Name</SelectLabel>
                          <SelectItem value="name_asc">Airline: A → Z</SelectItem>
                          <SelectItem value="name_desc">Airline: Z → A</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Participants</SelectLabel>
                          <SelectItem value="count_desc">Most Participants</SelectItem>
                          <SelectItem value="count_asc">Fewest Participants</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Loading / empty ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="card p-10 text-center text-sm text-primary-400">No airline submissions found.</div>
      )}

      {/* ── Airline Groups ── */}
      {/* ── Airline Groups ── */}
      {!loading && filtered.filter(({ airline }) => airlineKey(airline) !== null).map(({ airline, participants }) => {
        const aKey = airlineKey(airline);
        const filterKey = `${search.trim()}_${filterType}_${filterCertStatus}`;
        const initialOpen = Boolean(expanded[aKey]);

        return (
          <AirlineCardGroup
            key={aKey}
            airline={airline}
            participants={participants}
            aKey={aKey}
            checkedAirlines={checkedAirlines}
            toggleAirline={toggleAirline}
            openEditAirline={openEditAirline}
            checked={checked}
            toggleOne={toggleOne}
            setRowPreview={setRowPreview}
            handleDownloadIssued={handleDownloadIssued}
            handleDelete={handleDelete}
            downloadingId={downloadingId}
            certEdits={certEdits}
            startCertEdit={startCertEdit}
            cancelCertEdit={cancelCertEdit}
            saveCertEdit={saveCertEdit}
            setCertEdits={setCertEdits}
            ndgScores={ndgScores}
            setNdgScores={setNdgScores}
            handleNdgScoreSave={handleNdgScoreSave}
            fdrHours={fdrHours}
            setFdrHours={setFdrHours}
            handleFdrHoursSave={handleFdrHoursSave}
            handleFdrHoursToggle={handleFdrHoursToggle}
            updateValidity={updateValidity}
            fetchData={fetchData}
            eligibleForDhlExtra={eligibleForDhlExtra}
            setDhlRowPreview={setDhlRowPreview}
            handleDownloadDhlIssued={handleDownloadDhlIssued}
            downloadingDhlId={downloadingDhlId}
            filterKey={filterKey}
            initialOpen={initialOpen}
            airlineCardRefs={airlineCardRefs}
            participantRowRefs={participantRowRefs}
          />
        );
      })}

      </div> {/* end padded content wrapper */}
      {ConfirmDialog}
    </motion.div>
  );
}


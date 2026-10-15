import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { HiOutlinePencil, HiOutlineTrash, HiOutlineMail, HiOutlineDocumentDownload, HiOutlineEye, HiOutlineClock, HiOutlineCheckCircle } from 'react-icons/hi';
import ValidityBadge from '../../components/ValidityBadge';
import { certExpiry } from '../../utils/certValidity';
import { Checkbox } from '@/components/ui/checkbox';
import { badgeStyle, mkInitials, fmtDate, Spin } from './helpers';

// ─── Mobile participant card (replaces table row on small screens) ─────────────
export function ParticipantCard({ p, checked, onCheck, onPreview, onDownload, onEdit, onDelete, downloadingId, certEdits, onStartEdit, onCancelEdit, onSaveEdit, setCertEdits, ndgScores, setNdgScores, onNdgScoreSave, fdrHours, setFdrHours, onFdrHoursSave, onFdrHoursToggle, onRemind }) {
  // Sub-admins only see the actions their powers allow.
  const { can } = useAuth();
  const canEditP = can('participants.edit');
  const canDeleteP = can('participants.delete');
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
            <ValidityBadge participant={p} showDate={false} className="self-center" />
            {canEditP && certExpiry(p)?.expiresOn && (
              <button onClick={() => onRemind(p)} title="Email the airline an expiry reminder"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100">
                <HiOutlineMail className="w-3.5 h-3.5" /> Remind
              </button>
            )}
          </>
        )}
        {canEditP && (<Link to={`/admin/participants/edit/${pid}`} onClick={() => onEdit(p)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs font-medium text-primary-600 hover:bg-primary-100">
          <HiOutlinePencil className="w-3.5 h-3.5" /> Edit
        </Link>)}
        {canDeleteP && (<button onClick={() => onDelete(pid, fullName)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-500 hover:bg-red-50">
          <HiOutlineTrash className="w-3.5 h-3.5" /> Delete
        </button>)}
      </div>
    </div>
  );
}

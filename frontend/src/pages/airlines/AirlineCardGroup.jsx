import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import LogoAvatar from '../../components/LogoAvatar';
import { HiOutlineUsers, HiOutlineChevronDown, HiOutlineArrowsExpand, HiOutlinePencil, HiOutlineTrash, HiOutlineMail, HiOutlineDocumentDownload, HiOutlineEye, HiOutlineClock, HiOutlineCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import ValidityBadge from '../../components/ValidityBadge';
import { certExpiry } from '../../utils/certValidity';
import { Checkbox } from '@/components/ui/checkbox';
import { TRAINING_LABELS, rememberReturn, badgeStyle, mkInitials, fmtDate, Spin } from './helpers';
import { VALIDITY_OPTIONS } from './CertificateModals';
import { ParticipantCard } from './ParticipantCard';

// ─── Individual Airline Accordion Card Component ─────────────────────────────
export const AirlineCardGroup = React.memo(function AirlineCardGroup({
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
  onRemind,
}) {
  const isFilterActive = Boolean(filterKey && filterKey !== '__');
  // Sub-admins only see the actions their powers allow.
  const { can } = useAuth();
  const canEditP = can('participants.edit');
  const canDeleteP = can('participants.delete');
  const canManageAirlines = can('airlines.manage');
  const [open, setOpen] = useState(() => initialOpen);

  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (filterKey !== prevFilterKey.current) {
      setOpen(false);
      prevFilterKey.current = filterKey;
    }
  }, [filterKey]);

  const isCardOpen = open;

  // Every card opens enlarged (nearly the full window height); Shrink drops
  // this one card back to the compact box until the page is reloaded.
  const [tall, setTall] = useState(true);
  const toggleTall = () => setTall(prev => {
    const next = !prev;
    if (next) setTimeout(() => airlineCardRefs.current?.[aKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    return next;
  });

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
          {canManageAirlines && !airline.is_unassigned && <button type="button" onClick={() => openEditAirline(airline)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs">
            <HiOutlinePencil className="w-3.5 h-3.5 text-slate-500" /> Edit
          </button>}
          {isCardOpen && participants.length > 0 && (
            <button type="button" onClick={toggleTall} title={tall ? 'Shrink the list' : 'Enlarge the list'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-2xs ${
                tall ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300'
              }`}>
              <HiOutlineArrowsExpand className="w-3.5 h-3.5" /> {tall ? 'Shrink' : 'Enlarge'}
            </button>
          )}
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
              className={`border-t border-slate-100 overflow-y-auto overflow-x-hidden ${tall ? 'max-h-[calc(100vh-6rem)]' : 'max-h-[460px]'}`}
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
                      onPreview={setRowPreview} onDownload={handleDownloadIssued} onEdit={(pp) => rememberReturn(pp.id || pp._id, aKey)}
                      onDelete={handleDelete} downloadingId={downloadingId}
                      certEdits={certEdits} onStartEdit={startCertEdit}
                      onCancelEdit={cancelCertEdit} onSaveEdit={saveCertEdit}
                      setCertEdits={setCertEdits}
                      ndgScores={ndgScores} setNdgScores={setNdgScores} onNdgScoreSave={handleNdgScoreSave}
                      fdrHours={fdrHours} setFdrHours={setFdrHours} onFdrHoursSave={handleFdrHoursSave} onFdrHoursToggle={handleFdrHoursToggle}
                      onRemind={onRemind} />
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block">
                <table className="w-full min-w-[980px] border-collapse">
                  <colgroup>
                    <col className="w-10" />
                    <col className="w-[22%]" />
                    <col className="w-[10%]" />
                    <col className="w-[14%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[12%]" />
                    <col className="w-[24%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-primary-50/60 border-b border-primary-100">
                      <th className="px-3 py-2.5 text-center" />
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Participant</th>
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Dept</th>
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Training</th>
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Start</th>
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">End</th>
                      <th className="text-left text-[10px] font-bold text-primary-500 uppercase tracking-wider px-3 py-2.5">Validity</th>
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
                            <ValidityBadge participant={p} fallback={<span className="text-xs text-primary-300">—</span>} />
                          </td>
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
                                  {canEditP && certExpiry(p)?.expiresOn && (
                                    <button onClick={() => onRemind(p)} title="Email the airline an expiry reminder"
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100">
                                      <HiOutlineMail className="w-3.5 h-3.5" /> Remind
                                    </button>
                                  )}
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
                              {canEditP && (<Link to={`/admin/participants/edit/${pid}`} onClick={() => rememberReturn(pid, aKey)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs font-medium text-primary-600 hover:bg-primary-100">
                                <HiOutlinePencil className="w-3.5 h-3.5" /> Edit
                              </Link>)}
                              {canDeleteP && (<button onClick={() => handleDelete(pid, fullName)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-500 hover:bg-red-50">
                                <HiOutlineTrash className="w-3.5 h-3.5" /> Delete
                              </button>)}
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

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineAcademicCap, HiOutlinePlusCircle, HiOutlinePencil, HiOutlineTrash,
  HiOutlineUserAdd, HiOutlineClipboardCheck,
  HiOutlineSearch, HiOutlineX, HiOutlineUserGroup, HiChevronRight,
  HiOutlineClock, HiOutlineDocumentText, HiOutlineMail, HiOutlineCheckCircle,
  HiOutlinePaperAirplane, HiOutlineCollection,
} from 'react-icons/hi';
import { FaPlaneDeparture } from 'react-icons/fa';
import { listExams, deleteExam, publishExam, getExamAirlines, assignExam, updateExam, sendExamInvites, getExamInvites } from '../api';
import { useAuth } from '../context/AuthContext';
import QuestionBankList from './QuestionBank';
import { DateTimeInputCard } from './ExamBuilder';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useConfirm } from '@/hooks/use-confirm';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const STATUS_VARIANT = { draft: 'amber', published: 'emerald', archived: 'default' };

function AssignModal({ exam, onClose, onAssigned, isAdmin = true }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedAirlines, setExpandedAirlines] = useState(new Set());
  const [pendingOnly, setPendingOnly] = useState(false);
  const [visibleUntil, setVisibleUntil] = useState(exam.visible_until || null);
  const [showGlobalVisibility, setShowGlobalVisibility] = useState(false);
  // Per-airline overrides — key present (even with value null = "Never") means
  // this airline has its OWN setting; key absent means it inherits the global
  // default above. Seeded from exam.airline_visibility.
  const [airlineOverrides, setAirlineOverrides] = useState(() =>
    Object.fromEntries((exam.airline_visibility || []).map((v) => [String(v.airline_id), v.visible_until || null]))
  );
  const [expandedVisibility, setExpandedVisibility] = useState(() => new Set());

  const toggleAirlineOverride = (airlineId, enabled) => {
    setAirlineOverrides((prev) => {
      const next = { ...prev };
      if (enabled) next[airlineId] = visibleUntil || null;
      else delete next[airlineId];
      return next;
    });
  };
  const setAirlineOverrideValue = (airlineId, iso) => {
    setAirlineOverrides((prev) => ({ ...prev, [airlineId]: iso }));
  };
  const toggleVisibilityPanel = (airlineId) => {
    setExpandedVisibility((prev) => {
      const next = new Set(prev);
      next.has(airlineId) ? next.delete(airlineId) : next.add(airlineId);
      return next;
    });
  };

  useEffect(() => {
    getExamAirlines()
      .then((res) => setGroups(res.data))
      .catch(() => toast.error('Failed to load airlines.'))
      .finally(() => setLoading(false));
  }, []);

  const alreadyAssigned = new Set((exam.assignments || []).map((a) => String(a.participant_id)));
  const isCertPending = (p) => p.cert_sequence == null;

  // Calculate all eligible participants across all airlines (respecting the
  // "pending certificate only" filter, same as the visible list below)
  const allEligibleParticipants = groups.flatMap((g) =>
    g.participants.filter((p) => !alreadyAssigned.has(String(p._id)) && (!pendingOnly || isCertPending(p)))
  );

  const isAllGlobalSelected =
    allEligibleParticipants.length > 0 &&
    allEligibleParticipants.every((p) => selected.has(p._id));

  const toggleAllGlobal = () => {
    if (isAllGlobalSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allEligibleParticipants.map((p) => p._id)));
    }
  };

  const toggleExpandAirline = (airlineId) => {
    setExpandedAirlines((prev) => {
      const next = new Set(prev);
      next.has(airlineId) ? next.delete(airlineId) : next.add(airlineId);
      return next;
    });
  };

  const toggleAllExpanded = () => {
    if (expandedAirlines.size === groups.length) {
      setExpandedAirlines(new Set());
    } else {
      setExpandedAirlines(new Set(groups.map((g) => g.airline._id)));
    }
  };

  const toggleAirline = (participants) => {
    const eligible = participants.filter((p) => !alreadyAssigned.has(String(p._id)) && (!pendingOnly || isCertPending(p)));
    if (eligible.length === 0) return;

    const allSelectedInAirline = eligible.every((p) => selected.has(p._id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectedInAirline) {
        eligible.forEach((p) => next.delete(p._id));
      } else {
        eligible.forEach((p) => next.add(p._id));
      }
      return next;
    });
  };

  const toggleParticipant = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const originalOverrides = Object.fromEntries((exam.airline_visibility || []).map((v) => [String(v.airline_id), v.visible_until || null]));
  const overridesChanged = JSON.stringify(airlineOverrides) !== JSON.stringify(originalOverrides);
  const globalChanged = (exam.visible_until || null) !== (visibleUntil || null);
  const visibilityChanged = globalChanged || overridesChanged;

  const save = async () => {
    if (selected.size === 0 && !visibilityChanged) return onClose();
    setSaving(true);
    try {
      if (selected.size > 0) await assignExam(exam.id, [...selected]);
      if (visibilityChanged) {
        await updateExam(exam.id, {
          visible_until: visibleUntil,
          airline_visibility: Object.entries(airlineOverrides).map(([airline_id, visible_until]) => ({ airline_id, visible_until })),
        });
      }
      const parts = [];
      if (selected.size > 0) parts.push(`assigned to ${selected.size} candidate(s)`);
      if (visibilityChanged) parts.push('airline visibility updated');
      toast.success(`Exam ${parts.join(', ')}.`);
      onAssigned();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  // Filter groups based on search + the "pending certificate only" toggle
  const filteredGroups = groups
    .map((g) => {
      const matchesAirline = g.airline.airlineName.toLowerCase().includes(search.toLowerCase());
      const matchingParticipants = g.participants.filter(
        (p) =>
          (matchesAirline || p.participant_name.toLowerCase().includes(search.toLowerCase())) &&
          (!pendingOnly || isCertPending(p))
      );
      return { ...g, participants: matchingParticipants };
    })
    .filter((g) => g.participants.length > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[94vw] h-[85vh] max-h-[750px] flex flex-col p-0 overflow-hidden rounded-3xl border border-slate-200/80 shadow-2xl bg-white">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-2xs flex-shrink-0">
                <HiOutlineAcademicCap className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
                  Assign &ldquo;{exam.title}&rdquo;
                </DialogTitle>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  Click an airline to view students and assign exam access.
                </p>
              </div>
            </div>
          </div>

          {/* Global default visibility — admin-only; an airline manages a single list */}
          {isAdmin && (
          <div className="mt-3 pt-3 border-t border-slate-100/80">
            <button
              type="button"
              onClick={() => setShowGlobalVisibility((s) => !s)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                globalChanged ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <HiOutlineClock className="w-3.5 h-3.5" />
                Global Default Visibility: {visibleUntil ? new Date(visibleUntil).toLocaleString() : 'Never'}
              </span>
              <HiChevronRight className={`w-3.5 h-3.5 transition-transform ${showGlobalVisibility ? 'rotate-90' : ''}`} />
            </button>
            {showGlobalVisibility && (
              <div className="mt-2">
                <DateTimeInputCard
                  label="Visible to Airlines Until (default)"
                  isoValue={visibleUntil}
                  onChange={setVisibleUntil}
                  defaultTime="23:59"
                />
                <p className="text-[10px] text-slate-400 font-semibold mt-1.5 leading-relaxed">
                  Applies to every airline unless overridden individually below. Leave blank ("Never") to keep this exam visible indefinitely. Past results always stay visible under each candidate's own performance page regardless.
                </p>
              </div>
            )}
          </div>
          )}

          {/* Search + Global Select Toolbar */}
          {!loading && groups.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 min-w-0">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search candidate or airline..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-8 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Pending-certificate-only filter */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPendingOnly((v) => !v)}
                  title="Only show candidates who don't have a certificate yet"
                  className={`h-9 px-3 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer select-none ${
                    pendingOnly
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Checkbox checked={pendingOnly} className="w-3.5 h-3.5 pointer-events-none accent-white" />
                  <span>No Certificate Yet</span>
                </div>

                {/* Expand / Collapse All toggle */}
                <button
                  type="button"
                  onClick={toggleAllExpanded}
                  className="h-9 px-3 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200/80 transition-all border border-slate-200/60"
                >
                  {expandedAirlines.size === groups.length ? 'Collapse All' : 'Expand All'}
                </button>

                {allEligibleParticipants.length > 0 && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={toggleAllGlobal}
                    className={`h-9 px-3 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer select-none ${
                      isAllGlobalSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Checkbox
                      checked={isAllGlobalSelected}
                      className="w-3.5 h-3.5 pointer-events-none"
                    />
                    <span>Select All ({allEligibleParticipants.length})</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-3.5 bg-slate-50/60">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
              <p className="text-xs font-medium">Loading airlines and candidates…</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <HiOutlineUserGroup className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No candidates match your filter.</p>
            </div>
          ) : (
            filteredGroups.map(({ airline, participants }) => {
              const eligibleInGroup = participants.filter((p) => !alreadyAssigned.has(String(p._id)));
              const isGroupAllSelected =
                eligibleInGroup.length > 0 && eligibleInGroup.every((p) => selected.has(p._id));
              const selectedCountInGroup = participants.filter((p) => selected.has(p._id)).length;
              const isExpanded = search.trim() !== '' || expandedAirlines.has(airline._id);
              const hasOverride = Object.prototype.hasOwnProperty.call(airlineOverrides, airline._id);
              const overrideValue = airlineOverrides[airline._id];
              const isVisibilityOpen = expandedVisibility.has(airline._id);

              return (
                <div
                  key={airline._id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all"
                >
                  {/* Airline Header Bar (Clickable to toggle collapse/expand) */}
                  <div
                    onClick={() => toggleExpandAirline(airline._id)}
                    className="px-4 py-3 bg-slate-50/90 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between gap-4 select-none transition-colors"
                  >
                    {/* Left: Chevron + Icon + Airline Name */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <HiChevronRight className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-slate-700' : ''}`} />
                      <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs flex-shrink-0">
                        <FaPlaneDeparture className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {airline.airlineName}
                      </span>
                    </div>

                    {/* Right: Vertically Aligned Count Badge + Select All button */}
                    <div className="flex items-center gap-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[11px] font-bold min-w-[28px] text-center">
                        {participants.length}
                      </span>

                      {isAdmin && (
                      <button
                        type="button"
                        onClick={() => toggleVisibilityPanel(airline._id)}
                        title={hasOverride ? `Custom visibility: ${overrideValue ? new Date(overrideValue).toLocaleString() : 'Never'}` : 'Inherits global default visibility'}
                        className={`p-1.5 rounded-lg border transition-all ${
                          hasOverride ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <HiOutlineClock className="w-3.5 h-3.5" />
                      </button>
                      )}

                      {eligibleInGroup.length > 0 ? (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleAirline(participants)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 select-none cursor-pointer ${
                            isGroupAllSelected
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Checkbox
                            checked={isGroupAllSelected}
                            className="w-3.5 h-3.5 pointer-events-none"
                          />
                          <span>
                            {isGroupAllSelected ? 'Selected' : 'Select All'}
                            {selectedCountInGroup > 0 && !isGroupAllSelected && (
                              <span className="ml-1 px-1.5 rounded bg-slate-100 text-slate-900 text-[10px] font-extrabold">
                                {selectedCountInGroup}
                              </span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-bold text-slate-400">All Assigned</span>
                      )}
                    </div>
                  </div>

                  {/* Per-airline visibility override — independent of participant list expansion */}
                  {isAdmin && isVisibilityOpen && (
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 space-y-2">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                        <Checkbox
                          checked={hasOverride}
                          onCheckedChange={(c) => toggleAirlineOverride(airline._id, !!c)}
                        />
                        Custom visibility for {airline.airlineName}
                      </label>
                      {hasOverride ? (
                        <DateTimeInputCard
                          label={`Visible to ${airline.airlineName} Until`}
                          isoValue={overrideValue}
                          onChange={(iso) => setAirlineOverrideValue(airline._id, iso)}
                          defaultTime="23:59"
                        />
                      ) : (
                        <p className="text-[10px] text-slate-400 font-semibold">
                          Inherits the global default: {visibleUntil ? new Date(visibleUntil).toLocaleString() : 'Never'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Animated Student List */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden border-t border-slate-100 bg-white"
                      >
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                          {participants.map((p) => {
                            const isAssigned = alreadyAssigned.has(String(p._id));
                            const isChecked = isAssigned || selected.has(p._id);
                            const ini = p.participant_name
                              ? p.participant_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                              : 'ST';

                            return (
                              <label
                                key={p._id}
                                onClick={(e) => {
                                  if (isAssigned) return;
                                  e.preventDefault();
                                  toggleParticipant(p._id);
                                }}
                                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all select-none border min-w-0 ${
                                  isAssigned
                                    ? 'bg-slate-50/70 border-slate-100 text-slate-400 cursor-not-allowed'
                                    : isChecked
                                    ? 'bg-blue-50/50 border-blue-500/40 text-slate-900 shadow-2xs cursor-pointer'
                                    : 'bg-white border-slate-200/80 hover:bg-slate-50 text-slate-700 cursor-pointer hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                                  <Checkbox
                                    disabled={isAssigned}
                                    checked={isChecked}
                                    onCheckedChange={() => !isAssigned && toggleParticipant(p._id)}
                                    className="w-4 h-4 flex-shrink-0"
                                  />
                                  <div className="w-6 h-6 rounded-full bg-slate-900/10 text-slate-800 border border-slate-200/60 flex items-center justify-center text-[10px] font-black flex-shrink-0">
                                    {ini}
                                  </div>
                                  <span className="truncate font-semibold text-slate-800">{p.participant_name}</span>
                                </div>

                                {isAssigned ? (
                                  <div className="w-[60px] flex justify-end flex-shrink-0 ml-auto">
                                    <span className="w-full py-0.5 rounded-md bg-slate-200/60 text-slate-500 text-[10px] font-bold text-center block">
                                      Assigned
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto justify-end">
                                    <div className="w-[44px] flex justify-end flex-shrink-0">
                                      {p.training_type && (
                                        <span className="w-full py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/80 text-[10px] font-bold text-center truncate block">
                                          {p.training_type}
                                        </span>
                                      )}
                                    </div>
                                    <div className="w-[58px] flex justify-end flex-shrink-0">
                                      {isCertPending(p) && (
                                        <span className="w-full py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold text-center block">
                                          No Cert
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 px-6 py-4 border-t border-slate-100 bg-white sticky bottom-0 z-10 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500">
            {selected.size > 0 ? (
              <span className="text-slate-900 font-bold">{selected.size} candidate(s) selected</span>
            ) : visibilityChanged ? (
              <span className="text-slate-900 font-bold">Visibility changed</span>
            ) : (
              'No new candidates selected'
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} className="rounded-xl text-xs font-bold">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={saving || (selected.size === 0 && !visibilityChanged)}
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold px-5 py-2 shadow-2xs"
            >
              {saving ? 'Saving…' : selected.size > 0 ? `Assign (${selected.size})` : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send-invite modal — emails the passwordless take-link to participants ────
// Shows every participant grouped by airline WITH their email and current
// invite/attempt status, so the admin can review who's been sent/completed and
// send (or re-send) links to those who have an email.
const INVITE_BADGE = {
  sent:        { label: 'Sent',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  opened:      { label: 'Opened',     cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: 'In Progress',cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  completed:   { label: 'Completed',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function SendInviteModal({ exam, onClose, onSent }) {
  const [groups, setGroups] = useState([]);
  const [inviteByPid, setInviteByPid] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set());

  const load = () => {
    setLoading(true);
    Promise.all([getExamAirlines(), getExamInvites(exam.id)])
      .then(([airRes, invRes]) => {
        setGroups(airRes.data);
        setInviteByPid(Object.fromEntries((invRes.data || []).map((i) => [String(i.participant_id), i])));
      })
      .catch(() => toast.error('Failed to load participants.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [exam.id]);

  const hasEmail = (p) => !!(p.email && p.email.trim());
  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExpand = (id) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const send = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await sendExamInvites(exam.id, [...selected]);
      const { sent = [], skipped = [] } = res.data || {};
      if (sent.length) toast.success(`${sent.length} exam link${sent.length > 1 ? 's' : ''} sent.`);
      if (skipped.length) toast(`${skipped.length} skipped (${skipped[0].reason}${skipped.length > 1 ? ', …' : ''}).`, { icon: 'ℹ️' });
      setSelected(new Set());
      load();
      onSent?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send invites.');
    } finally {
      setSending(false);
    }
  };

  const filteredGroups = groups
    .map((g) => {
      const matchAir = g.airline.airlineName.toLowerCase().includes(search.toLowerCase());
      const parts = g.participants.filter((p) => matchAir || p.participant_name.toLowerCase().includes(search.toLowerCase()) || (p.email || '').toLowerCase().includes(search.toLowerCase()));
      return { ...g, participants: parts };
    })
    .filter((g) => g.participants.length > 0);

  const sendableInGroup = (parts) => parts.filter(hasEmail);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[92vw] h-[85vh] max-h-[750px] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-slate-100 bg-white space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600"><HiOutlineMail className="w-5 h-5" /></span>
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 truncate">
              Send &ldquo;{exam.title}&rdquo; to participants
            </DialogTitle>
          </div>
          <p className="text-xs text-slate-500">Each participant gets a personal, passwordless exam link by email. Participants without an email can't be sent to.</p>
          <div className="relative pt-2">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 mt-1 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text" placeholder="Search participant, email or airline…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-3.5 bg-slate-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
              <p className="text-xs font-medium">Loading participants…</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <HiOutlineUserGroup className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No participants match your filter.</p>
            </div>
          ) : (
            filteredGroups.map(({ airline, participants }) => {
              const sendable = sendableInGroup(participants);
              const allSel = sendable.length > 0 && sendable.every((p) => selected.has(p._id));
              const isOpen = search.trim() !== '' || expanded.has(airline._id);
              return (
                <div key={airline._id} className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div onClick={() => toggleExpand(airline._id)} className="px-4 py-3 bg-slate-50/80 hover:bg-slate-100/70 cursor-pointer flex items-center justify-between gap-4 select-none">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <HiChevronRight className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90 text-slate-600' : ''}`} />
                      <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs flex-shrink-0">
                        <FaPlaneDeparture className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-800 truncate">{airline.airlineName}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[11px] font-bold">{participants.length}</span>
                    </div>
                    {sendable.length > 0 && (
                      <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setSelected((prev) => { const n = new Set(prev); allSel ? sendable.forEach((p) => n.delete(p._id)) : sendable.forEach((p) => n.add(p._id)); return n; }); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border select-none cursor-pointer ${allSel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                        {allSel ? 'Selected' : `Select ${sendable.length}`}
                      </div>
                    )}
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-slate-100 bg-white">
                        <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                          {participants.map((p) => {
                            const email = hasEmail(p);
                            const inv = inviteByPid[String(p._id)];
                            const badge = inv && INVITE_BADGE[inv.status];
                            const isChecked = selected.has(p._id);
                            const ini = p.participant_name ? p.participant_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'ST';
                            return (
                              <div key={p._id}
                                onClick={() => email && toggle(p._id)}
                                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-all ${
                                  !email ? 'bg-slate-50/70 border-slate-100 opacity-70 cursor-not-allowed'
                                  : isChecked ? 'bg-slate-900/5 border-slate-900/30 cursor-pointer shadow-2xs'
                                  : 'bg-white border-slate-100 hover:bg-slate-50 cursor-pointer'}`}>
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <Checkbox disabled={!email} checked={isChecked} onCheckedChange={() => email && toggle(p._id)} className="w-4 h-4 flex-shrink-0" />
                                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-extrabold text-slate-600 flex-shrink-0">{ini}</div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">{p.participant_name}</p>
                                    {email ? (
                                      <p className="text-[11px] text-slate-500 truncate flex items-center gap-1"><HiOutlineMail className="w-3 h-3" />{p.email}</p>
                                    ) : (
                                      <p className="text-[11px] text-rose-500 font-semibold truncate">No email on file</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {badge && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>{badge.label}</span>
                                  )}
                                  {inv?.attempt && inv.attempt.percentage != null && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${inv.attempt.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                      {inv.attempt.percentage}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="flex-shrink-0 px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500">
            {selected.size > 0 ? <span className="text-slate-900 font-bold">{selected.size} selected</span> : 'No participants selected'}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} className="rounded-xl text-xs font-bold">Close</Button>
            <Button variant="primary" onClick={send} disabled={sending || selected.size === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold px-4 py-2 shadow-2xs flex items-center gap-1.5">
              <HiOutlinePaperAirplane className="w-4 h-4 rotate-45" />
              {sending ? 'Sending…' : `Send Link${selected.size !== 1 ? 's' : ''} (${selected.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExamSystem() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const base = isAdmin ? '/admin/exams' : '/airline/exams';
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = !isAdmin ? 'exams'
    : tabParam === 'question-bank' ? 'question-bank'
    : tabParam === 'airline-exams' ? 'airline-exams'
    : 'exams';

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignTarget, setAssignTarget] = useState(null);
  const [sendTarget, setSendTarget] = useState(null);
  const [bankShowCreate, setBankShowCreate] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  const setActiveTab = (tab) => {
    if (tab === 'exams') setSearchParams({});
    else setSearchParams({ tab });
  };

  // Airlines manage only the exams they own here; exams merely assigned to them
  // live in the "Exam Results" view.
  const load = () => listExams()
    .then((res) => setExams(isAdmin ? res.data : res.data.filter((e) => e.owner_airline)))
    .catch(() => toast.error('Failed to load exams.'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handlePublish = async (exam) => {
    try {
      await publishExam(exam.id);
      toast.success('Exam published.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to publish exam.');
    }
  };

  const handleDelete = async (exam) => {
    const ok = await confirm(`Delete "${exam.title}"? This cannot be undone.`, { title: 'Delete exam', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await deleteExam(exam.id);
      toast.success('Exam deleted.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete exam.');
    }
  };

  // Admin view splits exams into airline-created vs IFOA-created; airline view
  // only ever has its own exams so it renders as one list.
  const airlineExams = exams.filter((e) => e.owner_airline);
  const ifoaExams = exams.filter((e) => !e.owner_airline);

  const renderCard = (exam) => {
    const airlineOwned = !!exam.owner_airline;
    const canManage = isAdmin ? !airlineOwned : airlineOwned;
    return (
      <Card
        key={exam.id}
        className="group p-5 sm:p-6 bg-white border border-slate-200/90 rounded-3xl shadow-2xs hover:shadow-lg hover:border-slate-300 transition-all duration-200 flex flex-col justify-between"
      >
        <div className="space-y-3.5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <HiOutlineAcademicCap className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 break-words leading-snug group-hover:text-blue-600 transition-colors" title={exam.title}>
                  {exam.title}
                </h2>
                <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                  {exam.questions?.length || 0} Questions · {exam.duration_minutes} Mins
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {isAdmin && airlineOwned && (
                <Badge variant="default" className="font-bold text-[10px] px-2.5 py-0.5 rounded-full" title="Created by an airline">
                  {exam.owner_airline_name || 'Airline'}
                </Badge>
              )}
              <Badge
                variant={STATUS_VARIANT[exam.status]}
                className="capitalize font-bold text-[10px] px-2.5 py-0.5 rounded-full"
              >
                {exam.status}
              </Badge>
              {canManage && (
              <SimpleTooltip label="Delete exam">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  onClick={() => handleDelete(exam)}
                >
                  <HiOutlineTrash className="w-3.5 h-3.5" />
                </Button>
              </SimpleTooltip>
              )}
            </div>
          </div>

          {/* Description with fixed min-height for perfect card alignment */}
          <div className="h-9 flex items-center">
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
              {exam.description || <span className="italic text-slate-300">No description provided</span>}
            </p>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 pt-0.5">
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60">
              <HiOutlineClock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">Pass ≥ {exam.pass_percentage}%</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60">
              <HiOutlineUserGroup className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">{exam.assignments?.length || 0} Assigned</span>
            </div>
          </div>
        </div>

        {/* Structured 2-Row Action Bar */}
        <div className="pt-3.5 mt-3.5 border-t border-slate-100/90 space-y-2">
          {canManage && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`${base}/${exam.id}/edit`)}
              className="w-full rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs h-8 flex items-center justify-center gap-1"
            >
              <HiOutlinePencil className="w-3.5 h-3.5 text-slate-400" /> Edit
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="w-full rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-bold text-xs shadow-2xs h-8 flex items-center justify-center gap-1"
              onClick={() => setAssignTarget(exam)}
            >
              <HiOutlineUserAdd className="w-3.5 h-3.5 text-slate-400" /> Assign
            </Button>
          </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {canManage && (exam.status === 'draft' ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full rounded-xl border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 font-bold text-xs shadow-2xs h-8 flex items-center justify-center gap-1"
                onClick={() => handlePublish(exam)}
              >
                <HiOutlineCheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Publish
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full rounded-xl border-blue-200/80 bg-blue-50/60 text-blue-700 hover:bg-blue-100/80 font-bold text-xs shadow-2xs h-8 flex items-center justify-center gap-1"
                onClick={() => setSendTarget(exam)}
              >
                <HiOutlineMail className="w-3.5 h-3.5 text-blue-600" /> Send Link
              </Button>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`${base}/${exam.id}/attempts`)}
              className="w-full rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs h-8 flex items-center justify-center gap-1"
            >
              <HiOutlineClipboardCheck className="w-3.5 h-3.5 text-slate-400" /> Results
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* Flush Full-Width Sticky Page Header */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-6 lg:px-8 py-2.5 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex-shrink-0">Exam System</h1>
            
            {/* Executive Tab Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 ml-2">
              <button
                type="button"
                onClick={() => setActiveTab('exams')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                  activeTab === 'exams'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HiOutlineAcademicCap className="w-4 h-4 text-blue-600" />
                <span>{isAdmin ? 'IFOA Exams' : 'Exams'}</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-800 text-[10px]">
                  {isAdmin ? ifoaExams.length : exams.length}
                </span>
              </button>

              {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('question-bank')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                  activeTab === 'question-bank'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HiOutlineCollection className="w-4 h-4 text-indigo-600" />
                <span>Question Bank</span>
              </button>
              )}

              {isAdmin && (
              <>
                <div className="h-4 w-px bg-slate-300 mx-2 self-center" />
                <button
                  type="button"
                  onClick={() => setActiveTab('airline-exams')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                    activeTab === 'airline-exams'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FaPlaneDeparture className="w-4 h-4 text-slate-500" />
                  <span>Airline Exams</span>
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-800 text-[10px]">
                    {airlineExams.length}
                  </span>
                </button>
              </>
              )}
            </div>
          </div>

          {activeTab === 'exams' ? (
            <Button onClick={() => navigate(`${base}/new`)} className="bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-2xs flex items-center gap-1.5 px-4 py-2 flex-shrink-0">
              <HiOutlinePlusCircle className="w-4 h-4" /> New Exam
            </Button>
          ) : activeTab === 'question-bank' ? (
            <Button onClick={() => setBankShowCreate((s) => !s)} className="bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-2xs flex items-center gap-1.5 px-4 py-2 flex-shrink-0">
              <HiOutlinePlusCircle className="w-4 h-4" /> New Bank
            </Button>
          ) : null}
        </div>
      </div>

      {/* Main Content Body */}
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        {activeTab === 'question-bank' ? (
          <QuestionBankList embedded showCreateState={bankShowCreate} setShowCreateState={setBankShowCreate} />
        ) : loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading exams…</span>
          </div>
        ) : (() => {
          const list = activeTab === 'airline-exams' ? airlineExams : (isAdmin ? ifoaExams : exams);
          if (list.length === 0) {
            return (
              <Card className="p-12 text-center text-sm font-medium text-slate-400">
                {activeTab === 'airline-exams'
                  ? 'No airline-created exams yet. Airlines with exam access build their own here.'
                  : 'No exams yet. Create your first exam to get started.'}
              </Card>
            );
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {list.map(renderCard)}
            </div>
          );
        })()}

      {assignTarget && (
        <AssignModal exam={assignTarget} isAdmin={isAdmin} onClose={() => setAssignTarget(null)} onAssigned={() => { setAssignTarget(null); load(); }} />
      )}
      {sendTarget && (
        <SendInviteModal exam={sendTarget} onClose={() => setSendTarget(null)} onSent={load} />
      )}
      {ConfirmDialog}
    </div>
  </div>
);
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineAcademicCap, HiOutlinePlusCircle, HiOutlinePencil, HiOutlineTrash,
  HiOutlineUserAdd, HiOutlineClipboardCheck, HiOutlineOfficeBuilding,
  HiOutlineSearch, HiOutlineX, HiOutlineUserGroup, HiChevronRight,
  HiOutlineClock, HiOutlineDocumentText,
} from 'react-icons/hi';
import { listExams, deleteExam, publishExam, getExamAirlines, assignExam } from '../api';
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

function AssignModal({ exam, onClose, onAssigned }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedAirlines, setExpandedAirlines] = useState(new Set());

  useEffect(() => {
    getExamAirlines()
      .then((res) => setGroups(res.data))
      .catch(() => toast.error('Failed to load airlines.'))
      .finally(() => setLoading(false));
  }, []);

  const alreadyAssigned = new Set((exam.assignments || []).map((a) => String(a.participant_id)));

  // Calculate all eligible participants across all airlines
  const allEligibleParticipants = groups.flatMap((g) =>
    g.participants.filter((p) => !alreadyAssigned.has(String(p._id)))
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
    const eligible = participants.filter((p) => !alreadyAssigned.has(String(p._id)));
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

  const save = async () => {
    if (selected.size === 0) return onClose();
    setSaving(true);
    try {
      await assignExam(exam.id, [...selected]);
      toast.success(`Exam assigned to ${selected.size} candidate(s).`);
      onAssigned();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to assign exam.');
    } finally {
      setSaving(false);
    }
  };

  // Filter groups based on search
  const filteredGroups = groups
    .map((g) => {
      const matchesAirline = g.airline.airlineName.toLowerCase().includes(search.toLowerCase());
      const matchingParticipants = g.participants.filter(
        (p) => matchesAirline || p.participant_name.toLowerCase().includes(search.toLowerCase())
      );
      return { ...g, participants: matchingParticipants };
    })
    .filter((g) => g.participants.length > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[92vw] h-[85vh] max-h-[750px] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                  <HiOutlineAcademicCap className="w-5 h-5" />
                </span>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  Assign &ldquo;{exam.title}&rdquo;
                </DialogTitle>
              </div>
              <p className="text-xs text-slate-500 mt-1">Click an airline to view students and assign exam access.</p>
            </div>
          </div>

          {/* Search + Global Select Toolbar */}
          {!loading && groups.length > 0 && (
            <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 min-w-0">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search candidate or airline..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
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
                {/* Expand / Collapse All toggle */}
                <button
                  type="button"
                  onClick={toggleAllExpanded}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                >
                  {expandedAirlines.size === groups.length ? 'Collapse All' : 'Expand All'}
                </button>

                {allEligibleParticipants.length > 0 && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={toggleAllGlobal}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer select-none ${
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
        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-3.5 bg-slate-50/50">
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

              return (
                <div
                  key={airline._id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all"
                >
                  {/* Airline Header Bar (Clickable to toggle collapse/expand) */}
                  <div
                    onClick={() => toggleExpandAirline(airline._id)}
                    className="px-4 py-3 bg-slate-50/80 hover:bg-slate-100/70 cursor-pointer flex items-center justify-between gap-4 select-none transition-colors"
                  >
                    {/* Left: Chevron + Icon + Airline Name */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <HiChevronRight className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-slate-600' : ''}`} />
                      <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs flex-shrink-0">
                        <HiOutlineOfficeBuilding className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-800 truncate">
                        {airline.airlineName}
                      </span>
                    </div>

                    {/* Right: Vertically Aligned Count Badge + Select All button */}
                    <div className="flex items-center gap-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[11px] font-bold min-w-[28px] text-center">
                        {participants.length}
                      </span>

                      {eligibleInGroup.length > 0 ? (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleAirline(participants)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 select-none cursor-pointer ${
                            isGroupAllSelected
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Checkbox
                            checked={isGroupAllSelected}
                            className="w-3.5 h-3.5 pointer-events-none"
                          />
                          <span>
                            {isGroupAllSelected ? 'Selected' : 'Select All'}
                            {selectedCountInGroup > 0 && !isGroupAllSelected && (
                              <span className="ml-1 px-1 rounded bg-slate-100 text-slate-900 text-[10px] font-bold">
                                {selectedCountInGroup}
                              </span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">All Assigned</span>
                      )}
                    </div>
                  </div>

                  {/* Animated Student List (Scrollable container inside each accordion) */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden border-t border-slate-100 bg-white"
                      >
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
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
                                className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all select-none border ${
                                  isAssigned
                                    ? 'bg-slate-50/70 border-slate-100 text-slate-400 cursor-not-allowed'
                                    : isChecked
                                    ? 'bg-slate-900/5 border-slate-900/30 text-slate-900 shadow-2xs cursor-pointer'
                                    : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700 cursor-pointer'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <Checkbox
                                    disabled={isAssigned}
                                    checked={isChecked}
                                    onCheckedChange={() => !isAssigned && toggleParticipant(p._id)}
                                    className="w-4 h-4 flex-shrink-0"
                                  />
                                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-extrabold text-slate-600 flex-shrink-0">
                                    {ini}
                                  </div>
                                  <span className="truncate font-semibold">{p.participant_name}</span>
                                </div>

                                {isAssigned ? (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-500 text-[10px] font-bold flex-shrink-0">
                                    Assigned
                                  </span>
                                ) : (
                                  p.training_type && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium flex-shrink-0">
                                      {p.training_type}
                                    </span>
                                  )
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
        <DialogFooter className="flex-shrink-0 px-6 py-3.5 border-t border-slate-100 bg-white sticky bottom-0 z-10 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500">
            {selected.size > 0 ? (
              <span className="text-slate-900 font-bold">{selected.size} candidate(s) selected</span>
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
              disabled={saving || selected.size === 0}
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold px-4 py-2 shadow-2xs"
            >
              {saving ? 'Assigning…' : `Assign (${selected.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExamSystem() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignTarget, setAssignTarget] = useState(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const load = () => listExams().then((res) => setExams(res.data)).catch(() => toast.error('Failed to load exams.')).finally(() => setLoading(false));
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

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* Flush Full-Width Sticky Page Header */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-6 lg:px-8 py-2.5 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex-shrink-0">Exam System</h1>
            <span className="hidden sm:inline-block text-xs font-medium text-slate-400 truncate border-l border-slate-200 pl-3">
              Create, publish and assign exams to your airline students
            </span>
          </div>
          <Button onClick={() => navigate('/admin/exams/new')} className="bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-2xs flex items-center gap-1.5 px-4 py-2 flex-shrink-0">
            <HiOutlinePlusCircle className="w-4 h-4" /> New Exam
          </Button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading exams…</span>
        </div>
      ) : exams.length === 0 ? (
        <Card className="p-12 text-center text-sm font-medium text-slate-400">
          No exams yet. Create your first exam to get started.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {exams.map((exam) => (
            <Card
              key={exam.id}
              className="group p-6 bg-white border border-slate-200/90 rounded-3xl shadow-2xs hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                      <HiOutlineAcademicCap className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900 break-words leading-snug group-hover:text-blue-600 transition-colors">
                        {exam.title}
                      </h2>
                      <p className="text-[11px] font-medium text-slate-400">
                        {exam.questions?.length || 0} Questions · {exam.duration_minutes} Mins
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={STATUS_VARIANT[exam.status]}
                    className="capitalize font-bold text-[11px] px-2.5 py-0.5 rounded-full flex-shrink-0"
                  >
                    {exam.status}
                  </Badge>
                </div>

                {/* Description */}
                {exam.description ? (
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 min-h-[36px]">
                    {exam.description}
                  </p>
                ) : (
                  <div className="min-h-[12px]" />
                )}

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 pt-1">
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <HiOutlineClock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">Pass ≥ {exam.pass_percentage}%</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <HiOutlineUserGroup className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{exam.assignments?.length || 0} Assigned</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center gap-1.5 pt-4 mt-4 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/admin/exams/${exam.id}/edit`)}
                  className="rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 shadow-2xs"
                >
                  <HiOutlinePencil className="w-3.5 h-3.5" /> Edit
                </Button>
                {exam.status === 'draft' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs shadow-2xs"
                    onClick={() => handlePublish(exam)}
                  >
                    Publish
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs shadow-2xs"
                  onClick={() => setAssignTarget(exam)}
                >
                  <HiOutlineUserAdd className="w-3.5 h-3.5" /> Assign
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/admin/exams/${exam.id}/attempts`)}
                  className="rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 shadow-2xs"
                >
                  <HiOutlineClipboardCheck className="w-3.5 h-3.5" /> Results
                </Button>
                <SimpleTooltip label="Delete exam">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                    onClick={() => handleDelete(exam)}
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </Button>
                </SimpleTooltip>
              </div>
            </Card>
          ))}
        </div>
      )}

      {assignTarget && (
        <AssignModal exam={assignTarget} onClose={() => setAssignTarget(null)} onAssigned={() => { setAssignTarget(null); load(); }} />
      )}
      {ConfirmDialog}
    </div>
  </div>
);
}

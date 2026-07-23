import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineAcademicCap, HiOutlinePlusCircle, HiOutlinePencil, HiOutlineTrash,
  HiOutlineUserAdd, HiOutlineClipboardCheck, HiOutlineOfficeBuilding,
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

  useEffect(() => {
    getExamAirlines().then((res) => setGroups(res.data)).catch(() => toast.error('Failed to load airlines.')).finally(() => setLoading(false));
  }, []);

  const alreadyAssigned = new Set((exam.assignments || []).map((a) => String(a.participant_id)));

  const toggle = (id) => {
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
      toast.success('Exam assigned.');
      onAssigned();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to assign exam.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
          <DialogTitle>Assign &ldquo;{exam.title}&rdquo;</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No airlines with students found.</p>
          ) : (
            groups.map(({ airline, participants }) => (
              <div key={airline._id}>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5">
                  <HiOutlineOfficeBuilding className="w-4 h-4" /> {airline.airlineName}
                </p>
                <div className="space-y-1">
                  {participants.map((p) => (
                    <label key={p._id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-sm cursor-pointer">
                      <Checkbox
                        disabled={alreadyAssigned.has(String(p._id))}
                        checked={alreadyAssigned.has(String(p._id)) || selected.has(p._id)}
                        onCheckedChange={() => toggle(p._id)}
                      />
                      <span className={alreadyAssigned.has(String(p._id)) ? 'text-slate-300' : 'text-slate-800'}>
                        {p.participant_name}{alreadyAssigned.has(String(p._id)) ? ' (already assigned)' : ''}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter className="flex-shrink-0 px-6 py-3.5 border-t border-slate-100 bg-white sticky bottom-0 z-10">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Assigning…' : `Assign (${selected.size})`}
          </Button>
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
      <div className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {exams.map((exam) => (
            <Card key={exam.id} className="p-5 hover:shadow-xs transition-all space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-bold text-slate-900 leading-snug">{exam.title}</p>
                <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge>
              </div>
              {exam.description && <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{exam.description}</p>}
              <div className="flex flex-wrap gap-2.5 text-xs font-medium text-slate-400 pt-1">
                <span className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">{exam.questions?.length || 0} questions</span>
                <span className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">{exam.duration_minutes} min</span>
                <span className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">Pass ≥ {exam.pass_percentage}%</span>
                <span className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">{exam.assignments?.length || 0} assigned</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => navigate(`/admin/exams/${exam.id}/edit`)}>
                  <HiOutlinePencil className="w-3.5 h-3.5" /> Edit
                </Button>
                {exam.status === 'draft' && (
                  <Button size="sm" variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    onClick={() => handlePublish(exam)}>
                    Publish
                  </Button>
                )}
                <Button size="sm" variant="outline" className="border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                  onClick={() => setAssignTarget(exam)}>
                  <HiOutlineUserAdd className="w-3.5 h-3.5" /> Assign
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate(`/admin/exams/${exam.id}/attempts`)}>
                  <HiOutlineClipboardCheck className="w-3.5 h-3.5" /> Results
                </Button>
                <SimpleTooltip label="Delete exam">
                  <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                    onClick={() => handleDelete(exam)}>
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

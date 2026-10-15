import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import SegmentedToggle from '../components/SegmentedToggle';
import { StatTileCompact } from '../components/dashboard/Charts';
import { useHistoryState } from '@/hooks/use-history-state';
import { AnimatePresence } from 'framer-motion';
import { HiOutlineClipboardList, HiOutlineSearch, HiOutlineChartBar, HiOutlineDocumentText, HiOutlineCheckCircle, HiOutlinePlus, HiOutlineTrash, HiOutlinePencil, HiOutlineEye, HiOutlineRefresh, HiOutlineAcademicCap, HiOutlineUpload, HiOutlineDocumentDownload, HiOutlineLockClosed, HiOutlineChevronDown, HiOutlineReply, HiOutlineUserGroup, HiOutlineTrendingUp, HiOutlineBadgeCheck, HiOutlineClipboardCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { getExamResults, createExamResult, bulkCreateExamResults, updateExamResult, deleteExamResult, issueResultSheet, getExamBatches } from '../api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { COURSE_TYPES, TABS, gradeFromMark, gradeBadge, courseTypeBadge, pickRestore, downloadPdf, viewPdf } from './examResults/helpers';
import { ImportExcelModal } from './examResults/ImportExcelModal';
import { ResultFormModal } from './examResults/ResultFormModal';
import { BatchEditModal } from './examResults/BatchEditModal';
import { StudentDetailModal } from './examResults/StudentDetailModal';
// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExamResults() {
  const { isAdmin } = useAuth();
  const [results, setResults]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useHistoryState('activeTab', 0);
  const [search, setSearch]           = useHistoryState('search', '');
  const [filterType, setFilterType]   = useHistoryState('filterType', '');
  const [filterBatch, setFilterBatch] = useHistoryState('filterBatch', '');
  const [filterSheet, setFilterSheet] = useHistoryState('filterSheet', '');
  const [batches, setBatches]         = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [prefill, setPrefill]         = useState(null); // add-student-to-batch defaults
  const [batchEdit, setBatchEdit]     = useState(null); // group being bulk-edited
  const [undoStack, setUndoStack]     = useState([]);   // [{ label, run }] — newest last
  const [viewStudent, setViewStudent] = useState(null);

  const [selected, setSelected]       = useState(new Set());
  const [sort, setSort] = useState({ key: null, dir: 'asc' }); // Overview sorting
  const [openGroups, setOpenGroups] = useState(new Set()); // Overview accordion — batches start collapsed
  const [bulkIssuing, setBulkIssuing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRevoking, setBulkRevoking] = useState(false);
  const [revokingSheetId, setRevokingSheetId] = useState(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const toggleSelect = (id) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(selected.size === results.length ? new Set() : new Set(results.map(r => r._id || r.id)));

  // ── Undo history ──────────────────────────────────────────────────────────
  // Every destructive / modifying action pushes { label, run }; run() reverses it.
  const pushUndo = (label, run) => setUndoStack(st => [...st.slice(-19), { label, run }]);

  const handleUndo = async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setUndoStack(st => st.slice(0, -1));
    try {
      await entry.run();
      toast.success(`Undone: ${entry.label}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || `Could not undo: ${entry.label}`);
    }
    fetchAll();
  };

  // Ctrl/Cmd+Z undoes the last page-level action (ignored while typing in a field,
  // so it never fights the browser's own text undo or the form modal's undo).
  const undoRef = useRef(handleUndo);
  undoRef.current = handleUndo;
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      undoRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleBulkDelete = async () => {
    const ok = await confirm(`Delete ${selected.size} selected result(s)? This cannot be undone.`, { title: 'Delete results', confirmLabel: 'Delete' });
    if (!ok) return;
    setBulkDeleting(true);
    let count = 0;
    const deletedRows = [];
    for (const id of selected) {
      const snap = results.find(r => (r._id || r.id) === id);
      try {
        await deleteExamResult(id);
        count++;
        if (snap) deletedRows.push(pickRestore(snap));
      } catch {}
    }
    if (deletedRows.length) {
      pushUndo(`delete ${deletedRows.length} result(s)`, () => bulkCreateExamResults(deletedRows));
    }
    toast.success(`${count} result(s) deleted. Press Undo to restore.`);
    setSelected(new Set());
    setBulkDeleting(false);
    fetchAll();
  };

  const handleBulkIssue = async () => {
    const toIssue = results.filter(r => selected.has(r._id || r.id) && !r.sheet_issued);
    if (!toIssue.length) { toast('All selected sheets are already issued.'); return; }
    const ok = await confirm(`Issue result sheets for ${toIssue.length} student(s)?`, { title: 'Issue result sheets', confirmLabel: 'Issue' });
    if (!ok) return;
    setBulkIssuing(true);
    let count = 0;
    for (const r of toIssue) {
      try { await issueResultSheet(r._id || r.id); count++; } catch {}
    }
    toast.success(`${count} sheet(s) issued successfully.`);
    setSelected(new Set());
    setBulkIssuing(false);
    fetchAll();
  };

  const handleBulkRevoke = async () => {
    const toRevoke = results.filter(r => selected.has(r._id || r.id) && r.sheet_issued);
    if (!toRevoke.length) { toast('No issued sheets in selected records.'); return; }
    const ok = await confirm(`Revoke result sheets for ${toRevoke.length} student(s)?`, { title: 'Revoke result sheets', confirmLabel: 'Revoke' });
    if (!ok) return;
    setBulkRevoking(true);
    let count = 0;
    for (const r of toRevoke) {
      try {
        await updateExamResult(r._id || r.id, { sheet_issued: false, sheet_date: null });
        count++;
      } catch {}
    }
    toast.success(`${count} sheet(s) revoked successfully.`);
    setSelected(new Set());
    setBulkRevoking(false);
    fetchAll();
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType)  params.course_type = filterType;
      if (filterBatch) params.batch_name  = filterBatch;
      if (search)      params.search      = search;
      const [rRes, bRes] = await Promise.all([getExamResults(params), getExamBatches()]);
      setResults(rRes.data);
      setBatches(bRes.data);
    } catch {
      toast.error('Failed to load exam results.');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterBatch, search]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const passCount  = results.filter(r => r.overall_grade && r.overall_grade !== 'FAILED').length;
  // Students without a mark / grade yet are left out, so they don't drag the
  // average and pass rate towards zero.
  const marked     = results.filter(r => r.final_marks != null && r.final_marks !== '');
  const graded     = results.filter(r => r.overall_grade);
  const passRate   = graded.length ? Math.round((passCount / graded.length) * 100) : null;
  const avgMark    = marked.length ? Math.round(marked.reduce((acc, r) => acc + Number(r.final_marks), 0) / marked.length * 10) / 10 : null;
  const batchCount = new Set(results.map(r => r.batch_name).filter(Boolean)).size;
  const sheetCount = results.filter(r => r.sheet_issued).length;

  const subjectAverages = (() => {
    const map = {};
    results.forEach(r => {
      (r.subjects || []).forEach(s => {
        if (s.marks_obtained != null) {
          if (!map[s.abbr]) map[s.abbr] = { name: s.name, abbr: s.abbr, total: 0, count: 0 };
          map[s.abbr].total += s.marks_obtained;
          map[s.abbr].count += 1;
        }
      });
    });
    return Object.values(map).map(v => ({ ...v, avg: Math.round((v.total / v.count) * 10) / 10 }));
  })();

  const handleSave = async (payload) => {
    try {
      if (editTarget) {
        const id = editTarget._id || editTarget.id;
        const before = pickRestore(editTarget);
        const name = editTarget.participant_name || `${editTarget.first_name} ${editTarget.last_name}`;
        await updateExamResult(id, payload);
        pushUndo(`edit ${name}`, () => updateExamResult(id, before));
        toast.success('Exam result updated.');
      } else {
        const res = await createExamResult(payload);
        const newId = res?.data?.id || res?.data?._id;
        if (newId) pushUndo(`add ${payload.first_name} ${payload.last_name}`, () => deleteExamResult(newId));
        toast.success('Exam result added.');
      }
      setShowForm(false);
      setEditTarget(null);
      setPrefill(null);
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save exam result.');
      throw err;
    }
  };

  // Save a whole-batch edit: one update per changed student, undone as one step.
  const handleBatchSave = async (updates) => {
    const results = await Promise.allSettled(updates.map(u => updateExamResult(u.id, u.payload)));
    const okUpdates = updates.filter((_, i) => results[i].status === 'fulfilled');
    const failed = updates.length - okUpdates.length;
    if (okUpdates.length) {
      pushUndo(`edit batch (${okUpdates.length} student${okUpdates.length === 1 ? '' : 's'})`,
        () => Promise.all(okUpdates.map(u => updateExamResult(u.id, u.before))));
      toast.success(`${okUpdates.length} student${okUpdates.length === 1 ? '' : 's'} updated.`);
    }
    if (failed) toast.error(`${failed} update${failed === 1 ? '' : 's'} failed.`);
    if (!failed) setBatchEdit(null);
    fetchAll();
  };

  const handleDelete = async (id, name) => {
    if (!(await confirm(`Delete result for ${name}?`, { title: 'Delete result', confirmLabel: 'Delete' }))) return;
    try {
      const snap = results.find(r => (r._id || r.id) === id);
      await deleteExamResult(id);
      if (snap) {
        const row = pickRestore(snap);
        pushUndo(`delete ${name}`, () => createExamResult(row));
      }
      toast.success('Result deleted. Press Undo to restore.');
      fetchAll();
    } catch {
      toast.error('Failed to delete result.');
    }
  };

  const handleIssueSheet = async (id) => {
    await issueResultSheet(id);
    fetchAll();
  };

  const handleRevokeSheet = async (id) => {
    await updateExamResult(id, { sheet_issued: false, sheet_date: null });
    fetchAll();
  };

  const handleRevokeSheetWithConfirm = async (id) => {
    const ok = await confirm('Revoke this sheet? It will return to Pending.', { title: 'Revoke sheet', confirmLabel: 'Revoke' });
    if (!ok) return;
    setRevokingSheetId(id);
    try {
      await handleRevokeSheet(id);
      toast.success('Sheet revoked.');
    } catch {
      toast.error('Failed to revoke.');
    } finally {
      setRevokingSheetId(null);
    }
  };

  const openAdd  = ()     => { setEditTarget(null); setPrefill(null); setShowForm(true); };
  // Add one student to an existing batch — batch / course details and the course
  // list are copied from the batch, scores start blank.
  const openAddToBatch = (g) => {
    const t = g.items[0] || {};
    setEditTarget(null);
    setPrefill({
      batch_name: g.batch_name, course_type: g.course_type,
      course_name: t.course_name || '', result_header_text: t.result_header_text || '',
      training_mode: t.training_mode || 'HYBRID',
      start_date: t.start_date || '', end_date: t.end_date || '',
      company: t.company || '', lead_instructor: t.lead_instructor || '',
      instructors: t.instructors || [], sheet_date: t.sheet_date || t.end_date || '',
      subjects: t.subjects || [],
    });
    setShowForm(true);
  };
  const openEdit = (item) => { setEditTarget(item); setPrefill(null); setShowForm(true); };

  const handleQuickIssueAndView = async (r) => {
    const id = r._id || r.id;
    try {
      await issueResultSheet(id);
      fetchAll();
      toast.success('Sheet issued.');
      await viewPdf(id);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to issue sheet.');
    }
  };

  const filteredResults = filterSheet === ''
    ? results
    : filterSheet === 'pending'
      ? results.filter(r => !r.sheet_issued)
      : results.filter(r => r.sheet_issued);

  // Overview: one section per batch + course type + airline (e.g. "OCT-2026 · FDI · DHL Bahrain")
  const overviewGroups = (() => {
    const map = new Map();
    filteredResults.forEach(r => {
      const company = (r.company || '').trim();
      const key = `${r.batch_name}||${r.course_type}||${company.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { key, batch_name: r.batch_name, course_type: r.course_type, company, items: [] });
      map.get(key).items.push(r);
    });
    const GRADE_RANK = { OUTSTANDING: 5, DISTINCTION: 4, MERIT: 3, PASS: 2, FAILED: 1 };
    const val = {
      student: r => (r.participant_name || `${r.first_name} ${r.last_name}`).toLowerCase(),
      marks:   r => (r.final_marks != null ? Number(r.final_marks) : -1),
      grade:   r => GRADE_RANK[r.overall_grade] || 0,
      status:  r => (r.sheet_issued ? 1 : 0),
    };
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const sign = sort.dir === 'asc' ? 1 : -1;
    const groupsArr = [...map.values()];
    if (sort.key === 'batch') {
      groupsArr.sort((a, b) => sign * cmp(a.batch_name.toLowerCase(), b.batch_name.toLowerCase()));
    } else if (val[sort.key]) {
      groupsArr.forEach(g => g.items.sort((a, b) => sign * cmp(val[sort.key](a), val[sort.key](b))));
    }
    return groupsArr;
  })();
  const toggleSort = (key) =>
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="w-full space-y-4">
      {/* Top Card Header (Full Width Edge-to-Edge) */}
      <div className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight">Exam Results &amp; Sheets</h1>
            <span className="hidden xs:inline-block px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] sm:text-[11px] font-bold text-slate-700 flex-shrink-0">
              Suite
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 hidden sm:block mt-0.5">
            Manage student scores, grades, and issue official result sheets
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleUndo} disabled={undoStack.length === 0}
              title={undoStack.length ? `Undo: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)` : 'Nothing to undo'}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-all shadow-2xs disabled:opacity-40 disabled:hover:bg-white">
              <HiOutlineReply className="w-4 h-4 text-slate-500" />
              <span>Undo{undoStack.length > 0 && ` (${undoStack.length})`}</span>
            </button>
            <button onClick={() => setShowImport(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-all shadow-2xs">
              <HiOutlineUpload className="w-4 h-4 text-slate-500" />
              <span>Import</span>
            </button>
            <button onClick={openAdd}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-2xs">
              <HiOutlinePlus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>
        )}
      </div>

      {/* Page Content */}
      <div className="px-4 sm:px-6 lg:px-8 space-y-6">

      {/* Headline numbers — a compact strip above the table */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatTileCompact icon={HiOutlineUserGroup} label="Students" value={results.length}
          sub={batchCount ? `In ${batchCount} batch${batchCount === 1 ? '' : 'es'}` : 'No results yet'} />
        <StatTileCompact icon={HiOutlineTrendingUp} label="Average mark" value={avgMark ?? '—'} suffix={avgMark != null ? '%' : ''}
          ring={avgMark}
          sub={marked.length ? `Across ${marked.length} marked student${marked.length === 1 ? '' : 's'}` : 'No marks entered yet'} />
        <StatTileCompact icon={HiOutlineBadgeCheck} label="Pass rate" value={passRate ?? '—'} suffix={passRate != null ? '%' : ''}
          ring={passRate}
          sub={graded.length ? `${passCount} of ${graded.length} graded passed` : 'No grades yet'} />
        <StatTileCompact icon={HiOutlineClipboardCheck} label="Result sheets issued" value={sheetCount}
          ring={results.length ? (sheetCount / results.length) * 100 : null}
          sub={results.length ? `${results.length - sheetCount} still pending` : 'No results yet'} />
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {/* Merged Header & Filter Bar */}
        <div className="px-4 sm:px-5 pt-3 pb-3.5 border-b border-slate-200/80 bg-white space-y-3.5">
          {/* Row 1: views. Row 2: everything that narrows the list. */}
          <div className="flex items-center justify-between gap-3 -mt-1 border-b border-slate-100">
            <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden scrollbar-none">
              {TABS.map((tab, i) => (
                <button key={tab} onClick={() => setActiveTab(i)}
                  className={`relative flex-shrink-0 px-3 py-2.5 text-sm font-semibold transition-colors ${
                    activeTab === i ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                  }`}>
                  {tab}
                  {activeTab === i && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-slate-900" />}
                </button>
              ))}
            </div>
            <button onClick={fetchAll} title="Refresh"
              className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              <HiOutlineRefresh className="w-4 h-4" /> <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="relative flex-1 min-w-0">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="Search student, batch, company…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Select value={filterType || 'all'} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-44 h-9 text-xs font-medium bg-white border-slate-200/80 rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Course Types</SelectItem>
                  {COURSE_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.value}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterBatch || 'all'} onValueChange={v => setFilterBatch(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-44 h-9 text-xs font-medium bg-white border-slate-200/80 rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  {batches.filter(b => b._id?.batch_name).map(b => <SelectItem key={b._id.batch_name} value={b._id.batch_name}>{b._id.batch_name}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Sheet status */}
              <SegmentedToggle value={filterSheet || 'all'} onChange={(v) => setFilterSheet(v === 'all' ? '' : v)}
                options={[{ key: 'all', label: 'All sheets' }, { key: 'pending', label: 'Pending' }, { key: 'generated', label: 'Issued' }]} />
            </div>
          </div>

          {isAdmin && activeTab === 0 && selected.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl">
                {selected.size} selected
              </span>
              <button onClick={handleBulkIssue} disabled={bulkIssuing || bulkDeleting || bulkRevoking || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-2xs">
                {bulkIssuing
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <HiOutlineCheckCircle className="w-3.5 h-3.5" />}
                {bulkIssuing ? 'Issuing…' : 'Issue Selected'}
              </button>
              <button onClick={handleBulkRevoke} disabled={bulkRevoking || bulkIssuing || bulkDeleting || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 disabled:opacity-50 transition-colors shadow-2xs">
                {bulkRevoking
                  ? <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                  : <HiOutlineRefresh className="w-3.5 h-3.5" />}
                {bulkRevoking ? 'Revoking…' : 'Revoke'}
              </button>
              <button onClick={handleBulkDelete} disabled={bulkDeleting || bulkIssuing || bulkRevoking || selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-2xs">
                {bulkDeleting
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <HiOutlineTrash className="w-3.5 h-3.5" />}
                {bulkDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
              <span className="text-sm font-medium">Loading exam results…</span>
            </div>
          ) : (
            <>
              {/* TAB 0 — Overview table */}
              {activeTab === 0 && (
                filteredResults.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <HiOutlineClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
                    <p className="text-sm font-medium text-slate-500">No exam results found.</p>
                    {isAdmin && (
                      <button onClick={() => setShowImport(true)}
                        className="mt-3 text-xs font-bold text-slate-900 hover:underline inline-flex items-center gap-1">
                        <HiOutlineUpload className="w-4 h-4" /> Import from Excel
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200/80 overflow-hidden">
                    <div className="overflow-auto [scrollbar-gutter:stable] h-[calc(100vh-27.5rem)] min-h-[17rem]">
                    {/* Actions gets a fixed width that fits its five icons; the student
                        column takes whatever is left, so the table never needs to scroll sideways. */}
                    <table className="w-full min-w-[700px] table-fixed text-xs">
                      <colgroup>
                        {isAdmin && <col style={{ width: '3rem' }} />}
                        <col style={{ width: '3rem' }} />
                        <col />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '12%' }} />
                        {isAdmin && <col style={{ width: '11.5rem' }} />}
                      </colgroup>
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-50 text-left">
                          {isAdmin && (
                            <th className="px-4 py-3">
                              <Checkbox
                                checked={selected.size === filteredResults.length && filteredResults.length > 0 ? true : selected.size > 0 ? 'indeterminate' : false}
                                onCheckedChange={toggleAll}
                                title={selected.size === filteredResults.length ? 'Deselect all' : 'Select all'}
                              />
                            </th>
                          )}
                          {[
                            ['#'], ['Student', 'student'], ['Batch', 'batch'], ['Type'],
                            ['Final Marks', 'marks'], ['Grade', 'grade'], ['Sheet Status', 'status'],
                            isAdmin && ['Actions'],
                          ].filter(Boolean).map(([h, key]) => (
                            <th key={h} className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                              {key ? (
                                <button type="button" onClick={() => toggleSort(key)}
                                  className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 ${sort.key === key ? 'text-slate-900' : ''}`}>
                                  {h}
                                  <span className="text-[10px] leading-none">
                                    {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                                  </span>
                                </button>
                              ) : h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {overviewGroups.map(g => {
                          const gIds = g.items.map(r => r._id || r.id);
                          const gAll = gIds.every(id => selected.has(id));
                          const gSome = gIds.some(id => selected.has(id));
                          const gCompanies = g.company ? [g.company] : [];
                          const gIssued = g.items.filter(r => r.sheet_issued).length;
                          const gOpen = openGroups.has(g.key);
                          const gMarks = g.items.map(r => r.final_marks).filter(v => v != null && v !== '').map(Number).filter(v => !Number.isNaN(v));
                          const gAvg = gMarks.length ? Math.round((gMarks.reduce((t, v) => t + v, 0) / gMarks.length) * 10) / 10 : null;
                          const toggleG = () => setOpenGroups(prev => {
                            const n = new Set(prev);
                            n.has(g.key) ? n.delete(g.key) : n.add(g.key);
                            return n;
                          });
                          return (
                          <Fragment key={g.key}>
                          <tr className={`cursor-pointer select-none transition-colors ${gOpen ? 'bg-slate-100/80' : 'bg-slate-50/60 hover:bg-slate-100/70'}`} onClick={toggleG}>
                            {isAdmin && (
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <Checkbox
                                  checked={gAll ? true : gSome ? 'indeterminate' : false}
                                  onCheckedChange={() => setSelected(prev => {
                                    const n = new Set(prev);
                                    gIds.forEach(id => (gAll ? n.delete(id) : n.add(id)));
                                    return n;
                                  })}
                                  title="Select batch"
                                />
                              </td>
                            )}
                            {/* Batch row follows the table's own columns, so everything lines up with the header */}
                            <td className="px-4 py-3">
                              <HiOutlineChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${gOpen ? '' : '-rotate-90'}`} />
                            </td>
                            <td className="px-4 py-3 min-w-0">
                              <p className="text-sm font-extrabold text-slate-900 truncate" title={g.batch_name}>{g.batch_name}</p>
                              {gCompanies.length > 0 && <p className="text-[11px] font-medium text-slate-500 truncate">{gCompanies.join(', ')}</p>}
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">
                              {g.items.length} student{g.items.length > 1 ? 's' : ''}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${courseTypeBadge(g.course_type)}`}>{g.course_type}</span>
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">
                              {gAvg != null ? <>Avg <span className="font-bold text-slate-900">{gAvg}</span></> : <span className="text-slate-300">–</span>}
                            </td>
                            <td className="px-4 py-3" />
                            <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">
                              <span className="font-bold text-slate-900">{gIssued}</span> of {g.items.length} issued
                            </td>
                            {isAdmin && (
                              <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white divide-x divide-slate-200 overflow-hidden shadow-2xs">
                                  <button type="button" onClick={() => setBatchEdit(g)}
                                    title={`Edit all students in ${g.batch_name} at once`}
                                    className="h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                                    <HiOutlinePencil className="w-4 h-4" />
                                  </button>
                                  <button type="button" onClick={() => openAddToBatch(g)}
                                    title={`Add a student to ${g.batch_name}`}
                                    className="h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                                    <HiOutlinePlus className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                          {gOpen && g.items.map((r, i) => {
                          const rid = r._id || r.id;
                          const isSelected = selected.has(rid);
                          return (
                          <tr key={rid} className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-slate-50' : ''}`}>
                            {isAdmin && (
                              <td className="px-4 py-3">
                                <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(rid)} />
                              </td>
                            )}
                            <td className="px-4 py-3 text-slate-400 font-bold">{i + 1}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => setViewStudent(r)} className="font-bold text-slate-900 hover:text-slate-600 text-left">
                                {r.participant_name || `${r.first_name} ${r.last_name}`}
                              </button>
                              {r.company && <p className="text-[11px] font-medium text-slate-400">{r.company}</p>}
                            </td>
                            <td className="px-4 py-3 text-slate-700 font-semibold">{r.batch_name}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${courseTypeBadge(r.course_type)}`}>{r.course_type}</span>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900">{r.final_marks != null ? Number(r.final_marks).toFixed(2) : '–'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${gradeBadge(r.overall_grade)}`}>{r.overall_grade || '–'}</span>
                            </td>
                            <td className="px-4 py-3">
                              {r.sheet_issued
                                ? <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><HiOutlineCheckCircle className="w-3.5 h-3.5" /> Issued</span>
                                : <span className="text-xs text-amber-600 font-bold flex items-center gap-1"><HiOutlineLockClosed className="w-3.5 h-3.5" /> Pending</span>}
                            </td>
                            {isAdmin && (
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-0.5">
                                  <button onClick={() => setViewStudent(r)} title="View" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900">
                                    <HiOutlineEye className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900">
                                    <HiOutlinePencil className="w-4 h-4" />
                                  </button>
                                  {r.sheet_issued && (
                                    <button onClick={() => viewPdf(rid)} title="View PDF" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900">
                                      <HiOutlineDocumentText className="w-4 h-4" />
                                    </button>
                                  )}
                                  {r.sheet_issued && (
                                    <button
                                      onClick={() => handleRevokeSheetWithConfirm(rid)}
                                      title="Revoke Sheet"
                                      disabled={revokingSheetId === rid}
                                      className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 disabled:opacity-50"
                                    >
                                      {revokingSheetId === rid
                                        ? <div className="w-4 h-4 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                                        : <HiOutlineRefresh className="w-4 h-4" />}
                                    </button>
                                  )}
                                  <button onClick={() => handleDelete(r._id || r.id, r.participant_name || `${r.first_name} ${r.last_name}`)} title="Delete"
                                    className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600">
                                    <HiOutlineTrash className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                          );
                          })}
                          </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )
              )}

              {/* TAB 1 — Student cards */}
              {activeTab === 1 && (
                filteredResults.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <HiOutlineAcademicCap className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
                    <p className="text-sm font-medium text-slate-500">No results to display.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredResults.map(r => (
                      <div key={r._id || r.id}
                        className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-shadow cursor-pointer space-y-3"
                        onClick={() => setViewStudent(r)}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm">{r.participant_name || `${r.first_name} ${r.last_name}`}</h3>
                            <p className="text-xs font-medium text-slate-400">{r.company || r.batch_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.sheet_issued && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <HiOutlineCheckCircle className="w-3 h-3" /> Issued
                              </span>
                            )}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeBadge(r.overall_grade)}`}>{r.overall_grade || '–'}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { val: r.final_marks != null ? Number(r.final_marks).toFixed(2) : '–', label: 'Avg' },
                            { val: r.final_exam_score ?? '–', label: 'Exam' },
                            { val: r.subjects?.filter(s => s.marks_obtained != null).length ?? 0, label: 'Subjects' },
                          ].map(({ val, label }) => (
                            <div key={label} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                              <p className="text-base font-extrabold text-slate-900">{val}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* TAB 2 — Subject analysis */}
              {activeTab === 2 && (
                subjectAverages.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <HiOutlineChartBar className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
                    <p className="text-sm font-medium text-slate-500">No subject scores recorded yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {subjectAverages.sort((a, b) => b.avg - a.avg).map(s => {
                      const grade = gradeFromMark(s.avg);
                      return (
                        <div key={s.abbr} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-base font-bold text-slate-900">{s.abbr}</p>
                              <p className="text-xs font-medium text-slate-400">{s.name}</p>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeBadge(grade)}`}>{grade || '–'}</span>
                          </div>
                          <div className="flex items-end gap-2">
                            <p className="text-3xl font-black text-slate-900">{s.avg}</p>
                            <p className="text-xs font-medium text-slate-400 mb-1">/ 100 · {s.count} students</p>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-slate-900 transition-all" style={{ width: `${s.avg}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* TAB 3 — Result Sheets */}
              {activeTab === 3 && (
                filteredResults.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <HiOutlineDocumentText className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
                    <p className="text-sm font-medium text-slate-500">No result sheets available.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          {['#','Student','Batch','Sheet Date','Status','Actions'].map(h => (
                            <th key={h} className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-[11px]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredResults.map((r, i) => {
                          const id   = r._id || r.id;
                          const name = r.participant_name || `${r.first_name} ${r.last_name}`;
                          return (
                            <tr key={id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-3 text-slate-400 font-bold">{i + 1}</td>
                              <td className="px-4 py-3 font-bold text-slate-900">{name}</td>
                              <td className="px-4 py-3 text-slate-700 font-semibold">{r.batch_name}</td>
                              <td className="px-4 py-3 text-slate-600 font-medium">{r.sheet_date || '–'}</td>
                              <td className="px-4 py-3">
                                {r.sheet_issued
                                  ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                                      <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Issued
                                    </span>
                                  : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                                      <HiOutlineLockClosed className="w-3 h-3" /> Pending
                                    </span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <button onClick={() => setViewStudent(r)}
                                    className="flex items-center gap-1 text-xs font-bold text-slate-900 hover:underline">
                                    <HiOutlineEye className="w-3.5 h-3.5" /> View
                                  </button>
                                  {r.sheet_issued ? (
                                    <>
                                      <button onClick={() => viewPdf(id)}
                                        className="flex items-center gap-1 text-xs font-bold text-slate-900 hover:underline">
                                        <HiOutlineDocumentText className="w-3.5 h-3.5" /> PDF
                                      </button>
                                      <button onClick={() => downloadPdf(id, name)}
                                        className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline">
                                        <HiOutlineDocumentDownload className="w-3.5 h-3.5" /> Download
                                      </button>
                                      {isAdmin && (
                                        <button
                                          onClick={() => handleRevokeSheetWithConfirm(id)}
                                          disabled={revokingSheetId === id}
                                          className="flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
                                        >
                                          {revokingSheetId === id
                                            ? <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                                            : <HiOutlineRefresh className="w-3.5 h-3.5" />} Revoke
                                        </button>
                                      )}
                                    </>
                                  ) : isAdmin ? (
                                    <button onClick={() => handleQuickIssueAndView(r)}
                                      className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline">
                                      <HiOutlineCheckCircle className="w-3.5 h-3.5" /> Issue & View
                                    </button>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs text-slate-400">
                                      <HiOutlineLockClosed className="w-3 h-3" /> PDF locked
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showImport && (
          <ImportExcelModal onClose={() => setShowImport(false)} onImported={() => { fetchAll(); }} />
        )}
        {showForm && (
          <ResultFormModal initial={editTarget} prefill={prefill} onSave={handleSave} batches={batches}
            onClose={() => { setShowForm(false); setEditTarget(null); setPrefill(null); }} />
        )}
        {batchEdit && (
          <BatchEditModal group={batchEdit} onSave={handleBatchSave} onClose={() => setBatchEdit(null)} />
        )}
        {viewStudent && (
          <StudentDetailModal
            student={viewStudent}
            onClose={() => setViewStudent(null)}
            onIssueSheet={handleIssueSheet}
            onRevokeSheet={handleRevokeSheet}
            onRefresh={fetchAll}
          />
        )}
      </AnimatePresence>
      {ConfirmDialog}
      </div>
    </div>
  );
}

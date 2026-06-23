import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  HiOutlineShieldExclamation,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlinePlusCircle,
  HiOutlineEye,
  HiOutlineDocumentDownload,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineX,
} from 'react-icons/hi';
import {
  getDgrAirlines, getDgrForms, createDgrForm, updateDgrForm, deleteDgrForm,
} from '../api';
import { generateDgrPdf, computeDgrScores } from '../utils/generateDgrPdf';

const JOB_FUNCTIONS = [
  { value: 'FC', label: 'F.C. - 7.7' },
  { value: 'FD', label: 'F.D. - 7.8' },
  { value: 'CC', label: 'C.C. - 7.9' },
];

const emptyForm = () => ({
  page_ref: 'Appendix A-13',
  doc_date: '01-11-2024',
  iss_rev:  '5 / 8',
  ato_name_number: '',
  dg_training_type: 'Initial',
  training_date: '',
  initials: {
    item0: '', item0_1: '', item0_2: '', item0_3: '', item0_4: '', item0_5: '', item0_6: '',
    item5: '', item6: '', item7: '',
  },
  job_function: 'FC',
  knowledge_score: '',
  skills: { input_response: '', response_time: '', number_of_errors: '', repeated_attempts: '' },
  attitude: { shows_interest: '', participation: '', input: '', co_operation: '', asks_relevant_questions: '' },
  instructor_name: '',
  instructor_signature: '',
});

const Spin = ({ cls = 'w-4 h-4 border-2 border-primary-300 border-t-primary-600' }) => (
  <div className={`${cls} rounded-full animate-spin`} />
);

// Convert DD.MM.YYYY or DD-MM-YYYY → YYYY-MM-DD (for <input type="date">)
const toInputDate = (str = '') => {
  if (!str) return '';
  const sep = str.includes('.') ? '.' : '-';
  const p = str.split(sep);
  if (p.length !== 3 || p[2].length !== 4) return '';
  return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
};
// Convert YYYY-MM-DD → DD[sep]MM[sep]YYYY
const fromInputDate = (val = '', sep = '.') => {
  if (!val) return '';
  const [y, m, d] = val.split('-');
  return `${d}${sep}${m}${sep}${y}`;
};

// ─────────────────────────────────────────────────────────────────────────────
//  Create / Edit modal
// ─────────────────────────────────────────────────────────────────────────────
function DgrFormModal({ open, initial, onClose, onSave, saving }) {
  const [f, setF] = useState(emptyForm());
  useEffect(() => {
    if (open) {
      const sName = initial?._student?.participant_name || initial?.assignments?.[0]?.participant_name || '';
      setF({ ...emptyForm(), ...initial, _applicantName: sName });
    }
  }, [open, initial]);
  if (!open) return null;

  const set    = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setSub = (grp, k, v) => setF(p => ({ ...p, [grp]: { ...p[grp], [k]: v } }));
  const scores = computeDgrScores(f);

  const numInput = (val, onChange) => (
    <input type="number" min="0" max="100" value={val ?? ''} onChange={e => onChange(e.target.value)}
      className="w-20 px-2 py-1 text-sm border border-primary-200 rounded-lg outline-none focus:border-[#0000ff]" />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-primary-200">
          <div>
            <p className="text-base font-bold text-primary-800">{initial?._id ? 'Edit' : 'New'} DGR Training Form</p>
            {f._applicantName && <p className="text-xs text-primary-400 mt-0.5">Student: {f._applicantName}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
        </div>

        {/* ── Form body: mirrors PDF layout top-to-bottom ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm text-primary-800">

          {/* 0. PDF header top-right (Page / Date / Iss.Rev) */}
          <div>
            <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider mb-2">PDF Header (top-right)</p>
            <div className="rounded-lg border border-primary-200 overflow-hidden text-xs">
              {/* Page */}
              <div className="grid grid-cols-[90px_1fr] border-b border-primary-100">
                <div className="px-3 py-2 border-r border-primary-100 font-medium text-primary-600 flex items-center">Page:</div>
                <input value={f.page_ref ?? ''} onChange={e => set('page_ref', e.target.value)}
                  placeholder="Appendix A-13" className="px-3 py-2 outline-none text-primary-800 focus:bg-blue-50" />
              </div>
              {/* Date — calendar picker, stored as DD-MM-YYYY */}
              <div className="grid grid-cols-[90px_1fr] border-b border-primary-100">
                <div className="px-3 py-2 border-r border-primary-100 font-medium text-primary-600 flex items-center">Date:</div>
                <input type="date" value={toInputDate(f.doc_date)}
                  onChange={e => set('doc_date', fromInputDate(e.target.value, '-'))}
                  className="px-3 py-2 outline-none text-primary-800 focus:bg-blue-50" />
              </div>
              {/* Iss./Rev */}
              <div className="grid grid-cols-[90px_1fr]">
                <div className="px-3 py-2 border-r border-primary-100 font-medium text-primary-600 flex items-center">Iss. / Rev:</div>
                <input value={f.iss_rev ?? ''} onChange={e => set('iss_rev', e.target.value)}
                  placeholder="5 / 8" className="px-3 py-2 outline-none text-primary-800 focus:bg-blue-50" />
              </div>
            </div>
          </div>

          {/* 1. Applicant's Name — editable by admin */}
          <div className="flex items-baseline gap-2">
            <span className="font-semibold whitespace-nowrap">Applicant's Name:</span>
            <input
              value={f._applicantName || ''}
              onChange={e => set('_applicantName', e.target.value)}
              placeholder="Enter participant name"
              className="flex-1 border-0 border-b-2 border-primary-300 bg-transparent outline-none px-1 py-0.5 text-sm font-bold text-[#0000ff] placeholder:font-normal placeholder:text-primary-300 focus:border-[#0000ff]"
            />
          </div>

          {/* 2. IATA items table — all rows with initials inputs */}
          <div>
            <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider mb-2">Appendix A.1.6 — IATA Items &amp; Instructor Initials</p>
            <div className="rounded-lg border border-primary-200 overflow-hidden text-xs">
              <div className="grid grid-cols-[52px_1fr_100px] bg-primary-50 border-b border-primary-200 font-semibold text-primary-700">
                <div className="px-2 py-2 text-center border-r border-primary-200">IATA Item</div>
                <div className="px-3 py-2 border-r border-primary-200">Description</div>
                <div className="px-2 py-2 text-center">Instructor Initials</div>
              </div>
              {[
                { item: '0',   desc: 'Understanding the basics of dangerous goods',                   key: 'item0'   },
                { item: '0.1', desc: 'Dangerous goods applicability',                                  key: 'item0_1' },
                { item: '0.2', desc: 'Understanding the general limitations',                          key: 'item0_2' },
                { item: '0.3', desc: 'Identifying Roles and Responsibilities',                          key: 'item0_3' },
                { item: '0.4', desc: 'Understanding the importance of classification and packaging',    key: 'item0_4' },
                { item: '0.5', desc: 'Understanding hazard communication',                             key: 'item0_5' },
                { item: '0.6', desc: 'Familiarising with basic emergency response',                    key: 'item0_6' },
                { item: '5',   desc: 'Accepting passenger and crew baggage – (n/a for F/D and FOO)',   key: 'item5'   },
                { item: '6',   desc: 'Transporting cargo/baggage',                                     key: 'item6'   },
                { item: '7',   desc: 'Collecting safety data – (n/a for F/D and FOO)',                 key: 'item7'   },
              ].map(({ item, desc, key }) => (
                <div key={item} className={`grid grid-cols-[52px_1fr_100px] border-b border-primary-100 last:border-0 ${item.includes('.') ? 'bg-primary-50/30' : ''}`}>
                  <div className="px-2 py-1.5 text-center border-r border-primary-100 text-primary-500 font-medium">{item}</div>
                  <div className={`px-3 py-1.5 border-r border-primary-100 text-primary-700 ${item.includes('.') ? 'pl-6 text-primary-500' : 'font-medium'}`}>{desc}</div>
                  <div className="px-2 py-1 flex items-center justify-center">
                    <input
                      value={f.initials[key] ?? ''}
                      onChange={e => setSub('initials', key, e.target.value)}
                      className="w-16 px-2 py-1 text-xs text-center border border-primary-200 rounded outline-none focus:border-[#0000ff]"
                      placeholder="Init."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Declaration — inline sentence format matching PDF */}
          <div>
            <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider mb-2">Declaration</p>
            <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-4 space-y-3 text-sm text-primary-800 leading-relaxed">
              {/* Line 1 */}
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                <span className="font-medium">We,</span>
                <input
                  value={f.ato_name_number}
                  onChange={e => set('ato_name_number', e.target.value)}
                  placeholder="ATO/CCTO name and number"
                  className="flex-1 min-w-[180px] border-0 border-b border-primary-400 bg-transparent outline-none px-1 py-0.5 text-sm placeholder:text-primary-300 focus:border-[#0000ff]"
                />
                <span className="text-xs text-primary-400">(name and number of ATO/CCTO)</span>
              </div>
              {/* Line 2 */}
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                <span className="font-medium">confirm, that</span>
                <span className="font-bold text-primary-800 border-b border-primary-300 px-1 min-w-[120px]">
                  {f._applicantName || <span className="font-normal text-primary-300 italic">student name</span>}
                </span>
                <span className="text-xs text-primary-400">(Participant's first and last name)</span>
              </div>
              {/* Line 3 */}
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                <span className="font-medium">has received</span>
                <select
                  value={f.dg_training_type}
                  onChange={e => set('dg_training_type', e.target.value)}
                  className="border-0 border-b border-primary-400 bg-transparent outline-none px-1 py-0.5 text-sm focus:border-[#0000ff]"
                >
                  <option value="Initial">Initial</option>
                  <option value="Recurrent">Recurrent</option>
                </select>
                <span className="font-medium">DG Training on</span>
                <input
                  type="date"
                  value={toInputDate(f.training_date)}
                  onChange={e => set('training_date', fromInputDate(e.target.value, '.'))}
                  className="border-0 border-b border-primary-400 bg-transparent outline-none px-1 py-0.5 text-sm focus:border-[#0000ff]"
                />
                <span className="text-xs text-primary-400">(date / DD.MM.YYYY)</span>
              </div>
            </div>
          </div>

          {/* 4. Reference lists — static text as in PDF */}
          <div>
            <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider mb-2">Reference Lists (shown in PDF)</p>
            <div className="rounded-lg border border-primary-100 bg-gray-50 p-3 text-xs text-primary-500 space-y-1 leading-relaxed">
              <p className="font-semibold text-primary-600">ICAO reference list:</p>
              <p>ICAO Doc 9284-AN/905 "Technical Instructions for safe transportation of dangerous goods by air"</p>
              <p>ICAO Doc 10147 "Guidance on a Competency-based Approach to DG Training and Assessment"</p>
              <p className="font-semibold text-primary-600 pt-1">Comlux OM (Operations Manual) reference list:</p>
              <p>OM D Chapter 2 "Operations personnel including crew"</p>
              <p>OM A 9 "Dangerous Goods and Weapons"</p>
            </div>
          </div>

          {/* 5. Score table — full 3-column layout matching PDF */}
          <div>
            <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider mb-2">Assessment Scores</p>
            {/* Knowledge score — standalone field above table */}
            <div className="flex items-center gap-3 mb-3 px-1">
              <span className="text-sm font-medium text-primary-700">Knowledge score</span>
              {numInput(f.knowledge_score, v => set('knowledge_score', v))}
              <span className="text-xs text-primary-400">%  (final test result)</span>
            </div>
            <div className="rounded-lg border border-primary-200 overflow-hidden text-xs">
              {/* Header */}
              <div className="grid grid-cols-[110px_1fr_1fr_1fr] bg-primary-50 border-b border-primary-200 font-semibold text-primary-700 text-center text-[11px]">
                <div className="px-2 py-2 border-r border-primary-200">Job Function</div>
                <div className="px-2 py-2 border-r border-primary-200">Knowledge</div>
                <div className="px-2 py-2 border-r border-primary-200">Skills</div>
                <div className="px-2 py-2">Attitude</div>
              </div>
              {/* Description row */}
              <div className="grid grid-cols-[110px_1fr_1fr_1fr] border-b border-primary-100 text-[10px] text-primary-500 leading-relaxed">
                <div className="px-2 py-2 border-r border-primary-100 flex items-center">
                  <select value={f.job_function} onChange={e => set('job_function', e.target.value)}
                    className="w-full border border-primary-200 rounded px-1 py-1 outline-none focus:border-[#0000ff] text-xs text-primary-700">
                    {JOB_FUNCTIONS.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                  </select>
                </div>
                <div className="px-2 py-2 border-r border-primary-100">Final test, multiple choice questions based on result obtained.</div>
                <div className="px-2 py-2 border-r border-primary-100">Intermediate multiple choice questions, interactive tasks and final practical tasks based on sub-scores below.</div>
                <div className="px-2 py-2">Observable behaviours and participation assessed across sub-scores below.</div>
              </div>
              {/* Score inputs row */}
              <div className="grid grid-cols-[110px_1fr_1fr_1fr] border-b border-primary-100">
                <div className="px-2 py-3 border-r border-primary-100 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary-600">Score</span>
                </div>
                {/* Knowledge — score entered above table */}
                <div className="px-3 py-2 border-r border-primary-100 flex items-center justify-center">
                  <span className="text-[10px] text-primary-300 italic">see above</span>
                </div>
                {/* Skills sub-scores */}
                <div className="px-3 py-2 border-r border-primary-100 space-y-1.5">
                  {[['input_response', 'Input response'], ['response_time', 'Response time'], ['number_of_errors', 'No. of errors'], ['repeated_attempts', 'Repeated attempts']].map(([k, lbl]) => (
                    <div key={k} className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-primary-500">{lbl}</span>
                      {numInput(f.skills[k], v => setSub('skills', k, v))}
                    </div>
                  ))}
                </div>
                {/* Attitude sub-scores */}
                <div className="px-3 py-2 space-y-1.5">
                  {[['shows_interest', 'Shows interest'], ['participation', 'Participation'], ['input', 'Input'], ['co_operation', 'Co-operation'], ['asks_relevant_questions', 'Asks rel. questions']].map(([k, lbl]) => (
                    <div key={k} className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-primary-500">{lbl}</span>
                      {numInput(f.attitude[k], v => setSub('attitude', k, v))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 6. Final score formula */}
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-2.5 text-sm text-primary-700 font-medium">
            Final Score = Knowledge 60% + Skills 20% + Attitude 20% =
            <span className="font-bold ml-1 text-[#0000ff]">{scores.final != null ? `${Math.round(scores.final)} %` : '— %'}</span>
          </div>

          {/* 7. Instructor name + signature */}
          <div>
            <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider mb-2">Instructor</p>
            <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-4">
              <div className="flex flex-wrap gap-6">
                <div className="flex items-baseline gap-2 flex-1 min-w-[200px]">
                  <span className="font-medium whitespace-nowrap text-sm">Name of Instructor:</span>
                  <input
                    value={f.instructor_name}
                    onChange={e => set('instructor_name', e.target.value)}
                    className="flex-1 border-0 border-b border-primary-400 bg-transparent outline-none px-1 py-0.5 text-sm focus:border-[#0000ff]"
                  />
                </div>
                <div className="flex items-baseline gap-2 flex-1 min-w-[160px]">
                  <span className="font-medium whitespace-nowrap text-sm">Signature:</span>
                  <input
                    value={f.instructor_signature}
                    onChange={e => set('instructor_signature', e.target.value)}
                    className="flex-1 border-0 border-b border-primary-400 bg-transparent outline-none px-1 py-0.5 text-sm focus:border-[#0000ff]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-primary-200 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-primary-200 text-sm text-primary-600 hover:bg-primary-50">Cancel</button>
          <button onClick={() => onSave(f)} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-60">
            {saving && <Spin cls="w-4 h-4 border-2 border-white/40 border-t-white" />}
            {initial?._id ? 'Save changes' : 'Create form'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Admin airline group — shows all students with per-student form actions
// ─────────────────────────────────────────────────────────────────────────────
function AirlineGroup({ airline, participants, forms, onNew, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);

  const formForStudent = (studentId) =>
    forms.find(f => f.assignments?.some(a => String(a.participant_id) === String(studentId)));

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
        style={{ background: '#eff6ff' }}
      >
        {open
          ? <HiOutlineChevronDown  className="w-5 h-5 text-primary-400 flex-shrink-0" />
          : <HiOutlineChevronRight className="w-5 h-5 text-primary-400 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-primary-800 truncate">{airline.airlineName}</p>
          <p className="text-[11px] text-primary-400">
            {participants.length} student{participants.length !== 1 ? 's' : ''} · {forms.length} form{forms.length !== 1 ? 's' : ''}
          </p>
        </div>
      </button>

      {open && (
        <div className="divide-y divide-primary-100">
          {participants.length === 0 ? (
            <p className="text-sm text-primary-400 text-center py-6 px-4">No students in this airline.</p>
          ) : (
            participants.map(student => {
              const form = formForStudent(student._id);
              return (
                <div key={String(student._id)} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary-800 truncate">{student.participant_name}</p>
                    <p className="text-[11px] text-primary-400">{student.training_type}</p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {form ? (
                      <>
                        <button
                          onClick={() => onEdit(form, student)}
                          title="Edit form"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs text-primary-600 hover:bg-primary-50"
                        >
                          <HiOutlinePencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => generateDgrPdf({ form, applicantName: student.participant_name, mode: 'preview' })}
                          title="View PDF"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-[#0000ff] text-xs hover:bg-blue-100"
                        >
                          <HiOutlineEye className="w-3.5 h-3.5" /> View PDF
                        </button>
                        <button
                          onClick={() => generateDgrPdf({ form, applicantName: student.participant_name, mode: 'download' })}
                          title="Download PDF"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100"
                        >
                          <HiOutlineDocumentDownload className="w-3.5 h-3.5" /> Download
                        </button>
                        <button
                          onClick={() => onDelete(form)}
                          title="Delete form"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onNew(airline, student)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0000ff] text-white text-xs font-semibold hover:bg-blue-700"
                      >
                        <HiOutlinePlusCircle className="w-4 h-4" /> New DGR Form
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Airline view — read-only list of assigned forms
// ─────────────────────────────────────────────────────────────────────────────
function AirlineFormCard({ form }) {
  const assignments = form.assignments || [];
  const s = computeDgrScores(form);
  return (
    <div className="rounded-xl border border-primary-100 p-4 bg-white space-y-3">
      <div>
        <p className="text-sm font-semibold text-primary-800">
          DG Training — {form.dg_training_type}{form.training_date ? ` · ${form.training_date}` : ''}
        </p>
        <p className="text-[11px] text-primary-400 mt-0.5">
          {s.final != null ? `Final score ${Math.round(s.final)}%` : 'Scores not set'}
          {form.instructor_name ? ` · Instructor: ${form.instructor_name}` : ''}
        </p>
      </div>
      {assignments.length > 0 && (
        <div className="space-y-1">
          {assignments.map(a => (
            <div key={String(a.participant_id)} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-primary-50">
              <span className="text-sm text-primary-700 truncate">{a.participant_name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => generateDgrPdf({ form, applicantName: a.participant_name, mode: 'preview' })}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 text-[#0000ff] text-xs hover:bg-blue-100"
                >
                  <HiOutlineEye className="w-3.5 h-3.5" /> Preview
                </button>
                <button
                  onClick={() => generateDgrPdf({ form, applicantName: a.participant_name, mode: 'download' })}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100"
                >
                  <HiOutlineDocumentDownload className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────────────────────
export default function DgrForms() {
  const { isAdmin } = useAuth();
  const [loading, setLoading]   = useState(true);
  const [airlines, setAirlines] = useState([]);
  const [forms, setForms]       = useState([]);
  const [saving, setSaving]     = useState(false);

  // editModal shape: { airline_id?, _id?, _student?, ...formFields }
  const [editModal, setEditModal] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const [a, f] = await Promise.all([getDgrAirlines(), getDgrForms()]);
        setAirlines(a.data || []);
        setForms(f.data || []);
      } else {
        const f = await getDgrForms();
        setForms(f.data || []);
      }
    } catch {
      toast.error('Failed to load DGR forms');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const formsByAirline = useMemo(() => {
    const m = {};
    forms.forEach(f => { (m[String(f.airline_id)] ||= []).push(f); });
    return m;
  }, [forms]);

  const handleSave = async (rawData) => {
    // Extract internal UI state not sent to API
    const { _student, _applicantName, ...data } = rawData;

    // Resolve final name (admin may have edited it)
    const finalName = (_applicantName || '').trim() || _student?.participant_name || '';

    if (!data._id && _student) {
      // New form — assign the student with (possibly edited) name
      data.assignments = [{
        participant_id: _student._id,
        participant_name: finalName,
      }];
    } else if (data._id && data.assignments?.length > 0 && finalName) {
      // Edit — update the name in the first assignment
      data.assignments = data.assignments.map((a, i) =>
        i === 0 ? { ...a, participant_name: finalName } : a
      );
    }

    setSaving(true);
    try {
      let result;
      if (data._id) {
        result = (await updateDgrForm(data._id, data)).data;
        setForms(prev => prev.map(f => f._id === result._id ? result : f));
        toast.success('Form updated');
      } else {
        result = (await createDgrForm(data)).data;
        setForms(prev => [result, ...prev]);
        toast.success('Form created');
      }

      // Auto-open PDF preview for the student
      const applicantName = finalName
        || result.assignments?.[0]?.participant_name
        || '';
      if (applicantName) {
        generateDgrPdf({ form: result, applicantName, mode: 'preview' });
      }

      setEditModal(null);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (form) => {
    if (!window.confirm('Delete this DGR form?')) return;
    try {
      await deleteDgrForm(form._id);
      setForms(prev => prev.filter(f => f._id !== form._id));
      toast.success('Form deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <HiOutlineShieldExclamation className="w-6 h-6 text-[#0000ff]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary-800">DGR CBTA</h1>
          <p className="text-xs sm:text-sm text-primary-400">
            {isAdmin
              ? 'Create Dangerous Goods training forms for individual students.'
              : 'Dangerous Goods training forms assigned to your students.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-primary-400">
          <Spin /><span className="text-sm">Loading…</span>
        </div>
      ) : isAdmin ? (
        airlines.length === 0
          ? <div className="card p-12 text-center text-sm text-primary-400">No airlines with students yet.</div>
          : (
            <div className="space-y-3">
              {airlines.map(({ airline, participants }) => (
                <AirlineGroup
                  key={airline._id}
                  airline={airline}
                  participants={participants}
                  forms={formsByAirline[String(airline._id)] || []}
                  onNew={(a, student) => setEditModal({ airline_id: a._id, _student: student })}
                  onEdit={(f, student) => setEditModal({ ...f, _student: student })}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )
      ) : (
        forms.length === 0
          ? <div className="card p-12 text-center text-sm text-primary-400">No DGR forms assigned to you yet.</div>
          : <div className="space-y-3">{forms.map(f => <AirlineFormCard key={f._id} form={f} />)}</div>
      )}

      <DgrFormModal
        open={!!editModal}
        initial={editModal}
        saving={saving}
        onClose={() => setEditModal(null)}
        onSave={handleSave}
      />
    </div>
  );
}

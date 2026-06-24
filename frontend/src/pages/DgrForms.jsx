import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  HiOutlineSearch,
  HiOutlineOfficeBuilding,
} from 'react-icons/hi';
import {
  getDgrAirlines, getDgrForms, createDgrForm, updateDgrForm, deleteDgrForm,
} from '../api';
import { generateDgrPdf, computeDgrScores } from '../utils/generateDgrPdf';

const mkInitials = (name = '') =>
  name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

const JOB_FUNCTIONS = [
  { value: 'FC', label: 'F.C. - 7.7' },
  { value: 'FD', label: 'F.D. - 7.8' },
  { value: 'CC', label: 'C.C. - 7.9' },
];

const emptyForm = () => ({
  airline_name: '',
  ato_name_number: 'INTERNATIONAL FLIGHT OPERATIONAL ACADEMY',
  dg_training_type: 'Initial',
  training_date: '',
  show_item5: false,
  show_item7: false,
  initials: {
    item0: 'V.I', item0_1: 'V.I', item0_2: 'V.I', item0_3: 'V.I', item0_4: 'V.I', item0_5: 'V.I', item0_6: 'V.I',
    item5: 'V.I', item6: 'V.I', item7: 'V.I',
  },
  job_function: 'FC',
  knowledge_score: '',
  skills: { input_response: '', response_time: '', number_of_errors: '', repeated_attempts: '' },
  attitude: { shows_interest: '', participation: '', input: '', co_operation: '', asks_relevant_questions: '' },
  instructor_name: 'Vincent Incammicia',
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

  // 1–5 scale rating for Skills and Attitude sub-scores
  const ratingInput = (val, onChange) => (
    <input type="number" min="1" max="5" value={val ?? ''} onChange={e => onChange(e.target.value)}
      className="w-14 px-2 py-1 text-sm border border-primary-200 rounded-lg outline-none focus:border-[#0000ff]" />
  );

  return (
    <>
      <div className="fixed -inset-20 z-50 bg-black/60 backdrop-blur-sm pointer-events-none" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-primary-200">
          <div>
            <p className="text-base font-bold text-primary-800">{initial?._id ? 'Edit' : 'New'} Dangerous Goods Training Form</p>
            {f._applicantName && <p className="text-xs text-primary-400 mt-0.5">Student: {f._applicantName}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
        </div>

        {/* ── Form body: mirrors PDF layout top-to-bottom ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm text-primary-800">

          {/* 0. Airline / Organisation name — shown in PDF header and reference list */}
          <div className="flex items-baseline gap-2">
            <span className="font-semibold whitespace-nowrap text-sm">Airline / Organisation:</span>
            <input
              value={f.airline_name || ''}
              onChange={e => set('airline_name', e.target.value)}
              placeholder="e.g. Comlux Aviation"
              className="flex-1 border-0 border-b-2 border-primary-300 bg-transparent outline-none px-1 py-0.5 text-sm font-bold text-[#0000ff] placeholder:font-normal placeholder:text-primary-300 focus:border-[#0000ff]"
            />
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

          {/* 2. IATA items table */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider">IATA Items &amp; Instructor Initials</p>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={!!f.show_item5} onChange={e => set('show_item5', e.target.checked)} className="rounded" />
                  <span className="text-xs text-primary-500">Include: Accepting passenger and crew baggage (n/a for F/D and FOO)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={!!f.show_item7} onChange={e => set('show_item7', e.target.checked)} className="rounded" />
                  <span className="text-xs text-primary-500">Include: Collecting safety data (n/a for F/D and FOO)</span>
                </label>
              </div>
            </div>
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
                ...(f.show_item5 ? [
                  { item: '5', desc: 'Accepting passenger and crew baggage – (n/a for F/D and FOO)', key: 'item5' },
                ] : []),
                { item: f.show_item5 ? '6' : '5', desc: 'Transporting cargo/baggage', key: 'item6' },
                ...(f.show_item7 ? [
                  { item: f.show_item5 ? '7' : '6', desc: 'Collecting safety data – (n/a for F/D and FOO)', key: 'item7' },
                ] : []),
              ].map(({ item, desc, key }) => (
                <div key={key} className={`grid grid-cols-[52px_1fr_100px] border-b border-primary-100 last:border-0 ${item.includes('.') ? 'bg-primary-50/30' : ''}`}>
                  <div className="px-2 py-2 text-center border-r border-primary-100 text-primary-500 font-medium">{item}</div>
                  <div className={`px-3 py-2 border-r border-primary-100 text-primary-700 ${item.includes('.') ? 'pl-6 text-primary-500' : 'font-medium'}`}>{desc}</div>
                  <div className="px-2 py-1.5 flex items-center justify-center">
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
                <span className="font-medium">Dangerous Goods Training on</span>
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
              <p className="font-semibold text-primary-600 pt-1">{f.airline_name || 'Organisation'} OM (Operations Manual) reference list:</p>
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
                {/* Skills sub-scores — rated 1–5 */}
                <div className="px-3 py-2 border-r border-primary-100 space-y-1.5">
                  {[
                    ['input_response',    'Input response',    '5: Accurate, complete, no correction\n4: Minor omissions only\n3: Noticeable errors or gaps\n2: Limited understanding\n1: Incorrect or cannot complete'],
                    ['response_time',     'Response time',     '5: Well within expected time\n4: Within expected time\n3: Slightly slower than expected\n2: Frequently exceeds expected time\n1: Unable to complete in time'],
                    ['number_of_errors',  'No. of errors',     '5: No errors\n4: 1–2 minor errors\n3: Several minor or 1 significant error\n2: Multiple significant errors\n1: Excessive errors'],
                    ['repeated_attempts', 'Repeated attempts', '5: Completes on first attempt\n4: Requires 1 extra attempt\n3: Requires 2 extra attempts\n2: Requires several attempts + guidance\n1: Unable to complete'],
                  ].map(([k, lbl, tip]) => (
                    <div key={k} className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-primary-500 cursor-help" title={tip}>{lbl}</span>
                      {ratingInput(f.skills[k], v => setSub('skills', k, v))}
                    </div>
                  ))}
                  {scores.skillsAvg != null && (
                    <div className="pt-2 border-t border-primary-100 text-center">
                      <span className="text-[10px] text-primary-400">avg {scores.skillsAvg.toFixed(2)}/5 = </span>
                      <span className="text-base font-bold text-[#0000ff]">{Math.round(scores.skills)}%</span>
                    </div>
                  )}
                </div>
                {/* Attitude sub-scores — rated 1–5 */}
                <div className="px-3 py-2 space-y-1.5">
                  {[
                    ['shows_interest',         'Shows interest',         '5: Consistently enthusiastic and committed\n4: Frequently shows interest and engagement\n3: Adequate interest when prompted\n2: Limited interest\n1: Disengaged throughout'],
                    ['participation',           'Participation',           '5: Actively participates in all activities\n4: Participates regularly with minimal prompting\n3: Participates occasionally when requested\n2: Rarely participates voluntarily\n1: Does not participate'],
                    ['input',                   'Input',                   '5: Consistently valuable and constructive contributions\n4: Regularly contributes useful ideas\n3: Occasional relevant contributions\n2: Infrequent or limited-value contributions\n1: No meaningful contributions'],
                    ['co_operation',            'Co-operation',            '5: Consistently works effectively with others\n4: Cooperates well with peers and instructors\n3: Generally cooperative with occasional issues\n2: Difficulty working with others\n1: Frequently uncooperative or disruptive'],
                    ['asks_relevant_questions', 'Asks rel. questions',     '5: Frequently asks insightful questions\n4: Regularly asks relevant and constructive questions\n3: Occasionally asks relevant questions\n2: Rarely or irrelevant questions\n1: Does not ask questions or shows disengagement'],
                  ].map(([k, lbl, tip]) => (
                    <div key={k} className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-primary-500 cursor-help" title={tip}>{lbl}</span>
                      {ratingInput(f.attitude[k], v => setSub('attitude', k, v))}
                    </div>
                  ))}
                  {scores.attitudeAvg != null && (
                    <div className="pt-2 border-t border-primary-100 text-center">
                      <span className="text-[10px] text-primary-400">avg {scores.attitudeAvg.toFixed(2)}/5 = </span>
                      <span className="text-base font-bold text-[#0000ff]">{Math.round(scores.attitude)}%</span>
                    </div>
                  )}
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Admin airline group — shows all students with per-student form actions
// ─────────────────────────────────────────────────────────────────────────────
function AirlineGroup({ airline, participants, forms, onNew, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const formForStudent = (studentId) =>
    forms.find(f => f.assignments?.some(a => String(a.participant_id) === String(studentId)));

  const visibleStudents = participants.filter(s =>
    s.participant_name?.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div className={`card overflow-hidden${open ? ' flex flex-col max-h-[480px]' : ''}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left flex-shrink-0"
        style={{ background: open ? '#f9fafb' : '#ffffff' }}
      >
        {open
          ? <HiOutlineChevronDown  className="w-5 h-5 text-primary-400 flex-shrink-0" />
          : <HiOutlineChevronRight className="w-5 h-5 text-primary-400 flex-shrink-0" />}
        {/* Airline logo */}
        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-primary-800 flex items-center justify-center">
          {airline.logo_url
            ? <img src={airline.logo_url} alt={airline.airlineName} className="w-full h-full object-contain p-0.5 bg-white" />
            : <span className="text-white text-[10px] font-bold">{mkInitials(airline.airlineName)}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-primary-800 truncate">{airline.airlineName}</p>
          <p className="text-[11px] text-primary-400">
            {participants.length} student{participants.length !== 1 ? 's' : ''} · {forms.length} form{forms.length !== 1 ? 's' : ''}
          </p>
        </div>
      </button>

      {open && (
        <>
          {/* Search bar — sticky inside expanded card */}
          <div className="flex-shrink-0 px-4 py-2 border-b border-primary-100 bg-white">
            <div className="relative">
              <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary-400" />
              <input
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                placeholder="Search students…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-primary-200 outline-none focus:border-blue-400 bg-primary-50"
              />
            </div>
          </div>
        <div className="divide-y divide-primary-100 overflow-y-auto flex-1">
          {participants.length === 0 ? (
            <p className="text-sm text-primary-400 text-center py-6 px-4">No students in this airline.</p>
          ) : visibleStudents.length === 0 ? (
            <p className="text-sm text-primary-400 text-center py-6 px-4">No students match your search.</p>
          ) : (
            visibleStudents.map(student => {
              const form = formForStudent(student._id);
              return (
                <div key={String(student._id)} className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary-800 truncate">{student.participant_name}</p>
                    <p className="text-[11px] text-primary-400 mt-0.5">{student.training_type}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0 w-full sm:w-auto justify-end">
                    {form ? (
                      <>
                        <button
                          onClick={() => onEdit(form, student)}
                          title="Edit form"
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs text-primary-600 hover:bg-primary-50 transition-colors"
                        >
                          <HiOutlinePencil className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Edit</span>
                        </button>
                        <button
                          onClick={() => generateDgrPdf({ form, applicantName: student.participant_name, mode: 'preview' })}
                          title="View PDF"
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-[#0000ff] text-xs hover:bg-blue-100 transition-colors"
                        >
                          <HiOutlineEye className="w-3.5 h-3.5" /> <span className="hidden sm:inline">View PDF</span>
                        </button>
                        <button
                          onClick={() => generateDgrPdf({ form, applicantName: student.participant_name, mode: 'download' })}
                          title="Download PDF"
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100 transition-colors"
                        >
                          <HiOutlineDocumentDownload className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Download</span>
                        </button>
                        <button
                          onClick={() => onDelete(form)}
                          title="Delete form"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onNew(airline, student)}
                        className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[#0000ff] text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                      >
                        <HiOutlinePlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">New DGR Form</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        </>
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
  const scoreLabel = s.final != null ? `${Math.round(s.final)}%` : '—';

  return (
    <div className="bg-white rounded-xl border border-primary-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-primary-100">
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary-100 text-primary-700 border border-primary-200 flex-shrink-0">
          DGR {form.dg_training_type || 'Training'}
        </span>
        {form.training_date && (
          <span className="text-[11px] text-primary-500 font-medium">{form.training_date}</span>
        )}
        <div className="flex-1" />
        <span className="text-[11px] text-primary-400">
          Score: <span className={`font-semibold ${s.final != null ? 'text-primary-700' : 'text-primary-300'}`}>{scoreLabel}</span>
        </span>
        {form.instructor_name && (
          <span className="hidden sm:block text-[11px] text-primary-400 truncate max-w-[160px]">{form.instructor_name}</span>
        )}
      </div>

      {/* Assignment rows */}
      {assignments.length === 0 ? (
        <p className="text-sm text-primary-400 text-center py-4">No participants assigned.</p>
      ) : (
        <div className="divide-y divide-primary-100">
          {assignments.map(a => (
            <div key={String(a.participant_id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
              <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-primary-600">{mkInitials(a.participant_name)}</span>
              </div>
              <span className="flex-1 text-sm font-medium text-primary-800 truncate min-w-0">{a.participant_name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => generateDgrPdf({ form, applicantName: a.participant_name, mode: 'preview' })}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-[#0000ff] text-xs font-medium hover:bg-blue-100 transition-colors"
                >
                  <HiOutlineEye className="w-3.5 h-3.5" /><span className="hidden sm:inline">Preview</span>
                </button>
                <button
                  onClick={() => generateDgrPdf({ form, applicantName: a.participant_name, mode: 'download' })}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
                >
                  <HiOutlineDocumentDownload className="w-3.5 h-3.5" /><span className="hidden sm:inline">PDF</span>
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
  const [searchParams] = useSearchParams();
  const focusId     = searchParams.get('focus') || null;
  const formCardRefs = useRef({});
  const [loading, setLoading]   = useState(true);
  const [airlines, setAirlines] = useState([]);
  const [forms, setForms]       = useState([]);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterType, setFilterType] = useState('');

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

  useEffect(() => {
    if (!focusId || loading || forms.length === 0) return;
    setTimeout(() => {
      const el = formCardRefs.current[focusId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('notif-highlight');
        el.addEventListener('animationend', () => el.classList.remove('notif-highlight'), { once: true });
      }
    }, 300);
  }, [focusId, loading, forms.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ── Airline view ─────────────────────────────────────────────────────── */
  if (!isAdmin) {
    const filtered = forms.filter(f =>
      (!filterType || f.dg_training_type === filterType) &&
      (!search ||
        f.dg_training_type?.toLowerCase().includes(search.toLowerCase()) ||
        f.assignments?.some(a => a.participant_name?.toLowerCase().includes(search.toLowerCase())))
    );

    return (
      <div className="flex flex-col -m-4 sm:-m-6 h-full overflow-hidden">
        {/* ── Fixed top section: title + search ── */}
        <div className="flex-shrink-0 bg-white border-b border-primary-200 shadow-sm px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary-800 flex items-center justify-center flex-shrink-0">
              <HiOutlineShieldExclamation className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-primary-800">DGR CBTA</h1>
              <p className="text-xs sm:text-sm text-primary-400">Dangerous Goods training forms assigned to your students.</p>
            </div>
            {!loading && (
              <span className="flex-shrink-0 text-xs font-semibold text-primary-500 bg-primary-100 px-3 py-1.5 rounded-lg">
                {forms.length} form{forms.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {!loading && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search forms or student names…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-primary-200 outline-none focus:border-blue-400 bg-white"
                />
              </div>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-primary-200 outline-none focus:border-blue-400 bg-white text-primary-700 min-w-[120px]"
              >
                <option value="">All types</option>
                <option value="Initial">Initial</option>
                <option value="Recurrent">Recurrent</option>
              </select>
            </div>
          )}
        </div>

        {/* ── Scrollable cards ── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-primary-400">
              <Spin /><span className="text-sm">Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-12 text-center text-sm text-primary-400">
              {forms.length === 0 ? 'No DGR forms assigned to you yet.' : 'No forms match your search.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(f => (
                <div key={f._id} ref={el => { formCardRefs.current[f._id] = el; }}>
                  <AirlineFormCard form={f} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Admin view ────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <HiOutlineShieldExclamation className="w-6 h-6 text-[#0000ff]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary-800">DGR CBTA</h1>
          <p className="text-xs sm:text-sm text-primary-400">Create Dangerous Goods training forms for individual students.</p>
        </div>
      </div>

      <div>
        {!loading && (
          <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-white border-b border-primary-200 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search airlines or student names…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-primary-200 outline-none focus:border-blue-400 bg-white"
                />
              </div>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-primary-200 outline-none focus:border-blue-400 bg-white text-primary-700 min-w-[140px]"
              >
                <option value="">All types</option>
                <option value="Initial">Initial</option>
                <option value="Recurrent">Recurrent</option>
              </select>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-primary-400 mt-4">
            <Spin /><span className="text-sm">Loading…</span>
          </div>
        ) : (() => {
          const q = search.toLowerCase();
          const filtered = airlines.filter(({ airline, participants }) => {
            const matchSearch = !search ||
              airline.airlineName?.toLowerCase().includes(q) ||
              participants.some(p => p.participant_name?.toLowerCase().includes(q));
            const airlineForms = formsByAirline[String(airline._id)] || [];
            const matchType = !filterType ||
              airlineForms.some(f => f.dg_training_type === filterType) ||
              participants.some(p => p.training_type === filterType);
            return matchSearch && matchType;
          });
          return filtered.length === 0
            ? <div className="card p-12 text-center text-sm text-primary-400 mt-4">{airlines.length === 0 ? 'No airlines with students yet.' : 'No results match your search.'}</div>
            : (
              <div className="space-y-3 mt-4">
                {filtered.map(({ airline, participants }) => (
                  <AirlineGroup
                    key={airline._id}
                    airline={airline}
                    participants={participants}
                    forms={formsByAirline[String(airline._id)] || []}
                    onNew={(a, student) => setEditModal({ airline_id: a._id, airline_name: a.airlineName, _student: student })}
                    onEdit={(f, student) => setEditModal({ ...f, _student: student })}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            );
        })()}
      </div>

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

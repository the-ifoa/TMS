import { useMemo, useState } from 'react';
import {
  HiOutlineInformationCircle, HiOutlineSearch, HiOutlineX, HiOutlineLightBulb,
  HiOutlineExclamation, HiChevronRight, HiOutlineArrowRight,
  HiOutlineViewGrid, HiOutlineDesktopComputer, HiOutlineShieldCheck, HiOutlineQuestionMarkCircle,
  HiOutlineLightningBolt, HiOutlineAdjustments, HiOutlineTemplate, HiOutlineLockClosed,
  HiOutlineViewList, HiOutlineSave, HiOutlineRefresh, HiOutlineTrash, HiOutlinePencil,
  HiOutlineUserGroup, HiOutlineClock, HiOutlineEye, HiOutlineDocumentDuplicate,
  HiOutlineCollection, HiOutlineDownload, HiOutlineChartBar, HiOutlineMail, HiOutlineUpload,
  HiOutlinePaperAirplane, HiOutlineCheckCircle, HiOutlineFilter, HiOutlinePhotograph,
  HiOutlineArrowLeft, HiOutlineChevronUp, HiOutlineChevronDown, HiOutlineSelector,
  HiOutlineDuplicate, HiOutlineCalendar, HiOutlineBan, HiOutlineLink, HiOutlineAcademicCap,
  HiOutlineClipboardCheck, HiOutlineChatAlt2, HiOutlinePlusCircle, HiOutlineUserAdd,
  HiOutlineHashtag, HiOutlinePencilAlt, HiOutlinePlay, HiOutlineFlag, HiOutlineCursorClick,
  HiOutlineXCircle, HiOutlineArrowsExpand, HiOutlineSwitchHorizontal, HiOutlineCog,
  HiOutlineUsers, HiOutlineKey, HiOutlineBookOpen, HiOutlineCode, HiOutlineShare, HiOutlineStar,
} from 'react-icons/hi';
import { FaPlaneDeparture } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// ─── "How exams work" guide ───────────────────────────────────────────────────
// An (i) button that opens a step-by-step guide to the exam system. Content is
// plain data. `admin: true` / `airline: true` on a topic, block or list item
// hides it from the other role. In strings, `**text**` is bold and `` `text` ``
// is shown as typed input.
//
// Block shapes:
//   { lead: '…' }                          one-line summary at the top of a topic
//   { h: '…' }                             small sub-heading
//   { p: '…' }                             paragraph
//   { steps: ['…', '…'] }                  numbered steps
//   { flow: [{ icon, label, note }] }      left-to-right process with arrows
//   { list: [{ term, desc, icon, chip, n }] }
//        chip = how the term is drawn, matching the real control:
//        outline | blue | green | amber | violet | rose | slate | dark | primary
//        (omit for plain bold text). n = number of a marker in the mock-up above.
//   { mock: 'examCard' | … }               small replica of the real screen
//   { example: { title, lines: ['…'] } }   worked example
//   { tip: '…' } / { warn: '…' }           call-outs

// ─── Chips — a term drawn like the button / badge it describes ────────────────
const CHIP = {
  outline: 'bg-white text-slate-700 border-slate-200',
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
  green:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-800 border-amber-200',
  violet:  'bg-violet-50 text-violet-700 border-violet-200',
  rose:    'bg-rose-50 text-rose-700 border-rose-200',
  slate:   'bg-slate-100 text-slate-700 border-slate-200',
  dark:    'bg-slate-900 text-white border-slate-900',
  primary: 'bg-blue-600 text-white border-blue-600',
};

function Chip({ icon: Icon, label, chip, small }) {
  if (!chip) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
        {Icon && <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        {label}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 border font-bold whitespace-nowrap shadow-2xs ${small ? 'px-1.5 py-0.5 rounded-md text-[10px]' : 'px-2 py-1 rounded-lg text-[11px]'} ${CHIP[chip]}`}>
      {Icon && <Icon className={small ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
      {label}
    </span>
  );
}

// Numbered marker used in mock-ups and the matching legend rows.
function Marker({ n, className = '' }) {
  return (
    <span className={`inline-flex w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold items-center justify-center flex-shrink-0 ring-2 ring-white shadow-sm tabular-nums ${className}`}>{n}</span>
  );
}

// ─── Mock-ups — scaled-down replicas of the real screens ──────────────────────
function MockFrame({ caption, children }) {
  return (
    <figure className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 sm:p-5" aria-hidden="true">
      <div className="pointer-events-none select-none">{children}</div>
      {caption && <figcaption className="mt-3 text-[11px] font-medium text-slate-400 text-center">{caption}</figcaption>}
    </figure>
  );
}

function MockExamCard({ isAdmin }) {
  return (
    <MockFrame caption="An exam card. The numbers match the list below.">
      <div className="max-w-xs mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
            <HiOutlineAcademicCap className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-slate-900 leading-tight">Dangerous Goods Recurrent</p>
            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">25 Questions · 45 Mins <Marker n={2} /></p>
          </div>
          <span className="flex items-center gap-1">
            <Marker n={1} />
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Published</span>
            <HiOutlineTrash className="w-3.5 h-3.5 text-slate-400" />
            <Marker n={5} />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-semibold text-slate-600">
          <div className="flex items-center gap-1 p-1.5 rounded-lg bg-slate-50 border border-slate-200/70"><HiOutlineClock className="w-3 h-3 text-slate-400" />Pass ≥ 75% <Marker n={3} className="ml-auto" /></div>
          <div className="flex items-center gap-1 p-1.5 rounded-lg bg-slate-50 border border-slate-200/70"><HiOutlineUserGroup className="w-3 h-3 text-slate-400" />12 Assigned <Marker n={4} className="ml-auto" /></div>
        </div>
        <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-1.5 text-[10px] font-bold">
          <span className="flex items-center justify-center gap-1 h-6 rounded-lg border border-slate-200 text-slate-700"><HiOutlinePencil className="w-3 h-3" />Edit</span>
          <span className="flex items-center justify-center gap-1 h-6 rounded-lg border border-blue-200 bg-blue-50 text-blue-700"><HiOutlineUserAdd className="w-3 h-3" />Assign</span>
          <span className={`flex items-center justify-center gap-1 h-6 rounded-lg border border-slate-200 text-slate-700 ${isAdmin ? '' : 'col-span-2'}`}><HiOutlineClipboardCheck className="w-3 h-3" />Results</span>
          {isAdmin && <span className="flex items-center justify-center gap-1 h-6 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"><HiOutlineChatAlt2 className="w-3 h-3" />Feedback</span>}
        </div>
      </div>
    </MockFrame>
  );
}

function MockLiveCard() {
  return (
    <MockFrame caption="A Quiz Arena game card. The numbers match the list below.">
      <div className="max-w-xs mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
            <FaPlaneDeparture className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-slate-900 leading-tight">Dispatch Basics</p>
            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">10 Questions · ~5 Mins <Marker n={2} /></p>
          </div>
          <span className="flex items-center gap-1">
            <Marker n={1} />
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Ready</span>
            <HiOutlineTrash className="w-3.5 h-3.5 text-slate-400" />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-semibold text-slate-600">
          <div className="flex items-center gap-1 p-1.5 rounded-lg bg-slate-50 border border-slate-200/70"><HiOutlineUserGroup className="w-3 h-3 text-slate-400" />3 Plays <Marker n={3} className="ml-auto" /></div>
          <div className="flex items-center gap-1 p-1.5 rounded-lg bg-slate-50 border border-slate-200/70"><HiOutlineClock className="w-3 h-3 text-slate-400" />Last 19 Oct <Marker n={4} className="ml-auto" /></div>
        </div>
        <div className="pt-2.5 border-t border-slate-100 grid grid-cols-3 gap-1.5 text-[10px] font-bold">
          <span className="flex items-center justify-center gap-1 h-6 rounded-lg border border-slate-200 text-slate-700"><HiOutlinePencil className="w-3 h-3" />Edit</span>
          <span className="flex items-center justify-center gap-1 h-6 rounded-lg border border-slate-200 text-slate-700"><HiOutlineChartBar className="w-3 h-3" />Results</span>
          <span className="flex items-center justify-center gap-1 h-6 rounded-lg border border-blue-200 bg-blue-50 text-blue-700"><HiOutlinePlay className="w-3 h-3" />Host<Marker n={5} /></span>
        </div>
      </div>
    </MockFrame>
  );
}

function MockLifecycle() {
  return (
    <MockFrame caption="The status badge on the card shows which stage an exam is at.">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Chip chip="amber" label="Draft" small />
        <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">click Publish <HiOutlineArrowRight className="w-3 h-3" /></span>
        <Chip chip="green" label="Published" small />
        <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">click Assign <HiOutlineArrowRight className="w-3 h-3" /></span>
        <Chip chip="blue" icon={HiOutlineMail} label="Links emailed" small />
      </div>
    </MockFrame>
  );
}

function MockParticipantRow() {
  return (
    <MockFrame caption="One person in the Assign window. The numbers match the list below.">
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 min-w-0 flex-1">
          <span className="w-3.5 h-3.5 rounded border border-slate-300 bg-white flex-shrink-0" />
          <span className="w-6 h-6 rounded-full bg-slate-100 text-[9px] font-extrabold text-slate-600 flex items-center justify-center flex-shrink-0">PS</span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold text-slate-800">Priya Sharma</span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500"><HiOutlineMail className="w-3 h-3" />priya@airline.com</span>
          </span>
        </span>
        <span className="flex items-center gap-1 flex-wrap justify-end">
          <Marker n={1} /><Chip chip="green" label="Completed" small />
          <Marker n={2} /><span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700">82%</span>
          <Marker n={3} /><Chip chip="slate" label="Attempts 1/1" small />
          <Marker n={4} /><Chip chip="green" label="Passed · reassign to retake" small />
          <Marker n={5} /><Chip chip="blue" icon={HiOutlineRefresh} label="Reassign" small />
          <Marker n={6} /><span className="p-1 rounded-md border border-slate-200 bg-white text-slate-400"><HiOutlineTrash className="w-3 h-3" /></span>
        </span>
      </div>
    </MockFrame>
  );
}

function MockQuestionHeader({ isAdmin }) {
  return (
    <MockFrame caption="The top of one question in the editor. The numbers match the list below.">
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <Marker n={1} /><span className="w-3.5 h-3.5 rounded border border-slate-300" />
          <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center">1</span>
          <Marker n={2} /><span className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-800">Multiple Choice <HiOutlineSelector className="w-3 h-3 text-slate-400" /></span>
          <Marker n={3} /><span className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-500">POINTS <span className="text-slate-900">2</span></span>
          <Marker n={4} /><span className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-500">TIME (SEC) <span className="text-slate-900">60</span></span>
          <Marker n={5} /><span className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-500">SECTION <span className="text-slate-900">Theory</span></span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] font-bold">
          <Marker n={6} /><span className="flex items-center px-1 py-1 rounded-lg border border-slate-200 text-slate-400"><HiOutlineChevronUp className="w-3 h-3" /><HiOutlineChevronDown className="w-3 h-3" /></span>
          {isAdmin && <><Marker n={7} /><Chip chip="blue" icon={HiOutlineCollection} label="Send to Bank" small /></>}
          <Marker n={8} /><Chip chip="rose" icon={HiOutlineTrash} label="Delete" small />
          <Marker n={9} /><Chip chip="outline" icon={HiOutlineChevronUp} label="Collapse" small />
        </div>
      </div>
    </MockFrame>
  );
}

function MockCandidateStart() {
  return (
    <MockFrame caption="What the candidate sees when they open their link.">
      <div className="max-w-xs mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-4 text-center space-y-2">
        <div className="w-9 h-9 mx-auto rounded-xl bg-slate-900 text-white flex items-center justify-center"><HiOutlineAcademicCap className="w-5 h-5" /></div>
        <p className="text-[13px] font-extrabold text-slate-900">Dangerous Goods Recurrent</p>
        <div className="flex justify-center flex-wrap gap-1.5 text-[10px] font-semibold text-slate-600">
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100">45 min</span>
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100">Pass 75%</span>
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100">2 attempts left</span>
        </div>
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold"><HiOutlinePlay className="w-3.5 h-3.5" />Start Exam</span>
      </div>
    </MockFrame>
  );
}

function MockStudentRow() {
  return (
    <MockFrame caption="One student inside an exam card.">
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">R</span>
          <span>
            <span className="block text-[11px] font-bold text-slate-900">Rahul Menon</span>
            <span className="block text-[10px] text-slate-400">rahul@airline.com</span>
          </span>
        </span>
        <span className="flex items-center gap-2 text-[10px] font-semibold">
          <span className="text-emerald-600 font-bold text-[11px]">88%</span>
          <span className="flex items-center gap-1 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Completed</span>
          <Chip chip="outline" icon={HiOutlineEye} label="View" small />
          <span className="p-1 rounded-md border border-slate-200 text-slate-400"><HiOutlineTrash className="w-3 h-3" /></span>
        </span>
      </div>
    </MockFrame>
  );
}

const MOCKS = {
  liveCard: MockLiveCard,
  examCard: MockExamCard,
  lifecycle: MockLifecycle,
  participantRow: MockParticipantRow,
  questionHeader: MockQuestionHeader,
  candidateStart: MockCandidateStart,
  studentRow: MockStudentRow,
};

// ─── Content ──────────────────────────────────────────────────────────────────
const SYSTEM_TOPICS = [
  {
    id: 'overview',
    title: 'How it works',
    icon: HiOutlineBookOpen,
    blocks: [
      { lead: 'Every exam goes through the same six stages, from creating it to sending certificates.' },
      {
        flow: [
          { icon: HiOutlinePlusCircle, label: 'Create', note: 'Add questions & rules' },
          { icon: HiOutlineSave, label: 'Save', note: 'Saved as a Draft' },
          { icon: HiOutlineCheckCircle, label: 'Publish', note: 'Exam goes live' },
          { icon: HiOutlineUserAdd, label: 'Assign', note: 'Links are emailed' },
          { icon: HiOutlineDesktopComputer, label: 'Take', note: 'Candidates sit it' },
          { icon: HiOutlineClipboardCheck, label: 'Results', note: 'Grade & certify' },
        ],
      },
      {
        steps: [
          '**Create** the exam with **New Exam**, add questions and set the rules (time, pass mark, attempts, security).',
          '**Save** it. A new exam is saved as a **Draft**, which candidates cannot see.',
          '**Publish** it from its card. Only published exams can be assigned.',
          '**Assign** it to participants. Each one gets a personal exam link by email, with no password needed.',
          'Candidates open the link and **take the exam**. Most question types are marked automatically.',
          'Open **Results** to check scores, mark essay and short-answer questions, export reports and send certificates.',
        ],
      },
      {
        example: {
          title: 'A typical recurrent exam',
          lines: [
            'You create "Dangerous Goods Recurrent" with 25 questions, 45 minutes and a 75% pass mark, then save and publish it.',
            'You assign it to 12 crew members with links valid for 7 days. Each of them gets an email straight away.',
            'Ten finish within the week. Nine pass and one fails. You reassign the one who failed, and they pass on their second try.',
            'From **Results** you export a PDF report and email certificates to everyone who passed.',
          ],
        },
      },
      { tip: 'Click the **(i)** button inside the exam editor for a guide to building questions and every exam setting.' },
    ],
  },
  {
    id: 'page',
    title: 'This page',
    icon: HiOutlineViewGrid,
    blocks: [
      { lead: 'Find an exam, check its status and open whatever you need from its card.' },
      { h: 'Tabs' },
      {
        list: [
          { term: 'IFOA Exams', icon: HiOutlineAcademicCap, chip: 'outline', desc: 'Exams created by IFOA. The number shows how many there are.', admin: true },
          { term: 'Exams', icon: HiOutlineAcademicCap, chip: 'outline', desc: 'The exams your airline created.', airline: true },
          { term: 'Question Bank', icon: HiOutlineCollection, chip: 'outline', desc: 'Reusable question libraries you can import into any exam.', admin: true },
          { term: 'Airline Exams', icon: FaPlaneDeparture, chip: 'outline', desc: 'Exams that airlines built themselves. You can see them and their results here, but only the airline can edit them.', admin: true },
          { term: 'New Exam', icon: HiOutlinePlusCircle, chip: 'dark', desc: 'Top right. Opens the editor to build a new exam.' },
        ],
      },
      { h: 'Reading an exam card' },
      { mock: 'examCard' },
      {
        list: [
          { n: 1, term: 'Status badge', desc: '**Draft**: not visible to candidates and can\'t be assigned. **Published**: live and can be assigned. **Archived**: retired.' },
          { n: 2, term: 'Questions · Mins', desc: 'How many questions the exam has and its total time limit.' },
          { n: 3, term: 'Pass ≥ %', desc: 'The score a candidate needs to pass.' },
          { n: 4, term: 'N Assigned', desc: 'Click it to see everyone assigned and how far each person has got. You can also **Reassign** people from this list.' },
          { n: 5, term: 'Bin icon', desc: 'Deletes the exam. It disappears from the list and its links stop working, but **its results are kept** for reports and dashboards. Choose **Deleted** in the status filter to find it and open its Results.' },
        ],
      },
      {
        list: [
          { term: 'Delete permanently', icon: HiOutlineTrash, chip: 'rose', desc: 'The delete window has an option, **unticked by default**: *Also permanently delete all results, candidates and feedback*. Tick it to erase every attempt, score, certificate, invite and feedback response, and the temporary candidates added only for this exam. Permanent participant records are never removed. This cannot be undone.' },
          { term: 'Later', desc: 'Not sure yet? Delete normally and keep the data. When it is no longer needed, choose **Deleted** in the status filter and click the bin icon on that exam to erase its data for good.' },
          { term: 'Lightning icon', icon: HiOutlineLightningBolt, desc: '**Make a live quiz**: creates a Quiz Arena game from this exam\'s multiple-choice, true/false and multiple-response questions, 20 seconds each, and opens it in the quiz editor. The exam is not changed. IFOA exams only.', admin: true },
        ],
      },
      { h: 'Card buttons' },
      {
        list: [
          { term: 'Edit', icon: HiOutlinePencil, chip: 'outline', desc: 'Opens the exam editor to change questions and settings.' },
          { term: 'Publish', icon: HiOutlineCheckCircle, chip: 'green', desc: 'Shown on Draft exams, in place of Assign. Makes the exam live.' },
          { term: 'Assign', icon: HiOutlineUserAdd, chip: 'blue', desc: 'Shown on published exams. Sends the exam link to participants.' },
          { term: 'Results', icon: HiOutlineClipboardCheck, chip: 'outline', desc: 'Every attempt, with scores, grading, analytics, exports and certificates.' },
          { term: 'Feedback', icon: HiOutlineChatAlt2, chip: 'green', desc: 'Sends the Customer Training Feedback form and shows the responses. IFOA exams only.', admin: true },
        ],
      },
      { h: 'Finding an exam' },
      {
        list: [
          { term: 'Search', icon: HiOutlineSearch, desc: 'Matches the title, description or owner of the exam.' },
          { term: 'Status filter', icon: HiOutlineFilter, desc: 'Show only Draft, Published or Archived exams, or **Deleted** exams so you can still open their results.' },
          { term: 'For airline', icon: FaPlaneDeparture, desc: 'On the IFOA Exams tab, shows only the exams run for one airline.', admin: true },
          { term: 'Airline filter', icon: FaPlaneDeparture, desc: 'On the Airline Exams tab, shows only one airline or department.', admin: true },
          { term: 'Created', icon: HiOutlineCalendar, desc: 'Only exams created in the last 7 days, 30 days, 3 months, this year, last year, or between two dates (**Custom dates…**). Each card shows the date it was created after the duration.' },
          { term: 'Sort', desc: '**Newest first** (default), **Oldest first**, **Recently updated**, **Title A–Z / Z–A**, **Most assigned** or **Most questions**.' },
          { term: 'Reset', icon: HiOutlineX, desc: 'Clears every filter and the sort.' },
        ],
      },
      { example: { title: 'Find unfinished drafts', lines: ['Set the status filter to **Draft** and type `recurrent` in the search box. Only draft exams with "recurrent" in their title or description stay on screen. Click **Reset** to see everything again.'] } },
      { tip: 'If you can\'t see a button, your account doesn\'t have that permission. See **Roles & access**.' },
    ],
  },
  {
    id: 'create',
    title: 'Create & publish',
    icon: HiOutlinePlusCircle,
    blocks: [
      { lead: 'Build the exam, save it as a draft, then publish it when it\'s ready.' },
      { mock: 'lifecycle' },
      {
        steps: [
          'Click **New Exam** at the top right.',
          'Under **Exam Settings**, enter a **title**, then set the **duration**, **pass %** and **max attempts**.',
          'Add questions with **Add Question**. You can also bring them in from the **Import** menu: from another exam, the question bank or a JSON file.',
          'Optionally create **sections**, a **scheduling window** and **security** rules.',
          'Click **Preview** to try the exam as a candidate would.',
          'Click **Save Exam**. The exam now appears on this page as a **Draft**.',
          'Click **Publish** on its card. It is now live and ready to assign.',
        ],
      },
      { example: { title: 'Reuse last year\'s exam', lines: ['Click **New Exam**, then **Import → From another exam** and pick last year\'s exam. Its questions are copied in. Edit the ones that changed, give it a new title, then save and publish.'] } },
      { warn: 'You can still edit a published exam. If you change the answer key after people have taken it, you are asked first, and then their results are re-marked automatically.' },
    ],
  },
  {
    id: 'assign',
    title: 'Assign participants',
    icon: HiOutlineUserAdd,
    blocks: [
      { lead: 'Assigning emails each person a private link. They click it and start, with no login needed.' },
      {
        steps: [
          'Click **Assign** on a published exam.',
          'Expand an airline or department group, or search by name, email or airline.',
          'Tick the participants, or click **Select N** on a group to select everyone in it who has an email address. People without an email are greyed out.',
          'Pick the link expiry (the **Link:** box with the clock): no expiry, 1 to 30 days, or **Until a date…**.',
          'Click **Assign (N)**. The links are emailed straight away.',
        ],
      },
      { example: { title: 'Link expiry', lines: ['You assign on **Monday at 10:00** with "Link: **7 days**". The link works until the next Monday at 10:00. After that it shows "This exam link has expired" and the row gets a red **Expired** badge.'] } },
      { h: 'Reading a participant row' },
      { mock: 'participantRow' },
      {
        list: [
          { n: 1, term: 'Status', desc: '**Sent**: emailed, not opened yet. **Opened**: opened, not started. **In Progress**: taking it now. **Completed**: submitted.' },
          { n: 2, term: 'Score', desc: 'The percentage, in green for a pass and red for a fail.' },
          { n: 3, term: 'Attempts', desc: 'Attempts used out of attempts allowed.' },
          { n: 4, term: 'Warning badge', desc: '**Passed · reassign to retake** or **No attempts left**. Either way, assigning again sends nothing, so use Reassign.' },
          { n: 5, term: 'Reassign', desc: 'Lets the person take the exam again, **passed or failed**. It gives one new attempt and emails a fresh link. The old link stops working and earlier results are kept.' },
          { n: 6, term: 'Bin icon', desc: 'Removes the person from the exam. Their link stops working and any result, answers and certificate are deleted.' },
        ],
      },
      { tip: 'If Assign skips anyone because they already passed or have no attempts left, a pop-up offers to reassign them, one at a time or all at once.' },
      { h: 'Adding people who aren\'t in the list' },
      {
        steps: [
          'Click **Add people**. Type a name and email on each row, or click **Paste a list**.',
          'Choose the airline or department.',
          'Choose **Keep permanently** (saved for future exams and certificates) or **Only for this exam**.',
          'Click **Add & select**. They are ticked automatically, so then click **Assign**.',
        ],
      },
      {
        example: {
          title: 'Paste a list',
          lines: [
            'Paste one person per line, in any of these formats:',
            '`John Smith, john@airline.com`',
            '`Jane Doe <jane@airline.com>`',
            '`alex@airline.com` (the name is taken from the email: "Alex")',
          ],
        },
      },
      { tip: 'People added for this exam only get a **This exam only** badge. Click its **Keep** button to make them permanent.' },
      { tip: 'You can reassign from three places: the **Assign** window, the **N Assigned** list on the card, and the candidate rows on the **Results** page.' },
    ],
  },
  {
    id: 'candidate',
    title: 'Candidate experience',
    icon: HiOutlineDesktopComputer,
    blocks: [
      { lead: 'What happens on the candidate\'s side, from the email to their result.' },
      {
        flow: [
          { icon: HiOutlineMail, label: 'Email', note: 'Personal link' },
          { icon: HiOutlinePlay, label: 'Start', note: 'Timer begins' },
          { icon: HiOutlinePencilAlt, label: 'Answer', note: 'Saved as they go' },
          { icon: HiOutlineFlag, label: 'Submit', note: 'Or time runs out' },
          { icon: HiOutlineCheckCircle, label: 'Result', note: 'Pass or fail' },
        ],
      },
      { mock: 'candidateStart' },
      {
        steps: [
          'The candidate gets an email with their personal exam link. No login is needed.',
          'They open the link and see the exam title, instructions, time limit and number of attempts left.',
          'They click **Start Exam**. The timer begins. In lockdown mode the browser also switches to fullscreen. If they come back later, the button says **Resume Exam**.',
          'Answers are saved as they go, so refreshing the page doesn\'t lose them.',
          'They submit, or the exam submits itself when the time runs out or a security limit is reached.',
          'They see their result. If **answer review** is turned on, they also see the correct answers and explanations.',
        ],
      },
      { h: 'When a candidate can\'t start' },
      {
        list: [
          { term: 'Link expired', icon: HiOutlineClock, chip: 'rose', desc: 'The link expiry time has passed. Reassign them to send a fresh link.' },
          { term: 'Old link', icon: HiOutlineLink, chip: 'rose', desc: 'After a reassign, only the newest link works.' },
          { term: 'Outside the window', icon: HiOutlineCalendar, chip: 'amber', desc: 'The exam hasn\'t opened yet or has already closed. See the scheduling window in the exam settings.' },
          { term: 'Already passed', icon: HiOutlineCheckCircle, chip: 'green', desc: 'A candidate who has passed can\'t take it again until you **Reassign** them.' },
          { term: 'Awaiting grading', icon: HiOutlineClock, chip: 'amber', desc: 'The previous attempt still has questions waiting to be marked by hand.' },
          { term: 'All attempts used', icon: HiOutlineBan, chip: 'rose', desc: 'Use **Reassign** to give them another attempt.' },
          { term: 'Window closed too often', icon: HiOutlineXCircle, chip: 'rose', desc: 'With "Limit closing the exam window" turned on, closing the window more often than allowed submits the attempt.' },
        ],
      },
      {
        example: {
          title: 'Two attempts, 75% pass mark',
          lines: [
            '1st attempt: **68%**, so failed. The link offers a second attempt.',
            '2nd attempt: **81%**, so passed. The link now says "You have already passed".',
            'Want them to take it again anyway, for example after a rule change? Click **Reassign**.',
          ],
        },
      },
    ],
  },
  {
    id: 'results',
    title: 'Results & grading',
    icon: HiOutlineClipboardCheck,
    blocks: [
      { lead: 'Click Results on a card to see every attempt, grouped by candidate.' },
      {
        list: [
          { term: 'Status tabs', icon: HiOutlineFilter, desc: '**All**, **Pending review** (needs marking by hand), **Graded** and **In progress**.' },
          { term: 'Search', icon: HiOutlineSearch, desc: 'Find a candidate by name.' },
          { term: 'Analytics', icon: HiOutlineChartBar, chip: 'outline', desc: 'Results by session, outcomes, and the questions most often answered wrong.' },
          { term: 'Export', icon: HiOutlineDownload, chip: 'outline', desc: 'Download as Excel, CSV, a PDF report or XML.' },
          { term: 'Reassign', icon: HiOutlineRefresh, chip: 'blue', desc: 'On a candidate row. Lets them take the exam again, even if they passed.' },
          { term: 'Violations', icon: HiOutlineShieldCheck, chip: 'rose', desc: 'Shows when a candidate left fullscreen, switched tabs or closed the window.' },
          { term: 'Live', icon: HiOutlineEye, chip: 'outline', desc: 'Opens the **live monitor**: who is taking the exam right now. A green pulsing dot and a number mean people are taking it now.' },
        ],
      },
      { h: 'Live monitor' },
      { p: 'Watch an exam while it runs, for example during a classroom or remote session. It updates every 5 seconds.' },
      {
        list: [
          { term: 'Progress', desc: 'Questions answered out of the candidate\'s total, and the question they are on now.' },
          { term: 'Tabs & search', desc: '**In progress** shows who is taking it now, **Finished** who submitted in the last 2 hours. Search filters both by name.' },
          { term: 'Connection', desc: 'When the candidate\'s exam page last checked in (it does every few seconds). **Active**: within 30 seconds. **Quiet**: within 2 minutes. **Disconnected**: longer, e.g. the window is closed or the device is offline. The attempt stays open and is submitted automatically when its time runs out.' },
          { term: 'Time left', desc: 'Counts down live and turns red in the last 2 minutes. Shows any time you added.' },
          { term: 'Integrity', desc: '**Clean**, or how many violations so far (out of the limit with lockdown) and the last one. Also shows how often the window was reopened.' },
          { term: '⋯ menu', desc: 'On each candidate: **Add time** (+5, +10, +15, +30 or any number of minutes) or **Submit now**.' },
          { term: 'Add time for all', icon: HiOutlinePlusCircle, chip: 'outline', desc: 'Top right: extra minutes for everyone taking it now, e.g. after a network problem. Each candidate\'s timer updates within about 10 seconds and they see a message.' },
          { term: 'Submit now', chip: 'rose', desc: 'Submits the attempt with the answers saved so far, and marks it. The candidate\'s screen closes within about 10 seconds with "submitted by the exam administrator". The result shows **Submitted by staff**. Cannot be undone.' },
          { term: 'Finished', desc: 'Who finished in the last 2 hours: when, how long they took, their result, and whether they were auto-submitted (too many violations, window closed, or by staff).' },
        ],
      },
      { tip: 'Adding time and submitting need the assign or author permission. Others can watch only.' },
      { h: 'Grading essays and short answers' },
      {
        steps: [
          'Open the **Pending review** tab.',
          'Open the attempt. Each question that needs marking shows the candidate\'s answer.',
          'Enter points for each question, or click **Max** or **Zero**.',
          'If needed, override the final score directly.',
          'Save. The result is released and pass or fail is worked out from the pass %.',
        ],
      },
      { example: { title: 'Marking an essay', lines: ['An essay question is worth **10 points**. The answer covers most of what you wanted, so you type `7`. The candidate\'s total goes up by 7 and their pass or fail is worked out again straight away.'] } },
      { h: 'Certificates' },
      {
        list: [
          { term: 'Upload', icon: HiOutlineUpload, chip: 'outline', desc: 'Attach a certificate file (PDF, PNG or JPG) to a candidate who passed.' },
          { term: 'Bulk upload', icon: HiOutlineUpload, chip: 'outline', desc: 'Choose many files at once. Each file is matched to the candidate whose name is in its file name.' },
          { term: 'Email pending', icon: HiOutlineMail, chip: 'dark', desc: 'Emails every certificate not yet sent, or only the selected ones.' },
        ],
      },
      { example: { title: 'Bulk upload file names', lines: ['`john-smith.pdf` is matched to John Smith and `Priya Sharma cert.png` to Priya Sharma. Check the matches on screen before uploading.'] } },
      { h: 'Deleting results' },
      { p: 'Delete one result with its bin icon, or tick several and delete them together. The candidate\'s link works again, so they can retake the exam.' },
      { warn: 'Deleting a result also deletes the answers and any uploaded certificate. This cannot be undone.' },
    ],
  },
  {
    id: 'feedback',
    title: 'Training feedback',
    icon: HiOutlineChatAlt2,
    admin: true,
    blocks: [
      { lead: 'Collect Customer Training Feedback from the people who took an IFOA exam.' },
      {
        steps: [
          'Click **Feedback** on the exam card.',
          'On the **Send form** tab, choose participants and send the form by email.',
          'Track replies on the **Responses** tab and open any response to read it.',
          'If needed, **Resend** the form, or delete a response. You can also delete it and send a new form in one step.',
          'Download every response as a **PDF** report.',
        ],
      },
      { h: 'Deleting responses' },
      {
        list: [
          { term: 'One response', icon: HiOutlineTrash, desc: 'In **Responses → Participants**, click the bin icon on the row, or open the response and click **Delete response**.' },
          { term: 'Several at once', icon: HiOutlineCheckCircle, desc: 'Tick the rows (or **Select all**) and click **Delete (n)**.' },
          { term: 'From the dashboard', icon: HiOutlineChartBar, desc: 'On the Feedback dashboard, click any comment to open that response. It opens in its exam\'s Feedback window, or, for imported feedback and deleted exams, in a window with its own **Delete response** button.' },
        ],
      },
      { warn: 'A deleted response is removed from every chart and total and its link stops working. You can send the form to that person again.' },
      { example: { title: 'After a classroom course', lines: ['Once the exam is done, send the form to all 12 participants. Eight reply within two days. Resend it to the other four, then download the PDF for the course file.'] } },
    ],
  },
  {
    id: 'bank',
    title: 'Question bank',
    icon: HiOutlineCollection,
    admin: true,
    blocks: [
      { lead: 'Write a question once and use it in as many exams as you like.' },
      {
        steps: [
          'Open the **Question Bank** tab and click **New Bank**.',
          'Add questions, tagged with topic, difficulty and type (knowledge, skill, initial or recurrent).',
          'In the exam editor, click **Import → From question bank**, choose a bank, filter it, tick questions and import them.',
          'To save a question from an exam back into a bank, click **Send to Bank** on that question.',
        ],
      },
      { example: { title: 'Build a recurrent exam quickly', lines: ['In **Import → From question bank**, choose "DG Questions", filter to **Recurrent** and **medium** difficulty, tick 20 questions and import them. They are copied into the exam, ready to edit.'] } },
      { tip: 'Importing copies the question. Later edits to the bank don\'t change exams that already use it.' },
    ],
  },
  {
    id: 'roles',
    title: 'Roles & access',
    icon: HiOutlineShieldCheck,
    blocks: [
      { lead: 'Each button only appears if your account has the permission for it.' },
      {
        list: [
          { term: 'exams.author', icon: HiOutlinePencil, chip: 'slate', desc: 'Create, edit, publish and delete exams, and delete results.' },
          { term: 'exams.assign', icon: HiOutlineUserAdd, chip: 'slate', desc: 'Assign, reassign and remove participants.' },
          { term: 'exams.grade', icon: HiOutlineClipboardCheck, chip: 'slate', desc: 'Mark answers and manage certificates.' },
        ],
      },
      { p: 'IFOA admins manage IFOA exams. Airline-created exams appear under **Airline Exams**, where admins can view them and their results but not edit them.', admin: true },
      { p: 'You can only manage exams your airline created. Exams that IFOA sends to your students appear on the **Exam Results** page instead.', airline: true },
      { p: 'A department can only edit exams it created itself. It can also assign its parent airline\'s exams to its own team.', airline: true },
      { example: { title: 'A grader-only account', lines: ['A user with only **exams.grade** sees **Results** on each card but not Edit, Publish or Assign. They can mark essays and send certificates, but can\'t change the exam.'] } },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ',
    icon: HiOutlineQuestionMarkCircle,
    blocks: [
      {
        list: [
          { term: 'Why is Assign missing?', desc: 'The exam is still a Draft (publish it first), or your account doesn\'t have the exams.assign permission.' },
          { term: 'A candidate didn\'t get the email', desc: 'Check their email address in the participant list, then click **Reassign** to send a fresh link.' },
          { term: 'Can someone who passed take it again?', desc: 'Yes. **Reassign** them. They get a fresh link and a new attempt, and their earlier pass stays in the results.' },
          { term: 'Can I change an exam after people took it?', desc: 'Yes. If you change the answer key, you are shown which results will be re-marked before you save.' },
          { term: 'A candidate\'s computer crashed', desc: 'Their answers are saved as they go. They reopen the same link and carry on while there is time left. If "Limit closing the exam window" is on, the return counts towards that limit.' },
        ],
      },
    ],
  },
];

const BUILDER_TOPICS = [
  {
    id: 'quick',
    title: 'Quick start',
    icon: HiOutlineLightningBolt,
    blocks: [
      { lead: 'Settings go on the right, questions on the left. Save when you\'re done.' },
      {
        flow: [
          { icon: HiOutlineCog, label: 'Settings', note: 'Title, time, pass %' },
          { icon: HiOutlinePlusCircle, label: 'Questions', note: 'Add or import' },
          { icon: HiOutlineEye, label: 'Preview', note: 'Try it yourself' },
          { icon: HiOutlineSave, label: 'Save', note: 'Saved as a Draft' },
          { icon: HiOutlineCheckCircle, label: 'Publish', note: 'From the exam list' },
        ],
      },
      {
        steps: [
          'Fill in **Exam Settings** on the right: title, description, duration, pass % and max attempts.',
          'Optionally add **Sections** such as "Theory" or "Practical", each with its own time limit or weight.',
          'Click **Add Question** (or **Add to <section>**), choose the question type, type the question and mark the correct answer.',
          'Set **Points** for each question. **Time (sec)** is an optional time limit for that question.',
          'Choose the **security** and **candidate experience** options.',
          'Click **Preview** to take the exam as a candidate would. Nothing is saved.',
          'Click **Save Exam**. Then go **Back** and click **Publish** on the exam\'s card.',
        ],
      },
      { warn: 'Saving stops if a question isn\'t finished. Every question needs text. Choice questions need at least two options and a correct answer.' },
    ],
  },
  {
    id: 'toolbar',
    title: 'Top bar',
    icon: HiOutlineAdjustments,
    blocks: [
      { lead: 'The buttons along the top of the editor.' },
      {
        list: [
          { term: 'Back', icon: HiOutlineArrowLeft, chip: 'outline', desc: 'Returns to the exam list. Save first, because unsaved changes are lost.' },
          { term: 'Theory (12)', chip: 'primary', desc: 'Section pills. Show only one section\'s questions. The count is in brackets.' },
          { term: 'Import → From question bank', icon: HiOutlineCollection, chip: 'outline', desc: 'Copy questions from a question bank, with filters for topic, difficulty and type.', admin: true },
          { term: 'Import → From another exam', icon: HiOutlineDocumentDuplicate, chip: 'outline', desc: 'Copy questions from another exam you can access.' },
          { term: 'Import → From a JSON file', icon: HiOutlineCode, chip: 'outline', desc: 'Add many questions at once from a JSON file. Download the template (it has an example of every question type), fill it in, then upload or paste it. Each question is checked before import. Images are added in the editor afterwards.' },
          { term: 'Preview', icon: HiOutlineEye, chip: 'outline', desc: 'Try the exam exactly as a candidate sees it. No result is saved.' },
          { term: 'Save Exam', icon: HiOutlineSave, chip: 'primary', desc: 'Saves everything. A new exam is saved as a Draft.' },
        ],
      },
    ],
  },
  {
    id: 'questions',
    title: 'Editing questions',
    icon: HiOutlinePencilAlt,
    blocks: [
      { lead: 'Every question has a row of controls at the top and the text and answers below.' },
      { mock: 'questionHeader' },
      {
        list: [
          { n: 1, term: 'Checkbox', desc: 'Selects the question for bulk actions.' },
          { n: 2, term: 'Type', desc: 'Changes the question type. The text, points and section are kept.' },
          { n: 3, term: 'Points', desc: 'How much the question is worth.' },
          { n: 4, term: 'Time (sec)', desc: 'Optional time limit for this question. Leave it blank for no limit.' },
          { n: 5, term: 'Section', desc: 'Which section the question belongs to.' },
          { n: 6, term: 'Arrows', desc: 'Move the question up or down.' },
          { n: 7, term: 'Send to Bank', desc: 'Saves a copy of the question to a question bank.', admin: true },
          { n: 8, term: 'Delete', desc: 'Removes the question.' },
          { n: 9, term: 'Collapse', desc: 'Hides the question body. **Collapse all** in the top bar does this for every question.' },
        ],
      },
      { h: 'Question body' },
      {
        list: [
          { term: 'Question', icon: HiOutlinePencilAlt, desc: 'The text the candidate sees.' },
          { term: 'Add question image', icon: HiOutlinePhotograph, chip: 'outline', desc: 'Attach a picture or diagram to the question.' },
          { term: 'Add Option', icon: HiOutlinePlusCircle, chip: 'blue', desc: 'Adds another answer option. Click the circle next to an option to mark it correct, and use **Image** to add a picture to an option.' },
          { term: 'Explanation', icon: HiOutlineLightBulb, desc: 'Optional. Shown after marking if answer review or instant feedback is on.' },
        ],
      },
      { h: 'Bulk actions' },
      { p: 'Tick several questions, or use **Select all** in the top bar. A blue panel appears on the right:' },
      {
        list: [
          { term: 'Move to section', icon: HiOutlineSwitchHorizontal, desc: 'Move all selected questions into one section.' },
          { term: 'Batch Set Points', icon: HiOutlineHashtag, desc: 'Give every selected question the same points.' },
          { term: 'Duplicate', icon: HiOutlineDuplicate, chip: 'outline', desc: 'Make copies of the selected questions.' },
          { term: 'Delete', icon: HiOutlineTrash, chip: 'rose', desc: 'Remove all selected questions.' },
        ],
      },
      { example: { title: 'Make every Theory question worth 2 points', lines: ['Click the **Theory** pill, then **Select all**. In the blue panel, type `2` under Batch Set Points and click **Set**.'] } },
    ],
  },
  {
    id: 'types',
    title: 'Question types',
    icon: HiOutlineTemplate,
    blocks: [
      { lead: 'Choose a type from the drop-down on each question. The colour shows how it is marked.' },
      {
        list: [
          { term: 'Auto', chip: 'green', desc: 'Marked instantly when the candidate submits.' },
          { term: 'Manual', chip: 'amber', desc: 'Goes to **Pending review** until someone marks it.' },
          { term: 'Unscored', chip: 'slate', desc: 'Collects opinions only and doesn\'t affect the score.' },
        ],
      },
      { h: 'All types, with examples' },
      {
        list: [
          { term: 'Multiple Choice', chip: 'green', desc: 'One correct option. Example: "Which class covers flammable liquids?" The answer is Class 3.' },
          { term: 'Multiple Response', chip: 'green', desc: 'More than one option can be correct. Example: "Tick every item forbidden in the cabin."' },
          { term: 'True/False', chip: 'green', desc: 'Example: "Spare lithium batteries may go in checked baggage." True or False?' },
          { term: 'Numeric', chip: 'green', desc: 'A number answer, with an optional tolerance. Example: answer 1013 with tolerance 2, so anything from 1011 to 1015 is correct.' },
          { term: 'Sequence', chip: 'green', desc: 'Put the items in the right order. Example: the steps of a pre-flight check.' },
          { term: 'Matching', chip: 'green', desc: 'Match each item on the left with one on the right. Example: hazard labels to their classes.' },
          { term: 'Fill in the Blanks', chip: 'green', desc: 'Type the missing words. Example: "The maximum crosswind is ___ knots."' },
          { term: 'Select from Lists', chip: 'green', desc: 'Pick the right word from a drop-down in each gap.' },
          { term: 'Drag the Words', chip: 'green', desc: 'Drag words into the gaps in a sentence.' },
          { term: 'Hotspot', chip: 'green', desc: 'Click the correct area of an image. Example: "Click the fire extinguisher."' },
          { term: 'Drag and Drop', chip: 'green', desc: 'Drag items onto the correct targets on an image.' },
          { term: 'Short Answer', chip: 'amber', desc: 'A short typed answer, marked by hand.' },
          { term: 'Essay', chip: 'amber', desc: 'A long written answer, marked by hand, with an optional minimum word count.' },
          { term: 'Likert Scale', chip: 'slate', desc: 'Rate statements, for example from "Strongly disagree" to "Strongly agree".' },
        ],
      },
      { tip: 'Changing the type keeps the question text, points and section. Answer options carry over between Multiple Choice, Multiple Response and Select from Lists.' },
    ],
  },
  {
    id: 'settings',
    title: 'Exam settings',
    icon: HiOutlineCog,
    blocks: [
      { lead: 'The basic rules of the exam, at the top of the right-hand panel.' },
      {
        list: [
          { term: 'Exam Title', icon: HiOutlinePencil, desc: 'Required. Shown to candidates, in emails and on reports.' },
          { term: 'For airline', icon: HiOutlineUsers, desc: 'Required for IFOA exams: which airline this exam is being run for. The exam card shows it, the Assign window opens on that airline\'s participants first, and every feedback form submitted for the exam counts towards this airline on the Feedback dashboard.', admin: true },
          { term: 'Description', icon: HiOutlineBookOpen, desc: 'Instructions shown to candidates before they start.' },
          { term: 'Duration (min)', icon: HiOutlineClock, desc: 'The total time allowed. The exam submits itself when it runs out.' },
          { term: 'Pass %', icon: HiOutlineCheckCircle, desc: 'The percentage needed to pass.' },
          { term: 'Max attempts', icon: HiOutlineRefresh, desc: 'How many times each candidate may take the exam. You can give someone an extra attempt later with **Reassign**.' },
          { term: 'Shuffle', icon: HiOutlineSwitchHorizontal, desc: 'Shows the questions in a different random order for each candidate.' },
          { term: 'Random question draw', icon: HiOutlineCollection, desc: 'Each candidate gets a different random selection of questions, so colleagues from the same airline can\'t share answers. Tick it, then set how many to draw from each section (and from questions without a section), e.g. **10 of 25** Air Law and **5 of 12** Met. The card then shows e.g. **15 of 37 Questions**. Works together with Shuffle. Make sure the questions in a section are worth the same and are equally hard, so every candidate gets a fair paper.' },
        ],
      },
      { example: { title: 'Pass mark', lines: ['20 questions worth 1 point each, with Pass % set to `75`. A candidate needs **15 out of 20** to pass. 14 out of 20 (70%) is a fail.'] } },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    icon: HiOutlineLockClosed,
    blocks: [
      { lead: 'Stop candidates leaving the exam to look things up.' },
      {
        list: [
          { term: 'Lockdown Mode', icon: HiOutlineArrowsExpand, desc: 'The exam must be taken in fullscreen. Leaving fullscreen or switching tabs counts as a **violation**.' },
          { term: 'Max violations', icon: HiOutlineExclamation, desc: 'When a candidate reaches this number of violations, the exam submits itself. Each violation before that shows a warning.' },
          { term: 'Allow switching tabs', icon: HiOutlineSwitchHorizontal, desc: 'Ticked by default when lockdown is on: switching tabs doesn\'t count as a violation, but leaving fullscreen still does. Untick it to count tab switches too.' },
          { term: 'Limit closing the window', icon: HiOutlineXCircle, desc: 'Counts each time a candidate closes the exam and comes back. Refreshing doesn\'t count. Works with or without lockdown.' },
          { term: 'Returns allowed', icon: HiOutlineRefresh, desc: 'How many times they may come back. One more close submits the attempt. 0 means even one close submits it.' },
        ],
      },
      {
        example: {
          title: 'Max violations = 3',
          lines: [
            'The 1st and 2nd time the candidate leaves fullscreen, they see a warning, for example "Warning 1/3: 2 more will auto submit your exam."',
            'The **3rd** time, the exam submits itself with the answers given so far.',
          ],
        },
      },
      { example: { title: 'Returns allowed = 2', lines: ['The candidate can close the window and come back twice. If they close it a third time, the attempt is submitted when they return.'] } },
      { tip: 'Every violation is recorded on the Results page, even if the limit wasn\'t reached.' },
    ],
  },
  {
    id: 'experience',
    title: 'Candidate experience',
    icon: HiOutlineEye,
    blocks: [
      { lead: 'Decide whether candidates see the right answers.' },
      {
        list: [
          { term: 'Instant feedback', icon: HiOutlineLightningBolt, desc: 'The candidate checks each answer during the exam and sees right or wrong, the correct answer, the explanation and a running score. A checked answer is locked.' },
          { term: 'Answer review', icon: HiOutlineBookOpen, desc: 'After submitting, the candidate sees every question with their answer, the correct answer and the explanation.' },
        ],
      },
      {
        example: {
          title: 'Which to choose',
          lines: [
            '**Practice quiz** before a course: turn both on, so candidates learn as they go.',
            '**Final graded exam** you will use again: turn both off, so the answer key stays secret.',
          ],
        },
      },
      { warn: 'Both options show the candidate the answer key.' },
    ],
  },
  {
    id: 'sections',
    title: 'Sections',
    icon: HiOutlineViewList,
    blocks: [
      { lead: 'Group questions into parts, optionally with their own time limit and weight.' },
      {
        steps: [
          'Type a name, such as "Theory", under **Sections** and click **Add**.',
          'Use the pencil icon to rename a section or the bin icon to delete it.',
          'Optionally set **Time (min)** to give the section its own time limit.',
          'Optionally set a **Weight %** on every section to use weighted scoring.',
          'Use **Move all ungrouped questions to…** to put unsectioned questions into a section.',
        ],
      },
      { h: 'How weighting works' },
      { p: 'Weights are relative and don\'t need to add up to 100. Leave every weight blank to score by total points instead.' },
      {
        example: {
          title: 'Weighted vs. flat scoring',
          lines: [
            '**Theory**: 40 points, the candidate scores 32 (80%). **Practical**: 10 points, the candidate scores 5 (50%).',
            '**Flat** (no weights): (32 + 5) ÷ 50 = **74%**.',
            '**Weighted** (Theory 70, Practical 30): 80% × 0.7 + 50% × 0.3 = **71%**. The small Practical section now counts for 30% of the result.',
          ],
        },
      },
    ],
  },
  {
    id: 'schedule',
    title: 'Scheduling window',
    icon: HiOutlineCalendar,
    blocks: [
      { lead: 'Optional dates between which candidates can start the exam.' },
      {
        list: [
          { term: 'Opens At', icon: HiOutlinePlay, desc: 'Candidates can\'t start before this date and time.' },
          { term: 'Closes At', icon: HiOutlineBan, desc: 'Candidates can\'t start after this date and time.' },
        ],
      },
      { p: 'Leave both blank for no restriction.' },
      {
        example: {
          title: 'Closing time',
          lines: [
            'Opens **1 Nov 09:00**, closes **5 Nov 23:59**, duration 60 minutes.',
            'A candidate who starts on 5 Nov at 23:30 can still finish at 00:30. The window only controls **starting** an attempt.',
          ],
        },
      },
      { tip: 'Link expiry, set in the Assign window, applies to each person. The scheduling window applies to everyone. A reassigned candidate can start even after the window closes.' },
    ],
  },
  {
    id: 'saving',
    title: 'Saving & re-marking',
    icon: HiOutlineSave,
    blocks: [
      { lead: 'You can edit an exam at any time. Existing results are updated safely.' },
      {
        list: [
          { term: 'New exam', icon: HiOutlinePlusCircle, desc: 'Saved as a **Draft**. Publish it from the exam list so you can assign it.' },
          { term: 'Checks before saving', icon: HiOutlineCheckCircle, desc: 'Every question needs text. Choice questions need at least two filled-in options and a correct answer.' },
          { term: 'Changing the answer key', icon: HiOutlineKey, desc: 'If people have already taken the exam, you see which results will change before you save. Click **Save & re-mark** to update their scores.' },
          { term: 'Answers marked by hand', icon: HiOutlineUsers, desc: 'If a changed question was marked by hand, it is flagged so you can check it again.' },
        ],
      },
      { example: { title: 'Fixing a wrong answer key', lines: ['Question 7 had B marked as correct, but the right answer is C. You change it and save. You are told that 4 results will change. Click **Save & re-mark** and their scores and pass or fail are updated.'] } },
    ],
  },
];

const AIRLINE_RESULTS_TOPICS = [
  {
    id: 'overview',
    title: 'How it works',
    icon: HiOutlineBookOpen,
    blocks: [
      { lead: 'IFOA emails your students their exam links. You follow their progress and results here.' },
      {
        flow: [
          { icon: HiOutlinePaperAirplane, label: 'IFOA assigns', note: 'Links are emailed' },
          { icon: HiOutlineDesktopComputer, label: 'Student takes', note: 'No login needed' },
          { icon: HiOutlineEye, label: 'You review', note: 'Scores appear here' },
        ],
      },
      {
        steps: [
          'IFOA assigns an exam, and each student receives their own link by email.',
          'The student opens the link and takes the exam.',
          'One card appears for each exam, showing how many students have completed it, for example **8 / 12 Completed**.',
          'Click a card to see each student\'s status, score and result.',
        ],
      },
      { mock: 'studentRow' },
    ],
  },
  {
    id: 'status',
    title: 'Statuses',
    icon: HiOutlineFlag,
    blocks: [
      { lead: 'The status next to each student shows how far they have got.' },
      {
        list: [
          { term: 'Sent', chip: 'slate', desc: 'The link was emailed but hasn\'t been opened yet.' },
          { term: 'Opened', chip: 'amber', desc: 'The student opened the link but hasn\'t started.' },
          { term: 'In progress', chip: 'violet', desc: 'The student is taking the exam now.' },
          { term: 'Completed', chip: 'green', desc: 'Submitted. The score is shown in green for a pass and red for a fail.' },
          { term: 'Awaiting review', chip: 'amber', desc: 'Some answers, such as essays, are waiting to be marked by an examiner.' },
        ],
      },
    ],
  },
  {
    id: 'actions',
    title: 'Actions',
    icon: HiOutlineCursorClick,
    blocks: [
      {
        list: [
          { term: 'Search', icon: HiOutlineSearch, desc: 'Find an exam or a student by name.' },
          { term: 'Sort', icon: HiOutlineFilter, desc: 'Order exams by the date they were sent.' },
          { term: 'View', icon: HiOutlineEye, chip: 'outline', desc: 'Opens a student\'s full result.' },
          { term: 'Delete', icon: HiOutlineTrash, chip: 'rose', desc: 'Deletes a student\'s result. Their link works again so they can retake. This cannot be undone.' },
        ],
      },
      { tip: 'If a student lost their link or it expired, ask IFOA to reassign the exam. A fresh link will be emailed to them.' },
    ],
  },
];

const LIVE_TOPICS = [
  {
    id: 'overview',
    title: 'How it works',
    icon: HiOutlineBookOpen,
    blocks: [
      { lead: 'Quiz Arena is a live quiz played together, like Kahoot. You show the questions on a big screen, and everyone answers on their phone against the clock. Play solo, or split the room into **teams**.' },
      {
        flow: [
          { icon: HiOutlinePlusCircle, label: 'Build', note: 'Questions & timers' },
          { icon: HiOutlinePlay, label: 'Host', note: 'PIN, link & QR' },
          { icon: HiOutlineUsers, label: 'Join', note: 'Players on phones' },
          { icon: HiOutlineClock, label: 'Play', note: 'Answer fast' },
          { icon: HiOutlineChartBar, label: 'Rank', note: 'Leaderboard' },
          { icon: HiOutlineFlag, label: 'Podium', note: 'Winner & results' },
        ],
      },
      {
        steps: [
          'Click **New game**, add your questions, set a timer for each and save.',
          'Click **Host** on the game\'s card. A full-screen lobby opens with a **6-digit PIN**, an invite link and a **QR code**. Put it on the projector.',
          'Players open the link, scan the code, or go to **/play** and type the PIN. They pick a nickname and an avatar. No account is needed.',
          'Optional: under **Teams**, pick 2 to 6 teams for a team game. Players choose their team, or the game spreads them out evenly.',
          'When everyone is in, click **Start game**. Each question shows on the big screen and on every phone at the same moment.',
          'After each question you see the right answer and how the room voted, then the **Leaderboard**.',
          'After the last question the **podium** shows the top three, with full standings for everyone.',
        ],
      },
      {
        example: {
          title: 'Ice-breaker for a recurrent class',
          lines: [
            'You build "Dispatch Basics" with 10 questions of 20 seconds each, then host it at the start of the class.',
            '18 trainees scan the QR code and join in under a minute. The game takes about 6 minutes.',
            'Priya wins with 8 of 10 right, and the final standings show how everyone did.',
          ],
        },
      },
      { tip: 'Nobody needs to log in. Anyone with the PIN or link can join while the game is open, so only share it with your group.' },
    ],
  },
  {
    id: 'page',
    title: 'This page',
    icon: HiOutlineViewGrid,
    blocks: [
      { lead: 'Every game you have built, ready to host again as often as you like.' },
      { h: 'The top panel' },
      {
        list: [
          { term: 'Games', desc: 'How many games you have, and how many questions they hold in total.' },
          { term: 'Times played', desc: 'How many times all your games have been hosted.' },
          { term: 'Last played', desc: 'When any game was last hosted.' },
          { term: 'New game', icon: HiOutlinePlusCircle, chip: 'outline', desc: 'Opens the editor to build a new game.' },
        ],
      },
      { h: 'Reading a game card' },
      { mock: 'liveCard' },
      {
        list: [
          { n: 1, term: 'Ready / Draft', desc: '**Ready** means it has questions and can be hosted. **Draft** means it has no questions yet.' },
          { n: 2, term: 'Questions · Mins', desc: 'How many questions, and roughly how long a game takes, including the reveal and leaderboard after each question.' },
          { n: 3, term: 'N Plays', desc: 'How many times it has been hosted. Click it to open **Past games**.' },
          { n: 4, term: 'Last played', desc: 'When it was last hosted, or **Never played**.' },
          { n: 5, term: 'Host', icon: HiOutlinePlay, chip: 'blue', desc: 'Starts a new game with a fresh PIN and opens the host screen.' },
        ],
      },
      {
        list: [
          { term: 'Edit', icon: HiOutlinePencil, chip: 'outline', desc: 'Change the questions, timers and icon. A game that is already running is not affected.' },
          { term: 'Results', icon: HiOutlineChartBar, chip: 'outline', desc: 'Opens **Past games**: every time this game was hosted, with the winner.' },
          { term: 'Cap icon', icon: HiOutlineAcademicCap, desc: '**Turn into an exam**: creates a draft exam from this game\'s questions and opens it in the exam builder. See **Quiz ↔ exam**.' },
          { term: 'Bin icon', icon: HiOutlineTrash, desc: 'Deletes the game. It cannot be hosted again.' },
        ],
      },
    ],
  },
  {
    id: 'build',
    title: 'Building a game',
    icon: HiOutlinePencilAlt,
    blocks: [
      { lead: 'The editor has three parts: the question list on the left, the question in the middle, and its settings on the right.' },
      {
        steps: [
          'Type the game\'s **title** in the top bar.',
          'Click **Add question** and choose a type.',
          'Type the question, fill in the answers and tick the correct one(s) with the **check** button.',
          'On the right, pick the **Time limit** and **Points**.',
          'Click **Save**. If a question is unfinished, the editor jumps to it and tells you what is missing.',
        ],
      },
      { h: 'Question types' },
      {
        list: [
          { term: 'Quiz', chip: 'blue', desc: '2 to 6 answers, exactly **one** right.' },
          { term: 'True or false', chip: 'blue', desc: 'Two fixed answers. Mark which one is right.' },
          { term: 'Pick all that apply', chip: 'violet', desc: 'Several right answers. A player scores only if they pick **all** the right ones and **none** of the wrong ones.' },
          { term: 'Poll', chip: 'slate', desc: 'No right answer and no points. Shows how the room voted. Good for opinions and warm-ups.' },
        ],
      },
      { h: 'Settings' },
      {
        list: [
          { term: 'Time limit', icon: HiOutlineClock, desc: 'From **5 to 120 seconds** per question. Shorter timers make the game faster and more exciting.' },
          { term: 'Points', desc: '**Standard** (up to 1000), **Double** (up to 2000) for a key question, or **None** for practice.' },
          { term: 'Arrange', icon: HiOutlineSelector, desc: 'Move a question up or down, duplicate it, or delete it.' },
          { term: 'Game tab', icon: HiOutlineCog, desc: 'Title, description and the cover icon shown on the card, the host screen and the players\' phones.' },
          { term: 'Shuffle answers on each phone', icon: HiOutlineSwitchHorizontal, desc: 'In the Game tab under **Gameplay**. Every player sees the answers in a different order, so neighbours can\'t copy by position. The big screen keeps your order, and the answer letters are hidden on phones (they would not match the screen). True/false is never shuffled. A player keeps the same order if they reload.' },
          { term: 'Import', icon: HiOutlineDocumentDuplicate, chip: 'outline', desc: '**From an exam** adds the multiple-choice, true/false and multiple-response questions of an IFOA exam to this game (the **Make a live quiz** icon on an exam card does the same as a brand-new game). **From question bank** lets you pick questions from a bank, filtered by topic, difficulty or search. Other question types are greyed out with the reason. Each imported question gets 20 seconds.' },
        ],
      },
      { tip: 'The number of issues in the top bar shows how many questions still need fixing. When it says **Ready to save**, everything is filled in.' },
    ],
  },
  {
    id: 'host',
    title: 'Hosting a game',
    icon: HiOutlineDesktopComputer,
    blocks: [
      { lead: 'The host screen is made for a projector. You drive the game from it, one step at a time.' },
      { h: 'In the lobby' },
      {
        list: [
          { term: 'PIN & QR code', icon: HiOutlineHashtag, desc: 'Players type the PIN at **/play** or scan the code. Names appear as they join.' },
          { term: 'Copy invite link', icon: HiOutlineLink, chip: 'outline', desc: 'Copies the direct join link, to paste into a chat or a Teams meeting.' },
          { term: 'Share QR', icon: HiOutlineShare, chip: 'outline', desc: 'Makes an image with the game\'s title, QR code, PIN and join address, and opens your device\'s share menu (WhatsApp, Teams, email…). Where sharing isn\'t available, the image downloads instead.' },
          { term: 'Download QR', icon: HiOutlineDownload, chip: 'outline', desc: 'Saves the same image as a PNG, to print or attach.' },
          { term: 'Remove a player', icon: HiOutlineXCircle, desc: 'Click a player\'s name to remove them, for example for a rude nickname.' },
          { term: 'Lock', icon: HiOutlineLockClosed, desc: 'Stops new players joining. Click again to unlock.' },
          { term: 'Teams', icon: HiOutlineUserGroup, desc: '**Solo** or **2 to 6** teams, chosen before you start. See **Team mode**.' },
          { term: 'Full screen', icon: HiOutlineArrowsExpand, desc: 'Hides the browser bars for the projector.' },
          { term: 'Start game', icon: HiOutlinePlay, chip: 'dark', desc: 'Begins the first question. At least one player must have joined.' },
        ],
      },
      { h: 'Each question' },
      {
        flow: [
          { icon: HiOutlineClock, label: 'Get ready', note: '4 seconds' },
          { icon: HiOutlineCursorClick, label: 'Answer', note: 'Timer runs' },
          { icon: HiOutlineCheckCircle, label: 'Reveal', note: 'Right answer' },
          { icon: HiOutlineChartBar, label: 'Leaderboard', note: 'Top 5' },
        ],
      },
      {
        list: [
          { term: 'Answer counter', desc: 'Shows how many players have answered. The question ends by itself as soon as **everyone** has answered, or when the timer runs out.' },
          { term: 'Show answer early', chip: 'outline', desc: 'Ends the question now, without waiting for the timer.' },
          { term: 'Leaderboard', icon: HiOutlineChartBar, chip: 'outline', desc: 'After the reveal, shows the top five and the points each just earned.' },
          { term: 'Next Question', chip: 'dark', desc: 'Moves on. On the leaderboard you can also press **Space** or **Enter**.' },
          { term: 'End game', icon: HiOutlineFlag, desc: 'The flag button finishes the game now and goes to the podium.' },
        ],
      },
      { h: 'Leaving the host screen' },
      {
        p: 'If you click **Exit Game** before the end, you are asked to choose. **End game** finishes it for everyone. **Keep it running** leaves it open, and you can pick it up again from **Past games**.',
      },
      { warn: 'Players can join up to 12 hours after a game is opened, and a game holds at most 500 players.' },
    ],
  },
  {
    id: 'players',
    title: 'On players\' phones',
    icon: HiOutlineUsers,
    blocks: [
      { lead: 'Players need only a phone or laptop with a browser. Nothing to install and no login.' },
      {
        steps: [
          'Open the invite link, scan the QR code, or go to **/play** and type the 6-digit PIN.',
          'Choose an avatar and type a nickname of 2 to 24 characters. Each nickname can be used only once per game.',
          'In a team game where players choose, tap a **team** too. It can be changed in the lobby until the game starts.',
          'In a **Captain answers** game, only the team captain can tap. Everyone else sees the question and helps decide.',
          'Wait in the lobby. Players can send reactions that float up on the big screen.',
          'When a question opens, tap an answer. For **Pick all that apply**, tap every right answer, then **Submit Answer**.',
          'After each question the phone shows whether they were right, the points won, and their current place.',
          'At the end each player sees their final place, score, average speed and best streak.',
        ],
      },
      {
        list: [
          { term: 'One answer per question', desc: 'The first tap counts. It can\'t be changed, even after reloading the page.' },
          { term: 'Shuffled answers', desc: 'If the game shuffles answers, each phone has its own order and no letters. Players read the answer text, not the position on the screen.' },
          { term: 'Joining late', desc: 'A player can join mid-game (unless the lobby is locked) and starts from the current question.' },
          { term: 'Reload or lost signal', desc: 'The phone remembers the player. Reloading, or losing signal for a moment, puts them straight back in.' },
          { term: 'Removed', desc: 'A player removed by the host sees a message and can\'t answer any more.' },
        ],
      },
    ],
  },
  {
    id: 'teams',
    title: 'Team mode',
    icon: HiOutlineUserGroup,
    blocks: [
      { lead: 'Split the room into groups that play against each other. Everyone still answers on their own phone; their points count for their team.' },
      {
        steps: [
          'Click **Host**. In the lobby, under **Teams**, pick **2**, **3**, **4**, **5** or **6** (**Solo** turns teams off).',
          'Choose how players get a team: **Players choose** (they pick on their phone when joining, and can switch while in the lobby) or **Auto-balance** (the game deals everyone out evenly in joining order).',
          'Choose who answers: **Everyone answers** (each player answers on their own phone) or **Captain answers** (see below).',
          'Click a team\'s name to rename it, for example **Dispatch A** and **Dispatch B**. Press Enter to save.',
          'Players appear in their team\'s column. Click the **arrows** next to a name to move that player to the next team, or the name itself to remove them.',
          'Click **Start game**. Anyone who hasn\'t picked a team is put in the smallest one. Teams are fixed from now on.',
        ],
      },
      { h: 'Captain answers' },
      { p: 'Like a crew making a decision: the team talks it over, and one person commits the answer. Closest to real crew resource management.' },
      {
        list: [
          { term: 'Captain', icon: HiOutlineStar, desc: 'The first player to join each team, unless you pick someone else: click the **crown** next to a player in the lobby. Gold crown = captain. If the captain leaves or is removed, the next player who joined takes over.' },
          { term: 'Phones', desc: 'Everyone sees the question and answers so they can discuss, but only the captain can tap. Teammates see who is answering for them.' },
          { term: 'Scoring', desc: 'The captain\'s answer, and its speed, counts for **every** player in the team. The question ends early once every team has answered.' },
          { term: 'Big screen', desc: 'Shows **Teams answered** instead of players, and a **Captains answer** label.' },
        ],
      },
      { h: 'How teams score' },
      {
        list: [
          { term: 'Team score', desc: 'The **average** points of the team\'s players, so a team of 3 can beat a team of 6. Ties go to the higher total.' },
          { term: 'Leaderboard', icon: HiOutlineChartBar, desc: 'After each question the big screen shows the team standings, with the average each team just earned, then the top 3 players.' },
          { term: 'Phones', desc: 'Each player sees their team colour, where their team stands and their own place.' },
          { term: 'Podium', desc: 'The winning team is announced, with the full team standings, the top three players, and a **Team** column in the final standings.' },
        ],
      },
      {
        example: {
          title: 'Two classroom groups',
          lines: [
            'You pick **2** teams with **Players choose** and rename them **Morning** and **Afternoon**.',
            'Morning has 6 players scoring 4,800 in total (**800** average); Afternoon has 4 players scoring 3,600 (**900** average).',
            '**Afternoon wins**: fewer players, but a better average.',
          ],
        },
      },
      { tip: 'Late joiners are placed in a team too: their choice if players choose, otherwise the smallest team.' },
    ],
  },
  {
    id: 'convert',
    title: 'Quiz ↔ exam',
    icon: HiOutlineSwitchHorizontal,
    blocks: [
      { lead: 'Reuse the same questions both ways: play an exam\'s questions as a live quiz, or turn a quiz into a proper exam.' },
      { h: 'Exam → live quiz' },
      {
        steps: [
          'In the Exam System, click the **lightning** icon on an IFOA exam card (**Make a live quiz**).',
          'A new game is created with the exam\'s multiple-choice, true/false and multiple-response questions (2 to 6 answers), 20 seconds each, and opens in the quiz editor.',
          'Adjust timers or points and **Save**. Other question types (written answers, matching, etc.) are left out.',
        ],
      },
      { p: 'To add an exam\'s questions to a game you already have, use **Import → From an exam** in the quiz editor.' },
      { h: 'Live quiz → exam' },
      {
        steps: [
          'On a game card here, click the **cap** icon (**Turn into an exam**).',
          'A **draft** exam is created and opens in the exam builder.',
          'Choose the exam\'s **For airline**, check the duration (about a minute per question) and pass mark, then save and **Publish**.',
        ],
      },
      {
        list: [
          { term: 'Quiz', chip: 'blue', desc: 'Becomes **multiple choice**.' },
          { term: 'True or false', chip: 'blue', desc: 'Stays **true / false**.' },
          { term: 'Pick all that apply', chip: 'violet', desc: 'Becomes **multiple response**.' },
          { term: 'Poll', chip: 'slate', desc: '**Left out**: it has no right answer.' },
          { term: 'Points', desc: 'Standard = 1 mark, Double = 2 marks. Pictures and the **shuffle answers** setting are kept (both ways).' },
        ],
      },
      { tip: 'Converting never changes the original. The quiz and the exam are separate copies from then on.' },
    ],
  },
  {
    id: 'scoring',
    title: 'Scoring',
    icon: HiOutlineLightningBolt,
    blocks: [
      { lead: 'Right and fast wins. Wrong answers and no answer score nothing, but never lose points.' },
      {
        list: [
          { term: 'Speed', desc: 'A right answer is worth **1000** straight away, falling smoothly to **500** at the buzzer.' },
          { term: 'Double points', desc: 'Everything on that question counts **×2**.' },
          { term: 'Streak bonus', desc: '**+100** for each right answer in a row after the first, up to **+500**. A wrong or missed answer resets the streak. Polls don\'t affect it.' },
          { term: 'Ties', desc: 'With equal scores, the player who answered faster overall ranks higher.' },
          { term: 'Teams', icon: HiOutlineUserGroup, desc: 'In team mode a team\'s score is the **average** of its players\' points. See **Team mode**.' },
        ],
      },
      {
        example: {
          title: '20-second question',
          lines: [
            'Anna answers right after **5 s**: 1000 × (1 − 5/20 ÷ 2) = **875 points**.',
            'It was her third right answer in a row, so she gets **+200** streak bonus: **1075** in total.',
            'Ben answers right after **18 s** with no streak: **550 points**. Cara answers wrong: **0**, and her streak resets.',
          ],
        },
      },
    ],
  },
  {
    id: 'results',
    title: 'Results & past games',
    icon: HiOutlineChartBar,
    blocks: [
      { lead: 'Every time a game is hosted it is saved, with every player\'s answers and score.' },
      {
        list: [
          { term: 'Podium', desc: 'The top three, with how many they got right, average time and best streak.' },
          { term: 'Final standings', desc: 'Every player\'s rank, score, correct answers, accuracy, average time and streak, plus their team in a team game.' },
          { term: 'Team standings', icon: HiOutlineUserGroup, desc: 'In a team game, the winning team and every team\'s average score.' },
          { term: 'Play again', icon: HiOutlineRefresh, chip: 'dark', desc: 'Hosts the same game again with a new PIN.' },
        ],
      },
      { h: 'Past games' },
      {
        list: [
          { term: 'Live', chip: 'green', desc: 'Still running. Click it, or **Resume**, to go back to the host screen.' },
          { term: 'Not finished', chip: 'amber', desc: 'The host left before the end and nothing has happened for 30 minutes. You can still resume or delete it.' },
          { term: 'Finished', chip: 'slate', desc: 'Reached the podium. Click it to see the results again.' },
          { term: 'Bin icon', icon: HiOutlineTrash, desc: 'Deletes that game with its players and scores. If it is still live, it ends for everyone.' },
        ],
      },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ',
    icon: HiOutlineQuestionMarkCircle,
    blocks: [
      {
        list: [
          { term: 'A player can\'t join', desc: 'Check the PIN, and that the lobby isn\'t **locked** and the game hasn\'t finished. Or send them the invite link.' },
          { term: '"Nickname is taken"', desc: 'Someone in this game already has that name (capital letters don\'t count). Pick another.' },
          { term: 'The timer is still running', desc: 'Someone hasn\'t answered yet. Wait, or click **Show answer early**.' },
          { term: 'I closed the host tab', desc: 'Open **Results** on the game\'s card and click the **Live** game to resume it.' },
          { term: 'I edited the game mid-play', desc: 'The running game keeps the questions it started with. Your changes apply the next time you host it.' },
          { term: 'Is it the same as an exam?', desc: 'No. Quiz Arena scores are for fun and engagement. They don\'t create exam results or certificates. To assess people formally, use the **cap** icon to turn the quiz into an exam.' },
          { term: 'A teammate can\'t answer', desc: 'In a **Captain answers** game only the captain can. Make someone else captain with the crown in the lobby, or switch to **Everyone answers** before you start.' },
          { term: 'Teams are uneven', desc: 'That\'s fine: teams are ranked on average points per player. Use **Auto-balance** or the arrows in the lobby to even them out.' },
          { term: 'A player can\'t change team', desc: 'Teams are fixed once the game starts, and only **Players choose** lets players switch. You can still move them with the arrows in the lobby.' },
          { term: 'Some exam questions are missing in my quiz', desc: 'Only multiple-choice, true/false and multiple-response questions with 2 to 6 answers can be played live.' },
        ],
      },
    ],
  },
];

const GUIDES = {
  live: { title: 'How Quiz Arena works', topics: LIVE_TOPICS },
  system:  { title: 'How the exam system works', topics: SYSTEM_TOPICS },
  builder: { title: 'Building an exam', topics: BUILDER_TOPICS },
  airlineResults: { title: 'Exam results guide', topics: AIRLINE_RESULTS_TOPICS },
};

// ─── Rendering ────────────────────────────────────────────────────────────────
function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[12px] font-mono text-slate-800">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

function Block({ block, isAdmin }) {
  if (block.lead) {
    return <p className="text-sm leading-relaxed text-slate-700 font-medium"><Rich text={block.lead} /></p>;
  }
  if (block.h) {
    return <h4 className="pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{block.h}</h4>;
  }
  if (block.p) {
    return <p className="text-[13px] leading-relaxed text-slate-600"><Rich text={block.p} /></p>;
  }
  if (block.mock) {
    const Mock = MOCKS[block.mock];
    return Mock ? <Mock isAdmin={isAdmin} /> : null;
  }
  if (block.flow) {
    return (
      <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-start gap-y-3 rounded-2xl bg-slate-50/80 border border-slate-200/70 px-3 py-4">
        {block.flow.map(({ icon: Icon, label, note }, i) => (
          <div key={label} className="flex items-start">
            <div className="w-full sm:w-[5.25rem] text-center">
              <div className="w-10 h-10 mx-auto rounded-xl bg-white border border-blue-100 text-blue-600 flex items-center justify-center shadow-2xs">
                <Icon className="w-5 h-5" />
              </div>
              <p className="mt-1.5 text-xs font-bold text-slate-900">{label}</p>
              <p className="text-[10px] leading-tight text-slate-500">{note}</p>
            </div>
            {i < block.flow.length - 1 && <HiOutlineArrowRight className="hidden sm:block w-4 h-4 mt-3 text-slate-300 flex-shrink-0" />}
          </div>
        ))}
      </div>
    );
  }
  if (block.steps) {
    return (
      <ol className="space-y-2.5">
        {block.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 tabular-nums">{i + 1}</span>
            <span className="text-[13px] leading-relaxed text-slate-600"><Rich text={s} /></span>
          </li>
        ))}
      </ol>
    );
  }
  if (block.list) {
    return (
      <dl className="rounded-xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden bg-white">
        {block.list.map(({ term, desc, icon, chip, n }) => (
          <div key={term} className="px-3.5 py-2.5 sm:grid sm:grid-cols-[11.5rem_1fr] sm:gap-3 sm:items-start">
            <dt className="flex items-center gap-2 min-w-0">
              {n != null && <Marker n={n} />}
              <Chip icon={icon} label={term} chip={chip} />
            </dt>
            <dd className="mt-1.5 sm:mt-0.5 text-[13px] leading-relaxed text-slate-600"><Rich text={desc} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  if (block.example) {
    const { title, lines } = block.example;
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-700">
          Example{title ? ` · ${title}` : ''}
        </p>
        <div className="mt-1.5 space-y-1">
          {lines.map((l, i) => <p key={i} className="text-[13px] leading-relaxed text-slate-700"><Rich text={l} /></p>)}
        </div>
      </div>
    );
  }
  if (block.tip || block.warn) {
    const warn = !!block.warn;
    const Icon = warn ? HiOutlineExclamation : HiOutlineLightBulb;
    return (
      <div className={`flex gap-2.5 rounded-xl border px-3.5 py-2.5 ${warn ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'}`}>
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${warn ? 'text-amber-600' : 'text-blue-600'}`} />
        <p className={`text-[13px] leading-relaxed ${warn ? 'text-amber-900' : 'text-blue-900'}`}><Rich text={block.tip || block.warn} /></p>
      </div>
    );
  }
  return null;
}

// Drop topics, blocks and list rows that aren't for this viewer.
function forViewer(topics, isAdmin) {
  const shown = (x) => !(x.admin && !isAdmin) && !(x.airline && isAdmin);
  return topics.filter(shown).map((t) => ({
    ...t,
    blocks: t.blocks.filter(shown).map((b) => (b.list ? { ...b, list: b.list.filter(shown) } : b)),
  }));
}

const topicText = (t) => [
  t.title,
  ...t.blocks.flatMap((b) => [
    b.lead, b.h, b.p, b.tip, b.warn,
    ...(b.steps || []),
    ...(b.list || []).flatMap((x) => [x.term, x.desc]),
    ...(b.flow || []).flatMap((x) => [x.label, x.note]),
    ...(b.example ? [b.example.title, ...b.example.lines] : []),
  ]),
].filter(Boolean).join(' ').toLowerCase();

// topic: the topic id to open on (defaults to the guide's first topic).
export default function ExamHelpButton({ guide = 'system', topic = null, className = '' }) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { title, topics: allTopics } = GUIDES[guide];
  const topics = useMemo(() => forViewer(allTopics, isAdmin), [allTopics, isAdmin]);
  const [activeId, setActiveId] = useState(topics.some((t) => t.id === topic) ? topic : topics[0]?.id);

  const q = query.trim().toLowerCase();
  const visible = q ? topics.filter((t) => topicText(t).includes(q)) : topics;
  const active = visible.find((t) => t.id === activeId) || visible[0];
  const activeIdx = active ? visible.indexOf(active) : -1;
  const prev = activeIdx > 0 ? visible[activeIdx - 1] : null;
  const next = activeIdx >= 0 ? visible[activeIdx + 1] : null;
  const ActiveIcon = active?.icon || HiOutlineInformationCircle;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How this works"
        className={`h-8 w-8 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 shadow-2xs transition-colors flex-shrink-0 ${className}`}
      >
        <HiOutlineInformationCircle className="w-[18px] h-[18px]" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideClose className="max-w-5xl w-[94vw] h-[88vh] max-h-[800px] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
          {/* Header */}
          <div className="flex-shrink-0 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 flex-shrink-0"><HiOutlineInformationCircle className="w-5 h-5" /></span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 leading-snug">{title}</DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">Step-by-step help with pictures and examples. Pick a topic or search.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close"
              className="-mr-2 -mt-1 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Topic list — a sidebar on desktop, a scrolling row on mobile */}
            <nav className="flex-shrink-0 md:w-60 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/60 flex flex-col min-h-0">
              <div className="p-3 pb-2">
                <div className="relative">
                  <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search help, e.g. reassign"
                    className="w-full h-8 pl-8 pr-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex md:flex-col gap-1 px-3 pb-3 overflow-x-auto md:overflow-y-auto [scrollbar-width:none]">
                {visible.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-slate-400 whitespace-nowrap">No topics match.</p>
                ) : visible.map((t) => {
                  const on = active?.id === t.id;
                  const Icon = t.icon || HiOutlineInformationCircle;
                  return (
                    <button key={t.id} type="button" onClick={() => setActiveId(t.id)}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                        on ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}>
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${on ? 'bg-blue-600 text-white' : 'bg-slate-200/70 text-slate-500'}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="md:truncate">{t.title}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Topic body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-7 py-5">
              {active && (
                <div key={active.id} className="space-y-4 max-w-2xl">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <ActiveIcon className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Topic {activeIdx + 1} of {visible.length}</p>
                      <h3 className="text-base font-bold text-slate-900 leading-tight">{active.title}</h3>
                    </div>
                  </div>
                  {active.blocks.map((b, i) => <Block key={i} block={b} isAdmin={isAdmin} />)}
                  <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                    {prev ? (
                      <button type="button" onClick={() => setActiveId(prev.id)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800">
                        <HiOutlineArrowLeft className="w-3.5 h-3.5" /> {prev.title}
                      </button>
                    ) : <span />}
                    {next && (
                      <button type="button" onClick={() => setActiveId(next.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">
                        Next: {next.title} <HiChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

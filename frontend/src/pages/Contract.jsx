import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineDocumentText,
  HiOutlineMail,
  HiOutlineEye,
  HiOutlinePaperAirplane,
  HiOutlinePhotograph,
  HiOutlineTrash,
  HiOutlineX,
  HiOutlineOfficeBuilding,
  HiOutlineCalendar,
  HiOutlineArrowLeft,
  HiOutlinePencil,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineSearch,
  HiOutlineLightBulb,
  HiOutlinePencilAlt,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import LogoAvatar from '../components/LogoAvatar';
import {
  getContractDefaults,
  getContractDefaultsForAirline,
  getContractAirlines,
  getContractPdf,
  previewContract,
  sendContract,
} from '../api';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const STRUCTURAL = { spacer: true, sigimage: true };

function valueToHtml(v) {
  let html = String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\{\{([\s\S]*?)\}\}/g, '<mark class="hl-mark">$1</mark>');
  return html || '<br>';
}
function htmlToValue(html) {
  return html
    .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '{{$1}}')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div><div>/gi, '\n').replace(/<div>/gi, '\n').replace(/<\/div>/gi, '')
    .replace(/<\/p><p>/gi, '\n').replace(/<p>/gi, '').replace(/<\/p>/gi, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '');
}

function RichEditor({ value, onChange, onFocus, className = '' }) {
  const ref       = useRef(null);
  const focused   = useRef(false);
  const onChangeR = useRef(onChange);
  onChangeR.current = onChange;

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = valueToHtml(value);
  }, []);

  const prevVal = useRef(value);
  useEffect(() => {
    if (!focused.current && prevVal.current !== value && ref.current) {
      ref.current.innerHTML = valueToHtml(value);
    }
    prevVal.current = value;
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);

    // Walk up to find enclosing <mark class="hl-mark">
    const getMark = (node) => {
      let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      while (el && el !== ref.current) {
        if (el.tagName === 'MARK') return el;
        el = el.parentElement;
      }
      return null;
    };

    const mark = getMark(range.commonAncestorContainer);
    if (!mark) return;

    const markText = mark.textContent;
    const willEmpty = range.collapsed
      ? markText.length <= 1
      : range.toString().length >= markText.length;

    if (willEmpty) {
      e.preventDefault();
      mark.textContent = '';
      // Keep cursor inside the empty mark
      try {
        const r = document.createRange();
        r.setStart(mark, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      } catch {}
      ref.current?.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onFocus={() => { focused.current = true; onFocus?.(); }}
      onBlur={() => { focused.current = false; }}
      onKeyDown={handleKeyDown}
      onInput={() => {
        if (!ref.current) return;
        const v = htmlToValue(ref.current.innerHTML);
        prevVal.current = v;
        onChangeR.current(v);
      }}
      className={`input-field min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent-400 whitespace-pre-wrap break-words cursor-text ${className}`}
    />
  );
}

function BlockEditor({ block, onTextChange, onFocus }) {
  const { type, text = '' } = block;

  if (type === 'title' || type === 'heading') {
    return (
      <input type="text" value={text} onFocus={onFocus}
        onChange={e => onTextChange(e.target.value)}
        className={`input-field w-full ${type === 'title' ? 'font-bold text-center text-[15px]' : 'font-bold'}`}
      />
    );
  }

  if (type === 'party') {
    const pipeIdx = text.indexOf('|');
    const label   = pipeIdx >= 0 ? text.slice(0, pipeIdx) : 'BETWEEN';
    const content = pipeIdx >= 0 ? text.slice(pipeIdx + 1) : text;
    return (
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 mt-2 px-2 py-0.5 rounded bg-primary-100 text-xs font-bold text-primary-700 uppercase tracking-wide">
          {label}
        </span>
        <RichEditor value={content} onChange={v => onTextChange(label + '|' + v)}
          onFocus={onFocus} className="flex-1" />
      </div>
    );
  }

  if (type === 'sigrow') {
    const pipeIdx = text.indexOf('|');
    const left  = pipeIdx >= 0 ? text.slice(0, pipeIdx) : text;
    const right = pipeIdx >= 0 ? text.slice(pipeIdx + 1) : '';
    return (
      <div className="grid grid-cols-2 gap-4">
        <input type="text" value={left} onFocus={onFocus} spellCheck={false}
          onChange={e => onTextChange(e.target.value + '|' + right)}
          className="input-field w-full" />
        <RichEditor value={right} onChange={v => onTextChange(left + '|' + v)}
          onFocus={onFocus} />
      </div>
    );
  }

  return <RichEditor value={text} onChange={onTextChange} onFocus={onFocus} />;
}

// ── Dropdown constants ────────────────────────────────────────────────────────
const TRAINING_TYPES_LIST = [
  'FDI – Flight Dispatch Initial',
  'FDR – Flight Dispatch Recurrent',
  'FDA – Flight Dispatch Advanced',
  'FTL – Flight Time Limitations',
  'NDG – Dangerous Goods No-Carry',
  'HF – Human Factors for OCC',
  'GD – Ground Operations',
  'TCD – Training Competencies Development',
];
const CURRENCY_OPTIONS = ['EUROS', 'SWISS FRANCS', 'US DOLLARS'];
const CURRENCY_SHORT   = ['EUR', 'CHF', 'USD'];
const DELIVERY_OPTIONS = ['Synchronous Virtual Training', 'Classroom Onsite', 'Online', 'Hybrid'];

// Extract all {{...}} values from text in order
const extractMarks = (text) => [...text.matchAll(/\{\{([^}]*)\}\}/g)].map(m => m[1]);

// ── Date helpers ──────────────────────────────────────────────────────────────
function dateToInput(str) {
  if (!str) return '';
  try {
    const d = new Date(str.trim().replace(/(\d+)\s+([A-Z]+)\s+(\d+)/i, '$2 $1, $3'));
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
    const d2 = new Date(str.trim());
    if (!isNaN(d2)) return d2.toISOString().slice(0, 10);
  } catch {}
  return '';
}
function inputToGB(val) {  // "14 OCTOBER 2025"
  if (!val) return '';
  const d = new Date(val + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}
function inputToUS(val) {  // "October 14, 2025"
  if (!val) return '';
  const d = new Date(val + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Reusable date picker row ───────────────────────────────────────────────────
function DateRow({ label, value, onChange, formatFn }) {
  const [inputVal, setInputVal] = useState(() => dateToInput(value));
  const upd = (v) => {
    setInputVal(v);
    onChange(formatFn(v) || v);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide w-full sm:w-28 flex-shrink-0">{label}</label>
      <input type="date" value={inputVal} onChange={e => upd(e.target.value)}
        className="input-field text-sm font-semibold text-amber-800 border-amber-300 flex-1 min-w-0" />
      {inputVal && <span className="text-xs px-2 py-1 rounded hl-mark flex-shrink-0">{formatFn(inputVal)}</span>}
    </div>
  );
}

// ── DateMarkEditor — wraps a whole block, replaces its single {{date}} mark ───
function DateMarkEditor({ block, label, onChange, formatFn }) {
  const initDisplay = extractMarks(block.text)[0] || '';
  const upd = (display) => {
    onChange(block.text.replace(/\{\{[^}]*\}\}/, `{{${display}}}`));
  };
  return (
    <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/30">
      <DateRow label={label} value={initDisplay} onChange={upd} formatFn={formatFn} />
    </div>
  );
}

// ── Services bullet structured editor (block id: s3bullet) ───────────────────
function ServicesBulletEditor({ block, onChange }) {
  const vals0 = extractMarks(block.text);
  const [days,     setDays]     = useState(vals0[0] || '2');
  const [type,     setType]     = useState(vals0[1] || TRAINING_TYPES_LIST[0]);
  const [dates,    setDates]    = useState(vals0[2] || '');
  const [datesInput, setDatesInput] = useState(() => dateToInput(vals0[2] || ''));
  const [delivery, setDelivery] = useState(vals0[3] || DELIVERY_OPTIONS[0]);
  const [notes,    setNotes]    = useState(vals0[4] || '—');

  const rebuild = (d, t, dt, dv, n) =>
    onChange(
      `**Duration:** {{${d}}} day(s) — **Training Type:** {{${t}}}\n` +
      `**Dates:** {{${dt}}}\n` +
      `**Delivery:** {{${dv}}}\n` +
      `**Additional Notes:** {{${n}}}`
    );

  const upd = (setter, key, val) => {
    setter(val);
    const s = { days, type, dates, delivery, notes, [key]: val };
    rebuild(s.days, s.type, s.dates, s.delivery, s.notes);
  };

  const updDate = (inputVal) => {
    setDatesInput(inputVal);
    const display = inputToGB(inputVal);
    setDates(display);
    rebuild(days, type, display, delivery, notes);
  };

  return (
    <div className="space-y-2 p-3 rounded-xl border border-amber-200 bg-amber-50/30">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Services Provided</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide">Duration (days)</label>
          <input type="text" value={days} onChange={e => upd(setDays, 'days', e.target.value)}
            className="input-field w-full text-sm mt-0.5" placeholder="e.g. 2" />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide">Training Type</label>
        <Select value={TRAINING_TYPES_LIST.includes(type) ? type : TRAINING_TYPES_LIST[0]} onValueChange={v => upd(setType, 'type', v)}>
          <SelectTrigger className="w-full mt-0.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TRAINING_TYPES_LIST.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide">Training Date</label>
        <div className="flex items-center gap-2 mt-0.5">
          <input type="date" value={datesInput} onChange={e => updDate(e.target.value)}
            className="input-field text-sm font-semibold text-amber-800 border-amber-300 flex-1" />
          {datesInput && <span className="text-xs px-2 py-1 rounded hl-mark flex-shrink-0">{inputToGB(datesInput)}</span>}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide">Delivery Mode</label>
        <Select value={DELIVERY_OPTIONS.includes(delivery) ? delivery : DELIVERY_OPTIONS[0]} onValueChange={v => upd(setDelivery, 'delivery', v)}>
          <SelectTrigger className="w-full mt-0.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DELIVERY_OPTIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide">Additional Notes</label>
        <input type="text" value={notes} onChange={e => upd(setNotes, 'notes', e.target.value)}
          className="input-field w-full text-sm mt-0.5" />
      </div>
    </div>
  );
}

// ── Currency paragraph editor (block id: s4a) ─────────────────────────────────
function CurrencyParaEditor({ block, onChange }) {
  const init = extractMarks(block.text)[0] || 'EUROS';
  const [currency, setCurrency] = useState(CURRENCY_OPTIONS.includes(init) ? init : CURRENCY_OPTIONS[0]);
  const upd = (val) => {
    setCurrency(val);
    onChange(`Except as otherwise provided in this Agreement, all monetary amounts referred to in this Agreement are in {{${val}}}.`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50/30">
      <span className="text-sm text-primary-700 flex-shrink-0">
        …all monetary amounts referred to in this Agreement are in
      </span>
      <Select value={currency} onValueChange={v => upd(v)}>
        <SelectTrigger className="font-semibold text-amber-800 border-amber-300 w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          {CURRENCY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-sm text-primary-700">.</span>
    </div>
  );
}

// ── Fee bullet editor (block ids: s4bullet1, s4bullet2) ───────────────────────
function FeeBulletEditor({ block, onChange, showCurrency = true }) {
  const marks = extractMarks(block.text);
  const labelMatch = block.text.match(/^([^{]+):/);
  const label = labelMatch ? labelMatch[1].trim() : '';
  const [amount,   setAmount]   = useState(marks[0] || '');
  const [currency, setCurrency] = useState(CURRENCY_SHORT.includes(marks[1]) ? marks[1] : 'EUR');

  const upd = (a, c) => onChange(showCurrency ? `${label}: {{${a}}} {{${c}}}` : `${label}: {{${a}}}`);

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-xl border border-amber-200 bg-amber-50/30 flex-wrap">
      <span className="text-sm text-primary-700 flex-shrink-0 font-medium">{label}:</span>
      <input type="text" value={amount} onChange={e => { setAmount(e.target.value); upd(e.target.value, currency); }}
        placeholder={showCurrency ? 'e.g. 2 x 1,100 = 2,200' : 'e.g. 2'} className="input-field text-sm flex-1 min-w-[100px]" />
      {showCurrency && (
        <Select value={currency} onValueChange={v => { setCurrency(v); upd(amount, v); }}>
          <SelectTrigger className="font-semibold text-amber-800 border-amber-300 w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CURRENCY_SHORT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ── Yes/No bullet editor (block ids: s4bullet3, s4bullet4, s4bullet5) ─────────
function YesNoBulletEditor({ block, onChange }) {
  const marks = extractMarks(block.text);
  const label = block.text.replace(/\{\{[^}]*\}\}/g, '').replace(/:\s*$/, '').trim();
  const [val, setVal] = useState(marks[0] === 'Yes' ? 'Yes' : 'No');
  const upd = (v) => { setVal(v); onChange(`${label}: {{${v}}}`); };
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl border border-amber-200 bg-amber-50/30">
      <span className="text-sm text-primary-700 flex-1">{label}</span>
      <div className="flex gap-2">
        {['Yes', 'No'].map(opt => (
          <button key={opt} type="button" onClick={() => upd(opt)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              val === opt ? 'bg-primary-800 text-white border-primary-800' : 'border-primary-200 text-primary-600 hover:bg-primary-100'
            }`}>{opt}</button>
        ))}
      </div>
    </div>
  );
}

// ── Signature row editor (block id: sig_name) — date picker on right ──────────
function SigDateEditor({ block, onChange }) {
  const pipe = block.text.indexOf('|');
  const [left, setLeft] = useState(pipe >= 0 ? block.text.slice(0, pipe) : block.text);
  const rightRaw = pipe >= 0 ? block.text.slice(pipe + 1) : '';
  const prefix  = rightRaw.replace(/\{\{[^}]*\}\}.*/, '').trim(); // "Date:"
  const initDate = extractMarks(rightRaw)[0] || '';
  const [inputVal, setInputVal] = useState(() => dateToInput(initDate));

  const rebuild = (l, v) => onChange(`${l}|${prefix} {{${inputToUS(v) || v}}}`);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <input type="text" value={left} onChange={e => { setLeft(e.target.value); rebuild(e.target.value, inputVal); }}
        className="input-field w-full" />
      <div className="flex items-center gap-2">
        <span className="text-sm text-primary-600 flex-shrink-0">{prefix}</span>
        <input type="date" value={inputVal}
          onChange={e => { setInputVal(e.target.value); rebuild(left, e.target.value); }}
          className="input-field flex-1 text-sm font-semibold text-amber-800 border-amber-300" />
      </div>
    </div>
  );
}

// ── Custom month/year picker ──────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

function MonthPicker({ value, onChange }) {
  // value: "OCTOBER 2024", onChange: (str) => void
  const parse = (v) => {
    const idx = MONTH_FULL.findIndex(m => v?.toUpperCase().includes(m));
    const yearMatch = v?.match(/(\d{4})/);
    return { month: idx >= 0 ? idx : new Date().getMonth(), year: yearMatch ? Number(yearMatch[1]) : new Date().getFullYear() };
  };

  const [open, setOpen]   = useState(false);
  const [year, setYear]   = useState(() => parse(value).year);
  const [month, setMonth] = useState(() => parse(value).month);
  const ref = useRef(null);

  useEffect(() => {
    const { month: m, year: y } = parse(value);
    setMonth(m); setYear(y);
  }, [value]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (m) => {
    setMonth(m);
    setOpen(false);
    onChange(`${MONTH_FULL[m]} ${year}`);
  };

  const changeYear = (delta) => setYear(y => y + delta);

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input-field pl-10 w-full text-left flex items-center gap-2 cursor-pointer"
      >
        <HiOutlineCalendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
        <span className={value ? 'text-primary-800 font-medium' : 'text-primary-400'}>
          {value || 'Select month…'}
        </span>
      </button>

      {/* Popup */}
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-white rounded-2xl shadow-xl border border-primary-200 p-4">
          {/* Year nav */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => changeYear(-1)}
              className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-500 transition-colors">
              <HiOutlineChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-primary-800">{year}</span>
            <button type="button" onClick={() => changeYear(1)}
              className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-500 transition-colors">
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                type="button"
                onClick={() => select(i)}
                className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  i === month && year === parse(value).year
                    ? 'bg-primary-800 text-white'
                    : 'text-primary-600 hover:bg-primary-100'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* This month shortcut */}
          <div className="mt-3 pt-3 border-t border-primary-100 flex justify-between">
            <button type="button" onClick={() => { select(new Date().getMonth()); setYear(new Date().getFullYear()); }}
              className="text-xs font-semibold text-accent-600 hover:text-accent-700">
              This month
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="text-xs font-semibold text-primary-400 hover:text-primary-600">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'sent',     label: 'Sent' },
  { key: 'not_sent', label: 'Not Sent' },
];

// ── Airlines list view ────────────────────────────────────────────────────────
function AirlinesList({ airlines, onCreateContract, onViewContract, loading }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const visible = airlines.filter(a => {
    const matchFilter =
      filter === 'all'     ? true :
      filter === 'sent'    ? a.contractSent :
      !a.contractSent;
    const matchSearch = !q ||
      a.airlineName.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
      {/* ── Fixed Search & Filter Header Bar (No negative margin shifts) ── */}
      <div className="bg-slate-50/95 border-b border-slate-200/80 px-4 py-3 sm:px-6 sm:py-3.5 flex-shrink-0 space-y-3 sm:space-y-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search bar */}
        <div className="relative flex-1 max-w-md">
          <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search airline name or email…"
            className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors">
              <HiOutlineX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter tabs + counter */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <div className="inline-flex items-center gap-1 bg-white border border-slate-200/80 rounded-xl p-1 shadow-2xs">
            {FILTERS.map(f => {
              const count =
                f.key === 'all'     ? airlines.length :
                f.key === 'sent'    ? airlines.filter(a => a.contractSent).length :
                airlines.filter(a => !a.contractSent).length;
              const isActive = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span>{f.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap flex-shrink-0">
            {visible.length} {visible.length === 1 ? 'airline' : 'airlines'}
          </span>
        </div>
      </div>

      {/* ── Scrollable Airlines List Container Card ── */}
      <div className="divide-y divide-slate-100 overflow-y-auto overflow-x-hidden flex-1"
        style={{
          height: 'calc(100vh - 240px)',
          maxHeight: 'calc(100vh - 220px)',
          minHeight: '380px',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            <span className="text-xs font-medium">Loading contracts…</span>
          </div>
        ) : !visible.length ? (
          <div className="py-14 text-center text-slate-400 text-xs sm:text-sm font-medium">
            {airlines.length === 0
              ? 'No airlines found. Add airlines first.'
              : 'No airlines match your search or filter.'}
          </div>
        ) : visible.map(airline => (
          <div key={airline.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-slate-50/80 transition-colors">

            {/* Top row on mobile: icon + info + status badge */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <LogoAvatar logoUrl={airline.logoUrl} name={airline.airlineName} initials={airline.airlineName ? airline.airlineName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'AL'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate leading-tight">{airline.airlineName}</p>
                <p className="text-xs text-slate-500 truncate mt-0.5">{airline.email}</p>
                {/* Mobile-only status inline */}
                <div className="sm:hidden mt-1">
                  {airline.contractSent ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      <HiOutlineCheckCircle className="w-3 h-3 text-emerald-600" />
                      Sent · {airline.contractEmail}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                      <HiOutlineClock className="w-3 h-3 text-slate-400" /> Not sent
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop status column */}
            <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0 w-[185px]">
              {airline.contractSent ? (
                <>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                    <HiOutlineCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[11px] font-bold text-emerald-700">Contract sent</span>
                  </div>
                  {airline.contractEmail && (
                    <span className="text-[10px] font-medium text-slate-400 truncate max-w-[185px]">
                      &rarr; {airline.contractEmail}
                    </span>
                  )}
                  {airline.contractSentAt && (
                    <span className="text-[10px] text-slate-400">
                      {new Date(airline.contractSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200">
                  <HiOutlineClock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] font-semibold text-slate-500">Not sent</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0 sm:pl-0 pl-13">
              {airline.contractSent ? (
                <>
                  <button
                    onClick={() => onViewContract(airline)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs"
                  >
                    <HiOutlineEye className="w-4 h-4 text-slate-500" />
                    <span>View</span>
                  </button>
                  <button
                    onClick={() => onCreateContract(airline)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50/90 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-all shadow-2xs"
                  >
                    <HiOutlineRefresh className="w-4 h-4 text-amber-600" />
                    <span>Resend</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onCreateContract(airline)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-2xs"
                >
                  <HiOutlinePencil className="w-4 h-4" />
                  <span>Create Contract</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Contract editor view ──────────────────────────────────────────────────────
function ContractEditor({ airline, onBack, onSent }) {
  const [blocks, setBlocks]         = useState(null);
  const [headerDate, setHeaderDate] = useState('OCTOBER 2024');
  const [appliedName, setAppliedName] = useState('');
  const [appliedAddr, setAppliedAddr] = useState('');
  const [toEmail, setToEmail]       = useState(airline?.email || '');
  const [message, setMessage]       = useState('');
  const [extraBlocks, setExtraBlocks] = useState([]);
  const [previewUrl, setPreviewUrl]   = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending]       = useState(false);
  const imageInputRef = useRef(null);

  useEffect(() => {
    const loader = airline?.id
      ? getContractDefaultsForAirline(airline.id)
      : getContractDefaults();

    loader
      .then(res => {
        setBlocks(res.data.blocks);
        setAppliedName(res.data.meta?.clientName || '');
        setAppliedAddr(res.data.meta?.clientAddress || '');
        if (res.data.meta?.headerDate) setHeaderDate(res.data.meta.headerDate);
        if (airline?.email) setToEmail(airline.email);
      })
      .catch(() => toast.error('Failed to load contract content'));
  }, [airline?.id]);

  const updateBlock = (id, text) =>
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, text } : b));

  const applyBold = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { toast.error('Select text to highlight first'); return; }
    const range = sel.getRangeAt(0);
    const selected = range.toString();
    if (!selected) { toast.error('Select text to highlight first'); return; }
    const mark = document.createElement('mark');
    mark.className = 'hl-mark';
    mark.textContent = selected;
    range.deleteContents();
    range.insertNode(mark);
    mark.closest('[contenteditable]')?.dispatchEvent(new Event('input', { bubbles: true }));
    sel.removeAllRanges();
  };

  const addTextBlock  = () => setExtraBlocks(prev => [...prev, { type: 'text', content: '' }]);
  const addImageBlock = () => imageInputRef.current?.click();
  const onImageChosen = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error('Image must be under 3 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setExtraBlocks(prev => [...prev, { type: 'image', dataUrl: reader.result, name: file.name }]);
    reader.readAsDataURL(file);
  };
  const updateExtra = (i, content) => setExtraBlocks(prev => prev.map((b, idx) => idx === i ? { ...b, content } : b));
  const removeExtra = (i) => setExtraBlocks(prev => prev.filter((_, idx) => idx !== i));

  const buildPayload = () => ({
    blocks,
    headerDate,
    extraBlocks: extraBlocks.map(b => b.type === 'image'
      ? { type: 'image', dataUrl: b.dataUrl }
      : { type: 'text', content: b.content }),
  });

  const handlePreview = async () => {
    if (!blocks) return;
    setLoadingPreview(true);
    try {
      const res  = await previewContract(buildPayload());
      const blob = new Blob([res.data], { type: 'application/pdf' });
      if (previewUrl) window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl(window.URL.createObjectURL(blob));
    } catch {
      toast.error('Failed to generate preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handleSend = async () => {
    if (!toEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail.trim())) {
      toast.error('Enter a valid recipient email');
      return;
    }
    setSending(true);
    try {
      const res = await sendContract({
        ...buildPayload(),
        toEmail: toEmail.trim(),
        clientName: appliedName || undefined,
        airlineId: airline?.id || undefined,
        message: message.trim() || undefined,
      });
      toast.success(res.data.message || 'Contract sent');
      onSent?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send contract');
    } finally {
      setSending(false);
    }
  };

  if (!blocks) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* Recipient + header date */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <HiOutlineOfficeBuilding className="w-5 h-5 text-primary-500" />
          <h3 className="text-base font-bold text-primary-800">Recipient &amp; Document</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Send To Email</label>
            <div className="relative">
              <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <input type="email" value={toEmail} onChange={e => setToEmail(e.target.value)}
                placeholder="recipient@email.com" className="input-field pl-10 w-full" />
            </div>
          </div>
          <div>
            <label className="label">Header Date <span className="text-amber-500 normal-case font-medium">· top-right of every page</span></label>
            <MonthPicker value={headerDate} onChange={setHeaderDate} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Email Message (optional)</label>
            <input type="text" value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Custom note in the email body…" className="input-field w-full" />
          </div>
        </div>
      </div>

      {/* Contract content */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <HiOutlineDocumentText className="w-5 h-5 text-primary-500" />
          <h3 className="text-base font-bold text-primary-800">Contract Content</h3>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
          <HiOutlineLightBulb className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            <strong className="px-1 rounded hl-mark">Highlighted</strong> boxes are dynamic values — type directly into them.
            To mark more text as dynamic, select it in any text block and click <strong>Bold</strong>.
          </p>
        </div>

        <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-3 sm:p-4 space-y-2.5">
          {blocks.map((b) => {
            if (STRUCTURAL[b.type]) {
              return (
                <div key={b.id} className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-px bg-primary-200/70" />
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary-300">
                    {b.type === 'sigimage'
                      ? <><HiOutlinePencilAlt className="w-3 h-3" /> Signature image</>
                      : 'spacing'}
                  </span>
                  <div className="flex-1 h-px bg-primary-200/70" />
                </div>
              );
            }
            // Special structured editors for specific blocks
            if (b.id === 'eff')
              return <div key={b.id}><DateMarkEditor block={b} label="Effective Date" onChange={val => updateBlock(b.id, val)} formatFn={inputToGB} /></div>;
            if (b.id === 's1a')
              return <div key={b.id}><DateMarkEditor block={b} label="Agreement End" onChange={val => updateBlock(b.id, val)} formatFn={inputToGB} /></div>;
            if (b.id === 's3bullet')
              return <div key={b.id}><ServicesBulletEditor block={b} onChange={val => updateBlock(b.id, val)} /></div>;
            if (b.id === 's4a')
              return <div key={b.id}><CurrencyParaEditor block={b} onChange={val => updateBlock(b.id, val)} /></div>;
            if (b.id === 's4bullet1')
              return <div key={b.id}><FeeBulletEditor block={b} onChange={val => updateBlock(b.id, val)} showCurrency /></div>;
            if (b.id === 's4bullet2')
              return <div key={b.id}><FeeBulletEditor block={b} onChange={val => updateBlock(b.id, val)} showCurrency={false} /></div>;
            if (['s4bullet3', 's4bullet4', 's4bullet5'].includes(b.id))
              return <div key={b.id}><YesNoBulletEditor block={b} onChange={val => updateBlock(b.id, val)} /></div>;
            if (b.id === 'sig_name')
              return <div key={b.id}><SigDateEditor block={b} onChange={val => updateBlock(b.id, val)} /></div>;

            return (
              <div key={b.id}>
                <BlockEditor
                  block={b}
                  onTextChange={val => updateBlock(b.id, val)}
                  onFocus={() => {}}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Extra pages */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HiOutlinePhotograph className="w-5 h-5 text-primary-500" />
            <h3 className="text-base font-bold text-primary-800">Additional Pages</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={addTextBlock}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary-200 text-xs font-semibold text-primary-600 hover:bg-primary-100 transition-colors">
              <HiOutlineDocumentText className="w-4 h-4" /> Add Text Page
            </button>
            <button onClick={addImageBlock}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary-200 text-xs font-semibold text-primary-600 hover:bg-primary-100 transition-colors">
              <HiOutlinePhotograph className="w-4 h-4" /> Add Image
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" onChange={onImageChosen} className="hidden" />
          </div>
        </div>

        {extraBlocks.length === 0 && (
          <p className="text-xs text-primary-400">No extra pages. Long text flows onto new pages automatically; each image gets its own page.</p>
        )}

        <div className="space-y-3">
          {extraBlocks.map((b, i) => (
            <div key={i} className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary-400">
                  Extra Page {i + 1} · {b.type === 'image' ? 'Image' : 'Text'}
                </span>
                <button onClick={() => removeExtra(i)} className="p-1 rounded-lg text-primary-400 hover:text-red-500 hover:bg-red-50">
                  <HiOutlineTrash className="w-4 h-4" />
                </button>
              </div>
              {b.type === 'image' ? (
                <div className="flex items-center gap-3">
                  <img src={b.dataUrl} alt={b.name} className="w-20 h-20 object-contain rounded-lg border border-primary-200 bg-white" />
                  <p className="text-sm text-primary-600 truncate">{b.name}</p>
                </div>
              ) : (
                <textarea value={b.content} onChange={e => updateExtra(i, e.target.value)} rows={4}
                  placeholder="Type the content for this page…"
                  className="input-field w-full resize-y" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-3 z-20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 px-4 sm:px-5 py-3 rounded-2xl bg-white/90 backdrop-blur border border-primary-200 shadow-lg">
          <button onClick={applyBold}
            title="Select text in any block, then click Bold"
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-sm font-bold text-amber-800 hover:bg-amber-100 transition-colors">
            B Bold
          </button>
          <div className="hidden sm:block w-px h-6 bg-primary-200" />
          <button onClick={handlePreview} disabled={loadingPreview}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-primary-300 text-sm font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-60">
            {loadingPreview
              ? <div className="w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
              : <HiOutlineEye className="w-5 h-5" />}
            {loadingPreview ? 'Generating…' : 'Preview PDF'}
          </button>
          <button onClick={handleSend} disabled={sending}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-800 text-white text-sm font-semibold hover:bg-primary-900 disabled:opacity-60 shadow-sm">
            {sending
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <HiOutlinePaperAirplane className="w-5 h-5" />}
            {sending ? 'Sending…' : 'Send Contract'}
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs" onClick={closePreview}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-primary-200">
              <p className="text-sm sm:text-base font-bold text-primary-800">Contract Preview</p>
              <div className="flex items-center gap-2">
                <a href={previewUrl} download="Services_Agreement.pdf"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-800 text-white hover:bg-primary-900">Download</a>
                <button onClick={closePreview} className="p-2 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="bg-primary-50" style={{ height: '72vh' }}>
              <iframe src={previewUrl} title="Contract Preview" className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────
export default function Contract() {
  const [view, setView]             = useState('list'); // 'list' | 'editor'
  const [airlines, setAirlines]     = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedAirline, setSelectedAirline] = useState(null);
  const [viewPdfUrl, setViewPdfUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const fetchAirlines = useCallback(() => {
    setLoadingList(true);
    getContractAirlines()
      .then(res => setAirlines(res.data))
      .catch(() => toast.error('Failed to load airlines'))
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => { fetchAirlines(); }, [fetchAirlines]);

  const handleCreateContract = (airline) => {
    setSelectedAirline(airline);
    setView('editor');
  };

  const handleViewContract = async (airline) => {
    if (!airline.contractId) return;
    setLoadingPdf(true);
    try {
      const res  = await getContractPdf(airline.contractId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      if (viewPdfUrl) window.URL.revokeObjectURL(viewPdfUrl);
      setViewPdfUrl(window.URL.createObjectURL(blob));
    } catch {
      toast.error('Failed to load contract PDF');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleBack = () => {
    setView('list');
    setSelectedAirline(null);
  };

  const handleSent = () => {
    fetchAirlines();
    setView('list');
    setSelectedAirline(null);
  };

  const closePdfModal = () => {
    if (viewPdfUrl) window.URL.revokeObjectURL(viewPdfUrl);
    setViewPdfUrl(null);
  };

  return (
    <div className="w-full min-h-full pb-12">

      {/* Sticky Full-Width Page Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3.5 sm:px-6 sm:py-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center flex-shrink-0 shadow-2xs">
            <HiOutlineDocumentText className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight truncate">Contracts</h1>
            <p className="text-xs text-slate-500 truncate">
              {view === 'list'
                ? 'Manage & send contracts to airlines'
                : `Editing contract for ${selectedAirline?.airlineName || 'airline'}`}
            </p>
          </div>
        </div>

        {view === 'editor' && (
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {selectedAirline && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
                <HiOutlineOfficeBuilding className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold text-slate-800">{selectedAirline.airlineName}</span>
              </div>
            )}
            <button onClick={handleBack}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-2xs">
              <HiOutlineArrowLeft className="w-4 h-4 text-slate-500" /> Back to Airlines
            </button>
          </div>
        )}
      </div>

      {/* Page Body Content */}
      <div className="px-3.5 sm:px-6 pt-4 sm:pt-6 w-full space-y-4 sm:space-y-6">
        {view === 'list' ? (
          <AirlinesList
            airlines={airlines}
            loading={loadingList}
            onCreateContract={handleCreateContract}
            onViewContract={handleViewContract}
          />
        ) : (
          <ContractEditor
            airline={selectedAirline}
            onBack={handleBack}
            onSent={handleSent}
          />
        )}
      </div>

      {/* View sent contract PDF modal */}
      {(viewPdfUrl || loadingPdf) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs" onClick={closePdfModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-primary-200">
              <p className="text-sm sm:text-base font-bold text-primary-800">Sent Contract</p>
              <div className="flex items-center gap-2">
                {viewPdfUrl && (
                  <a href={viewPdfUrl} download="Contract.pdf"
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-800 text-white hover:bg-primary-900">Download</a>
                )}
                <button onClick={closePdfModal} className="p-2 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="bg-primary-50 flex items-center justify-center" style={{ height: '72vh' }}>
              {loadingPdf
                ? <div className="w-8 h-8 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                : <iframe src={viewPdfUrl} title="Sent Contract" className="w-full h-full border-0" />
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { HiOutlineClock, HiChevronDown } from 'react-icons/hi';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

/**
 * Helper to parse "HH:mm" (24h) to 12h components
 */
function parse24to12(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return { hour12: '12', minute: '00', ampm: 'AM' };
  }
  const parts = timeStr.split(':');
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);

  if (isNaN(h)) h = 12;
  if (isNaN(m)) m = 0;

  const ampm = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;

  const hStr = String(hour12).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');

  return { hour12: hStr, minute: mStr, ampm };
}

/**
 * Helper to convert 12h components to "HH:mm" (24h)
 */
function format12to24(hour12Str, minuteStr, ampm) {
  let h = parseInt(hour12Str, 10);
  let m = parseInt(minuteStr, 10);

  if (isNaN(h)) h = 12;
  if (isNaN(m)) m = 0;

  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TimePicker({ value = '12:00', onChange, disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const { hour12, minute, ampm } = parse24to12(value || '12:00');

  const updateTime = (newH, newM, newAmpm) => {
    const time24 = format12to24(newH, newM, newAmpm);
    if (onChange) {
      onChange(time24);
    }
  };

  const handleHourChange = (h) => {
    updateTime(h, minute, ampm);
  };

  const handleMinuteChange = (m) => {
    updateTime(hour12, m, ampm);
  };

  const handleAmpmChange = (a) => {
    updateTime(hour12, minute, a);
  };

  const hoursList = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '59'];

  const PRESETS = [
    { label: '09:00 AM', val: '09:00' },
    { label: '12:00 PM', val: '12:00' },
    { label: '05:00 PM', val: '17:00' },
    { label: '11:59 PM', val: '23:59' },
  ];

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-extrabold rounded-xl border outline-none transition-all shadow-2xs ${
            disabled
              ? 'bg-slate-100/70 border-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-white border-purple-200 hover:border-purple-300 text-purple-950 focus:ring-2 focus:ring-purple-500/20 cursor-pointer'
          } ${className}`}
        >
          <div className="flex items-center gap-2">
            <HiOutlineClock className={`w-4 h-4 ${disabled ? 'text-slate-400' : 'text-purple-600'}`} />
            <span className="tracking-wider text-sm font-black">
              {value ? `${hour12} : ${minute} ${ampm}` : '-- : --'}
            </span>
          </div>
          <HiChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180 text-purple-600' : 'text-slate-400'}`} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="w-72 p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xl space-y-3 z-50">
        {/* Header Display */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Select Custom Time</span>
          <span className="text-xs font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100">
            {hour12}:{minute} {ampm}
          </span>
        </div>

        {/* Time Selector Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {/* Hours Column */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase">Hour</label>
            <div className="h-36 overflow-y-auto pr-1 space-y-1">
              {hoursList.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleHourChange(h)}
                  className={`w-full py-1 text-xs font-extrabold rounded-lg transition-colors ${
                    hour12 === h
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'hover:bg-purple-50 text-slate-700'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Minutes Column */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase">Minute</label>
            <div className="h-36 overflow-y-auto pr-1 space-y-1">
              {minutesList.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMinuteChange(m)}
                  className={`w-full py-1 text-xs font-extrabold rounded-lg transition-colors ${
                    minute === m
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'hover:bg-purple-50 text-slate-700'
                  }`}
                >
                  :{m}
                </button>
              ))}
            </div>
          </div>

          {/* AM / PM Toggle Column */}
          <div className="space-y-1 flex flex-col justify-start">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase">Period</label>
            <div className="space-y-1.5 pt-1">
              {['AM', 'PM'].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => handleAmpmChange(a)}
                  className={`w-full py-2.5 text-xs font-black rounded-xl transition-all border ${
                    ampm === a
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Presets</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.val}
                type="button"
                onClick={() => {
                  onChange(p.val);
                }}
                className={`text-[11px] font-bold py-1 px-2 rounded-lg border transition-colors ${
                  value === p.val
                    ? 'bg-purple-100 border-purple-300 text-purple-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-purple-50 hover:border-purple-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

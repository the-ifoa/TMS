import { useMemo, useState, useRef, useEffect } from 'react';
import { HiOutlineArrowUp, HiOutlineArrowDown, HiOutlineZoomIn, HiChevronDown, HiCheck } from 'react-icons/hi';
import ImageLightbox from '../ImageLightbox';

function CustomSelect({ value, options, placeholder = "Choose match...", onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative w-full sm:w-64 select-none">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between transition-all cursor-pointer ${
          value
            ? 'border-2 border-blue-600 bg-blue-50/90 text-blue-950 shadow-2xs'
            : 'border border-slate-200/90 bg-white text-slate-700 hover:bg-blue-50/50 hover:border-blue-300'
        }`}
      >
        <span className="truncate">{value || placeholder}</span>
        <HiChevronDown className={`w-4 h-4 text-blue-600 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 left-0 top-full mt-1.5 bg-white rounded-xl border border-slate-200/90 shadow-xl overflow-hidden z-50 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
          <div
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 cursor-pointer transition-colors"
          >
            {placeholder}
          </div>
          {options.map((opt, i) => {
            const isSelected = value === opt;
            return (
              <div
                key={i}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`px-3.5 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-between cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                <span className="leading-snug">{opt}</span>
                {isSelected && <HiCheck className="w-4 h-4 text-white flex-shrink-0 ml-2" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ChoicePlayer({ q, response, onChange, multi, onImageClick }) {
  const toggle = (id) => {
    if (!multi) return onChange(id);
    const cur = Array.isArray(response) ? response : [];
    onChange(cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]);
  };

  const options = q.options || [];

  return (
    <div className="space-y-3 w-full">
      {options.map((opt, idx) => {
        const checked = multi ? (response || []).includes(opt._id) : response === opt._id;
        const letter = String.fromCharCode(65 + idx);
        return (
          <div
            key={opt._id}
            onClick={() => toggle(opt._id)}
            className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer select-none transition-all duration-200 group ${
              checked
                ? 'bg-blue-50/90 border-2 border-blue-600 shadow-2xs text-blue-950 font-semibold ring-1 ring-blue-500/20'
                : 'bg-white border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 text-slate-800 shadow-2xs'
            }`}
          >
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0 transition-all ${
                checked
                  ? 'bg-blue-600 text-white shadow-md scale-105 font-black'
                  : 'bg-slate-100 text-slate-600 border border-slate-200/80 group-hover:bg-slate-200/80 group-hover:text-slate-900'
              }`}
            >
              {letter}
            </span>
            {opt.image_url && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onImageClick?.(opt.image_url);
                }}
                className="group/img relative cursor-zoom-in flex-shrink-0"
              >
                <img
                  src={opt.image_url}
                  alt=""
                  className="h-12 w-auto rounded-xl border border-slate-200 object-contain hover:opacity-90 transition-opacity"
                />
                <span className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/img:opacity-100 rounded-xl transition-opacity flex items-center justify-center text-white text-xs">
                  <HiOutlineZoomIn className="w-4 h-4" />
                </span>
              </div>
            )}
            <span className="text-sm sm:text-base leading-relaxed flex-1 font-semibold text-slate-800">
              {opt.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TextPlayer({ response, onChange, minWords }) {
  const words = String(response || '').trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-2 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
      <textarea
        rows={4}
        value={response || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your response here..."
        className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50/30 focus:bg-white transition-all"
      />
      {!!minWords && (
        <p className={`text-xs font-semibold ${words < minWords ? 'text-rose-500' : 'text-slate-400'}`}>
          {words} / {minWords} words minimum
        </p>
      )}
    </div>
  );
}

function NumericPlayer({ response, onChange }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs flex items-center gap-3">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Answer:</span>
      <input
        type="number"
        value={response ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        placeholder="Enter number..."
        className="w-52 px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50/30 focus:bg-white transition-all shadow-2xs"
      />
    </div>
  );
}

function SequencePlayer({ q, response, onChange }) {
  const order = useMemo(
    () => (response && response.length ? response : shuffle((q.sequence_items || []).map((it) => it._idx))),
    [q, response]
  );
  const itemByIdx = useMemo(() => Object.fromEntries((q.sequence_items || []).map((it) => [it._idx, it])), [q]);

  const move = (pos, dir) => {
    const next = [...order];
    const swapPos = pos + dir;
    if (swapPos < 0 || swapPos >= next.length) return;
    [next[pos], next[swapPos]] = [next[swapPos], next[pos]];
    onChange(next);
  };

  return (
    <div className="space-y-2.5 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Reorder items in correct sequence:</p>
      {order.map((idx, pos) => (
        <div
          key={idx}
          className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-blue-300 transition-all shadow-2xs group"
        >
          <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center flex-shrink-0 shadow-2xs">
            {pos + 1}
          </span>
          <span className="flex-1 text-xs sm:text-sm font-semibold text-slate-800">{itemByIdx[idx]?.text}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => move(pos, -1)}
              disabled={pos === 0}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 disabled:opacity-30 disabled:hover:bg-white disabled:hover:border-slate-200 text-slate-700 transition-colors shadow-2xs cursor-pointer"
              title="Move Up"
            >
              <HiOutlineArrowUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => move(pos, 1)}
              disabled={pos === order.length - 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 disabled:opacity-30 disabled:hover:bg-white disabled:hover:border-slate-200 text-slate-700 transition-colors shadow-2xs cursor-pointer"
              title="Move Down"
            >
              <HiOutlineArrowDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchingPlayer({ q, response, onChange }) {
  const rightOptions = useMemo(() => shuffle(q.matching_right_options || []), [q]);
  const displayOrder = useMemo(
    () => shuffle((q.matching_pairs || []).map((_, idx) => idx)),
    [q]
  );
  const chosen = response || [];
  const setPair = (idx, val) => {
    const next = [...chosen];
    next[idx] = val;
    onChange(next);
  };
  return (
    <div className="space-y-3 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
      {displayOrder.map((idx) => {
        const p = q.matching_pairs[idx];
        const selected = chosen[idx];
        return (
          <div
            key={idx}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:border-blue-200 transition-colors"
          >
            <div className="flex-1 flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                {idx + 1}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 leading-snug">{p.left}</span>
            </div>
            <CustomSelect
              value={selected || ''}
              options={rightOptions}
              placeholder="Choose match..."
              onChange={(val) => setPair(idx, val)}
            />
          </div>
        );
      })}
    </div>
  );
}

function parseBlanks(text) {
  return String(text || '').split(/(\{\{\d+\}\})/g);
}

function FillBlankPlayer({ q, response, onChange }) {
  const parts = parseBlanks(q.blanks_text);
  const filled = response || [];
  let blankIdx = -1;
  return (
    <div className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
      <p className="text-xs sm:text-sm leading-loose font-medium text-slate-800">
        {parts.map((part, i) => {
          const m = part.match(/^\{\{(\d+)\}\}$/);
          if (!m) return <span key={i}>{part}</span>;
          blankIdx += 1;
          const idx = blankIdx;
          return (
            <input
              key={i}
              value={filled[idx] || ''}
              onChange={(e) => {
                const next = [...filled];
                next[idx] = e.target.value;
                onChange(next);
              }}
              className="mx-1.5 w-36 px-3 py-1 text-xs sm:text-sm font-bold border-b-2 border-blue-600 outline-none focus:border-blue-700 bg-blue-50/80 text-blue-950 rounded-t"
            />
          );
        })}
      </p>
    </div>
  );
}

function DragWordsPlayer({ q, response, onChange }) {
  const parts = parseBlanks(q.drag_words_text);
  const filled = response || [];
  const [selectedWord, setSelectedWord] = useState(null);
  const bank = q.drag_words_bank || [];

  const placeWord = (idx, word) => {
    const next = [...filled];
    next[idx] = word;
    onChange(next);
    setSelectedWord(null);
  };

  let blankIdx = -1;
  return (
    <div className="space-y-4 p-5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
      <p className="text-xs sm:text-sm leading-loose font-medium text-slate-800">
        {parts.map((part, i) => {
          const m = part.match(/^\{\{(\d+)\}\}$/);
          if (!m) return <span key={i}>{part}</span>;
          blankIdx += 1;
          const idx = blankIdx;
          return (
            <span
              key={i}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                placeWord(idx, e.dataTransfer.getData('text/plain'));
              }}
              onClick={() => selectedWord && placeWord(idx, selectedWord)}
              className="inline-block mx-1.5 min-w-[90px] px-3 py-1 text-center font-bold border-b-2 border-dashed border-blue-600 bg-blue-50/80 text-blue-950 rounded-t cursor-pointer"
            >
              {filled[idx] || ' '}
            </span>
          );
        })}
      </p>
      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
        {bank.map((w, i) => (
          <span
            key={i}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', w)}
            onClick={() => setSelectedWord(w)}
            className={`px-3.5 py-1.5 rounded-lg border text-xs font-semibold cursor-grab active:cursor-grabbing select-none transition-all shadow-2xs ${
              selectedWord === w
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm scale-105'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
            }`}
          >
            {w}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 font-medium">Drag a word onto a blank, or tap a word then tap a blank.</p>
    </div>
  );
}

function HotspotPlayer({ q, response, onChange }) {
  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onChange({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  };
  return (
    <div className="flex justify-center">
      <div className="relative inline-block max-w-full cursor-crosshair rounded-2xl overflow-hidden border border-slate-200 shadow-2xs bg-slate-50" onClick={handleClick}>
        <img src={q.image_url} alt="" className="max-w-full max-h-72 rounded-2xl border border-primary-200 select-none object-contain" />
        {response && (
          <div
            className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-rose-500 border-2 border-white shadow-md animate-pulse"
            style={{ left: `${response.x}%`, top: `${response.y}%` }}
          />
        )}
      </div>
    </div>
  );
}

function DragDropPlayer({ q, response, onChange }) {
  const targets = q.dragdrop_targets || [];
  const items = q.dragdrop_items || [];
  const placed = response || [];
  const [selectedItem, setSelectedItem] = useState(null);

  const place = (label, targetIdx) => {
    const next = placed.filter((p) => p.item_label !== label);
    next.push({ item_label: label, target_index: targetIdx });
    onChange(next);
    setSelectedItem(null);
  };

  const placedAt = (targetIdx) => placed.find((p) => p.target_index === targetIdx)?.item_label;
  const unplacedItems = items.filter((it) => !placed.some((p) => p.item_label === it.label));

  return (
    <div className="space-y-4">
      {q.image_url && (
        <div className="flex justify-center">
          <div className="relative inline-block max-w-full rounded-2xl overflow-hidden border border-slate-200 shadow-2xs bg-slate-900/5">
            <img src={q.image_url} alt="" className="max-w-full max-h-[320px] object-contain mx-auto select-none rounded-2xl" />
            {targets.map((t, idx) => (
              <div
                key={idx}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  place(e.dataTransfer.getData('text/plain'), idx);
                }}
                onClick={() => selectedItem && place(selectedItem, idx)}
                className="absolute border-2 border-dashed border-blue-500 bg-blue-600/20 backdrop-blur-2xs rounded-xl flex items-center justify-center text-xs font-bold text-blue-950 text-center px-1 shadow-2xs transition-all hover:bg-blue-600/30 cursor-pointer"
                style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.width}%`, height: `${t.height}%` }}
              >
                {placedAt(idx) ? (
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded-lg text-xs font-extrabold shadow-2xs">{placedAt(idx)}</span>
                ) : (
                  <span className="text-slate-900 font-extrabold text-[10px] drop-shadow-xs">{t.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-500">Available Items:</p>
        <div className="flex flex-wrap gap-2">
          {unplacedItems.map((it, i) => (
            <span
              key={i}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', it.label)}
              onClick={() => setSelectedItem(it.label)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-grab active:cursor-grabbing select-none transition-all shadow-2xs ${
                selectedItem === it.label
                  ? 'border-blue-600 bg-blue-600 text-white shadow-md scale-105'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 hover:border-slate-300'
              }`}
            >
              {it.label}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 font-medium">Drag an item onto its zone on the image, or tap an item then tap a zone.</p>
      </div>
    </div>
  );
}

function LikertPlayer({ q, response, onChange }) {
  const answers = response || [];
  const labels = q.likert_scale_labels || ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];

  return (
    <div className="space-y-3.5">
      {(q.likert_statements || []).map((s, sIdx) => (
        <div
          key={sIdx}
          className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-3 transition-all hover:border-slate-300"
        >
          <p className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
            {s}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
            {labels.map((label, lIdx) => {
              const checked = answers[sIdx] === lIdx;
              return (
                <button
                  key={lIdx}
                  type="button"
                  onClick={() => {
                    const next = [...answers];
                    next[sIdx] = lIdx;
                    onChange(next);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer select-none text-center ${
                    checked
                      ? 'bg-blue-600 text-white border-2 border-blue-600 shadow-2xs scale-[1.02]'
                      : 'bg-slate-50 text-slate-700 border border-slate-200/90 hover:bg-blue-50/70 hover:border-blue-300'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full text-[11px] font-extrabold flex items-center justify-center flex-shrink-0 ${
                      checked ? 'bg-white text-blue-600' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {lIdx + 1}
                  </span>
                  <span className="whitespace-normal leading-tight font-semibold text-[11px] sm:text-xs">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ImageGallery({ gallery, setLightboxSrc }) {
  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  const hasDragged = useRef(false);
  const targetScroll = useRef(0);
  const animFrame = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    targetScroll.current = el.scrollLeft;

    const smoothLoop = () => {
      if (!el) return;
      const diff = targetScroll.current - el.scrollLeft;
      if (Math.abs(diff) > 0.4) {
        el.scrollLeft += diff * 0.18;
        animFrame.current = requestAnimationFrame(smoothLoop);
      } else {
        el.scrollLeft = targetScroll.current;
        animFrame.current = null;
      }
    };

    const onWheel = (e) => {
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (delta !== 0) {
        e.preventDefault();
        const maxScroll = el.scrollWidth - el.clientWidth;
        const currentBase = animFrame.current ? targetScroll.current : el.scrollLeft;
        targetScroll.current = Math.max(0, Math.min(maxScroll, currentBase + delta * 2.2));
        
        if (!animFrame.current) {
          animFrame.current = requestAnimationFrame(smoothLoop);
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, []);

  const handleMouseDown = (e) => {
    if (!scrollRef.current) return;
    if (animFrame.current) cancelAnimationFrame(animFrame.current);
    animFrame.current = null;
    isDragging.current = true;
    hasDragged.current = false;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftStart.current = scrollRef.current.scrollLeft;
    targetScroll.current = scrollRef.current.scrollLeft;
  };

  const handleMouseLeaveOrUp = () => {
    isDragging.current = false;
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current || !scrollRef.current) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    if (Math.abs(walk) > 5) {
      hasDragged.current = true;
    }
    const newPos = scrollLeftStart.current - walk;
    scrollRef.current.scrollLeft = newPos;
    targetScroll.current = newPos;
  };

  const multi = gallery.length > 1;

  return (
    <div
      ref={scrollRef}
      onMouseDown={multi ? handleMouseDown : undefined}
      onMouseLeave={multi ? handleMouseLeaveOrUp : undefined}
      onMouseUp={multi ? handleMouseLeaveOrUp : undefined}
      onMouseMove={multi ? handleMouseMove : undefined}
      className={
        multi
          ? 'flex gap-3 overflow-x-auto pb-2.5 -mx-1 px-1 scrollbar-thin select-none cursor-grab active:cursor-grabbing'
          : 'flex justify-center'
      }
    >
      {gallery.map((img, idx) => (
        <div
          key={idx}
          onClick={() => {
            if (!hasDragged.current) setLightboxSrc(img.url);
          }}
          className={`group relative rounded-2xl border border-slate-200/80 p-1.5 bg-slate-50/70 inline-flex items-center justify-center cursor-zoom-in hover:border-blue-400 transition-all shadow-2xs overflow-hidden ${
            multi ? 'flex-shrink-0' : 'max-w-full'
          }`}
        >
          {multi && (
            <span className="absolute top-2 left-2 z-10 w-5 h-5 rounded-full bg-slate-900/80 text-white text-[10px] font-extrabold flex items-center justify-center">
              {idx + 1}
            </span>
          )}
          <img
            src={img.url}
            alt=""
            draggable={false}
            className={
              multi
                ? 'h-40 sm:h-48 w-auto max-w-[85vw] sm:max-w-xs rounded-xl object-contain pointer-events-none'
                : 'max-w-full max-h-40 sm:max-h-48 rounded-xl object-contain'
            }
          />
          <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-bold backdrop-blur-2xs flex items-center gap-1.5 shadow-md transition-transform group-hover:scale-105 whitespace-nowrap pointer-events-none">
            <HiOutlineZoomIn className="w-3.5 h-3.5 text-blue-400" />
            Click to expand
          </span>
        </div>
      ))}
    </div>
  );
}

export default function QuestionPlayer({ question: q, response, onChange }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);

  return (
    <div className="w-full space-y-4">
      {/* Question Prompt Card */}
      {q.prompt && (
        <div className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed whitespace-pre-wrap tracking-tight bg-slate-50/70 p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs">
          {q.prompt}
        </div>
      )}

      {/* Question Image(s) (Below Prompt, Above Options) */}
      {q.type !== 'hotspot' && q.type !== 'drag_drop' && (() => {
        const gallery = q.images && q.images.length > 0 ? q.images : (q.image_url ? [{ url: q.image_url }] : []);
        if (gallery.length === 0) return null;
        return <ImageGallery gallery={gallery} setLightboxSrc={setLightboxSrc} />;
      })()}

      {/* Answer Options (Below Image) */}
      <div className="w-full space-y-3">
        {(q.type === 'mcq' || q.type === 'true_false' || q.type === 'select_list') && (
          <ChoicePlayer q={q} response={response} onChange={onChange} onImageClick={setLightboxSrc} />
        )}
        {q.type === 'multi_response' && (
          <ChoicePlayer q={q} response={response} onChange={onChange} multi onImageClick={setLightboxSrc} />
        )}
        {(q.type === 'short_answer' || q.type === 'essay') && (
          <TextPlayer response={response} onChange={onChange} minWords={q.essay_min_words} />
        )}
        {q.type === 'numeric' && <NumericPlayer response={response} onChange={onChange} />}
        {q.type === 'sequence' && <SequencePlayer q={q} response={response} onChange={onChange} />}
        {q.type === 'matching' && <MatchingPlayer q={q} response={response} onChange={onChange} />}
        {q.type === 'fill_blank' && <FillBlankPlayer q={q} response={response} onChange={onChange} />}
        {q.type === 'drag_words' && <DragWordsPlayer q={q} response={response} onChange={onChange} />}
        {q.type === 'hotspot' && <HotspotPlayer q={q} response={response} onChange={onChange} />}
        {q.type === 'drag_drop' && <DragDropPlayer q={q} response={response} onChange={onChange} />}
        {q.type === 'likert' && <LikertPlayer q={q} response={response} onChange={onChange} />}
      </div>

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

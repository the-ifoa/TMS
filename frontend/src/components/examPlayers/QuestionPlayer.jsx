import { useMemo, useState } from 'react';
import { HiOutlineArrowUp, HiOutlineArrowDown } from 'react-icons/hi';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const optionRowCls = 'flex items-center gap-2 p-2.5 rounded-lg border border-primary-200 hover:bg-primary-50 cursor-pointer';

function ChoicePlayer({ q, response, onChange, multi }) {
  const toggle = (id) => {
    if (!multi) return onChange(id);
    const cur = Array.isArray(response) ? response : [];
    onChange(cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]);
  };
  return (
    <div className="space-y-3">
      {(q.options || []).map((opt, idx) => {
        const checked = multi ? (response || []).includes(opt._id) : response === opt._id;
        const letter = String.fromCharCode(65 + idx);
        return (
          <div
            key={opt._id}
            onClick={() => toggle(opt._id)}
            className={`flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl border cursor-pointer select-none transition-all duration-200 ${
              checked
                ? 'bg-blue-50/90 border-2 border-blue-600 shadow-2xs text-blue-950 font-semibold'
                : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70 hover:border-slate-300 text-slate-800'
            }`}
          >
            <span
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0 transition-colors ${
                checked ? 'bg-blue-600 text-white shadow-2xs' : 'bg-slate-200/90 text-slate-700'
              }`}
            >
              {letter}
            </span>
            {opt.image_url && <img src={opt.image_url} alt="" className="h-12 w-auto rounded-lg border border-slate-200" />}
            <span className="text-sm sm:text-base leading-snug flex-1 font-medium">{opt.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function TextPlayer({ response, onChange, minWords }) {
  const words = String(response || '').trim().split(/\s+/).filter(Boolean).length;
  return (
    <div>
      <textarea rows={4} value={response || ''} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-primary-200 rounded-lg outline-none focus:border-[#0000ff]" />
      {!!minWords && <p className={`text-xs mt-1 ${words < minWords ? 'text-red-500' : 'text-primary-400'}`}>{words} / {minWords} words minimum</p>}
    </div>
  );
}

function NumericPlayer({ response, onChange }) {
  return (
    <input type="number" value={response ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="w-40 px-3 py-2 text-sm border border-primary-200 rounded-lg outline-none focus:border-[#0000ff]" />
  );
}

function SequencePlayer({ q, response, onChange }) {
  // response: array of original _idx values in student-chosen order.
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
    <div className="space-y-1.5">
      {order.map((idx, pos) => (
        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border border-primary-200">
          <span className="text-xs font-semibold text-primary-400 w-5">{pos + 1}.</span>
          <span className="flex-1 text-sm text-primary-800">{itemByIdx[idx]?.text}</span>
          <button type="button" onClick={() => move(pos, -1)} disabled={pos === 0} className="p-1 rounded hover:bg-primary-100 disabled:opacity-30">
            <HiOutlineArrowUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => move(pos, 1)} disabled={pos === order.length - 1} className="p-1 rounded hover:bg-primary-100 disabled:opacity-30">
            <HiOutlineArrowDown className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function MatchingPlayer({ q, response, onChange }) {
  const rightOptions = useMemo(() => shuffle(q.matching_right_options || []), [q]);
  const chosen = response || [];
  const setPair = (idx, val) => {
    const next = [...chosen];
    next[idx] = val;
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {(q.matching_pairs || []).map((p, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-sm text-primary-800 flex-1">{p.left}</span>
          <select value={chosen[idx] || ''} onChange={(e) => setPair(idx, e.target.value)}
            className="w-48 px-2.5 py-1.5 text-sm border border-primary-200 rounded-lg outline-none focus:border-[#0000ff]">
            <option value="">Select match…</option>
            {rightOptions.map((r, i) => <option key={i} value={r}>{r}</option>)}
          </select>
        </div>
      ))}
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
    <p className="text-sm leading-8 text-primary-800">
      {parts.map((part, i) => {
        const m = part.match(/^\{\{(\d+)\}\}$/);
        if (!m) return <span key={i}>{part}</span>;
        blankIdx += 1;
        const idx = blankIdx;
        return (
          <input key={i} value={filled[idx] || ''} onChange={(e) => { const next = [...filled]; next[idx] = e.target.value; onChange(next); }}
            className="mx-1 w-32 px-2 py-1 text-sm border-b-2 border-primary-300 outline-none focus:border-[#0000ff] bg-blue-50/40" />
        );
      })}
    </p>
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
    <div className="space-y-3">
      <p className="text-sm leading-9 text-primary-800">
        {parts.map((part, i) => {
          const m = part.match(/^\{\{(\d+)\}\}$/);
          if (!m) return <span key={i}>{part}</span>;
          blankIdx += 1;
          const idx = blankIdx;
          return (
            <span key={i}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); placeWord(idx, e.dataTransfer.getData('text/plain')); }}
              onClick={() => selectedWord && placeWord(idx, selectedWord)}
              className="inline-block mx-1 min-w-[90px] px-2 py-1 text-center border-b-2 border-dashed border-primary-300 bg-blue-50/40 cursor-pointer"
            >
              {filled[idx] || ' '}
            </span>
          );
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        {bank.map((w, i) => (
          <span key={i} draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', w)}
            onClick={() => setSelectedWord(w)}
            className={`px-3 py-1.5 rounded-full border text-sm cursor-grab select-none ${selectedWord === w ? 'border-[#0000ff] bg-blue-50' : 'border-primary-200 bg-white'}`}
          >
            {w}
          </span>
        ))}
      </div>
      <p className="text-xs text-primary-400">Drag a word onto a blank, or tap a word then tap a blank.</p>
    </div>
  );
}

function HotspotPlayer({ q, response, onChange }) {
  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onChange({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  };
  return (
    <div className="relative inline-block max-w-full cursor-crosshair" onClick={handleClick}>
      <img src={q.image_url} alt="" className="max-w-full max-h-96 rounded-lg border border-primary-200 select-none" />
      {response && (
        <div className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-red-500 border-2 border-white shadow"
          style={{ left: `${response.x}%`, top: `${response.y}%` }} />
      )}
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
    <div className="space-y-5">
      {q.image_url && (
        <div className="relative inline-block max-w-full rounded-2xl overflow-hidden border border-slate-200 shadow-2xs bg-slate-900/5">
          <img src={q.image_url} alt="" className="max-w-full max-h-[460px] object-contain mx-auto select-none rounded-2xl" />
          {targets.map((t, idx) => (
            <div key={idx}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); place(e.dataTransfer.getData('text/plain'), idx); }}
              onClick={() => selectedItem && place(selectedItem, idx)}
              className="absolute border-2 border-dashed border-blue-500 bg-blue-600/20 backdrop-blur-2xs rounded-xl flex items-center justify-center text-xs font-bold text-blue-950 text-center px-1 shadow-2xs transition-all hover:bg-blue-600/30 cursor-pointer"
              style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.width}%`, height: `${t.height}%` }}
            >
              {placedAt(idx) ? (
                <span className="bg-blue-600 text-white px-2.5 py-1 rounded-lg text-xs font-extrabold shadow-2xs">{placedAt(idx)}</span>
              ) : (
                <span className="text-slate-900 font-extrabold text-[11px] drop-shadow-xs">{t.label}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500">Available Items:</p>
        <div className="flex flex-wrap gap-2.5">
          {unplacedItems.map((it, i) => (
            <span key={i} draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', it.label)}
              onClick={() => setSelectedItem(it.label)}
              className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-grab active:cursor-grabbing select-none transition-all shadow-2xs ${
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
  const labels = q.likert_scale_labels || [];
  return (
    <div className="space-y-3">
      {(q.likert_statements || []).map((s, sIdx) => (
        <div key={sIdx} className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50">
          <p className="text-sm font-semibold text-slate-800 mb-3 leading-relaxed">{s}</p>
          <div className="flex flex-wrap gap-4">
            {labels.map((label, lIdx) => (
              <label key={lIdx} className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                <input type="radio" name={`likert-${sIdx}`} checked={answers[sIdx] === lIdx}
                  onChange={() => { const next = [...answers]; next[sIdx] = lIdx; onChange(next); }} className="accent-blue-600 w-4 h-4" />
                {label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function QuestionPlayer({ question: q, response, onChange }) {
  return (
    <div className="space-y-6">
      {q.prompt && (
        <div className="text-base sm:text-lg font-bold text-slate-900 leading-relaxed whitespace-pre-wrap tracking-tight">
          {q.prompt}
        </div>
      )}
      {q.image_url && q.type !== 'hotspot' && q.type !== 'drag_drop' && (
        <div className="rounded-2xl border border-slate-200/80 p-2 bg-slate-50/50 inline-block max-w-full">
          <img src={q.image_url} alt="" className="max-w-full max-h-[420px] rounded-xl object-contain shadow-2xs" />
        </div>
      )}

      {(q.type === 'mcq' || q.type === 'true_false' || q.type === 'select_list') && <ChoicePlayer q={q} response={response} onChange={onChange} />}
      {q.type === 'multi_response' && <ChoicePlayer q={q} response={response} onChange={onChange} multi />}
      {(q.type === 'short_answer' || q.type === 'essay') && <TextPlayer response={response} onChange={onChange} minWords={q.essay_min_words} />}
      {q.type === 'numeric' && <NumericPlayer response={response} onChange={onChange} />}
      {q.type === 'sequence' && <SequencePlayer q={q} response={response} onChange={onChange} />}
      {q.type === 'matching' && <MatchingPlayer q={q} response={response} onChange={onChange} />}
      {q.type === 'fill_blank' && <FillBlankPlayer q={q} response={response} onChange={onChange} />}
      {q.type === 'drag_words' && <DragWordsPlayer q={q} response={response} onChange={onChange} />}
      {q.type === 'hotspot' && <HotspotPlayer q={q} response={response} onChange={onChange} />}
      {q.type === 'drag_drop' && <DragDropPlayer q={q} response={response} onChange={onChange} />}
      {q.type === 'likert' && <LikertPlayer q={q} response={response} onChange={onChange} />}
    </div>
  );
}

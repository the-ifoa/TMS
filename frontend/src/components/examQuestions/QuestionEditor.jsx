import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePhotograph, HiOutlineX, HiOutlinePlusCircle, HiOutlineTrash,
  HiOutlineChevronUp, HiOutlineChevronDown,
} from 'react-icons/hi';
import { uploadExamImage, deleteExamImage } from '../../api';
import ImageLightbox from '../ImageLightbox';

export const QUESTION_TYPES = [
  { value: 'mcq',            label: 'Multiple Choice' },
  { value: 'multi_response', label: 'Multiple Response' },
  { value: 'true_false',     label: 'True/False' },
  { value: 'short_answer',   label: 'Short Answer' },
  { value: 'numeric',        label: 'Numeric' },
  { value: 'sequence',       label: 'Sequence' },
  { value: 'matching',       label: 'Matching' },
  { value: 'fill_blank',     label: 'Fill in the Blanks' },
  { value: 'select_list',    label: 'Select from Lists' },
  { value: 'drag_words',     label: 'Drag the Words' },
  { value: 'hotspot',        label: 'Hotspot' },
  { value: 'drag_drop',      label: 'Drag and Drop' },
  { value: 'likert',         label: 'Likert Scale' },
  { value: 'essay',          label: 'Essay' },
];

const uid = () => `new-${Math.random().toString(36).slice(2, 10)}`;

export function createEmptyQuestion(type) {
  return {
    _id: uid(), type, prompt: '', image_url: '', image_public_id: '', points: 1, order: 0, explanation: '', section: '',
    options: ['mcq', 'multi_response', 'select_list'].includes(type)
      ? [{ _id: uid(), text: '', is_correct: false }, { _id: uid(), text: '', is_correct: false }]
      : type === 'true_false'
      ? [{ _id: uid(), text: 'True', is_correct: true }, { _id: uid(), text: 'False', is_correct: false }]
      : [],
    correct_text: [''],
    numeric_answer: null, numeric_tolerance: 0,
    sequence_items: [{ text: '', image_url: '' }, { text: '', image_url: '' }],
    matching_pairs: [{ left: '', right: '' }, { left: '', right: '' }],
    blanks_text: '', blanks_answers: [['']],
    drag_words_text: '', drag_words_bank: [''], drag_words_answers: [''],
    hotspot_regions: [],
    dragdrop_targets: [], dragdrop_items: [],
    likert_statements: [''], likert_scale_labels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
    essay_min_words: 0,
  };
}

// ── Shared image upload control ──────────────────────────────────────────────
function ImageField({ url, publicId, onChange, label = 'Image' }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadExamImage(file);
      if (publicId) deleteExamImage(publicId).catch(() => {});
      onChange({ url: res.data.url, publicId: res.data.public_id });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Image upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = () => {
    if (publicId) deleteExamImage(publicId).catch(() => {});
    onChange({ url: '', publicId: '' });
  };

  return (
    <div className="flex items-center gap-2">
      {url ? (
        <div className="relative group">
          <img
            src={url}
            alt=""
            onClick={() => setLightboxOpen(true)}
            className="h-16 w-auto rounded-xl border border-slate-200 object-cover shadow-2xs cursor-zoom-in hover:opacity-80 transition-opacity"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-slate-200 p-1 shadow-sm hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"
            title="Remove image"
          >
            <HiOutlineX className="w-3 h-3" />
          </button>
          {lightboxOpen && <ImageLightbox src={url} onClose={() => setLightboxOpen(false)} />}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 bg-white transition-all shadow-2xs"
        >
          <HiOutlinePhotograph className="w-4 h-4 text-slate-400" />
          <span>{busy ? 'Uploading…' : label}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

const inputCls = 'w-full px-3.5 py-2 text-sm font-medium text-slate-800 bg-slate-50/40 border border-slate-200/90 rounded-xl outline-none focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 transition-all placeholder:text-slate-400';
const smallBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 rounded-xl transition-colors';

// ── Per-type editors ──────────────────────────────────────────────────────────

function ChoiceOptionsEditor({ q, set, multi = false, locked = false }) {
  const options = q.options || [];
  const setOptions = (next) => set('options', next);

  const toggleCorrect = (idx) => {
    setOptions(options.map((o, i) => {
      if (multi) return i === idx ? { ...o, is_correct: !o.is_correct } : o;
      return { ...o, is_correct: i === idx };
    }));
  };

  return (
    <div className="space-y-2.5">
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        Answer Options ({multi ? 'Check all correct options' : 'Select correct answer'})
      </label>
      {options.map((opt, idx) => (
        <div key={opt._id || idx} className="flex items-center gap-2.5">
          <input
            type={multi ? 'checkbox' : 'radio'}
            checked={!!opt.is_correct}
            onChange={() => toggleCorrect(idx)}
            title="Mark correct option"
            className="w-4 h-4 text-blue-600 accent-blue-600 rounded cursor-pointer flex-shrink-0"
          />
          <input
            value={opt.text}
            disabled={locked}
            onChange={(e) => setOptions(options.map((o, i) => (i === idx ? { ...o, text: e.target.value } : o)))}
            placeholder={`Option ${idx + 1}`}
            className={inputCls + (locked ? ' bg-slate-100 text-slate-500 cursor-not-allowed' : '')}
          />
          <ImageField
            url={opt.image_url}
            publicId={opt.image_public_id}
            onChange={({ url, publicId }) => setOptions(options.map((o, i) => (i === idx ? { ...o, image_url: url, image_public_id: publicId } : o)))}
          />
          {!locked && options.length > 2 && (
            <button
              type="button"
              onClick={() => setOptions(options.filter((_, i) => i !== idx))}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0"
              title="Remove option"
            >
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {!locked && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 rounded-xl transition-colors mt-1"
          onClick={() => setOptions([...options, { _id: uid(), text: '', is_correct: false }])}
        >
          <HiOutlinePlusCircle className="w-4 h-4" />
          <span>Add option</span>
        </button>
      )}
    </div>
  );
}

function ShortAnswerEditor({ q, set }) {
  const answers = q.correct_text?.length ? q.correct_text : [''];
  const setAnswers = (next) => set('correct_text', next);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Accepted answers are shown to the administrator as reference — Short Answer requires manual review.</p>
      {answers.map((a, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={a} onChange={(e) => setAnswers(answers.map((v, i) => (i === idx ? e.target.value : v)))}
            placeholder={`Accepted answer ${idx + 1}`} className={inputCls} />
          {answers.length > 1 && (
            <button type="button" onClick={() => setAnswers(answers.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className={smallBtn} onClick={() => setAnswers([...answers, ''])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add accepted answer
      </button>
    </div>
  );
}

function NumericEditor({ q, set }) {
  return (
    <div className="flex items-center gap-4 bg-slate-50/50 p-3 rounded-xl border border-slate-200/80">
      <label className="text-xs font-bold text-slate-700">Correct Value
        <input type="number" value={q.numeric_answer ?? ''} onChange={(e) => set('numeric_answer', e.target.value === '' ? null : Number(e.target.value))}
          className={inputCls + ' mt-1 w-32'} />
      </label>
      <label className="text-xs font-bold text-slate-700">± Tolerance
        <input type="number" value={q.numeric_tolerance ?? 0} onChange={(e) => set('numeric_tolerance', Number(e.target.value))}
          className={inputCls + ' mt-1 w-28'} />
      </label>
    </div>
  );
}

function SequenceEditor({ q, set }) {
  const items = q.sequence_items || [];
  const setItems = (next) => set('sequence_items', next);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">List items in the CORRECT order — they will be shuffled for the candidate.</p>
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs font-extrabold text-slate-500 w-5">{idx + 1}.</span>
          <input value={it.text} onChange={(e) => setItems(items.map((v, i) => (i === idx ? { ...v, text: e.target.value } : v)))}
            className={inputCls} />
          {items.length > 2 && (
            <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className={smallBtn} onClick={() => setItems([...items, { text: '', image_url: '' }])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add step
      </button>
    </div>
  );
}

function MatchingEditor({ q, set }) {
  const pairs = q.matching_pairs || [];
  const setPairs = (next) => set('matching_pairs', next);
  return (
    <div className="space-y-2">
      {pairs.map((p, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={p.left} onChange={(e) => setPairs(pairs.map((v, i) => (i === idx ? { ...v, left: e.target.value } : v)))}
            placeholder="Left item" className={inputCls} />
          <span className="text-slate-400 font-bold">↔</span>
          <input value={p.right} onChange={(e) => setPairs(pairs.map((v, i) => (i === idx ? { ...v, right: e.target.value } : v)))}
            placeholder="Matches with" className={inputCls} />
          {pairs.length > 2 && (
            <button type="button" onClick={() => setPairs(pairs.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className={smallBtn} onClick={() => setPairs([...pairs, { left: '', right: '' }])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add pair
      </button>
    </div>
  );
}

function FillBlankEditor({ q, set }) {
  const answers = q.blanks_answers || [];
  const setAnswers = (next) => set('blanks_answers', next);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Use <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">{'{{1}}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">{'{{2}}'}</code>… in the text below to mark blanks.</p>
      <textarea value={q.blanks_text} onChange={(e) => set('blanks_text', e.target.value)} rows={2}
        placeholder="The capital of France is {{1}}." className={inputCls} />
      {answers.map((set_, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600 w-16">Blank {idx + 1}</span>
          <input value={(set_ || [])[0] || ''} onChange={(e) => setAnswers(answers.map((v, i) => (i === idx ? [e.target.value] : v)))}
            placeholder="Accepted answer" className={inputCls} />
          {answers.length > 1 && (
            <button type="button" onClick={() => setAnswers(answers.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className={smallBtn} onClick={() => setAnswers([...answers, ['']])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add blank
      </button>
    </div>
  );
}

function DragWordsEditor({ q, set }) {
  const answers = q.drag_words_answers || [];
  const bank = q.drag_words_bank || [];
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Use <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">{'{{1}}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">{'{{2}}'}</code>… in the text below to mark drop zones.</p>
      <textarea value={q.drag_words_text} onChange={(e) => set('drag_words_text', e.target.value)} rows={2}
        placeholder="The {{1}} orbits the {{2}}." className={inputCls} />
      <p className="text-xs font-bold text-slate-700">Correct word per blank</p>
      {answers.map((a, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600 w-16">Blank {idx + 1}</span>
          <input value={a} onChange={(e) => set('drag_words_answers', answers.map((v, i) => (i === idx ? e.target.value : v)))} className={inputCls} />
          {answers.length > 1 && (
            <button type="button" onClick={() => set('drag_words_answers', answers.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className={smallBtn} onClick={() => set('drag_words_answers', [...answers, ''])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add blank
      </button>
      <p className="text-xs font-bold text-slate-700 pt-1">Word bank (correct words + distractors, shown to candidate)</p>
      {bank.map((w, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={w} onChange={(e) => set('drag_words_bank', bank.map((v, i) => (i === idx ? e.target.value : v)))} className={inputCls} />
          <button type="button" onClick={() => set('drag_words_bank', bank.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" className={smallBtn} onClick={() => set('drag_words_bank', [...bank, ''])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add word
      </button>
    </div>
  );
}

// Click-to-place rectangle regions over an uploaded image (% coordinates).
function ImageRegionEditor({ imageUrl, regions, onChange, renderRegionLabel, onAddDefault }) {
  const imgRef = useRef(null);
  const dragRef = useRef(null); // { idx, mode: 'move' | 'resize', startX, startY, startRegion }

  const pctFromEvent = (e) => {
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  const handleClick = (e) => {
    if (!imgRef.current) return;
    const { x: xPct, y: yPct } = pctFromEvent(e);
    const w = 15, h = 15;
    onAddDefault({ x: Math.max(0, xPct - w / 2), y: Math.max(0, yPct - h / 2), width: w, height: h });
  };

  const onDragMove = (e) => {
    if (!dragRef.current || !imgRef.current) return;
    const { idx, mode, startX, startY, startRegion } = dragRef.current;
    const { x, y } = pctFromEvent(e);
    const dx = x - startX;
    const dy = y - startY;
    let patch;
    if (mode === 'move') {
      patch = {
        x: Math.min(100 - startRegion.width, Math.max(0, startRegion.x + dx)),
        y: Math.min(100 - startRegion.height, Math.max(0, startRegion.y + dy)),
      };
    } else {
      patch = {
        width: Math.max(3, Math.min(100 - startRegion.x, startRegion.width + dx)),
        height: Math.max(3, Math.min(100 - startRegion.y, startRegion.height + dy)),
      };
    }
    onChange(regions.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const onDragEnd = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  };

  const startDrag = (e, idx, mode) => {
    e.stopPropagation();
    e.preventDefault();
    const { x, y } = pctFromEvent(e);
    dragRef.current = { idx, mode, startX: x, startY: y, startRegion: { ...regions[idx] } };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  };

  if (!imageUrl) return <p className="text-xs font-medium text-slate-500">Upload an image above, then click on it to place regions.</p>;

  return (
    <div className="relative inline-block max-w-full" onClick={handleClick}>
      <img ref={imgRef} src={imageUrl} alt="" className="max-w-full max-h-80 rounded-xl border border-slate-200 cursor-crosshair select-none shadow-2xs" />
      {regions.map((r, idx) => (
        <div key={idx}
          onMouseDown={(e) => startDrag(e, idx, 'move')}
          onClick={(e) => e.stopPropagation()}
          className={`absolute border-2 cursor-move ${r.is_correct !== false ? 'border-emerald-500 bg-emerald-500/20' : 'border-blue-500 bg-blue-500/20'} flex items-center justify-center text-[10px] font-bold text-white rounded select-none`}
          style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.width}%`, height: `${r.height}%` }}
        >
          {renderRegionLabel ? renderRegionLabel(r, idx) : idx + 1}
          <div
            onMouseDown={(e) => startDrag(e, idx, 'resize')}
            title="Drag to resize"
            className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-white border-2 border-current rounded-full cursor-se-resize"
          />
        </div>
      ))}
    </div>
  );
}

function HotspotEditor({ q, set }) {
  const regions = q.hotspot_regions || [];
  const setRegions = (next) => set('hotspot_regions', next);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Click the image to add a region. Drag a region to move it, or its corner handle to resize. Correct regions (green) are valid click targets for candidates.</p>
      <ImageRegionEditor
        imageUrl={q.image_url}
        regions={regions}
        onChange={setRegions}
        onAddDefault={(r) => setRegions([...regions, { ...r, shape: 'rect', is_correct: true }])}
      />
      {regions.map((r, idx) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <span className="w-4 font-bold text-slate-500">{idx + 1}.</span>
          <label className="flex items-center gap-1 font-semibold text-slate-700">
            <input type="checkbox" checked={r.is_correct} onChange={() => setRegions(regions.map((v, i) => (i === idx ? { ...v, is_correct: !v.is_correct } : v)))} />
            Correct Region
          </label>
          <button type="button" onClick={() => setRegions(regions.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function DragDropEditor({ q, set }) {
  const targets = q.dragdrop_targets || [];
  const items = q.dragdrop_items || [];
  const setTargets = (next) => set('dragdrop_targets', next);
  const setItems = (next) => set('dragdrop_items', next);

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500">Click the image to add a drop-target zone, then name it. Drag a zone to move it, or its corner handle to resize. Add draggable items and pick which zone each belongs in.</p>
      <ImageRegionEditor
        imageUrl={q.image_url}
        regions={targets}
        onChange={setTargets}
        renderRegionLabel={(r) => r.label || '?'}
        onAddDefault={(r) => setTargets([...targets, { ...r, label: `Zone ${targets.length + 1}` }])}
      />
      {targets.map((t, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={t.label} onChange={(e) => setTargets(targets.map((v, i) => (i === idx ? { ...v, label: e.target.value } : v)))}
            placeholder={`Zone ${idx + 1} label`} className={inputCls} />
          <button type="button" onClick={() => setTargets(targets.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ))}
      <p className="text-xs font-bold text-slate-700 pt-1">Draggable Items</p>
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={it.label} onChange={(e) => setItems(items.map((v, i) => (i === idx ? { ...v, label: e.target.value } : v)))}
            placeholder="Item label" className={inputCls} />
          <select value={it.correct_target_index} onChange={(e) => setItems(items.map((v, i) => (i === idx ? { ...v, correct_target_index: Number(e.target.value) } : v)))}
            className={inputCls + ' w-40'}>
            {targets.map((t, ti) => <option key={ti} value={ti}>{t.label || `Zone ${ti + 1}`}</option>)}
          </select>
          <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" disabled={targets.length === 0} className={smallBtn}
        onClick={() => setItems([...items, { label: '', correct_target_index: 0 }])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add item
      </button>
    </div>
  );
}

function LikertEditor({ q, set }) {
  const statements = q.likert_statements || [];
  const labels = q.likert_scale_labels || [];
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Survey type — not auto-scored.</p>
      <p className="text-xs font-bold text-slate-700">Statements</p>
      {statements.map((s, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={s} onChange={(e) => set('likert_statements', statements.map((v, i) => (i === idx ? e.target.value : v)))} className={inputCls} />
          <button type="button" onClick={() => set('likert_statements', statements.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" className={smallBtn} onClick={() => set('likert_statements', [...statements, ''])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add statement
      </button>
      <p className="text-xs font-bold text-slate-700 pt-1">Scale labels (low → high)</p>
      <input value={labels.join(', ')} onChange={(e) => set('likert_scale_labels', e.target.value.split(',').map((s) => s.trim()))}
        className={inputCls} placeholder="Strongly Disagree, Disagree, Neutral, Agree, Strongly Agree" />
    </div>
  );
}

function EssayEditor({ q, set }) {
  return (
    <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-200/80 space-y-1">
      <label className="text-xs font-bold text-slate-700">Minimum Word Count (Optional)
        <input type="number" min="0" value={q.essay_min_words || 0} onChange={(e) => set('essay_min_words', Number(e.target.value))}
          className={inputCls + ' mt-1 w-32'} />
      </label>
      <p className="text-[11px] font-medium text-slate-500">Essay responses require manual review and grading by an administrator.</p>
    </div>
  );
}

// ── Main editor shell ─────────────────────────────────────────────────────────
export default function QuestionEditor({ question: q, index, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast, sectionNames = [], onMoveToSection }) {
  const set = (key, value) => onChange({ ...q, [key]: value });
  const typeLabel = QUESTION_TYPES.find((t) => t.value === q.type)?.label || q.type;

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all space-y-4">
      {/* ── Top Horizontal Header Bar: Question Number, Type, Points & Actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-xl bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center shadow-2xs flex-shrink-0">
            {index + 1}
          </span>
          <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg">
            {typeLabel}
          </span>
          <div className="flex items-center gap-1.5 ml-1 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Points</span>
            <input
              type="number"
              min="0"
              value={q.points}
              onChange={(e) => set('points', Number(e.target.value))}
              className="w-12 text-center text-xs font-bold text-slate-900 bg-transparent border-none outline-none p-0 focus:ring-0"
            />
          </div>

          {sectionNames.length > 0 && (
            <div className="flex items-center gap-1.5 ml-1 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Section</span>
              <select
                value={q.section || ''}
                onChange={(e) => onMoveToSection?.(e.target.value)}
                className="text-xs font-bold text-slate-900 bg-transparent border-none outline-none p-0 focus:ring-0 cursor-pointer"
              >
                <option value="">Ungrouped</option>
                {sectionNames.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          {/* Reorder Up/Down */}
          <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200/80 rounded-lg p-0.5">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              title="Move question up"
              className="p-1.5 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 transition-all shadow-2xs"
            >
              <HiOutlineChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              title="Move question down"
              className="p-1.5 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 transition-all shadow-2xs"
            >
              <HiOutlineChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Delete Question */}
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg transition-colors"
          >
            <HiOutlineTrash className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* ── Main Content: Prompt, Image, Options, Explanation ── */}
      <div className="space-y-3.5">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Question
          </label>
          <textarea
            value={q.prompt}
            onChange={(e) => set('prompt', e.target.value)}
            rows={2}
            placeholder="Enter the question here..."
            className={inputCls}
          />
        </div>

        <ImageField
          url={q.image_url}
          publicId={q.image_public_id}
          label="Add question image"
          onChange={({ url, publicId }) => onChange({ ...q, image_url: url, image_public_id: publicId })}
        />

        <div className="pt-1">
          {q.type === 'mcq' && <ChoiceOptionsEditor q={q} set={set} />}
          {q.type === 'select_list' && <ChoiceOptionsEditor q={q} set={set} />}
          {q.type === 'multi_response' && <ChoiceOptionsEditor q={q} set={set} multi />}
          {q.type === 'true_false' && <ChoiceOptionsEditor q={q} set={set} locked />}
          {q.type === 'short_answer' && <ShortAnswerEditor q={q} set={set} />}
          {q.type === 'numeric' && <NumericEditor q={q} set={set} />}
          {q.type === 'sequence' && <SequenceEditor q={q} set={set} />}
          {q.type === 'matching' && <MatchingEditor q={q} set={set} />}
          {q.type === 'fill_blank' && <FillBlankEditor q={q} set={set} />}
          {q.type === 'drag_words' && <DragWordsEditor q={q} set={set} />}
          {q.type === 'hotspot' && <HotspotEditor q={q} set={set} />}
          {q.type === 'drag_drop' && <DragDropEditor q={q} set={set} />}
          {q.type === 'likert' && <LikertEditor q={q} set={set} />}
          {q.type === 'essay' && <EssayEditor q={q} set={set} />}
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Explanation (Optional - shown after grading)
          </label>
          <textarea
            ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
            value={q.explanation}
            onChange={(e) => {
              set('explanation', e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            rows={1}
            placeholder="Provide answer rationale or feedback..."
            className={inputCls + ' text-slate-600 bg-slate-50/20 resize-none overflow-hidden'}
          />
        </div>
      </div>
    </div>
  );
}

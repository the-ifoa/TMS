import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePhotograph, HiOutlineX, HiOutlinePlusCircle, HiOutlineTrash,
  HiOutlineChevronUp, HiOutlineChevronDown,
} from 'react-icons/hi';
import { uploadExamImage, deleteExamImage } from '../../api';

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
    _id: uid(), type, prompt: '', image_url: '', image_public_id: '', points: 1, order: 0, explanation: '',
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
        <div className="relative">
          <img src={url} alt="" className="h-16 w-auto rounded-lg border border-primary-200 object-cover" />
          <button type="button" onClick={handleRemove}
            className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-primary-200 p-0.5 hover:bg-red-50">
            <HiOutlineX className="w-3 h-3 text-red-500" />
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-primary-300 text-xs text-primary-500 hover:bg-primary-50">
          <HiOutlinePhotograph className="w-4 h-4" /> {busy ? 'Uploading…' : label}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

const inputCls = 'w-full px-3 py-1.5 text-sm border border-primary-200 rounded-lg outline-none focus:border-[#0000ff]';
const smallBtn = 'flex items-center gap-1 text-xs font-semibold text-[#0000ff] hover:underline';

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
    <div className="space-y-2">
      {options.map((opt, idx) => (
        <div key={opt._id || idx} className="flex items-center gap-2">
          <input
            type={multi ? 'checkbox' : 'radio'}
            checked={!!opt.is_correct}
            onChange={() => toggleCorrect(idx)}
            title="Mark correct"
          />
          <input
            value={opt.text}
            disabled={locked}
            onChange={(e) => setOptions(options.map((o, i) => (i === idx ? { ...o, text: e.target.value } : o)))}
            placeholder={`Option ${idx + 1}`}
            className={inputCls + (locked ? ' bg-primary-50' : '')}
          />
          <ImageField url={opt.image_url} publicId={opt.image_public_id}
            onChange={({ url, publicId }) => setOptions(options.map((o, i) => (i === idx ? { ...o, image_url: url, image_public_id: publicId } : o)))} />
          {!locked && options.length > 2 && (
            <button type="button" onClick={() => setOptions(options.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {!locked && (
        <button type="button" className={smallBtn} onClick={() => setOptions([...options, { _id: uid(), text: '', is_correct: false }])}>
          <HiOutlinePlusCircle className="w-4 h-4" /> Add option
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
      <p className="text-xs text-primary-400">Accepted answers are shown to the admin as reference — Short Answer always goes to manual review.</p>
      {answers.map((a, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={a} onChange={(e) => setAnswers(answers.map((v, i) => (i === idx ? e.target.value : v)))}
            placeholder={`Accepted answer ${idx + 1}`} className={inputCls} />
          {answers.length > 1 && (
            <button type="button" onClick={() => setAnswers(answers.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
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
    <div className="flex items-center gap-3">
      <label className="text-xs text-primary-500">Correct value
        <input type="number" value={q.numeric_answer ?? ''} onChange={(e) => set('numeric_answer', e.target.value === '' ? null : Number(e.target.value))}
          className={inputCls + ' mt-1 w-32'} />
      </label>
      <label className="text-xs text-primary-500">± Tolerance
        <input type="number" value={q.numeric_tolerance ?? 0} onChange={(e) => set('numeric_tolerance', Number(e.target.value))}
          className={inputCls + ' mt-1 w-24'} />
      </label>
    </div>
  );
}

function SequenceEditor({ q, set }) {
  const items = q.sequence_items || [];
  const setItems = (next) => set('sequence_items', next);
  return (
    <div className="space-y-2">
      <p className="text-xs text-primary-400">List items in the CORRECT order — they'll be shuffled for the student.</p>
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs font-semibold text-primary-400 w-5">{idx + 1}.</span>
          <input value={it.text} onChange={(e) => setItems(items.map((v, i) => (i === idx ? { ...v, text: e.target.value } : v)))}
            className={inputCls} />
          {items.length > 2 && (
            <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
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
          <span className="text-primary-300">↔</span>
          <input value={p.right} onChange={(e) => setPairs(pairs.map((v, i) => (i === idx ? { ...v, right: e.target.value } : v)))}
            placeholder="Matches with" className={inputCls} />
          {pairs.length > 2 && (
            <button type="button" onClick={() => setPairs(pairs.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
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
      <p className="text-xs text-primary-400">Use <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>… in the text below to mark blanks.</p>
      <textarea value={q.blanks_text} onChange={(e) => set('blanks_text', e.target.value)} rows={2}
        placeholder="The capital of France is {{1}}." className={inputCls} />
      {answers.map((set_, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs font-semibold text-primary-400 w-14">Blank {idx + 1}</span>
          <input value={(set_ || [])[0] || ''} onChange={(e) => setAnswers(answers.map((v, i) => (i === idx ? [e.target.value] : v)))}
            placeholder="Accepted answer" className={inputCls} />
          {answers.length > 1 && (
            <button type="button" onClick={() => setAnswers(answers.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
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
      <p className="text-xs text-primary-400">Use <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>… in the text below to mark drop zones.</p>
      <textarea value={q.drag_words_text} onChange={(e) => set('drag_words_text', e.target.value)} rows={2}
        placeholder="The {{1}} orbits the {{2}}." className={inputCls} />
      <p className="text-xs font-semibold text-primary-600">Correct word per blank</p>
      {answers.map((a, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs font-semibold text-primary-400 w-14">Blank {idx + 1}</span>
          <input value={a} onChange={(e) => set('drag_words_answers', answers.map((v, i) => (i === idx ? e.target.value : v)))} className={inputCls} />
          {answers.length > 1 && (
            <button type="button" onClick={() => set('drag_words_answers', answers.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className={smallBtn} onClick={() => set('drag_words_answers', [...answers, ''])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add blank
      </button>
      <p className="text-xs font-semibold text-primary-600 pt-1">Word bank (correct words + distractors, shown to student)</p>
      {bank.map((w, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={w} onChange={(e) => set('drag_words_bank', bank.map((v, i) => (i === idx ? e.target.value : v)))} className={inputCls} />
          <button type="button" onClick={() => set('drag_words_bank', bank.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
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

  const handleClick = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const w = 15, h = 15;
    onAddDefault({ x: Math.max(0, xPct - w / 2), y: Math.max(0, yPct - h / 2), width: w, height: h });
  };

  if (!imageUrl) return <p className="text-xs text-primary-400">Upload an image above, then click on it to place regions.</p>;

  return (
    <div className="relative inline-block max-w-full" onClick={handleClick}>
      <img ref={imgRef} src={imageUrl} alt="" className="max-w-full max-h-80 rounded-lg border border-primary-200 cursor-crosshair select-none" />
      {regions.map((r, idx) => (
        <div key={idx}
          className={`absolute border-2 ${r.is_correct !== false ? 'border-green-500 bg-green-500/20' : 'border-blue-500 bg-blue-500/20'} flex items-center justify-center text-[10px] font-bold text-white`}
          style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.width}%`, height: `${r.height}%` }}
        >
          {renderRegionLabel ? renderRegionLabel(r, idx) : idx + 1}
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
      <p className="text-xs text-primary-400">Click the image to add a region. Correct regions (green) are the valid click targets for the student.</p>
      <ImageRegionEditor
        imageUrl={q.image_url}
        regions={regions}
        onAddDefault={(r) => setRegions([...regions, { ...r, shape: 'rect', is_correct: true }])}
      />
      {regions.map((r, idx) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <span className="w-4">{idx + 1}.</span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={r.is_correct} onChange={() => setRegions(regions.map((v, i) => (i === idx ? { ...v, is_correct: !v.is_correct } : v)))} />
            Correct
          </label>
          <button type="button" onClick={() => setRegions(regions.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
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
      <p className="text-xs text-primary-400">Click the image to add a drop-target zone, then name it. Add draggable items and pick which zone each belongs in.</p>
      <ImageRegionEditor
        imageUrl={q.image_url}
        regions={targets}
        renderRegionLabel={(r) => r.label || '?'}
        onAddDefault={(r) => setTargets([...targets, { ...r, label: `Zone ${targets.length + 1}` }])}
      />
      {targets.map((t, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={t.label} onChange={(e) => setTargets(targets.map((v, i) => (i === idx ? { ...v, label: e.target.value } : v)))}
            placeholder={`Zone ${idx + 1} label`} className={inputCls} />
          <button type="button" onClick={() => setTargets(targets.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ))}
      <p className="text-xs font-semibold text-primary-600 pt-1">Draggable items</p>
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={it.label} onChange={(e) => setItems(items.map((v, i) => (i === idx ? { ...v, label: e.target.value } : v)))}
            placeholder="Item label" className={inputCls} />
          <select value={it.correct_target_index} onChange={(e) => setItems(items.map((v, i) => (i === idx ? { ...v, correct_target_index: Number(e.target.value) } : v)))}
            className={inputCls + ' w-40'}>
            {targets.map((t, ti) => <option key={ti} value={ti}>{t.label || `Zone ${ti + 1}`}</option>)}
          </select>
          <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
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
      <p className="text-xs text-primary-400">Survey type — not auto-scored.</p>
      <p className="text-xs font-semibold text-primary-600">Statements</p>
      {statements.map((s, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input value={s} onChange={(e) => set('likert_statements', statements.map((v, i) => (i === idx ? e.target.value : v)))} className={inputCls} />
          <button type="button" onClick={() => set('likert_statements', statements.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" className={smallBtn} onClick={() => set('likert_statements', [...statements, ''])}>
        <HiOutlinePlusCircle className="w-4 h-4" /> Add statement
      </button>
      <p className="text-xs font-semibold text-primary-600 pt-1">Scale labels (low → high)</p>
      <input value={labels.join(', ')} onChange={(e) => set('likert_scale_labels', e.target.value.split(',').map((s) => s.trim()))}
        className={inputCls} placeholder="Strongly Disagree, Disagree, Neutral, Agree, Strongly Agree" />
    </div>
  );
}

function EssayEditor({ q, set }) {
  return (
    <label className="text-xs text-primary-500">Minimum word count (optional)
      <input type="number" min="0" value={q.essay_min_words || 0} onChange={(e) => set('essay_min_words', Number(e.target.value))}
        className={inputCls + ' mt-1 w-32'} />
      <p className="text-xs text-primary-400 mt-1">Essay always goes to manual review.</p>
    </label>
  );
}

// ── Main editor shell ─────────────────────────────────────────────────────────
export default function QuestionEditor({ question: q, index, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const set = (key, value) => onChange({ ...q, [key]: value });
  const typeLabel = QUESTION_TYPES.find((t) => t.value === q.type)?.label || q.type;

  return (
    <div className="bg-white border border-primary-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4">
      {/* Left column — question number + meta controls */}
      <div className="flex sm:flex-col items-center sm:items-stretch gap-3 sm:w-36 flex-shrink-0 sm:border-r sm:border-primary-100 sm:pr-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-blue-50 text-[#0000ff] text-xs font-bold flex items-center justify-center flex-shrink-0">{index + 1}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary-400 sm:hidden">{typeLabel}</span>
        </div>
        <span className="hidden sm:block text-[11px] font-semibold uppercase tracking-wide text-primary-400">{typeLabel}</span>
        <label className="text-xs text-primary-500 flex items-center gap-1.5">Points
          <input type="number" min="0" value={q.points} onChange={(e) => set('points', Number(e.target.value))}
            className="w-14 px-1.5 py-1 text-xs border border-primary-200 rounded-lg outline-none focus:border-[#0000ff]" />
        </label>
        <div className="flex items-center gap-1 ml-auto sm:ml-0">
          <span className="text-[11px] font-medium text-primary-400 hidden sm:block mr-1">Reorder</span>
          <button type="button" onClick={onMoveUp} disabled={isFirst} title="Move up"
            className="p-1 rounded-md border border-primary-200 text-primary-500 hover:bg-primary-50 disabled:opacity-30 disabled:hover:bg-transparent">
            <HiOutlineChevronUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={isLast} title="Move down"
            className="p-1 rounded-md border border-primary-200 text-primary-500 hover:bg-primary-50 disabled:opacity-30 disabled:hover:bg-transparent">
            <HiOutlineChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <button type="button" onClick={onDelete}
          className="flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-600 sm:mt-auto ml-auto sm:ml-0">
          <HiOutlineTrash className="w-4 h-4" /> Delete
        </button>
      </div>

      {/* Right column — prompt, image, type-specific editor, explanation */}
      <div className="flex-1 min-w-0 space-y-3">
        <textarea value={q.prompt} onChange={(e) => set('prompt', e.target.value)} rows={2}
          placeholder="Question prompt" className={inputCls} />

        <ImageField url={q.image_url} publicId={q.image_public_id} label="Add question image"
          onChange={({ url, publicId }) => onChange({ ...q, image_url: url, image_public_id: publicId })} />

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

        <textarea value={q.explanation} onChange={(e) => set('explanation', e.target.value)} rows={1}
          placeholder="Explanation shown after grading (optional)" className={inputCls + ' text-primary-400'} />
      </div>
    </div>
  );
}

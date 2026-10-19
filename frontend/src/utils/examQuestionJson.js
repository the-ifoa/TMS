import { createEmptyQuestion } from '../components/examQuestions/QuestionEditor';

// ─── Exam questions as JSON: template + importer ──────────────────────────────
// A simple, hand-writable format for bulk-adding questions to an exam. The
// template below has one example of every question type; parseQuestionsJson()
// checks a file in this format and turns each question into the editor's own
// shape (createEmptyQuestion), ready to add to the exam. Images are never part
// of the file — they are uploaded in the editor afterwards.
//
// Keys starting with "_" (like "_note") are ignored, so the template can
// explain itself inline.

export const JSON_FORMAT = 'ifoa-exam-questions';

export const QUESTION_JSON_TEMPLATE = {
  format: JSON_FORMAT,
  version: 1,
  _instructions: [
    'Keep one object per question inside "questions". Delete the examples you do not need.',
    'Every question needs "type" and "question". "section", "points", "time_limit_seconds" and "explanation" are optional.',
    'For choice questions, "correct" is the option letter (A, B, C…) or the exact option text.',
    'Images cannot be imported. Upload them in the editor after importing (needed for hotspot and drag_drop).',
    'Keys that start with "_" are notes and are ignored.',
  ],
  questions: [
    {
      type: 'mcq',
      _note: 'Multiple choice: one correct option.',
      section: 'Theory',
      points: 1,
      time_limit_seconds: 60,
      question: 'Which gas makes up the majority of Earth\'s atmosphere?',
      options: ['Nitrogen', 'Oxygen', 'Carbon dioxide', 'Argon'],
      correct: 'A',
      explanation: 'Nitrogen makes up about 78% of the atmosphere.',
    },
    {
      type: 'multi_response',
      _note: 'Multiple response: list every correct option.',
      section: 'Theory',
      points: 2,
      question: 'Which of these are forbidden in the passenger cabin?',
      options: ['Spare lithium batteries over 160 Wh', 'Laptop', 'Flammable gas cylinders', 'Hand sanitiser under 100 ml'],
      correct: ['A', 'C'],
      explanation: 'Large lithium batteries and flammable gases are forbidden.',
    },
    {
      type: 'true_false',
      question: 'Spare lithium batteries may be carried in checked baggage.',
      correct: false,
      explanation: 'Spare lithium batteries must be carried in the cabin.',
    },
    {
      type: 'short_answer',
      _note: 'Marked by hand; accepted_answers guide the marker (not case-sensitive).',
      question: 'What is the chemical symbol for nitrogen?',
      accepted_answers: ['N', 'N2'],
      explanation: 'N is the element; N2 is the gas.',
    },
    {
      type: 'numeric',
      _note: 'Any number between answer − tolerance and answer + tolerance is correct.',
      question: 'Standard sea-level pressure in hPa?',
      answer: 1013,
      tolerance: 2,
      explanation: 'ISA sea-level pressure is 1013.25 hPa.',
    },
    {
      type: 'sequence',
      _note: 'List the items in the CORRECT order; candidates see them shuffled.',
      question: 'Put the pre-flight steps in order.',
      items_in_correct_order: ['Check weather', 'File flight plan', 'Load fuel', 'Board passengers'],
    },
    {
      type: 'matching',
      question: 'Match each hazard class with its name.',
      pairs: [
        { left: 'Class 1', right: 'Explosives' },
        { left: 'Class 3', right: 'Flammable liquids' },
        { left: 'Class 8', right: 'Corrosives' },
      ],
    },
    {
      type: 'fill_blank',
      _note: 'Mark each blank as {{1}}, {{2}}… in "text". "blanks" lists the accepted answers for each one, in order.',
      question: 'Complete the sentence.',
      text: 'The capital of France is {{1}} and it lies on the river {{2}}.',
      blanks: [['Paris'], ['Seine', 'The Seine']],
    },
    {
      type: 'select_list',
      _note: 'Candidate picks one answer from a drop-down.',
      question: 'Choose the correct phonetic letter for "D".',
      options: ['Delta', 'Dog', 'Dixie'],
      correct: 'Delta',
    },
    {
      type: 'drag_words',
      _note: 'Mark each gap as {{1}}, {{2}}… "answers" are the correct words in order; "distractors" are extra wrong words.',
      question: 'Drag the words into the gaps.',
      text: 'An aircraft turns using its {{1}} and climbs using its {{2}}.',
      answers: ['ailerons', 'elevator'],
      distractors: ['rudder', 'flaps'],
    },
    {
      type: 'hotspot',
      _note: 'Upload the image in the editor after importing. Regions are % of the image (0–100); you can also leave them out and draw them in the editor.',
      question: 'Click the fire extinguisher.',
      regions: [{ shape: 'rect', x: 40, y: 55, width: 12, height: 20, correct: true }],
    },
    {
      type: 'drag_drop',
      _note: 'Upload the image in the editor after importing, then position the targets. Each item names the target it belongs on.',
      question: 'Drag each label onto the correct part of the aircraft.',
      targets: ['Wing', 'Tail', 'Cockpit'],
      items: [
        { label: 'Aileron', target: 'Wing' },
        { label: 'Rudder', target: 'Tail' },
        { label: 'Yoke', target: 'Cockpit' },
      ],
    },
    {
      type: 'likert',
      _note: 'Survey only, not scored.',
      question: 'How much do you agree with each statement?',
      statements: ['The course was well organised.', 'The instructor was clear.'],
      scale_labels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
    },
    {
      type: 'essay',
      _note: 'Marked by hand.',
      points: 10,
      question: 'Describe the steps you would take after a dangerous goods spill on board.',
      min_words: 100,
      explanation: 'Look for: isolate, inform the captain, use the spill kit, document.',
    },
  ],
};

export const templateJsonText = () => JSON.stringify(QUESTION_JSON_TEMPLATE, null, 2);

// ── Parsing ───────────────────────────────────────────────────────────────────
const uid = () => `new-${Math.random().toString(36).slice(2, 10)}`;
const TYPE_ALIASES = {
  multiple_choice: 'mcq', 'multiple choice': 'mcq', mcq: 'mcq', single_choice: 'mcq',
  multiple_response: 'multi_response', multi_response: 'multi_response', 'multiple response': 'multi_response', checkbox: 'multi_response',
  true_false: 'true_false', 'true/false': 'true_false', truefalse: 'true_false', boolean: 'true_false',
  short_answer: 'short_answer', 'short answer': 'short_answer', text: 'short_answer',
  numeric: 'numeric', number: 'numeric',
  sequence: 'sequence', ordering: 'sequence', order: 'sequence',
  matching: 'matching', match: 'matching',
  fill_blank: 'fill_blank', fill_in_the_blanks: 'fill_blank', 'fill in the blanks': 'fill_blank', fill_blanks: 'fill_blank',
  select_list: 'select_list', 'select from lists': 'select_list', dropdown: 'select_list',
  drag_words: 'drag_words', 'drag the words': 'drag_words',
  hotspot: 'hotspot',
  drag_drop: 'drag_drop', 'drag and drop': 'drag_drop', dragdrop: 'drag_drop',
  likert: 'likert', 'likert scale': 'likert',
  essay: 'essay',
};
const str = (v) => (v == null ? '' : String(v)).trim();
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const placeholders = (text) => [...new Set((String(text).match(/\{\{\s*(\d+)\s*\}\}/g) || []).map((m) => Number(m.replace(/\D/g, ''))))].sort((a, b) => a - b);

// Options may be ["A text", …] or [{ text, correct }, …].
function readOptions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => (o && typeof o === 'object'
    ? { text: str(o.text ?? o.label), is_correct: o.correct === true || o.is_correct === true }
    : { text: str(o), is_correct: false }));
}

// "A" / "b" / exact option text → option index, or -1.
function resolveChoice(ref, options) {
  if (typeof ref === 'number') return -2; // numbers are ambiguous (0- or 1-based) — reject
  const s = str(ref);
  if (/^[A-Za-z]$/.test(s)) {
    const i = s.toUpperCase().charCodeAt(0) - 65;
    return i < options.length ? i : -1;
  }
  return options.findIndex((o) => o.text.toLowerCase() === s.toLowerCase());
}

function markCorrect(options, refs, errors) {
  const list = Array.isArray(refs) ? refs : [refs];
  list.forEach((ref) => {
    const i = resolveChoice(ref, options);
    if (i === -2) errors.push(`"correct" ${ref} is a number — use the option letter (A, B…) or the option text.`);
    else if (i < 0) errors.push(`"correct" value "${ref}" doesn't match any option.`);
    else options[i].is_correct = true;
  });
}

// One question from the file → { question, errors, warnings }.
function convert(raw, index, defaults) {
  const errors = [];
  const warnings = [];
  const label = `Question ${index + 1}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: [`${label}: not an object.`], warnings };

  const type = TYPE_ALIASES[str(raw.type).toLowerCase()];
  if (!type) return { errors: [`${label}: unknown type "${str(raw.type) || '(missing)'}".`], warnings };

  const q = createEmptyQuestion(type);
  q.prompt = str(raw.question ?? raw.prompt);
  q.explanation = str(raw.explanation);
  q.section = str(raw.section ?? defaults.section);
  const points = num(raw.points);
  q.points = points != null && points >= 0 ? points : (type === 'likert' ? 0 : 1);
  if (points != null && points < 0) warnings.push('negative points ignored, set to 1');
  const t = num(raw.time_limit_seconds ?? raw.time_seconds);
  q.time_limit_seconds = t != null && t > 0 ? t : null;
  if (!q.prompt) errors.push('missing "question" text');

  switch (type) {
    case 'mcq':
    case 'select_list':
    case 'multi_response': {
      const options = readOptions(raw.options);
      if (options.length < 2) errors.push('needs at least two "options"');
      if (options.some((o) => !o.text)) errors.push('an option is empty');
      if (raw.correct != null) markCorrect(options, raw.correct, errors);
      const n = options.filter((o) => o.is_correct).length;
      if (!n) errors.push('no correct option — set "correct"');
      else if (type !== 'multi_response' && n > 1) errors.push('only one option can be correct for this type');
      q.options = options.map((o) => ({ _id: uid(), ...o }));
      break;
    }
    case 'true_false': {
      const c = raw.correct;
      const truth = c === true || /^(true|t|yes)$/i.test(str(c)) ? true : c === false || /^(false|f|no)$/i.test(str(c)) ? false : null;
      if (truth == null) errors.push('"correct" must be true or false');
      q.options = [{ _id: uid(), text: 'True', is_correct: truth === true }, { _id: uid(), text: 'False', is_correct: truth === false }];
      break;
    }
    case 'short_answer': {
      const acc = (Array.isArray(raw.accepted_answers) ? raw.accepted_answers : raw.accepted_answers != null ? [raw.accepted_answers] : raw.correct != null ? [].concat(raw.correct) : []).map(str).filter(Boolean);
      q.correct_text = acc.length ? acc : [''];
      if (!acc.length) warnings.push('no accepted_answers — it will be marked by hand only');
      break;
    }
    case 'numeric': {
      const a = num(raw.answer ?? raw.correct);
      if (a == null) errors.push('"answer" must be a number');
      q.numeric_answer = a;
      q.numeric_tolerance = Math.max(0, num(raw.tolerance) ?? 0);
      break;
    }
    case 'sequence': {
      const items = (raw.items_in_correct_order || raw.items || []).map(str).filter(Boolean);
      if (items.length < 2) errors.push('needs at least two items in "items_in_correct_order"');
      q.sequence_items = items.map((text) => ({ text, image_url: '' }));
      break;
    }
    case 'matching': {
      const pairs = (raw.pairs || []).map((p) => ({ left: str(p?.left), right: str(p?.right) }));
      if (!pairs.length) errors.push('needs "pairs"');
      if (pairs.some((p) => !p.left || !p.right)) errors.push('every pair needs "left" and "right"');
      q.matching_pairs = pairs;
      break;
    }
    case 'fill_blank': {
      q.blanks_text = String(raw.text ?? '');
      const sets = (raw.blanks || []).map((b) => (Array.isArray(b) ? b : [b]).map(str).filter(Boolean));
      const marks = placeholders(q.blanks_text);
      if (!q.blanks_text.trim()) errors.push('missing "text" with {{1}}, {{2}}… gaps');
      else if (!marks.length) errors.push('"text" has no {{1}} gaps');
      else if (marks.length !== sets.length || marks[marks.length - 1] !== marks.length) errors.push(`"text" has ${marks.length} gap(s) numbered from {{1}}, but "blanks" has ${sets.length} answer set(s)`);
      if (sets.some((s) => !s.length)) errors.push('a blank has no accepted answer');
      q.blanks_answers = sets.length ? sets : [['']];
      break;
    }
    case 'drag_words': {
      q.drag_words_text = String(raw.text ?? '');
      const answers = (raw.answers || []).map(str);
      const distractors = (raw.distractors || []).map(str).filter(Boolean);
      const marks = placeholders(q.drag_words_text);
      if (!q.drag_words_text.trim()) errors.push('missing "text" with {{1}}, {{2}}… gaps');
      else if (marks.length !== answers.length) errors.push(`"text" has ${marks.length} gap(s) but "answers" has ${answers.length} word(s)`);
      if (answers.some((a) => !a)) errors.push('an answer word is empty');
      q.drag_words_answers = answers;
      q.drag_words_bank = [...answers, ...distractors];
      break;
    }
    case 'hotspot': {
      const regions = (raw.regions || []).map((r) => ({
        shape: r?.shape === 'circle' ? 'circle' : 'rect',
        x: num(r?.x) ?? 0, y: num(r?.y) ?? 0, width: num(r?.width) ?? 10, height: num(r?.height) ?? 10,
        is_correct: r?.correct === true || r?.is_correct === true,
      }));
      q.hotspot_regions = regions;
      warnings.push('upload the image in the editor');
      if (!regions.some((r) => r.is_correct)) warnings.push('mark the correct region in the editor before saving');
      break;
    }
    case 'drag_drop': {
      const rawTargets = raw.targets || [];
      const targets = rawTargets.map((tg, i) => {
        const o = tg && typeof tg === 'object' ? tg : { label: tg };
        // Without coordinates, lay targets out in a row so they're visible to drag around.
        return {
          label: str(o.label),
          x: num(o.x) ?? 5 + (i % 4) * 24, y: num(o.y) ?? 10 + Math.floor(i / 4) * 25,
          width: num(o.width) ?? 20, height: num(o.height) ?? 15,
        };
      });
      const items = (raw.items || []).map((it) => {
        const ref = it?.target;
        let idx = typeof ref === 'number' ? ref - 1 : targets.findIndex((tg) => tg.label.toLowerCase() === str(ref).toLowerCase());
        if (!(idx >= 0 && idx < targets.length)) { errors.push(`item "${str(it?.label)}" points to an unknown target "${str(ref)}"`); idx = 0; }
        return { label: str(it?.label), correct_target_index: idx };
      });
      if (!targets.length) errors.push('needs "targets"');
      if (!items.length) errors.push('needs "items"');
      if (new Set(items.map((i) => i.label)).size !== items.length) errors.push('two items share the same label');
      q.dragdrop_targets = targets;
      q.dragdrop_items = items;
      warnings.push('upload the image and position the targets in the editor');
      break;
    }
    case 'likert': {
      const statements = (raw.statements || []).map(str).filter(Boolean);
      if (!statements.length) errors.push('needs "statements"');
      q.likert_statements = statements;
      const labels = (raw.scale_labels || []).map(str).filter(Boolean);
      if (labels.length) q.likert_scale_labels = labels;
      break;
    }
    case 'essay':
      q.essay_min_words = Math.max(0, num(raw.min_words) ?? 0);
      break;
    default:
      break;
  }

  const sentence = (m) => `${label}: ${m.replace(/\.+$/, '')}.`;
  return { question: q, errors: errors.map(sentence), warnings: warnings.map(sentence) };
}

// Parses the whole file. Accepts the template object or a bare array of questions.
// Returns { items: [{ index, question?, errors, warnings, raw }], fatal? }.
export function parseQuestionsJson(text, defaults = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { items: [], fatal: `This isn't valid JSON: ${err.message}` };
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.questions) ? data.questions : null;
  if (!list) return { items: [], fatal: 'Expected a "questions" list (or an array of questions).' };
  if (!list.length) return { items: [], fatal: 'The "questions" list is empty.' };
  if (list.length > 500) return { items: [], fatal: 'At most 500 questions can be imported at once.' };
  return { items: list.map((raw, i) => ({ index: i, raw, ...convert(raw, i, defaults) })) };
}

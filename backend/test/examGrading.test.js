// Exam marking: every auto-graded question type, scoring with and without
// section weights, answer-key checks and what a candidate is allowed to see.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  gradeAnswer, computeAttemptScore, answerKeyProblems, sanitizeQuestionForTaking, buildProgress, buildFeedback,
} = require('../services/examGrading');

const choice = (type, correct = ['a']) => ({
  _id: 'q1', type, points: 2,
  options: ['a', 'b', 'c'].map((id) => ({ _id: id, text: id.toUpperCase(), is_correct: correct.includes(id) })),
});

test('mcq / true_false / select_list: one right option', () => {
  for (const type of ['mcq', 'true_false', 'select_list']) {
    assert.deepEqual(gradeAnswer(choice(type), 'a'), { is_correct: true, points_awarded: 2, needs_manual_grading: false });
    assert.equal(gradeAnswer(choice(type), 'b').points_awarded, 0);
    assert.equal(gradeAnswer(choice(type), undefined).is_correct, false);
  }
  // no key at all → nobody can be right
  assert.equal(gradeAnswer(choice('mcq', []), 'a').is_correct, false);
});

test('multi_response: all the right options and none of the wrong ones', () => {
  const q = choice('multi_response', ['a', 'c']);
  assert.equal(gradeAnswer(q, ['c', 'a']).is_correct, true);
  assert.equal(gradeAnswer(q, ['a', 'a', 'c']).is_correct, true, 'duplicates ignored');
  assert.equal(gradeAnswer(q, ['a']).is_correct, false);
  assert.equal(gradeAnswer(q, ['a', 'b', 'c']).is_correct, false);
  assert.equal(gradeAnswer(q, 'a').is_correct, false, 'not an array');
});

test('numeric: tolerance, and a blank answer never matches a key of 0', () => {
  const q = { type: 'numeric', points: 1, numeric_answer: 10, numeric_tolerance: 0.5 };
  assert.equal(gradeAnswer(q, '10.4').is_correct, true);
  assert.equal(gradeAnswer(q, 10.6).is_correct, false);
  const zero = { type: 'numeric', points: 1, numeric_answer: 0 };
  assert.equal(gradeAnswer(zero, 0).is_correct, true);
  assert.equal(gradeAnswer(zero, '').is_correct, false);
  assert.equal(gradeAnswer(zero, null).is_correct, false);
  assert.equal(gradeAnswer({ type: 'numeric', points: 1, numeric_answer: null }, 5).is_correct, false);
});

test('sequence: original indexes in order', () => {
  const q = { type: 'sequence', points: 3, sequence_items: [{ text: 'x' }, { text: 'y' }, { text: 'z' }] };
  assert.equal(gradeAnswer(q, [0, 1, 2]).points_awarded, 3);
  assert.equal(gradeAnswer(q, ['0', '1', '2']).is_correct, true);
  assert.equal(gradeAnswer(q, [1, 0, 2]).is_correct, false);
  assert.equal(gradeAnswer(q, [0, 1]).is_correct, false);
});

test('matching: right side per left item, case and spaces ignored', () => {
  const q = { type: 'matching', points: 1, matching_pairs: [{ left: 'METAR', right: 'Weather report' }, { left: 'NOTAM', right: 'Notice' }] };
  assert.equal(gradeAnswer(q, ['weather  report', ' NOTICE ']).is_correct, true);
  assert.equal(gradeAnswer(q, ['Weather report', '']).is_correct, false);
  assert.equal(gradeAnswer(q, ['Notice', 'Weather report']).is_correct, false);
});

test('fill_blank: any accepted answer per blank', () => {
  const q = { type: 'fill_blank', points: 1, blanks_answers: [['FL350', 'flight level 350'], ['Mach 0.78']] };
  assert.equal(gradeAnswer(q, ['Flight Level 350', 'mach 0.78']).is_correct, true);
  assert.equal(gradeAnswer(q, ['FL350']).is_correct, false);
  assert.equal(gradeAnswer(q, ['', 'Mach 0.78']).is_correct, false);
});

test('drag_words: each blank its own word', () => {
  const q = { type: 'drag_words', points: 1, drag_words_answers: ['lift', 'drag'] };
  assert.equal(gradeAnswer(q, ['Lift', 'DRAG']).is_correct, true);
  assert.equal(gradeAnswer(q, ['drag', 'lift']).is_correct, false);
});

test('hotspot: point inside a correct rectangle or ellipse', () => {
  const q = {
    type: 'hotspot', points: 1,
    hotspot_regions: [
      { shape: 'rect', x: 10, y: 10, width: 20, height: 20, is_correct: true },
      { shape: 'circle', x: 60, y: 60, width: 20, height: 10, is_correct: true },
      { shape: 'rect', x: 0, y: 80, width: 20, height: 20, is_correct: false },
    ],
  };
  assert.equal(gradeAnswer(q, { x: 15, y: 25 }).is_correct, true);
  assert.equal(gradeAnswer(q, { x: 70, y: 65 }).is_correct, true, 'centre of the ellipse');
  assert.equal(gradeAnswer(q, { x: 61, y: 61 }).is_correct, false, 'box corner is outside the ellipse');
  assert.equal(gradeAnswer(q, { x: 5, y: 90 }).is_correct, false, 'wrong region');
  assert.equal(gradeAnswer(q, null).is_correct, false);
});

test('drag_drop: partial credit, rounded', () => {
  const q = {
    type: 'drag_drop', points: 3,
    dragdrop_targets: [{ label: 'T1' }, { label: 'T2' }],
    dragdrop_items: [{ label: 'A', correct_target_index: 0 }, { label: 'B', correct_target_index: 1 }, { label: 'C', correct_target_index: 1 }],
  };
  assert.deepEqual(gradeAnswer(q, [{ item_label: 'A', target_index: 0 }, { item_label: 'B', target_index: '1' }, { item_label: 'C', target_index: 1 }]),
    { is_correct: true, points_awarded: 3, needs_manual_grading: false });
  assert.deepEqual(gradeAnswer(q, [{ item_label: 'A', target_index: 0 }, { item_label: 'B', target_index: 0 }]),
    { is_correct: false, points_awarded: 1, needs_manual_grading: false });
});

test('essay / short answer go to a human; likert is unscored', () => {
  assert.deepEqual(gradeAnswer({ type: 'essay', points: 5 }, 'text'), { is_correct: null, points_awarded: null, needs_manual_grading: true });
  assert.equal(gradeAnswer({ type: 'short_answer', points: 1 }, 'x').needs_manual_grading, true);
  assert.deepEqual(gradeAnswer({ type: 'likert', points: 1 }, [3]), { is_correct: null, points_awarded: 0, needs_manual_grading: false });
  assert.equal(gradeAnswer({ type: 'unknown', points: 1 }, 'x').points_awarded, 0);
});

test('score: flat sum of points, likert excluded, first answer per question counts', () => {
  const qs = [
    { _id: 'a', type: 'mcq', points: 2 },
    { _id: 'b', type: 'mcq', points: 3 },
    { _id: 'c', type: 'likert', points: 9 },
  ];
  const answers = [
    { question_id: 'a', points_awarded: 2 },
    { question_id: 'a', points_awarded: 0 }, // duplicate — ignored
    { question_id: 'c', points_awarded: 9 },
  ];
  assert.deepEqual(computeAttemptScore(qs, answers), { score: 2, maxScore: 5, percentage: 40 });
  assert.deepEqual(computeAttemptScore([], []), { score: 0, maxScore: 0, percentage: 0 });
});

test('score: section weights only apply when every used section has one', () => {
  const qs = [
    { _id: 'a', type: 'mcq', points: 9, section: 'Theory' },
    { _id: 'b', type: 'mcq', points: 1, section: 'Practical' },
  ];
  const answers = [{ question_id: 'a', points_awarded: 9 }, { question_id: 'b', points_awarded: 0 }];
  // Flat: 9/10 = 90 %.
  assert.equal(computeAttemptScore(qs, answers).percentage, 90);
  // Practical weighted 3× Theory: (100×1 + 0×3) / 4 = 25 %.
  assert.equal(computeAttemptScore(qs, answers, [{ name: 'Theory', weight: 1 }, { name: 'Practical', weight: 3 }]).percentage, 25);
  // One section without a weight → falls back to flat.
  assert.equal(computeAttemptScore(qs, answers, [{ name: 'Theory', weight: 1 }]).percentage, 90);
});

test('answer-key problems are reported per question', () => {
  const problems = answerKeyProblems([
    choice('mcq', []),
    { type: 'numeric', points: 1, numeric_answer: null },
    { type: 'sequence', points: 1, sequence_items: [{ text: 'only one' }] },
    { type: 'matching', points: 1, matching_pairs: [{ left: 'x', right: '' }] },
    { type: 'drag_drop', points: 1, dragdrop_targets: [{}], dragdrop_items: [{ label: 'A', correct_target_index: 0 }, { label: 'A', correct_target_index: 0 }] },
    { type: 'essay', points: 5 },
    choice('mcq'),
    { ...choice('mcq'), points: -1, section: 'S' },
  ]);
  assert.equal(problems.length, 6);
  assert.match(problems[0], /^Question 1: no option is marked as correct/);
  assert.match(problems[4], /two items share the same label/);
  assert.match(problems[5], /^Question 8 \(S\): points must be 0 or more/);
});

test('a question sent to a candidate never carries its answer', () => {
  const sent = [
    sanitizeQuestionForTaking(choice('mcq')),
    sanitizeQuestionForTaking({ _id: 'n', type: 'numeric', points: 1, numeric_answer: 42, numeric_tolerance: 1 }),
    sanitizeQuestionForTaking({ _id: 'm', type: 'matching', points: 1, matching_pairs: [{ left: 'L', right: 'R' }] }),
    sanitizeQuestionForTaking({ _id: 'f', type: 'fill_blank', points: 1, blanks_text: 'a __ b', blanks_answers: [['x']] }),
    sanitizeQuestionForTaking({ _id: 'h', type: 'hotspot', points: 1, hotspot_regions: [{ shape: 'rect', x: 1, y: 1, width: 1, height: 1, is_correct: true }] }),
    sanitizeQuestionForTaking({ _id: 'd', type: 'drag_drop', points: 1, dragdrop_targets: [{ label: 'T' }], dragdrop_items: [{ label: 'A', correct_target_index: 0 }] }),
  ];
  const json = JSON.stringify(sent);
  for (const secret of ['is_correct', 'numeric_answer', 'numeric_tolerance', 'blanks_answers', 'correct_target_index', '"right"']) {
    assert.ok(!json.includes(secret), `leaked ${secret}`);
  }
  // sequence items are shuffled but keep their original index
  const seq = sanitizeQuestionForTaking({ _id: 's', type: 'sequence', points: 1, sequence_items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] });
  assert.deepEqual(seq.sequence_items.map((i) => i._idx).sort(), [0, 1, 2]);
});

test('instant feedback: running score and the correct answer text', () => {
  const qs = [choice('mcq'), { _id: 'q2', type: 'essay', points: 5 }, { _id: 'q3', type: 'numeric', points: 1, numeric_answer: 3 }];
  const p = buildProgress(qs, [
    { question_id: 'q1', locked: true, is_correct: true, points_awarded: 2 },
    { question_id: 'q2', locked: true },
    { question_id: 'q3', locked: true, is_correct: false, points_awarded: 0 },
    { question_id: 'q3', locked: false },
  ]);
  assert.deepEqual(p, { score: 2, max: 3, checked: 3, correct: 1, incorrect: 1, percentage: 66.7 });
  const fb = buildFeedback(choice('multi_response', ['a', 'c']), { is_correct: false, points_awarded: 0 });
  assert.equal(fb.correct_answer, 'A; C');
  assert.equal(fb.max_points, 2);
});

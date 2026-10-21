// Re-marking: which question edits change how answers are marked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { changedKeyQuestionIds, changedContentQuestionIds, keySignature } = require('../services/examRemark');

const mcq = (over = {}) => ({
  _id: 'q1', type: 'mcq', points: 1, prompt: 'Which?',
  options: [{ _id: 'a', text: 'A', is_correct: true }, { _id: 'b', text: 'B', is_correct: false }],
  ...over,
});

test('a new correct option or new points is a key change', () => {
  const flipped = mcq({ options: [{ _id: 'a', text: 'A', is_correct: false }, { _id: 'b', text: 'B', is_correct: true }] });
  assert.deepEqual(changedKeyQuestionIds([mcq()], [flipped]), ['q1']);
  assert.deepEqual(changedKeyQuestionIds([mcq()], [mcq({ points: 2 })]), ['q1']);
});

test('rewording is not a key change, but is a content change', () => {
  const reworded = mcq({ prompt: 'Which one?', options: [{ _id: 'a', text: 'Alpha', is_correct: true }, { _id: 'b', text: 'B', is_correct: false }] });
  assert.deepEqual(changedKeyQuestionIds([mcq()], [reworded]), []);
  assert.ok(changedContentQuestionIds([mcq()], [reworded]).includes('q1'));
});

test('new questions are not re-marked; key fields of other types count', () => {
  assert.deepEqual(changedKeyQuestionIds([], [mcq()]), []);
  const num = { _id: 'n', type: 'numeric', points: 1, numeric_answer: 5, numeric_tolerance: 0 };
  assert.deepEqual(changedKeyQuestionIds([num], [{ ...num, numeric_tolerance: 1 }]), ['n']);
  assert.equal(keySignature(num), keySignature({ ...num, prompt: 'changed' }));
});

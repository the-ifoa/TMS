// Random question draw and attempt deadlines (no database needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSnapshot, drawnQuestionCount, attemptDeadlineMs, submittedRefusal } = require('../services/examAttemptFlow');

const exam = (draws = {}, shuffle = false) => ({
  shuffle_questions: shuffle,
  questions: [
    ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => ({ _id: id, section: 'Air Law' })),
    ...['m1', 'm2', 'm3'].map((id) => ({ _id: id, section: 'Met' })),
    ...['u1', 'u2'].map((id) => ({ _id: id })),
  ],
  section_settings: Object.entries(draws).map(([name, draw_count]) => ({ name, draw_count })),
});
const ids = (qs) => qs.map((q) => q._id);

test('no draw: everyone gets every question, in order', () => {
  assert.deepEqual(ids(buildSnapshot(exam())), ['a1', 'a2', 'a3', 'a4', 'a5', 'm1', 'm2', 'm3', 'u1', 'u2']);
  assert.equal(drawnQuestionCount(exam()), 10);
});

test('draw per section, ungrouped bucket included, exam order kept', () => {
  const e = exam({ 'Air Law': 2, '': 1 });
  for (let i = 0; i < 25; i += 1) {
    const got = ids(buildSnapshot(e));
    assert.equal(got.filter((x) => x.startsWith('a')).length, 2);
    assert.deepEqual(got.filter((x) => x.startsWith('m')), ['m1', 'm2', 'm3'], 'Met has no draw → all');
    assert.equal(got.filter((x) => x.startsWith('u')).length, 1);
    const order = got.map((x) => ids(e.questions).indexOf(x));
    assert.deepEqual(order, [...order].sort((p, q) => p - q), 'picked questions keep the exam order');
  }
  assert.equal(drawnQuestionCount(e), 6);
});

test('candidates really get different selections', () => {
  const e = exam({ 'Air Law': 2 });
  const seen = new Set(Array.from({ length: 40 }, () => ids(buildSnapshot(e)).filter((x) => x.startsWith('a')).join()));
  assert.ok(seen.size > 3);
});

test('a count at or above the section size means all of it', () => {
  assert.equal(drawnQuestionCount(exam({ Met: 9 })), 10);
  assert.equal(buildSnapshot(exam({ Met: 9 })).length, 10);
  assert.equal(drawnQuestionCount(exam({ Met: 0 })), 10, '0 / blank = no draw');
});

test('shuffle still applies to the drawn questions', () => {
  const e = exam({ 'Air Law': 3 }, true);
  const orders = new Set(Array.from({ length: 30 }, () => ids(buildSnapshot(e)).join()));
  assert.ok(orders.size > 1);
  assert.ok([...orders].every((o) => o.split(',').length === 8));
});

test('deadline: duration plus time added from the monitor', () => {
  const started = new Date('2026-10-21T10:00:00Z');
  assert.equal(attemptDeadlineMs({ started_at: started }, 30), started.getTime() + 30 * 60000);
  assert.equal(attemptDeadlineMs({ started_at: started, extra_seconds: 600 }, 30), started.getTime() + 40 * 60000);
  assert.equal(attemptDeadlineMs({ started_at: started, extra_seconds: 600 }, 0), null, 'untimed exam');
});

test('an attempt submitted by staff says so', () => {
  assert.equal(submittedRefusal({ auto_submit_reason: 'admin' }).by_admin, true);
  assert.equal(submittedRefusal({ auto_submit_reason: 'violations' }).by_admin, undefined);
});

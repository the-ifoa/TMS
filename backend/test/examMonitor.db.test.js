// Live monitor end to end: heartbeat, add time, submit for a candidate.
// Needs a throwaway local MongoDB (wiped each run):
//   TEST_MONGODB_URL=mongodb://127.0.0.1:27017/tms_test npm test
const test = require('node:test');
const assert = require('node:assert/strict');

const URL = process.env.TEST_MONGODB_URL;
const local = URL && /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL);
const skip = !URL ? 'set TEST_MONGODB_URL to run' : !local && process.env.TEST_ALLOW_REMOTE_DB !== '1' ? 'TEST_MONGODB_URL must be a local database' : false;

process.env.JWT_SECRET ||= 'test';
const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const flow = require('../services/examAttemptFlow');
const monitor = require('../controllers/exams/monitor');

const mkRes = () => {
  const r = { code: 200 };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const adminReq = (extra) => ({ admin: { id: new mongoose.Types.ObjectId(), role: 'admin' }, query: {}, body: {}, params: {}, ...extra });

test('Live exam monitor with a database', { skip }, async (t) => {
  await mongoose.connect(URL.replace(/\/[^/?]*(\?|$)/, '/tms_monitor_test$1'));
  await mongoose.connection.db.dropDatabase();
  t.after(() => mongoose.disconnect());

  const exam = await Exam.create({
    title: 'Monitor', duration_minutes: 30, status: 'published', lockdown_enabled: true, max_violations: 4,
    questions: ['a', 'b', 'c'].map((p) => ({ type: 'mcq', prompt: p, points: 1, options: [{ text: 'x', is_correct: true }, { text: 'y' }] })),
    section_settings: [{ name: '', draw_count: 2 }],
  });
  const snapshot = flow.buildSnapshot(exam);
  assert.equal(snapshot.length, 2, 'random draw applied');
  const attempt = await ExamAttempt.create({
    exam_id: exam._id, participant_id: new mongoose.Types.ObjectId(), participant_name: 'Priya', questions_snapshot: snapshot,
  });

  // Heartbeat with position and one answer.
  const lean = await ExamAttempt.findById(attempt._id).select(flow.SAVE_PROJECTION).lean();
  const saved = await flow.saveAnswers(lean, [{ question_id: String(snapshot[0]._id), response: String(snapshot[0].options[0]._id), edited_at: 1 }], null, 1);
  assert.equal(saved.extra_seconds, 0);

  const view = mkRes();
  await monitor.liveMonitor(adminReq({ params: { id: String(exam._id) } }), view);
  assert.equal(view.code, 200);
  const row = view.body.active[0];
  assert.deepEqual([row.participant_name, row.answered, row.total, row.current_index], ['Priya', 1, 2, 1]);
  assert.ok(row.deadline > Date.now());

  // Add 10 minutes → deadline moves, the next autosave reports it.
  const ext = mkRes();
  await monitor.extendAttempt(adminReq({ params: { attemptId: String(attempt._id) }, body: { minutes: 10 } }), ext);
  assert.equal(ext.body.extra_seconds, 600);
  assert.equal(ext.body.deadline, row.deadline + 600000);
  const again = await flow.saveAnswers(await ExamAttempt.findById(attempt._id).select(flow.SAVE_PROJECTION).lean(), [], null, 0);
  assert.equal(again.extra_seconds, 600);
  const all = mkRes();
  await monitor.extendAll(adminReq({ params: { id: String(exam._id) }, body: { minutes: 5 } }), all);
  assert.equal(all.body.updated, 1);
  const bad = mkRes();
  await monitor.extendAttempt(adminReq({ params: { attemptId: String(attempt._id) }, body: { minutes: 0 } }), bad);
  assert.equal(bad.code, 400);

  // Submit for the candidate.
  const sub = mkRes();
  await monitor.forceSubmitAttempt(adminReq({ params: { attemptId: String(attempt._id) } }), sub);
  assert.equal(sub.code, 200);
  assert.equal(sub.body.percentage, 50);
  const done = await ExamAttempt.findById(attempt._id).lean();
  assert.equal(done.auto_submit_reason, 'admin');
  assert.equal(flow.submittedRefusal(done).by_admin, true);
  const twice = mkRes();
  await monitor.forceSubmitAttempt(adminReq({ params: { attemptId: String(attempt._id) } }), twice);
  assert.equal(twice.code, 409);

  const after = mkRes();
  await monitor.liveMonitor(adminReq({ params: { id: String(exam._id) } }), after);
  assert.equal(after.body.active.length, 0);
  assert.equal(after.body.finished[0].auto_submit_reason, 'admin');
});

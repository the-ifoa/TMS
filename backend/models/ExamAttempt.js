const mongoose = require('mongoose');
const { questionSchema } = require('./Exam');

// ─── Exam attempt ─────────────────────────────────────────────────────────────
// A snapshot-based attempt record. `questions_snapshot` copies exam.questions
// (including correct answers) at the moment the attempt starts, so later edits
// to the exam never corrupt an in-progress or already-graded attempt. Correct
// answer fields are stripped server-side before any attempt payload reaches the
// client during taking — only routes/exams.js and examGrading.js read them.
const answerSchema = new mongoose.Schema(
  {
    question_id:          { type: mongoose.Schema.Types.ObjectId, required: true },
    type:                  { type: String, required: true },
    response:              { type: mongoose.Schema.Types.Mixed, default: null },
    // When the candidate made this answer (client ms, monotonic per attempt).
    // A save carrying an older edit than the stored one is ignored, so a slow
    // request arriving after a newer one can't revert the answer.
    edited_at:             { type: Number, default: null },
    is_correct:            { type: Boolean, default: null },
    points_awarded:        { type: Number, default: null },
    needs_manual_grading:  { type: Boolean, default: false },
    feedback:              { type: String, default: '' },
    // Set when the candidate pressed "Check answer" (exams with instant
    // feedback): the response is final and can no longer be changed.
    locked:                { type: Boolean, default: false },
  },
  { _id: false }
);

const examAttemptSchema = new mongoose.Schema(
  {
    exam_id:             { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    exam_title_snapshot: { type: String, default: '' },

    participant_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', required: true },
    participant_name: { type: String, default: '' },
    airline_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'Airline' },
    attempt_number:    { type: Number, default: 1 },

    questions_snapshot: [questionSchema],
    answers:            [answerSchema],

    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'pending_review', 'graded'],
      default: 'in_progress',
    },

    score:      { type: Number, default: null },
    max_score:  { type: Number, default: null },
    percentage: { type: Number, default: null },
    passed:     { type: Boolean, default: null },

    started_at:   { type: Date, default: Date.now },
    submitted_at: { type: Date, default: null },
    graded_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    graded_at:    { type: Date, default: null },
    time_taken_seconds: { type: Number, default: null },

    // Lockdown-mode violation tracking (fullscreen exits, tab switches, etc).
    // Recorded server-side (not just client state) so the count can't be
    // reset by refreshing the page. auto_submitted marks attempts that hit
    // the exam's max_violations and were force-submitted as a result.
    violations: [
      {
        type:   { type: String, enum: ['fullscreen_exit', 'tab_switch', 'devtools_suspected'], required: true },
        at:     { type: Date, default: Date.now },
      },
    ],
    violation_count: { type: Number, default: 0 },
    auto_submitted:  { type: Boolean, default: false },
    // Why it was force-submitted: too many lockdown violations, or the exam
    // window was closed and reopened more often than the exam allows.
    auto_submit_reason: { type: String, enum: ['violations', 'window_closed', 'exam_deleted', 'admin', null], default: null },
    submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // set when an admin force-submits

    // Live monitor. extra_seconds: time an admin added on top of the exam's
    // duration (the deadline is started_at + duration + extra). last_seen_at /
    // current_index: refreshed by every autosave tick (a heartbeat), so the
    // monitor can show who is active and which question they are on.
    extra_seconds: { type: Number, default: 0, min: 0 },
    last_seen_at:  { type: Date, default: null },
    current_index: { type: Number, default: null },
    // Each time the candidate came back to an attempt already in progress
    // (closed the window / refreshed, then resumed). Counted on the server.
    window_closes: [{ _id: false, at: { type: Date, default: Date.now } }],
    window_close_count: { type: Number, default: 0 },

    // Seconds spent on each timed question / section, reported by the client
    // with every autosave and only ever raised ($max). Keys: `q_<questionId>`
    // and `s_<hex(sectionName)>`. Lets a refresh resume the per-question and
    // per-section clocks instead of resetting them.
    timer_elapsed: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    // Certificate the airline uploads for this candidate once they have passed
    // (its own document — nothing is generated). Stored privately in R2 and
    // emailed to the candidate on request.
    certificate: {
      r2_key:        { type: String, default: null },
      original_name: { type: String, default: '' },
      content_type:  { type: String, default: '' },
      size:          { type: Number, default: 0 },
      uploaded_at:   { type: Date, default: null },
      emailed_at:    { type: Date, default: null },
      emailed_to:    { type: String, default: '' },
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

examAttemptSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = String(obj._id);
  obj.id  = obj._id;
  // Never expose the private storage key; no upload → null.
  if (obj.certificate && obj.certificate.r2_key) delete obj.certificate.r2_key;
  else obj.certificate = null;
  return obj;
};

// Lookups the results, analytics and performance pages run on every load —
// without these each one scans the whole (large) attempts collection.
examAttemptSchema.index({ exam_id: 1, created_at: -1 });
examAttemptSchema.index({ participant_id: 1, submitted_at: 1 });
examAttemptSchema.index({ airline_id: 1, created_at: -1 });
examAttemptSchema.index({ status: 1, submitted_at: -1 }); // notifications feed
// Take flow: every landing/start/submit looks up one candidate's attempts on one exam.
examAttemptSchema.index({ exam_id: 1, participant_id: 1, status: 1 });
// At most one open attempt per candidate per exam — two simultaneous Start
// clicks (double click, two tabs) can't create two attempts.
examAttemptSchema.index(
  { participant_id: 1, exam_id: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' }, name: 'one_open_attempt_per_candidate' }
);

module.exports = mongoose.model('ExamAttempt', examAttemptSchema);

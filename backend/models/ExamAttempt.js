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
    is_correct:            { type: Boolean, default: null },
    points_awarded:        { type: Number, default: null },
    needs_manual_grading:  { type: Boolean, default: false },
    feedback:              { type: String, default: '' },
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
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

examAttemptSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = String(obj._id);
  obj.id  = obj._id;
  return obj;
};

module.exports = mongoose.model('ExamAttempt', examAttemptSchema);

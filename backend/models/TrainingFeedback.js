const mongoose = require('mongoose');

// ─── Training feedback ────────────────────────────────────────────────────────
// One participant's Customer Training Feedback for one IFOA exam/training. An
// admin emails the form; the token in the link is the participant's
// passwordless key to the public form (/feedback/<token>). One document per
// (exam, participant): re-sending reuses it, and the answers are stored on it
// once submitted. The questions themselves live in config/feedbackForm.js —
// `form_version` records which version was answered.
const ratingSchema = new mongoose.Schema(
  {
    key:   { type: String, required: true },        // statement key from feedbackForm.js
    value: { type: Number, required: true, min: 1, max: 5 }, // 1 Poor … 5 Excellent
  },
  { _id: false },
);

const trainingFeedbackSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },

    exam_id:             { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    exam_title_snapshot: { type: String, default: '' },

    participant_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', required: true },
    participant_name:  { type: String, default: '' },
    participant_email: { type: String, default: '' },
    airline_name:      { type: String, default: '' },

    // sent → opened (link loaded) → submitted (answers saved; link then read-only)
    status: { type: String, enum: ['sent', 'opened', 'submitted'], default: 'sent' },

    sent_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    sent_at:      { type: Date, default: Date.now },
    sent_count:   { type: Number, default: 1 },
    opened_at:    { type: Date, default: null },
    submitted_at: { type: Date, default: null },

    // ── Answers (set on submit) ─────────────────────────────────────────────
    form_version:    { type: Number, default: null },
    company:         { type: String, default: '' },
    training_title:  { type: String, default: '' },
    instructor_name: { type: String, default: '' },
    ratings:         { type: [ratingSchema], default: [] },
    comments:        { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

// One feedback request per participant per exam — re-sending updates it.
trainingFeedbackSchema.index({ exam_id: 1, participant_id: 1 }, { unique: true });
trainingFeedbackSchema.index({ exam_id: 1, status: 1 });

trainingFeedbackSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = String(obj._id);
  obj.id = obj._id;
  delete obj.token;   // the token is the participant's key — never sent to the admin UI
  return obj;
};

module.exports = mongoose.model('TrainingFeedback', trainingFeedbackSchema);

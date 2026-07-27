const mongoose = require('mongoose');

// ─── Exam invite ──────────────────────────────────────────────────────────────
// A single participant's emailed invitation to take an exam. The token is the
// candidate's passwordless key to the public take flow — unique, unguessable,
// carried in the emailed link (/exam/<token>). One invite per (exam,
// participant); re-sending reuses the same document/token. The actual answers,
// timing, score and violations live in ExamAttempt (referenced by attempt_id)
// — this model only tracks the invitation lifecycle.
const examInviteSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },

    exam_id:             { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    exam_title_snapshot: { type: String, default: '' },

    participant_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', required: true },
    participant_name:  { type: String, default: '' },
    participant_email: { type: String, default: '' },

    airline_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', default: null },
    airline_name: { type: String, default: '' },

    // sent      — email dispatched, candidate hasn't opened the link yet
    // opened    — candidate loaded the exam landing page
    // in_progress — candidate started the attempt
    // completed — attempt submitted/graded
    status: {
      type: String,
      enum: ['sent', 'opened', 'in_progress', 'completed'],
      default: 'sent',
    },

    attempt_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'ExamAttempt', default: null },

    // A "batch" is one admin send action — every invite dispatched together in
    // a single Send Links click shares this id, so the airline can view its
    // students grouped by the batch they were sent in.
    batch_id:    { type: String, default: '' },

    sent_at:      { type: Date, default: Date.now },
    sent_count:   { type: Number, default: 1 },
    opened_at:    { type: Date, default: null },
    completed_at: { type: Date, default: null },
    expires_at:   { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// One invite per participant per exam — re-sending updates the existing one.
examInviteSchema.index({ exam_id: 1, participant_id: 1 }, { unique: true });

examInviteSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = String(obj._id);
  obj.id = obj._id;
  return obj;
};

module.exports = mongoose.model('ExamInvite', examInviteSchema);

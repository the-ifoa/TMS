const mongoose = require('mongoose');

// ─── Live quiz game (the reusable question set) ───────────────────────────────
// An IFOA admin builds a game once and can host it any number of times; each
// hosting is a LiveSession. Kahoot-style: short questions with 2–6 answer
// tiles, a countdown per question and points for speed.
//
// Question types:
//   quiz        one correct option
//   true_false  options are True / False, one correct
//   multi       several correct options; all of them (and only them) must be picked
//   poll        no correct answer, no points — shows how the room voted
const liveOptionSchema = new mongoose.Schema(
  {
    text:       { type: String, default: '', maxlength: 120 },
    is_correct: { type: Boolean, default: false },
  },
  { _id: false },
);

const liveQuestionSchema = new mongoose.Schema(
  {
    type:       { type: String, enum: ['quiz', 'true_false', 'multi', 'poll'], default: 'quiz' },
    prompt:     { type: String, default: '', maxlength: 300 },
    image_url:  { type: String, default: '' },
    image_public_id: { type: String, default: '' }, // image storage id, so unused images can be cleaned up
    options:    { type: [liveOptionSchema], default: [] },
    time_limit: { type: Number, default: 20, min: 5, max: 240 }, // seconds
    points:     { type: String, enum: ['standard', 'double', 'none'], default: 'standard' },
  },
  { _id: true },
);

const liveGameSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 500 },
    cover:       { type: String, default: 'plane', maxlength: 16 }, // icon key shown on cards and the lobby
    // Each phone shows the answers in its own order (true/false excepted), so
    // neighbours can't copy by position. The big screen keeps the written order.
    shuffle_options: { type: Boolean, default: false },
    questions:   { type: [liveQuestionSchema], default: [] },
    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    deleted_at:  { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

liveGameSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = String(obj._id);
  return obj;
};

module.exports = mongoose.model('LiveGame', liveGameSchema);

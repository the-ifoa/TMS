const mongoose = require('mongoose');

// ─── A player in one live quiz session ────────────────────────────────────────
// Anyone with the link joins with a nickname + sticker avatar; no account.
// `token` is the player's secret (kept in their browser) — it is what lets them
// answer as this player, and it is never sent to anyone else.
const liveAnswerSchema = new mongoose.Schema(
  {
    index:   { type: Number, required: true },   // question index
    choices: { type: [Number], default: [] },    // option indexes picked
    correct: { type: Boolean, default: null },   // null for polls
    points:  { type: Number, default: 0 },
    time_ms: { type: Number, default: 0 },       // from question start to answer
    at:      { type: Date, default: Date.now },
  },
  { _id: false },
);

const livePlayerSchema = new mongoose.Schema(
  {
    session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true },
    nickname:   { type: String, required: true, maxlength: 24 },
    nickname_key: { type: String, required: true }, // lower-cased, for uniqueness
    avatar:     { type: String, default: 'plane', maxlength: 16 }, // icon key (frontend liveUi AVATAR_ICONS)
    team:       { type: String, default: '' }, // team key in team mode (LiveSession.teams), else ''
    token:      { type: String, required: true },

    score:         { type: Number, default: 0 },
    correct_count: { type: Number, default: 0 },
    streak:        { type: Number, default: 0 },
    best_streak:   { type: Number, default: 0 },
    total_time_ms: { type: Number, default: 0 }, // over scored answers — the tie-breaker
    last_points:   { type: Number, default: 0 }, // points from the latest question
    answers:       { type: [liveAnswerSchema], default: [] },

    kicked: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'joined_at', updatedAt: 'updated_at' } },
);

livePlayerSchema.index({ session_id: 1, nickname_key: 1 }, { unique: true });
livePlayerSchema.index({ session_id: 1, score: -1 });
livePlayerSchema.index({ token: 1 });

module.exports = mongoose.model('LivePlayer', livePlayerSchema);

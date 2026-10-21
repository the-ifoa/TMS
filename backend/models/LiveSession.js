const mongoose = require('mongoose');

// ─── One hosting of a live quiz ───────────────────────────────────────────────
// Players join with the 6-digit PIN or the link (/play/<code>), pick a
// nickname and sticker, and the host drives the game:
//
//   lobby → question → reveal → leaderboard → question → … → finished
//
// `question_starts_at` sits a few seconds after the host moves on ("Get
// ready…"); answers count from then until `question_ends_at`. A question ends
// early once every player has answered. The questions are copied in when the
// session starts, so editing the game later never changes a game in progress.
const liveSessionSchema = new mongoose.Schema(
  {
    game_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'LiveGame', required: true },
    title:    { type: String, default: '' },
    cover:    { type: String, default: 'plane' },
    questions: { type: Array, default: [] }, // snapshot of LiveGame.questions

    pin:  { type: String, required: true },   // 6 digits, typed on /play
    code: { type: String, required: true, unique: true }, // link token, /play/<code>
    host_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

    status: { type: String, enum: ['lobby', 'question', 'reveal', 'leaderboard', 'finished'], default: 'lobby' },
    current_index:      { type: Number, default: -1 },
    question_starts_at: { type: Date, default: null },
    question_ends_at:   { type: Date, default: null },
    locked:             { type: Boolean, default: false }, // no new players
    // Team mode (set by the host in the lobby): empty = everyone plays alone.
    // `team_pick` — 'player': each player chooses a team when joining;
    // 'auto': the server spreads players evenly. A team's score is the average
    // of its members' points, so groups of different sizes stay comparable.
    // `captain` — player id the host picked; else the team's first player.
    teams: [{ _id: false, key: String, name: String, captain: { type: String, default: '' } }],
    team_pick: { type: String, enum: ['player', 'auto'], default: 'player' },
    // 'each': everyone answers for themselves. 'captain': the team talks it
    // over and only its captain answers — that answer counts for every member.
    team_answer: { type: String, enum: ['each', 'captain'], default: 'each' },
    shuffle_options: { type: Boolean, default: false }, // copied from the game

    // Latest sticker reactions, newest last (capped) — floated on the host screen.
    reactions: [{ _id: false, nickname: String, sticker: String, at: Date }],

    finished_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

liveSessionSchema.index({ pin: 1, status: 1 });
liveSessionSchema.index({ game_id: 1, created_at: -1 });

module.exports = mongoose.model('LiveSession', liveSessionSchema);

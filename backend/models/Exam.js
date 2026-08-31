const mongoose = require('mongoose');

// ─── Exam question ────────────────────────────────────────────────────────────
// One flat schema shared by all 13 question types. Only the fields relevant to
// `type` are populated; the rest stay at their defaults. Type-specific
// validation happens in routes/exams.js, matching this repo's pragmatic style
// (see DgrForm.js) rather than Mongoose discriminators.
const optionSchema = new mongoose.Schema(
  {
    text:            { type: String, default: '' },
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },
    is_correct:      { type: Boolean, default: false },
  },
  { _id: true }
);

const questionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'mcq', 'multi_response', 'true_false', 'short_answer', 'numeric',
        'sequence', 'matching', 'fill_blank', 'select_list', 'drag_words',
        'hotspot', 'drag_drop', 'likert', 'essay',
      ],
    },
    prompt:          { type: String, default: '' },
    // Legacy single-image fields — still the only image storage for
    // hotspot/drag_drop (their regions are coordinates against ONE image).
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },
    // Every other question type instead uses this gallery — any number of
    // illustrative images on the question stem.
    images: [
      { url: { type: String, default: '' }, public_id: { type: String, default: '' } },
    ],
    points:          { type: Number, default: 1 },
    // Optional per-question soft time budget (seconds) — admin-set pacing on
    // top of the exam's overall duration_minutes; null means no separate limit.
    time_limit_seconds: { type: Number, default: null },
    order:           { type: Number, default: 0 },
    explanation:     { type: String, default: '' },
    // Free-text section/group label — questions sharing the same name render
    // grouped together (in exam.questions array order) for both the admin
    // builder and the candidate-facing exam. Empty string = ungrouped.
    section:         { type: String, default: '' },

    // mcq / multi_response / true_false / select_list
    options: [optionSchema],

    // short_answer — accepted answers, case-insensitive match
    correct_text: [{ type: String }],

    // numeric
    numeric_answer:    { type: Number, default: null },
    numeric_tolerance: { type: Number, default: 0 },

    // sequence — correct order is array order
    sequence_items: [
      { text: { type: String, default: '' }, image_url: { type: String, default: '' } },
    ],

    // matching
    matching_pairs: [
      { left: { type: String, default: '' }, right: { type: String, default: '' } },
    ],

    // fill_blank — template text with {{1}}, {{2}}... placeholders
    blanks_text:    { type: String, default: '' },
    blanks_answers: [[{ type: String }]],

    // drag_words — template text with {{1}}... placeholders. `drag_words_bank`
    // is the full draggable word pool (correct answers + distractors);
    // `drag_words_answers` is the correct word for each blank, in order.
    drag_words_text:    { type: String, default: '' },
    drag_words_bank:    [{ type: String }],
    drag_words_answers: [{ type: String }],

    // hotspot — regions given as % of image (0-100), responsive-safe
    hotspot_regions: [
      {
        shape:      { type: String, enum: ['rect', 'circle'], default: 'rect' },
        x:          { type: Number, default: 0 },
        y:          { type: Number, default: 0 },
        width:      { type: Number, default: 0 },
        height:     { type: Number, default: 0 },
        is_correct: { type: Boolean, default: false },
      },
    ],

    // drag_drop — draggable items dropped onto labeled target zones (% of image)
    dragdrop_targets: [
      {
        label:  { type: String, default: '' },
        x:      { type: Number, default: 0 },
        y:      { type: Number, default: 0 },
        width:  { type: Number, default: 0 },
        height: { type: Number, default: 0 },
      },
    ],
    dragdrop_items: [
      { label: { type: String, default: '' }, correct_target_index: { type: Number, default: 0 } },
    ],

    // likert — survey only, not scored
    likert_statements:   [{ type: String }],
    likert_scale_labels: [{ type: String }],

    // essay — manual grade only
    essay_min_words: { type: Number, default: 0 },
  },
  { timestamps: false }
);

const examSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },

    // null  = IFOA/admin-owned (global). Set = owned by this airline, which
    // manages it and can only assign it to its own participants. IFOA admins
    // get view-only access to airline-owned exams.
    owner_airline: { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', default: null },

    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },

    duration_minutes: { type: Number, default: 30 },
    pass_percentage:  { type: Number, default: 60 },
    max_attempts:     { type: Number, default: 1 },
    shuffle_questions: { type: Boolean, default: false },
    shuffle_options:   { type: Boolean, default: false },

    // Scheduling window — null means no restriction on that end. Gates new
    // attempt starts only; an attempt already in progress runs to its own
    // duration_minutes regardless of closes_at passing mid-attempt.
    opens_at:  { type: Date, default: null },
    closes_at: { type: Date, default: null },

    // When to stop showing this exam in an airline's exam list — independent
    // of opens_at/closes_at (which gate starting an attempt). Past results
    // stay visible in the participant performance view either way; this only
    // hides the exam itself. null = always visible ("Never").
    // `visible_until` is the global default; `airline_visibility` lets an
    // admin override that per airline (an airline with no entry here just
    // inherits the global default).
    visible_until: { type: Date, default: null },
    airline_visibility: [
      {
        airline_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', required: true },
        visible_until: { type: Date, default: null },
      },
    ],

    // Lockdown mode — fullscreen exam view with violation tracking (tab-switch,
    // exiting fullscreen, etc). max_violations is how many infractions are
    // tolerated before the attempt is auto-submitted. 0 disables lockdown mode.
    lockdown_enabled: { type: Boolean, default: true },
    max_violations:   { type: Number, default: 4 },

    // Ordered list of section names (e.g. "Aptitude", "Logical", "Practical").
    // Admin-managed independently of questions, so a section can exist before
    // any question is assigned to it. Each question's `section` field (see
    // questionSchema) names which of these it belongs to; '' = ungrouped.
    sections: [{ type: String }],

    // Optional per-section time budget + score weight, keyed by section name
    // (matching the `sections` list above; '' is the ungrouped bucket). A
    // section left out of this array has no time limit and, for scoring, is
    // only weighted if at least one other section used in the exam has an
    // explicit weight — see computeAttemptScore() in examGrading.js.
    section_settings: [
      {
        name:         { type: String, default: '' },
        time_minutes: { type: Number, default: null },
        weight:       { type: Number, default: null },
      },
    ],

    questions: [questionSchema],

    // Students this exam has been assigned to
    assignments: [
      {
        participant_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant' },
        airline_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Airline' },
        assigned_at:     { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

examSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = String(obj._id);
  obj.id  = obj._id;
  return obj;
};

module.exports = mongoose.model('Exam', examSchema);
module.exports.questionSchema = questionSchema;

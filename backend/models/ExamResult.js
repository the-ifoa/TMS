const mongoose = require('mongoose');

const subjectScoreSchema = new mongoose.Schema(
  {
    abbr:      { type: String, required: true },        // e.g. 'LAW'
    name:      { type: String, required: true },        // e.g. 'Air Law'
    max_marks: { type: Number, default: 100 },
    marks_obtained: { type: Number, default: null },    // null = not yet recorded
    grade:     { type: String, default: null },         // PASS / MERIT / DISTINCTION / OUTSTANDING / FAILED
  },
  { _id: false }
);

const examResultSchema = new mongoose.Schema(
  {
    // ── Student identity ──────────────────────────────────────────────────────
    first_name:       { type: String, required: true, trim: true },
    last_name:        { type: String, required: true, trim: true },
    participant_name: { type: String, default: '' },

    // ── Batch / course info ───────────────────────────────────────────────────
    batch_name: { type: String, required: true },         // e.g. 'NOV-DEC 2024'
    course_name: { type: String, required: true },        // e.g. 'Flight Dispatch Initial Training / Promotion'
    result_header_text: { type: String, default: '' },    // full line shown below "EXAM RESULTS" in PDF
    course_type: {
      type: String,
      required: true,
      enum: ['FDI', 'FDR', 'FDA', 'FTL', 'NDG', 'HF', 'GD', 'TCD'],
    },
    training_mode: { type: String, default: 'HYBRID' },  // HYBRID / ONLINE / IN-PERSON
    start_date:    { type: String, required: true },      // ISO date string
    end_date:      { type: String, required: true },
    company:       { type: String, default: '' },         // airline / company

    // ── Instructors ──────────────────────────────────────────────────────────
    lead_instructor:  { type: String, default: '' },
    instructors:      [{ type: String }],

    // ── Subject scores ────────────────────────────────────────────────────────
    subjects: [subjectScoreSchema],

    // ── Final marks ───────────────────────────────────────────────────────────
    final_exam_score: { type: Number, default: null },    // score on the final exam
    final_marks:      { type: Number, default: null },    // overall average
    overall_grade:    { type: String, default: null },

    // ── Result sheet state ────────────────────────────────────────────────────
    sheet_issued:   { type: Boolean, default: false },
    sheet_date:     { type: String, default: null },      // date printed on result sheet

    // ── Ownership ─────────────────────────────────────────────────────────────
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id; delete ret.__v; return ret; },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id; delete ret.__v; return ret; },
    },
  }
);

// ── Pre-save: auto-compute participant_name and grades ─────────────────────
examResultSchema.pre('save', function () {
  this.participant_name = `${this.first_name} ${this.last_name}`.trim();

  // Compute grade for each subject
  this.subjects = this.subjects.map((s) => {
    const m = s.marks_obtained;
    if (m == null) return s;
    let grade = 'FAILED';
    if (m > 95)       grade = 'OUTSTANDING';
    else if (m >= 90) grade = 'DISTINCTION';
    else if (m >= 76) grade = 'MERIT';
    else if (m >= 75) grade = 'PASS';
    return { ...s, grade };
  });

  // Compute overall grade from final_marks
  const fm = this.final_marks;
  if (fm != null) {
    if (fm > 95)       this.overall_grade = 'OUTSTANDING';
    else if (fm >= 90) this.overall_grade = 'DISTINCTION';
    else if (fm >= 76) this.overall_grade = 'MERIT';
    else if (fm >= 75) this.overall_grade = 'PASS';
    else               this.overall_grade = 'FAILED';
  }
});

module.exports = mongoose.model('ExamResult', examResultSchema);

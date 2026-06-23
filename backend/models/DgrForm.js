const mongoose = require('mongoose');

// ─── DGR (Dangerous Goods) CBTA Training Form ────────────────────────────────
// Mirrors Comlux "Appendix A.1.6 Dangerous Goods Training Course Form (MLMCXB-DG-1)".
// One form is created per airline by an admin, who fills every blank once.
// The form is then assigned to individual students of that airline — each
// assignment reuses the same field data, only the applicant/participant name
// changes per generated PDF.
const dgrFormSchema = new mongoose.Schema(
  {
    // Owner airline (Airline._id) — airlines see forms where this matches their token id
    airline_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Airline' },
    airline_name: { type: String, default: '' },
    created_by:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },

    // ── PDF header (top-right box) ──────────────────────────────────────────
    page_ref: { type: String, default: 'Appendix A-13' },
    doc_date: { type: String, default: '01-11-2024' },
    iss_rev:  { type: String, default: '5 / 8' },

    // ── Declaration block ───────────────────────────────────────────────────
    ato_name_number:  { type: String, default: '' }, // "We, ___ (name and number of ATO/CCTO)"
    dg_training_type: { type: String, enum: ['Initial', 'Recurrent'], default: 'Initial' },
    training_date:    { type: String, default: '' }, // DD.MM.YYYY (free text)

    // ── Instructor initials per IATA item row ──────────────────────────────
    initials: {
      item0:   { type: String, default: '' }, // Understanding the basics of dangerous goods
      item0_1: { type: String, default: '' }, // Dangerous goods applicability
      item0_2: { type: String, default: '' }, // Understanding the general limitations
      item0_3: { type: String, default: '' }, // Identifying Roles and Responsibilities
      item0_4: { type: String, default: '' }, // Understanding the importance of classification and packaging
      item0_5: { type: String, default: '' }, // Understanding hazard communication
      item0_6: { type: String, default: '' }, // Familiarising with basic emergency response
      item5:   { type: String, default: '' }, // Accepting passenger and crew baggage
      item6:   { type: String, default: '' }, // Transporting cargo/baggage
      item7:   { type: String, default: '' }, // Collecting safety data
    },

    // ── Job function: F.C.-7.7 / F.D.-7.8 / C.C.-7.9 ───────────────────────
    job_function: { type: String, enum: ['FC', 'FD', 'CC'], default: 'FC' },

    // ── Score table ─────────────────────────────────────────────────────────
    knowledge_score: { type: Number, default: null },
    skills: {
      input_response:    { type: Number, default: null },
      response_time:     { type: Number, default: null },
      number_of_errors:  { type: Number, default: null },
      repeated_attempts: { type: Number, default: null },
    },
    attitude: {
      shows_interest:         { type: Number, default: null },
      participation:          { type: Number, default: null },
      input:                  { type: Number, default: null },
      co_operation:           { type: Number, default: null },
      asks_relevant_questions:{ type: Number, default: null },
    },
    final_score: { type: Number, default: null }, // Knowledge 60% + Skills 20% + Attitude 20%

    instructor_name:      { type: String, default: '' },
    instructor_signature: { type: String, default: '' },

    // ── Assigned students (name auto-fills the applicant blank per PDF) ──────
    assignments: [
      {
        participant_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Participant' },
        participant_name: { type: String, default: '' },
        assigned_at:      { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

dgrFormSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = String(obj._id);
  obj.id  = obj._id;
  return obj;
};

module.exports = mongoose.model('DgrForm', dgrFormSchema);

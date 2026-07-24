const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    first_name:       { type: String, default: '', trim: true },
    last_name:        { type: String, default: '', trim: true },
    participant_name: { type: String, default: '' },
    // Candidate's own email — collected by the airline at enrollment time so
    // the admin can email exam links directly to the participant. Optional
    // (older records won't have it); required only when sending an exam invite.
    email:            { type: String, default: '', trim: true, lowercase: true },
    company:          { type: String, required: true },
    department:       { type: String, required: true },
    training_type: {
      type: String,
      required: true,
      enum: [
        'Dispatch Graduate', 'Human Factors', 'Recurrent',
        'FDI', 'FDR', 'FDA', 'FTL', 'NDG', 'HF', 'GD', 'TCD'
      ]
    },
    airline_name: { type: String, default: null },
    submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', default: null },
    locked:       { type: Boolean, default: true },
    training_date: { type: String, required: true },
    end_date:      { type: String, default: null },
    location:      { type: String, default: null },
    modules:       { type: String, default: null },

    // ── Certificate sequence number ────────────────────────────────────────────
    // NO default — must never be null in the DB.
    // Pre-save hook below strips null/undefined so the field is always absent
    // until an admin explicitly assigns a real number via reserveCertSequence().
    cert_sequence: { type: Number },

    templateVariant:    { type: String, default: 'default', enum: ['default', 'india'] },
    cert_year_override: { type: Number, default: null },
    ndg_score:          { type: Number, default: null, min: 0, max: 100 },
    ndg_subtype:        { type: String, default: 'I', enum: ['I', 'R'] },
    // Optional hours figure for FDR certificates — shown on the certificate
    // body ("Has successfully completed the {N} Hours Flight Dispatch...")
    // only when set; null means the line is left as-is.
    fdr_hours:          { type: Number, default: null, min: 0 },
    online_synchronous: { type: Boolean, default: false },
    cert_validity:      { type: String, default: '36', enum: ['12', '24', '36', 'Unlimited'] },
    cert_released:      { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ── Pre-save hook: ensure cert_sequence is NEVER stored as null ───────────────
// Mongoose can re-introduce null for Number fields even without a default.
// This hook removes the field entirely if it is null/undefined/NaN,
// so the partial index below never sees a null value.
participantSchema.pre('save', function () {
  if (this.cert_sequence == null || isNaN(this.cert_sequence)) {
    delete this._doc.cert_sequence;
    this.unmarkModified('cert_sequence');
  }
});

// ── DB-level uniqueness guard (PARTIAL index — only indexes real numbers) ─────
// partialFilterExpression ensures MongoDB only indexes documents where
// cert_sequence is a real integer > 0. Documents without the field, or with
// null, are completely ignored by this index — eliminating all E11000 errors
// on unissued participants regardless of how Mongoose handles the field.
participantSchema.index(
  { training_type: 1, cert_sequence: 1 },
  {
    unique: true,
    name: 'unique_cert_sequence_per_type',
    partialFilterExpression: { cert_sequence: { $type: 'number' } },
  }
);

module.exports = mongoose.model('Participant', participantSchema);

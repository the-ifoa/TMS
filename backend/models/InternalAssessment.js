const mongoose = require('mongoose');

// One person taking an internal assessment — either an existing participant
// (`participant` set, name/email snapshotted) or someone typed in manually.
// Each may carry one certificate PDF, kept in Cloudflare R2 under `r2_key`.
const candidateSchema = new mongoose.Schema({
  participant: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant', default: null },
  name:        { type: String, required: true, trim: true },
  email:       { type: String, default: '', trim: true, lowercase: true },
  certificate: {
    r2_key:           { type: String, default: null },
    original_name:    { type: String, default: '' },
    size:             { type: Number, default: 0 },
    uploaded_at:      { type: Date, default: null },
    uploaded_by_name: { type: String, default: '' },
  },
});

// An airline's own (internal) assessment: a titled list of candidates. Created
// by the airline or one of its departments — never by IFOA.
const internalAssessmentSchema = new mongoose.Schema({
  // Top-level airline the assessment belongs to (departments roll up to it).
  owner_airline:   { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', required: true, index: true },
  // Account that created it — the airline itself or a department.
  created_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', required: true, index: true },
  created_by_name: { type: String, default: '' },

  title:           { type: String, required: true, trim: true },
  description:     { type: String, default: '', trim: true },
  assessment_date: { type: Date, default: null },

  candidates:      { type: [candidateSchema], default: [] },
}, { timestamps: true });

internalAssessmentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = String(obj._id);
  obj.id = obj._id;
  obj.candidates = (obj.candidates || []).map((c) => ({
    id: String(c._id),
    participant: c.participant ? String(c.participant) : null,
    name: c.name,
    email: c.email,
    certificate: c.certificate?.r2_key ? {
      original_name: c.certificate.original_name,
      size: c.certificate.size,
      uploaded_at: c.certificate.uploaded_at,
      uploaded_by_name: c.certificate.uploaded_by_name,
    } : null,
  }));
  return obj;
};

module.exports = mongoose.model('InternalAssessment', internalAssessmentSchema);

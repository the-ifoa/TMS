const mongoose = require('mongoose');

// ── DHL FORM ST-001 extra certificate (DHL Bahrain / DHL Air (Bahrain), FDR only) ──
// One document per participant. Kept separate from Participant so the DHL
// numbering pool (starts at 001, gap-filled on revoke/delete) never touches
// the existing cert_sequence system used by every other certificate type.
const dhlCertificateSchema = new mongoose.Schema(
  {
    participant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Participant',
      required: true,
      unique: true,
    },
    // NO default — must never be stored as null. Pre-save hook below strips
    // null/undefined so the field is fully absent until a number is assigned.
    sequence: { type: Number },
    released: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

dhlCertificateSchema.pre('save', function () {
  if (this.sequence == null || isNaN(this.sequence)) {
    delete this._doc.sequence;
    this.unmarkModified('sequence');
  }
});

// Partial index — only indexes real numbers, so many docs can sit with no
// sequence assigned yet without ever colliding.
dhlCertificateSchema.index(
  { sequence: 1 },
  {
    unique: true,
    name: 'unique_dhl_cert_sequence',
    partialFilterExpression: { sequence: { $type: 'number' } },
  }
);

module.exports = mongoose.model('DhlCertificate', dhlCertificateSchema);

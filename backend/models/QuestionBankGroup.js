const mongoose = require('mongoose');

// ─── Question Bank (named) ─────────────────────────────────────────────────────
// A container an admin creates to organize reusable questions — e.g. one bank
// per training type. Individual questions (QuestionBankItem) belong to
// exactly one of these via bank_id.
const questionBankGroupSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

questionBankGroupSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = String(obj._id);
  obj.id = obj._id;
  return obj;
};

module.exports = mongoose.model('QuestionBankGroup', questionBankGroupSchema);

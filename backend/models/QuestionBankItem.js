const mongoose = require('mongoose');
const { questionSchema } = require('./Exam');

// ─── Question Bank item ───────────────────────────────────────────────────────
// A reusable question, independent of any exam. Same shape as an exam
// question (reuses Exam.js's questionSchema field set — every question type,
// options, images, etc.) plus classification tags an admin uses to filter
// when picking questions into a new exam. `order`/`section` are inherited
// but unused for ordering here; `section` is repurposed as a free-text
// "Topic" label so bank items get one more filterable axis for free.
const questionBankItemSchema = new mongoose.Schema(
  {
    ...questionSchema.obj,
    bank_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionBankGroup', required: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },

    difficulty:   { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    is_knowledge: { type: Boolean, default: false },
    is_skill:     { type: Boolean, default: false },
    is_initial:   { type: Boolean, default: false },
    is_recurrent: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

questionBankItemSchema.index({ bank_id: 1 });

questionBankItemSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj._id = String(obj._id);
  obj.id = obj._id;
  return obj;
};

module.exports = mongoose.model('QuestionBankItem', questionBankItemSchema);

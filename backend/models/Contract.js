const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
  airlineId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', required: true },
  airlineName: { type: String },
  toEmail:     { type: String },
  headerDate:  { type: String },
  blocks:      { type: Array,  default: [] },
  extraBlocks: { type: Array,  default: [] },
  message:     { type: String, default: '' },
  sentAt:      { type: Date,   default: Date.now },
}, { timestamps: true });

// One contract record per airline (upsert on re-send overwrites)
contractSchema.index({ airlineId: 1 });

module.exports = mongoose.model('Contract', contractSchema);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── This file is intentionally kept as Admin.js ──
// See Airline.js for airline user accounts


const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, default: 'Administrator' },
  organization: { type: String, default: 'IFOA - International Flight Operations Academy' },
  lastLogin: { type: Date, default: Date.now },

  // ── Sub-admins ─────────────────────────────────────────────────────────────
  // parent_admin = null  → super admin, full access (unchanged behaviour).
  // parent_admin set      → restricted admin, access limited to `permissions`.
  parent_admin:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  permissions:    { type: [String], default: [] },
  account_status: { type: String, enum: ['active', 'disabled'], default: 'active' },
}, { timestamps: true });

adminSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

adminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

adminSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Admin', adminSchema);

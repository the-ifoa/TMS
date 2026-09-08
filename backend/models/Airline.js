const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const airlineSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },        // contact person name
  airlineName: { type: String, required: true, trim: true },        // e.g. "Emirates Airlines"
  address:     { type: String, default: '', trim: true },           // airline mailing address
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true, minlength: 6 },
  role:        { type: String, default: 'airline' },
  // Admin-granted: when true this airline can create/publish its own exams and
  // assign them to its own participants (see examsController). Default off.
  can_author_exams: { type: Boolean, default: false },

  // ── Sub-users / departments ────────────────────────────────────────────────
  // A top-level airline account has parent_airline = null and behaves exactly
  // as before (implicit full airline permissions, sees all its departments).
  // A department is an Airline doc with parent_airline set — it logs in with
  // the airline login, but its access is limited to `permissions` and its own
  // data. A department never sees another account's exam results.
  parent_airline:   { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', default: null },
  is_department:    { type: Boolean, default: false },
  department_name:  { type: String, default: '', trim: true },
  permissions:      { type: [String], default: [] },
  // Admin-granted to a TOP-LEVEL airline: may it create its own departments?
  can_create_subusers: { type: Boolean, default: false },
  // Who created this account: an admin (admin-made airline user) or null (self
  // signup / airline-made department carries created_by_airline instead).
  created_by_admin:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin',   default: null },
  created_by_airline: { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', default: null },
  account_status:     { type: String, enum: ['active', 'disabled'], default: 'active' },
  lastLogin:   { type: Date, default: Date.now },
  logo_url:          { type: String, default: null },
  resetPasswordToken:  { type: String, default: null },
  resetPasswordExpiry: { type: Date,   default: null },
  // ── Email OTP verification ──────────────────────────────────────────────────
  emailVerified:    { type: Boolean, default: false },
  otpCode:          { type: String,  default: null },   // 6-digit code (hashed)
  otpExpiry:        { type: Date,    default: null },   // 10 minutes from send
  otpAttempts:      { type: Number,  default: 0 },      // wrong guesses this code
}, { timestamps: true });

airlineSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

airlineSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

airlineSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  // Ensure _id is always a plain string so frontend comparisons work reliably
  obj._id = String(obj._id);
  obj.id  = obj._id;
  return obj;
};

module.exports = mongoose.model('Airline', airlineSchema);

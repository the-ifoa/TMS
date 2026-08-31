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

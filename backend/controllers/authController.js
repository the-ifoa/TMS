const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Airline = require('../models/Airline');
const { sendPasswordResetEmail, sendOtpEmail } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

// When true, airline signup emails a 6-digit OTP and the account stays
// inactive until /airline/verify-otp succeeds. When false (default), the
// account is created verified and a token is returned straight away.
const EMAIL_VERIFICATION_ENABLED = process.env.EMAIL_VERIFICATION_ENABLED === 'true';

// ── Token helpers — every issue point goes through these so the permission /
// department claims stay consistent (see middleware/permissions.js). ──────────
function signAdminToken(admin) {
  const isSub = !!admin.parent_admin;
  return jwt.sign(
    {
      id: admin._id, email: admin.email, name: admin.name, role: 'admin',
      organization: admin.organization,
      parentAdmin: isSub ? String(admin.parent_admin) : null,
      permissions: isSub ? (admin.permissions || []) : [],
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function signAirlineToken(airline) {
  const isDept = !!airline.parent_airline;
  return jwt.sign(
    {
      id: airline._id, email: airline.email, name: airline.name,
      airlineName: airline.airlineName, role: 'airline',
      parentAirline: isDept ? String(airline.parent_airline) : null,
      topAirlineId: isDept ? String(airline.parent_airline) : String(airline._id),
      isDepartment: isDept,
      permissions: isDept ? (airline.permissions || []) : [],
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

// ─────────────────────────────────────────────
//  ADMIN SIGNUP
//  POST /api/auth/signup
// ─────────────────────────────────────────────
exports.adminSignup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const existing = await Admin.findOne({ email });
    if (existing)
      return res.status(400).json({ error: 'An account with this email already exists.' });

    const admin = await Admin.create({ name, email, password });
    const token = signAdminToken(admin);

    res.status(201).json({ token, admin: admin.toJSON() });
  } catch (err) {
    console.error('Admin signup error:', err);
    res.status(500).json({ error: err.message || 'Server error during signup.' });
  }
};

// ─────────────────────────────────────────────
//  ADMIN LOGIN
//  POST /api/auth/login
// ─────────────────────────────────────────────
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const admin = await Admin.findOne({ email });
    if (!admin)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const isMatch = await admin.comparePassword(password);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid email or password.' });

    if (admin.account_status === 'disabled')
      return res.status(403).json({ error: 'This account has been disabled. Contact your administrator.' });

    admin.lastLogin = new Date();
    await admin.save();

    const token = signAdminToken(admin);

    res.json({ token, admin: { ...admin.toJSON(), role: 'admin' } });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: err.message || 'Server error during login.' });
  }
};

// ─────────────────────────────────────────────
//  UPLOAD AIRLINE LOGO (call before signup)
//  POST /api/auth/airline/upload-logo
//  Body: multipart/form-data, field name = 'logo'
//  Returns: { logo_url: 'https://res.cloudinary.com/...' }
// ─────────────────────────────────────────────
exports.uploadAirlineLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    res.json({ logo_url: req.file.path });
  } catch (err) {
    console.error('Logo upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
};

// ─────────────────────────────────────────────
//  AIRLINE SIGNUP — Step 1: validate + send OTP (do NOT create account yet)
//  POST /api/auth/airline/signup
//  Returns { otpSent: true } — client must then call /airline/verify-otp
// ─────────────────────────────────────────────
exports.airlineSignup = async (req, res) => {
  try {
    const { name, airlineName, email, password, logo_url } = req.body;
    if (!name || !airlineName || !email || !password)
      return res.status(400).json({ error: 'Name, airline name, email, and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    // Check duplicate email
    const existing = await Airline.findOne({ email: email.toLowerCase().trim() });
    if (existing && existing.emailVerified)
      return res.status(400).json({ error: 'An account with this email already exists.' });

    // ── Email verification ON: email an OTP, keep the account inactive ──────────
    if (EMAIL_VERIFICATION_ENABLED) {
      const rawOtp    = String(Math.floor(100000 + Math.random() * 900000));
      const hashedOtp = await bcrypt.hash(rawOtp, 10);
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      if (existing && !existing.emailVerified) {
        existing.name        = name;
        existing.airlineName  = airlineName;
        existing.password     = password; // pre-save hook re-hashes
        existing.logo_url     = logo_url || null;
        existing.emailVerified = false;
        existing.otpCode      = hashedOtp;
        existing.otpExpiry    = otpExpiry;
        existing.otpAttempts  = 0;
        await existing.save();
      } else {
        await Airline.create({
          name, airlineName,
          email:         email.toLowerCase().trim(),
          password,
          logo_url:      logo_url || null,
          emailVerified: false,
          otpCode:       hashedOtp,
          otpExpiry,
          otpAttempts:   0,
        });
      }

      await sendOtpEmail({ toEmail: email, airlineName, otp: rawOtp });
      return res.status(200).json({
        otpSent: true,
        message: `Verification code sent to ${email}. It expires in 10 minutes.`,
      });
    }

    // ── Email verification OFF: create the account verified and log straight in ─
    let airline;
    if (existing && !existing.emailVerified) {
      // Reuse the pending record — update fields and mark verified directly
      existing.name          = name;
      existing.airlineName   = airlineName;
      existing.password      = password;  // pre-save hook will re-hash
      existing.logo_url      = logo_url || null;
      existing.emailVerified = true;
      await existing.save();
      airline = existing;
    } else {
      // Create a new verified record (skipping OTP step)
      airline = await Airline.create({
        name, airlineName,
        email:         email.toLowerCase().trim(),
        password,
        logo_url:      logo_url || null,
        emailVerified: true,
      });
    }

    const token = signAirlineToken(airline);

    res.status(200).json({
      token,
      admin: airline.toJSON(),
      message: `Welcome to IFOA, ${airlineName}!`,
    });
  } catch (err) {
    console.error('Airline signup error:', err);
    const msg = err.code === 11000
      ? 'An account with this email already exists.'
      : err.message || 'Server error during airline signup.';
    res.status(err.code === 11000 ? 400 : 500).json({ error: msg });
  }
};

// ─────────────────────────────────────────────
//  AIRLINE OTP VERIFY — Step 2: validate OTP, mark email verified, return token
//  POST /api/auth/airline/verify-otp
//  Body: { email, otp }
// ─────────────────────────────────────────────
exports.airlineVerifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ error: 'Email and OTP are required.' });

    const airline = await Airline.findOne({ email: email.toLowerCase().trim(), emailVerified: false });
    if (!airline)
      return res.status(400).json({ error: 'No pending registration found for this email. Please sign up again.' });

    // Check expiry
    if (!airline.otpExpiry || airline.otpExpiry < new Date())
      return res.status(400).json({ error: 'OTP has expired. Please request a new code.' });

    // Rate-limit: max 5 wrong attempts per code
    if (airline.otpAttempts >= 5) {
      // Invalidate this code to force a resend
      airline.otpCode    = null;
      airline.otpExpiry  = null;
      await airline.save();
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    // Verify OTP
    const isMatch = await bcrypt.compare(String(otp).trim(), airline.otpCode);
    if (!isMatch) {
      airline.otpAttempts += 1;
      await airline.save();
      const remaining = 5 - airline.otpAttempts;
      return res.status(400).json({
        error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      });
    }

    // ✅ OTP correct — mark account as verified and clear OTP fields
    airline.emailVerified = true;
    airline.otpCode       = null;
    airline.otpExpiry     = null;
    airline.otpAttempts   = 0;
    await airline.save();

    const token = signAirlineToken(airline);

    res.status(200).json({
      token,
      admin: airline.toJSON(),
      message: 'Email verified successfully. Welcome to IFOA!',
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Server error during verification.' });
  }
};

// ─────────────────────────────────────────────
//  RESEND OTP — generate a fresh code, reset expiry to 10 min
//  POST /api/auth/airline/resend-otp
//  Body: { email }
// ─────────────────────────────────────────────
exports.airlineResendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const airline = await Airline.findOne({ email: email.toLowerCase().trim(), emailVerified: false });
    if (!airline)
      return res.status(400).json({ error: 'No pending registration found for this email.' });

    const rawOtp    = String(Math.floor(100000 + Math.random() * 900000));
    const hashedOtp = await bcrypt.hash(rawOtp, 10);

    airline.otpCode     = hashedOtp;
    airline.otpExpiry   = new Date(Date.now() + 10 * 60 * 1000);
    airline.otpAttempts = 0;
    await airline.save();

    await sendOtpEmail({ toEmail: email, airlineName: airline.airlineName, otp: rawOtp });

    res.json({ otpSent: true, message: 'A new verification code has been sent. It expires in 10 minutes.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: 'Failed to resend verification code.' });
  }
};

// ─────────────────────────────────────────────
//  AIRLINE LOGIN
//  POST /api/auth/airline/login
// ─────────────────────────────────────────────
exports.airlineLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const airline = await Airline.findOne({ email });
    if (!airline)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const isMatch = await airline.comparePassword(password);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid email or password.' });

    // Block login for unverified accounts
    if (!airline.emailVerified)
      return res.status(403).json({
        error: 'Please verify your email first.',
        needsVerification: true,
        email: airline.email,
      });

    if (airline.account_status === 'disabled')
      return res.status(403).json({ error: 'This account has been disabled. Contact your airline administrator.' });

    airline.lastLogin = new Date();
    await airline.save();

    const token = signAirlineToken(airline);

    const adminOut = { ...airline.toJSON(), role: 'airline' };
    // A department with no logo of its own inherits the parent airline's.
    if (!adminOut.logo_url && airline.parent_airline) {
      const parent = await Airline.findById(airline.parent_airline).select('logo_url');
      if (parent?.logo_url) { adminOut.logo_url = parent.logo_url; adminOut.logo_inherited = true; }
    }

    res.json({ token, admin: adminOut });
  } catch (err) {
    console.error('Airline login error:', err);
    res.status(500).json({ error: err.message || 'Server error during airline login.' });
  }
};

// ─────────────────────────────────────────────
//  GET ME — works for admin and airline
//  GET /api/auth/me
// ─────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      const airline = await Airline.findById(req.admin.id);
      if (!airline) return res.status(404).json({ error: 'Airline user not found.' });
      const out = { ...airline.toJSON(), role: 'airline' };
      // A department with no logo of its own inherits the parent airline's.
      if (!out.logo_url && airline.parent_airline) {
        const parent = await Airline.findById(airline.parent_airline).select('logo_url');
        if (parent?.logo_url) { out.logo_url = parent.logo_url; out.logo_inherited = true; }
      }
      return res.json(out);
    } else {
      const admin = await Admin.findById(req.admin.id);
      if (!admin) return res.status(404).json({ error: 'Admin not found.' });
      return res.json({ ...admin.toJSON(), role: 'admin' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

// ─────────────────────────────────────────────
//  UPDATE PROFILE
//  PUT /api/auth/profile
// ─────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const Model = req.admin.role === 'airline' ? Airline : Admin;
    const user = await Model.findById(req.admin.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const { name, currentPassword, newPassword, newEmail, logo_url, organization, airlineName, address } = req.body;
    if (name && name.trim()) user.name = name.trim();
    if (logo_url !== undefined && req.admin.role === 'airline') user.logo_url = logo_url || null;
    if (address !== undefined && req.admin.role === 'airline') user.address = (address || '').trim();

    if (organization !== undefined && req.admin.role !== 'airline') {
      return res.status(403).json({ error: 'Only airline users can edit organization.' });
    }

    // For airlines: airlineName is their "organization" — update it
    if (req.admin.role === 'airline') {
      if (airlineName !== undefined && airlineName.trim()) user.airlineName = airlineName.trim();
      // Also support sending it as 'organization' from the frontend
      else if (organization !== undefined && organization.trim()) user.airlineName = organization.trim();
    }

    if (newPassword) {
      if (!currentPassword)
        return res.status(400).json({ error: 'Current password is required to set a new password.' });
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch)
        return res.status(401).json({ error: 'Current password is incorrect.' });
      if (newPassword.length < 6)
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      user.password = newPassword;
    }

    if (newEmail) {
      if (!currentPassword)
        return res.status(400).json({ error: 'Current password is required to change email.' });
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch)
        return res.status(401).json({ error: 'Current password is incorrect.' });

      // Check if email is already in use by another user
      const existingUser = await Model.findOne({ email: newEmail.trim(), _id: { $ne: user._id } });
      if (existingUser)
        return res.status(400).json({ error: 'This email is already in use.' });

      user.email = newEmail.trim();
    }

    await user.save();
    const role = req.admin.role === 'airline' ? 'airline' : 'admin';
    const token = role === 'airline' ? signAirlineToken(user) : signAdminToken(user);

    // Return the full updated user so the frontend state is always in sync
    res.json({ token, admin: { ...user.toJSON(), role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error updating profile.' });
  }
};

// ─────────────────────────────────────────────
//  FORGOT PASSWORD — send reset link to airline email
//  POST /api/auth/airline/forgot-password
// ─────────────────────────────────────────────
exports.airlineForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const airline = await Airline.findOne({ email: email.toLowerCase().trim() });
    // Always return success even if email not found — prevents email enumeration
    if (!airline) {
      return res.json({ message: 'If that email is registered, a reset link has been sent.' });
    }

    // Generate a secure random token
    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    airline.resetPasswordToken  = token;
    airline.resetPasswordExpiry = expiry;
    await airline.save();

    // Build reset URL — points to the frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl    = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(airline.email)}`;

    await sendPasswordResetEmail({
      toEmail:     airline.email,
      airlineName: airline.airlineName,
      resetUrl,
    });

    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// ─────────────────────────────────────────────
//  RESET PASSWORD — set new password using token
//  POST /api/auth/airline/reset-password
// ─────────────────────────────────────────────
exports.airlineResetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword)
      return res.status(400).json({ error: 'Email, token, and new password are required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const airline = await Airline.findOne({
      email:              email.toLowerCase().trim(),
      resetPasswordToken: token,
      resetPasswordExpiry:{ $gt: new Date() },  // not expired
    });

    if (!airline)
      return res.status(400).json({ error: 'Reset link is invalid or has expired. Please request a new one.' });

    // Set new password and clear reset token
    airline.password            = newPassword;  // pre-save hook hashes it
    airline.resetPasswordToken  = null;
    airline.resetPasswordExpiry = null;
    await airline.save();

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

// ─────────────────────────────────────────────
//  ADMIN: CREATE AIRLINE (on behalf of the airline — no email verification)
//  POST /api/auth/admin/airline
//  Body: { name, airlineName, email, password, address?, logo_url?,
//          can_author_exams?, can_create_subusers? }
// ─────────────────────────────────────────────
exports.adminCreateAirline = async (req, res) => {
  try {
    const {
      name, airlineName, email, password, address, logo_url,
      can_author_exams, can_create_subusers, can_view_all_results,
    } = req.body;

    if (!name || !airlineName || !email || !password)
      return res.status(400).json({ error: 'Contact name, airline name, email, and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const cleanEmail = email.toLowerCase().trim();
    const existing = await Airline.findOne({ email: cleanEmail });
    if (existing && existing.emailVerified)
      return res.status(400).json({ error: 'An account with this email already exists.' });

    let airline;
    if (existing && !existing.emailVerified) {
      // Reuse a pending (never-verified) record — overwrite and verify directly.
      existing.name          = name.trim();
      existing.airlineName    = airlineName.trim();
      existing.password       = password; // pre-save hook hashes
      existing.address        = (address || '').trim();
      existing.logo_url       = logo_url || null;
      existing.emailVerified  = true;
      existing.otpCode        = null;
      existing.otpExpiry      = null;
      existing.otpAttempts    = 0;
      if (typeof can_author_exams === 'boolean')     existing.can_author_exams = can_author_exams;
      if (typeof can_create_subusers === 'boolean')  existing.can_create_subusers = can_create_subusers;
      if (typeof can_view_all_results === 'boolean') existing.can_view_all_results = can_view_all_results;
      await existing.save();
      airline = existing;
    } else {
      airline = await Airline.create({
        name:          name.trim(),
        airlineName:    airlineName.trim(),
        email:          cleanEmail,
        password,
        address:        (address || '').trim(),
        logo_url:       logo_url || null,
        emailVerified:  true,
        can_author_exams:     typeof can_author_exams === 'boolean' ? can_author_exams : false,
        can_create_subusers:  typeof can_create_subusers === 'boolean' ? can_create_subusers : false,
        can_view_all_results: typeof can_view_all_results === 'boolean' ? can_view_all_results : false,
      });
    }

    res.status(201).json({ message: `Airline "${airline.airlineName}" created.`, airline: airline.toJSON() });
  } catch (err) {
    console.error('POST /admin/airline error:', err.message);
    const msg = err.code === 11000
      ? 'An account with this email already exists.'
      : err.message || 'Server error creating airline.';
    res.status(err.code === 11000 ? 400 : 500).json({ error: msg });
  }
};

// ─────────────────────────────────────────────
//  ADMIN: UPDATE AIRLINE (name + address)
//  PATCH /api/auth/admin/airline/:id
//  Admin can edit any airline's airlineName and address.
// ─────────────────────────────────────────────
exports.adminUpdateAirline = async (req, res) => {
  try {
    const airline = await Airline.findById(req.params.id);
    if (!airline) return res.status(404).json({ error: 'Airline not found.' });

    const { airlineName, address, can_author_exams, can_create_subusers, can_view_all_results } = req.body;
    if (airlineName !== undefined) {
      if (!airlineName.trim()) return res.status(400).json({ error: 'Airline name cannot be empty.' });
      airline.airlineName = airlineName.trim();
    }
    if (address !== undefined) airline.address = (address || '').trim();
    if (typeof can_author_exams === 'boolean') airline.can_author_exams = can_author_exams;
    if (typeof can_create_subusers === 'boolean') airline.can_create_subusers = can_create_subusers;
    if (typeof can_view_all_results === 'boolean') airline.can_view_all_results = can_view_all_results;

    await airline.save();
    res.json({ message: 'Airline updated.', airline: airline.toJSON() });
  } catch (err) {
    console.error('PATCH /admin/airline error:', err.message);
    res.status(500).json({ error: err.message || 'Server error updating airline.' });
  }
};

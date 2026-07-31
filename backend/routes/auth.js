const express = require('express');
const router = express.Router();
const { upload } = require('../services/upload');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const authController = require('../controllers/authController');

// ─── ADMIN SIGNUP — POST /api/auth/signup ────────────────────────────────────
router.post('/signup', authController.adminSignup);

// ─── ADMIN LOGIN — POST /api/auth/login ──────────────────────────────────────
router.post('/login', authController.adminLogin);

// ─── UPLOAD AIRLINE LOGO — POST /api/auth/airline/upload-logo ────────────────
router.post('/airline/upload-logo', upload.single('logo'), authController.uploadAirlineLogo);

// ─── AIRLINE SIGNUP — POST /api/auth/airline/signup ──────────────────────────
router.post('/airline/signup', authController.airlineSignup);

// ─── AIRLINE OTP VERIFY — POST /api/auth/airline/verify-otp ──────────────────
router.post('/airline/verify-otp', authController.airlineVerifyOtp);

// ─── RESEND OTP — POST /api/auth/airline/resend-otp ──────────────────────────
router.post('/airline/resend-otp', authController.airlineResendOtp);

// ─── AIRLINE LOGIN — POST /api/auth/airline/login ────────────────────────────
router.post('/airline/login', authController.airlineLogin);

// ─── GET ME — GET /api/auth/me ───────────────────────────────────────────────
router.get('/me', authMiddleware, authController.getMe);

// ─── UPDATE PROFILE — PUT /api/auth/profile ──────────────────────────────────
router.put('/profile', authMiddleware, authController.updateProfile);

// ─── FORGOT PASSWORD — POST /api/auth/airline/forgot-password ────────────────
router.post('/airline/forgot-password', authController.airlineForgotPassword);

// ─── RESET PASSWORD — POST /api/auth/airline/reset-password ──────────────────
router.post('/airline/reset-password', authController.airlineResetPassword);

// ─── ADMIN: UPDATE AIRLINE — PATCH /api/auth/admin/airline/:id ───────────────
router.patch('/admin/airline/:id', authMiddleware, adminOnly, authController.adminUpdateAirline);

module.exports = router;

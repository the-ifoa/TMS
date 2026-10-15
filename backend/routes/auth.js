const express = require('express');
const router = express.Router();
const { upload } = require('../services/upload');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const authController = require('../controllers/authController');
const { validateBody, schemas } = require('../middleware/validate');
const secondaryLogins = require('../controllers/secondaryLoginController');

// ─── ADMIN SIGNUP — POST /api/auth/signup ────────────────────────────────────
router.post('/signup', validateBody(schemas.adminSignup), authController.adminSignup);

// ─── ADMIN LOGIN — POST /api/auth/login ──────────────────────────────────────
router.post('/login', validateBody(schemas.login), authController.adminLogin);

// ─── UPLOAD AIRLINE LOGO — POST /api/auth/airline/upload-logo ────────────────
router.post('/airline/upload-logo', upload.single('logo'), authController.uploadAirlineLogo);

// ─── AIRLINE SIGNUP — POST /api/auth/airline/signup ──────────────────────────
router.post('/airline/signup', validateBody(schemas.airlineSignup), authController.airlineSignup);

// ─── AIRLINE OTP VERIFY — POST /api/auth/airline/verify-otp ──────────────────
router.post('/airline/verify-otp', validateBody(schemas.verifyOtp), authController.airlineVerifyOtp);

// ─── RESEND OTP — POST /api/auth/airline/resend-otp ──────────────────────────
router.post('/airline/resend-otp', validateBody(schemas.emailOnly), authController.airlineResendOtp);

// ─── AIRLINE LOGIN — POST /api/auth/airline/login ────────────────────────────
router.post('/airline/login', validateBody(schemas.login), authController.airlineLogin);

// Additional logins for the same airline account (admin-granted; primary login only)
router.get('/airline/secondary-logins',          authMiddleware, secondaryLogins.list);
router.get('/airline/secondary-logins/powers',   authMiddleware, secondaryLogins.powers);
router.post('/airline/secondary-logins',         authMiddleware, secondaryLogins.create);
router.patch('/airline/secondary-logins/:id',    authMiddleware, secondaryLogins.update);
router.delete('/airline/secondary-logins/:id',   authMiddleware, secondaryLogins.remove);

// ─── GET ME — GET /api/auth/me ───────────────────────────────────────────────
router.get('/me', authMiddleware, authController.getMe);

// ─── UPDATE PROFILE — PUT /api/auth/profile ──────────────────────────────────
router.put('/profile', authMiddleware, authController.updateProfile);

// ─── FORGOT PASSWORD — POST /api/auth/airline/forgot-password ────────────────
router.post('/airline/forgot-password', validateBody(schemas.emailOnly), authController.airlineForgotPassword);

// ─── RESET PASSWORD — POST /api/auth/airline/reset-password ──────────────────
router.post('/airline/reset-password', validateBody(schemas.resetPassword), authController.airlineResetPassword);

// ─── ADMIN: CREATE AIRLINE — POST /api/auth/admin/airline ────────────────────
router.post('/admin/airline', authMiddleware, adminOnly, loadScope, requirePermission('airlines.manage'), authController.adminCreateAirline);

// ─── ADMIN: UPDATE AIRLINE — PATCH /api/auth/admin/airline/:id ───────────────
router.patch('/admin/airline/:id', authMiddleware, adminOnly, loadScope, requirePermission('airlines.manage'), authController.adminUpdateAirline);

// ─── ADMIN: BULK AIRLINE SETTINGS — GET/PATCH /api/auth/admin/airlines/settings ─
router.get('/admin/airlines/settings', authMiddleware, adminOnly, loadScope, requirePermission('airlines.manage'), authController.adminListAirlineSettings);
router.patch('/admin/airlines/settings', authMiddleware, adminOnly, loadScope, requirePermission('airlines.manage'), authController.adminBulkUpdateAirlineSettings);

module.exports = router;

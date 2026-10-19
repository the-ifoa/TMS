// ─────────────────────────────────────────────────────────────────────────────
//  Body validation with zod.
//
//  validateBody(schema) rejects a request whose body does not match `schema`
//  with 400 { error, details }. Schemas only check types and sizes; the
//  controllers keep their own "field is required" messages, so every field
//  here is optional and unknown fields pass through untouched.
// ─────────────────────────────────────────────────────────────────────────────
const { z } = require('zod');
const { STATEMENT_KEYS, FEEDBACK_FORM } = require('../config/feedbackForm');

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid request.',
        details: result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
      });
    }
    req.body = result.data;
    next();
  };
}

const email    = z.string().trim().max(254);
const password = z.string().max(200);
const name     = z.string().trim().max(200);

const schemas = {
  adminSignup:    z.object({ name, email, password }).partial().passthrough(),
  login:          z.object({ email, password }).partial().passthrough(),
  airlineSignup:  z.object({ name, airlineName: name, email, password, logo_url: z.string().url().max(500).or(z.literal('')).nullable() }).partial().passthrough(),
  verifyOtp:      z.object({ email, otp: z.union([z.string().trim().regex(/^\d{6}$/, 'must be 6 digits'), z.number().int()]) }).partial().passthrough(),
  emailOnly:      z.object({ email }).partial().passthrough(),
  resetPassword:  z.object({ email, token: z.string().regex(/^[a-f0-9]{64}$/, 'invalid reset token'), newPassword: password }).partial().passthrough(),
  // Customer Training Feedback — public submit (all fields checked strictly).
  feedbackSubmit: z.object({
    company:         z.string().trim().min(1, 'is required').max(200),
    training_title:  z.string().trim().min(1, 'is required').max(200),
    instructor_name: z.string().trim().min(1, 'is required').max(200),
    ratings: z.object(Object.fromEntries(STATEMENT_KEYS.map((k) => [k, z.number().int().min(1).max(5).optional()]))),
    comments: z.string().trim().max(FEEDBACK_FORM.essay.max_length).optional().default(''),
  }),
  feedbackSend: z.object({
    participant_ids: z.array(z.string().regex(/^[a-f0-9]{24}$/, 'invalid id')).min(1).max(500),
  }),
  feedbackReportEmail: z.object({
    to: z.array(z.string().trim().email('invalid email address')).min(1, 'Add at least one email address.').max(10, 'At most 10 recipients.'),
    message: z.string().max(2000).optional().default(''),
    pdf_base64: z.string().min(100).max(14_000_000), // ~10 MB PDF
  }),
};

module.exports = { validateBody, schemas, z };

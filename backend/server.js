// Force Google public DNS so MongoDB Atlas SRV lookups work on
// corporate/restrictive networks whose DNS blocks SRV records.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
// Load first so every console.* below is also written to logs/backend.log
const { requestLogger } = require('./utils/logger');
const compression = require('compression');
const helmet = require('helmet');
const { FRONTEND_URL } = require('./config/appUrls');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// ── Auto-fix: ensure Dispatch_graduate.pdf and HumanFactors.pdf exist ──────────
// If they were deleted or are missing, copy from recurrent (same green design)
(function ensureGreenTemplates() {
  const root = path.join(__dirname, '..');
  const src  = path.join(root, 'recurrent_training_with_modules.pdf');
  const targets = ['Dispatch_graduate.pdf', 'HumanFactors.pdf'];
  if (!fs.existsSync(src)) return;
  targets.forEach(name => {
    const dst = path.join(root, name);
    if (!fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      console.log(`[startup] Created missing template: ${name}`);
    }
  });
})();

// Clear any cached models so nodemon restarts start completely fresh
// This prevents stale pre-save hook stacking across hot reloads
delete mongoose.models.Participant;
delete mongoose.models.Admin;
delete mongoose.models.Airline;
delete mongoose.models.CertCounter;
delete mongoose.models.ExamResult;
delete mongoose.models.Contract;
delete mongoose.models.Exam;
delete mongoose.models.ExamAttempt;

// Register all models fresh
require('./models/Admin');
require('./models/Airline');
require('./models/Participant');
require('./models/CertCounter');
require('./models/ExamResult');
require('./models/Contract');
require('./models/Exam');
require('./models/ExamAttempt');

const { initDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS: allow ALL origins.
// Security is enforced via JWT tokens on every protected route,
// not by restricting which domains can call the API.
app.use(cors({
  origin: true,               // reflect the request origin — allows any domain
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Handle preflight OPTIONS requests for every route
app.options('*', cors({ origin: true, credentials: true }));
// Security headers. The API is called from the frontend's own domain, and
// certificate / contract PDFs are shown there inside <iframe>s, so:
//  • framing is allowed only from the frontend origin(s) (frame-ancestors),
//    FRAME_ANCESTORS (comma list) overrides; with neither set, any origin may frame
//  • responses may be loaded cross-origin (crossOriginResourcePolicy)
const frameAncestors = (process.env.FRAME_ANCESTORS || FRONTEND_URL)
  .split(',').map((u) => u.trim()).filter(Boolean)
  .map((u) => { try { return new URL(u).origin; } catch { return null; } }).filter(Boolean);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      // Only frame-ancestors: a stricter default-src could stop the browser's
      // PDF viewer from rendering the certificate previews.
      defaultSrc: helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc,
      frameAncestors: frameAncestors.length ? ["'self'", ...frameAncestors] : ['*'],
    },
  },
  frameguard: false,   // X-Frame-Options can't list other origins; CSP frame-ancestors does it
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
// Gzip JSON responses — the list endpoints shrink ~5-10x over the wire.
app.use(compression());
app.use(express.json({ limit: '20mb' }));
// Strip MongoDB operators / prototype keys from all input (see middleware/sanitize.js)
app.use(require('./middleware/sanitize').sanitizeRequest);
app.use(requestLogger);

let dbConnected = false;

// Render's health check (render.yaml) — 503 until MongoDB is connected, so a
// deploy that can't reach the database never takes traffic.
app.get('/api/health', (req, res) => {
  const ok = dbConnected && mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    database: ok ? 'connected' : 'offline',
    timestamp: new Date().toISOString(),
  });
});

// Start DB initialization but don't block server startup
initDB()
  .then(async () => {
    dbConnected = true;
    console.log('✅ Database initialization complete');
    // Self-healing: advance any counter whose high_water is behind
    // the highest cert_sequence actually issued in the participants collection.
    // Safe if several instances start at once — it only ever raises a counter
    // with a conditional update. (The old seq → high_water migration now lives
    // in scripts/migrate-cert-counters.js.)
    const { syncHighWater } = require('./models/CertCounter');
    await syncHighWater();
  })
  .catch((err) => {
    dbConnected = false;
    console.warn('⚠️  Server starting in offline mode (database unavailable)');
    console.warn('   Some API endpoints may not work until database is reachable');
  });

// Register routes immediately — they will handle the offline/degraded state themselves
const participantsRouter    = require('./routes/participants');
const certificatesRouter    = require('./routes/certificates');
const notificationsRouter   = require('./routes/notifications');
const authRouter            = require('./routes/auth');
const examResultsRouter     = require('./routes/examResults');
const attendanceRouter      = require('./routes/attendance');
const contractsRouter       = require('./routes/contracts');
const dgrRouter             = require('./routes/dgr');
const examsRouter           = require('./routes/exams');
const publicExamRouter      = require('./routes/publicExam');
const questionBankRouter    = require('./routes/questionBank');
const clientLogsRouter      = require('./routes/clientLogs');
const teamRouter            = require('./routes/team');
const internalCertsRouter   = require('./routes/internalCertificates');
const internalAssessmentsRouter = require('./routes/internalAssessments');
const feedbackRouter        = require('./routes/feedback');
const publicFeedbackRouter  = require('./routes/publicFeedback');

app.use('/api/auth', authRouter);
app.use('/api/participants', participantsRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/exam-results', examResultsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/dgr', dgrRouter);
app.use('/api/exams', examsRouter);
app.use('/api/public-exam', publicExamRouter);
app.use('/api/question-bank', questionBankRouter);
app.use('/api/client-logs', clientLogsRouter);
app.use('/api/team', teamRouter);
app.use('/api/internal-certificates', internalCertsRouter);
app.use('/api/internal-assessments', internalAssessmentsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/public-feedback', publicFeedbackRouter);

// Frontend is served separately (localhost in dev, or its own host in prod).
// The backend is API-only — do NOT serve static files from here.

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 Database status: ${dbConnected ? 'connected' : 'offline'}`);
});

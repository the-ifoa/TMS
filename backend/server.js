// Force Google public DNS so MongoDB Atlas SRV lookups work on
// corporate/restrictive networks whose DNS blocks SRV records.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
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
app.use(express.json({ limit: '20mb' }));

let dbConnected = false;

app.get('/api/health', (req, res) => {
  res.json({ 
    status: dbConnected ? 'ok' : 'degraded',
    database: dbConnected ? 'connected' : 'offline',
    timestamp: new Date().toISOString() 
  });
});

// ── One-time migration: CertCounter seq → high_water ──────────────────────────
// Old documents used a `seq` field. New code uses `high_water`.
// This runs once at startup and is a no-op if already migrated.
async function migrateCertCounters() {
  try {
    const CertCounter = mongoose.model('CertCounter');
    // Find any counter docs that still have `seq` but no `high_water`
    const old = await CertCounter.find({ seq: { $exists: true }, high_water: { $exists: false } }).lean();
    if (old.length === 0) return;
    for (const doc of old) {
      await CertCounter.updateOne(
        { _id: doc._id },
        { $set: { high_water: doc.seq || 0 }, $unset: { seq: '' } }
      );
      console.log(`[migration] CertCounter ${doc.training_type}: seq=${doc.seq} → high_water=${doc.seq || 0}`);
    }
    console.log(`[migration] Migrated ${old.length} CertCounter document(s) to new high_water schema.`);
  } catch (err) {
    console.error('[migration] CertCounter migration failed:', err.message);
  }
}

// Start DB initialization but don't block server startup
initDB()
  .then(async () => {
    dbConnected = true;
    console.log('✅ Database initialization complete');
    await migrateCertCounters();
    // Self-healing: advance any counter whose high_water is behind
    // the highest cert_sequence actually issued in the participants collection.
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

// Frontend is served separately (localhost in dev, or its own host in prod).
// The backend is API-only — do NOT serve static files from here.

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 Database status: ${dbConnected ? 'connected' : 'offline'}`);
});

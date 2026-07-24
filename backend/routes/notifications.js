const express = require('express');
const router = express.Router();
const Participant = require('../models/Participant');
const Airline = require('../models/Airline');
const DgrForm = require('../models/DgrForm');
const { authMiddleware } = require('./auth');

router.use(authMiddleware);

// ─── GET /api/notifications ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.admin.role === 'admin' || req.admin.role === 'Administrator';
    const notifications = [];
    const now = Date.now();

    // ── Build participant filter ───────────────────────────────────────────
    const filter = {};
    if (!isAdmin) {
      const airlineFilters = [{ submitted_by: req.admin.id }];
      if (req.admin.airlineName) {
        const escaped = req.admin.airlineName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(`^${escaped}$`, 'i');
        airlineFilters.push({ submitted_by: null, $or: [{ airline_name: rx }, { company: rx }] });
      }
      filter.$or = airlineFilters;
    }

    const participants = await Participant.find(filter)
      .sort({ updated_at: -1, created_at: -1 })
      .limit(100)
      .lean();

    const sevenDays  = 7  * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    participants.forEach(p => {
      const name    = p.participant_name || `${p.first_name} ${p.last_name}`.trim();
      const airline = p.company || p.airline_name || 'Unknown Airline';
      const type    = p.training_type || '';
      const created = new Date(p.created_at).getTime();
      const updated = new Date(p.updated_at).getTime();

      // ── 1. Certificate generated ─────────────────────────────────────────
      if (p.cert_sequence) {
        const certId = `${type}-${String(p.cert_sequence).padStart(5, '0')}`;
        notifications.push({
          id:       `cert-${p._id}`,
          type:     'certificate',
          title:    isAdmin ? 'Certificate Issued' : 'Your Certificate is Ready',
          message:  isAdmin
            ? `${certId} issued for ${name} · ${airline} · ${type} training`
            : `${name}, your ${type} certificate (${certId}) has been issued. You can now download it.`,
          time:     updated,
          priority: 'high',
          link:     isAdmin ? `/admin/airlines?focus=${p._id}` : `/airline/submissions?focus=${p._id}`,
        });
      }

      // ── 2. New enrollment (last 7 days) ──────────────────────────────────
      if (now - created < sevenDays) {
        notifications.push({
          id:       `new-${p._id}`,
          type:     'participant',
          title:    isAdmin ? 'New Enrollment Received' : 'Enrollment Submitted',
          message:  isAdmin
            ? `${name} enrolled by ${airline} for ${type} training (${p.department || 'N/A'})`
            : `Your enrollment for ${name} (${type}) has been received and is pending review by IFOA.`,
          time:     created,
          priority: 'normal',
          link:     isAdmin ? `/admin/airlines?focus=${p._id}` : `/airline/submissions?focus=${p._id}`,
        });
      }

      // ── 3. NDG score set — admin only ────────────────────────────────────
      if (isAdmin && p.ndg_score != null && type === 'NDG') {
        notifications.push({
          id:       `ndg-${p._id}`,
          type:     'score',
          title:    'NDG Score Recorded',
          message:  `${name} (${airline}) achieved ${p.ndg_score}% on ${type} — ${p.ndg_subtype === 'R' ? 'Recurrent' : 'Initial'}`,
          time:     updated,
          priority: 'normal',
          link:     `/admin/airlines?focus=${p._id}`,
        });
      }
    });

    // ── 4. New airlines registered (last 30 days) — admin only ───────────
    if (isAdmin) {
      const airlines = await Airline.find({}).sort({ createdAt: -1 }).limit(20).lean();
      airlines.forEach(a => {
        const created = new Date(a.createdAt).getTime();
        if (now - created < thirtyDays) {
          notifications.push({
            id:       `airline-${a._id}`,
            type:     'airline',
            title:    'New Airline Registered',
            message:  `${a.airlineName} has created an account and can now submit enrollments`,
            time:     created,
            priority: 'normal',
            link:     `/admin/airlines?focus=${a._id}`,
          });
        }
      });

      // ── 5. Participants pending certificate (no cert_sequence yet) — admin ──
      const pending = participants.filter(p => !p.cert_sequence);
      if (pending.length > 0) {
        notifications.push({
          id:       `pending-certs-admin`,
          type:     'pending',
          title:    'Certificates Pending',
          message:  `${pending.length} participant${pending.length > 1 ? 's are' : ' is'} awaiting certificate generation`,
          time:     now - 1000,
          priority: 'normal',
          link:     '/admin/airlines?pendingCerts=1',
        });
      }
    } else {
      // ── 6. Airline: notify if any of their participants still pending ────
      const myPending = participants.filter(p => !p.cert_sequence);
      if (myPending.length > 0) {
        notifications.push({
          id:       `pending-mine`,
          type:     'pending',
          title:    'Awaiting Certificate',
          message:  `${myPending.length} of your submission${myPending.length > 1 ? 's are' : ' is'} still being processed by IFOA`,
          time:     now - 1000,
          priority: 'normal',
          link:     '/airline/submissions',
        });
      }

      // ── 7. Airline: DGR CBTA forms assigned to their participants ────────
      const dgrForms = await DgrForm.find({
        airline_id: req.admin.id,
        'assignments.0': { $exists: true },
      }).sort({ created_at: -1 }).limit(20).lean();

      dgrForms.forEach(f => {
        const created = new Date(f.created_at).getTime();
        const count   = f.assignments.length;
        const names   = f.assignments.map(a => a.participant_name).join(', ');
        const preview = names.length > 60 ? names.slice(0, 60) + '…' : names;
        notifications.push({
          id:       `dgr-${f._id}`,
          type:     'dgr',
          title:    'DGR CBTA Form Assigned',
          message:  `DGR ${f.dg_training_type || 'Training'} form (${f.training_date || 'no date'}) assigned to ${count} participant${count !== 1 ? 's' : ''}: ${preview}`,
          time:     created,
          priority: 'normal',
          link:     `/airline/dgr?focus=${f._id}`,
        });
      });
    }

    // ── Sort, deduplicate, cap at 30 ──────────────────────────────────────
    const seen = new Set();
    const final = notifications
      .sort((a, b) => b.time - a.time)
      .filter(n => { if (seen.has(n.id)) return false; seen.add(n.id); return true; })
      .slice(0, 30);

    res.json(final);
  } catch (err) {
    console.error('GET /notifications error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const DgrForm = require('../models/DgrForm');
const Airline = require('../models/Airline');
const Participant = require('../models/Participant');
const { authMiddleware } = require('./auth');

router.use(authMiddleware);

function isAdmin(req) {
  return req.admin?.role === 'admin' || req.admin?.role === 'Administrator';
}

// ─── GET /dgr/airlines — admin only: airlines that have participants ──────────
// Returns [{ airline, participants: [...] }] so the admin can pick an airline
// and then the students within it to assign a form to.
router.get('/airlines', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });

    const airlines     = await Airline.find({}).sort({ airlineName: 1 });
    const participants = await Participant.find({}).sort({ created_at: -1 });

    const result = airlines.map((a) => ({
      airline: a.toJSON(),
      participants: participants
        .filter(
          (p) =>
            (p.submitted_by && String(p.submitted_by) === String(a._id)) ||
            (!p.submitted_by && (p.company === a.airlineName || p.airline_name === a.airlineName))
        )
        .map((p) => ({ _id: String(p._id), participant_name: p.participant_name, training_type: p.training_type })),
    }));

    res.json(result.filter((r) => r.participants.length > 0));
  } catch (err) {
    console.error('GET /dgr/airlines error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /dgr — list forms ────────────────────────────────────────────────────
// Admin: all forms (optional ?airline_id= filter).
// Airline: only forms belonging to their airline that have at least one assignment.
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (isAdmin(req)) {
      if (req.query.airline_id) filter.airline_id = req.query.airline_id;
    } else {
      if (!req.admin.id) return res.json([]);
      filter.airline_id = req.admin.id;
      filter['assignments.0'] = { $exists: true }; // only forms that were actually assigned
    }
    const forms = await DgrForm.find(filter).sort({ created_at: -1 });
    res.json(forms.map((f) => f.toJSON()));
  } catch (err) {
    console.error('GET /dgr error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /dgr/:id — single form ───────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const form = await DgrForm.findById(req.params.id);
    if (!form) return res.status(404).json({ error: 'DGR form not found.' });
    if (!isAdmin(req) && String(form.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    res.json(form.toJSON());
  } catch (err) {
    console.error('GET /dgr/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /dgr — create (admin) ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    if (!req.body.airline_id) return res.status(400).json({ error: 'airline_id is required.' });

    const airline = await Airline.findById(req.body.airline_id);
    if (!airline) return res.status(404).json({ error: 'Airline not found.' });

    const form = await DgrForm.create({
      ...req.body,
      airline_id:   airline._id,
      airline_name: airline.airlineName,
      created_by:   req.admin.id,
    });
    res.status(201).json(form.toJSON());
  } catch (err) {
    console.error('POST /dgr error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /dgr/:id — update fields + assignments (admin) ───────────────────────
router.put('/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const form = await DgrForm.findById(req.params.id);
    if (!form) return res.status(404).json({ error: 'DGR form not found.' });

    // Never allow re-pointing the owner airline or audit fields via body
    const { airline_id, created_by, _id, id, ...updatable } = req.body;
    Object.assign(form, updatable);
    await form.save();
    res.json(form.toJSON());
  } catch (err) {
    console.error('PUT /dgr/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /dgr/:id (admin) ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const form = await DgrForm.findByIdAndDelete(req.params.id);
    if (!form) return res.status(404).json({ error: 'DGR form not found.' });
    res.json({ message: 'DGR form deleted.' });
  } catch (err) {
    console.error('DELETE /dgr/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

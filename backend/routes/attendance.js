const express = require('express');
const router = express.Router();
const AttendanceSheet = require('../models/AttendanceSheet');
const { authMiddleware } = require('./auth');

router.use(authMiddleware);

// ─── GET /api/attendance — list sheets ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.admin.role === 'airline') filter.submitted_by = req.admin.id;
    if (req.query.company) filter.company = req.query.company;
    if (req.query.training_type) filter.training_type = req.query.training_type;

    const sheets = await AttendanceSheet.find(filter)
      .select('_id company training_type start_date end_date participants submitted_by created_at')
      .sort({ created_at: -1 });
    res.json(sheets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/attendance/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const sheet = await AttendanceSheet.findById(req.params.id);
    if (!sheet) return res.status(404).json({ error: 'Not found' });

    // Airlines can only read their own sheets
    if (req.admin.role === 'airline' && String(sheet.submitted_by) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/attendance — create new sheet ──────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { company, training_type, start_date, end_date, participants, records } = req.body;
    if (!company || !start_date) return res.status(400).json({ error: 'company and start_date required' });

    const sheet = await AttendanceSheet.create({
      company,
      training_type: training_type || null,
      start_date,
      end_date: end_date || null,
      participants: participants || [],
      records: records || [],
      submitted_by: req.admin.role === 'airline' ? req.admin.id : null,
    });

    res.status(201).json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/attendance/:id — update existing sheet ─────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const sheet = await AttendanceSheet.findById(req.params.id);
    if (!sheet) return res.status(404).json({ error: 'Not found' });

    if (req.admin.role === 'airline' && String(sheet.submitted_by) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { company, training_type, start_date, end_date, participants, records } = req.body;
    if (company) sheet.company = company;
    if (training_type) sheet.training_type = training_type;
    if (start_date) sheet.start_date = start_date;
    sheet.end_date = end_date || null;
    if (participants) sheet.participants = participants;
    if (records) sheet.records = records;

    await sheet.save();
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

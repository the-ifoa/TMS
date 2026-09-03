const AttendanceSheet = require('../models/AttendanceSheet');
const Participant     = require('../models/Participant');
const Airline         = require('../models/Airline');

// ─── GET /api/attendance — list sheets ───────────────────────────────────────
exports.listSheets = async (req, res) => {
  try {
    const filter = {};
    if (req.admin.role === 'airline') filter.submitted_by = req.admin.id;
    if (req.query.company) filter.company = req.query.company;
    if (req.query.training_type) filter.training_type = req.query.training_type;

    const sheets = await AttendanceSheet.find(filter)
      .select('_id company training_type start_date end_date participants submitted_by created_at')
      .sort({ created_at: -1 })
      .lean();

    // `company` is a name snapshot taken when the sheet was made — it goes stale
    // if the airline later renames. Resolve the current name via submitted_by and
    // expose it as `airline_name` (falls back to the stored snapshot).
    const ownerIds = [...new Set(sheets.map(s => s.submitted_by).filter(Boolean).map(String))];
    const nameById = {};
    if (ownerIds.length) {
      const airlines = await Airline.find({ _id: { $in: ownerIds } }).select('airlineName').lean();
      airlines.forEach(a => { nameById[String(a._id)] = a.airlineName; });
    }
    const out = sheets.map(s => ({
      ...s,
      airline_name: (s.submitted_by && nameById[String(s.submitted_by)]) || s.company,
    }));
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/attendance/:id ──────────────────────────────────────────────────
exports.getSheet = async (req, res) => {
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
};

// ─── POST /api/attendance — create new sheet ──────────────────────────────────
exports.createSheet = async (req, res) => {
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
      // Airlines always own their own sheets. Admins may attribute the sheet to
      // an airline account by passing submitted_by (used by the bulk builder).
      submitted_by: req.admin.role === 'airline'
        ? req.admin.id
        : (req.body.submitted_by || null),
    });

    res.status(201).json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/attendance/bulk — ensure one sheet per training batch ──────────
// Body: { participantIds: [...] }. Groups the given participants by
// company + training_type + start/end date (+ owning airline) and creates an
// attendance sheet for each batch that doesn't have one yet. Returns every
// matching sheet so the caller can open the first for marking.
exports.bulkEnsureSheets = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.participantIds) ? req.body.participantIds : [];
    if (!ids.length) return res.status(400).json({ error: 'participantIds required' });

    let parts = await Participant.find({ _id: { $in: ids } }).lean();
    if (req.admin.role === 'airline') {
      parts = parts.filter(p => String(p.submitted_by) === String(req.admin.id));
    }
    if (!parts.length) return res.status(404).json({ error: 'No matching participants' });

    // ── group by batch ──
    const groups = new Map();
    for (const p of parts) {
      const start = (p.training_date || '').slice(0, 10);
      if (!start) continue;                       // no start date → can't build a sheet
      const company = p.company || p.airline_name || 'Unknown';
      const end     = (p.end_date || '').slice(0, 10) || null;
      const type    = p.training_type || null;
      const owner   = req.admin.role === 'airline' ? req.admin.id : (p.submitted_by || null);
      const key     = [company, type, start, end, String(owner || '')].join('||');
      if (!groups.has(key)) {
        groups.set(key, { company, training_type: type, start_date: start, end_date: end, submitted_by: owner || null, participants: [] });
      }
      groups.get(key).participants.push({ first_name: p.first_name || '', last_name: p.last_name || '' });
    }

    if (!groups.size) return res.status(400).json({ error: 'Selected participants have no training start date' });

    const out = [];
    for (const g of groups.values()) {
      let sheet = await AttendanceSheet.findOne({
        company:       g.company,
        training_type: g.training_type,
        start_date:    g.start_date,
        end_date:      g.end_date,
        submitted_by:  g.submitted_by || null,
      });
      let created = false;
      if (!sheet) {
        sheet = await AttendanceSheet.create({ ...g, records: [] });
        created = true;
      } else {
        // merge any newly-selected participants onto the existing sheet.
        // Append only (never reorder) so records[].present indices stay valid.
        const have = new Set(sheet.participants.map(x => `${x.first_name}|${x.last_name}`.toLowerCase()));
        let changed = false;
        for (const np of g.participants) {
          const k = `${np.first_name}|${np.last_name}`.toLowerCase();
          if (!have.has(k)) { sheet.participants.push(np); have.add(k); changed = true; }
        }
        if (changed) await sheet.save();
      }
      out.push({ sheet: sheet.toJSON(), created });
    }

    res.json({ sheets: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /api/attendance/:id — update existing sheet ─────────────────────────
exports.updateSheet = async (req, res) => {
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
};

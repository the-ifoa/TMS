const QuestionBankGroup = require('../models/QuestionBankGroup');
const QuestionBankItem = require('../models/QuestionBankItem');
const { deleteCloudinaryImage } = require('../services/upload');

function isAdmin(req) {
  return req.admin?.role === 'admin' || req.admin?.role === 'Administrator';
}

async function deleteItemImages(item) {
  const ids = [];
  if (item.image_public_id) ids.push(item.image_public_id);
  (item.images || []).forEach((img) => img.public_id && ids.push(img.public_id));
  (item.options || []).forEach((o) => o.image_public_id && ids.push(o.image_public_id));
  await Promise.all(ids.map((id) => deleteCloudinaryImage(id)));
}

// ═══════════════════════════════════════════════════════════════════════════
// Banks (named containers)
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /question-bank/groups — list banks with question counts (admin) ─────
exports.listGroups = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const groups = await QuestionBankGroup.find({}).sort({ created_at: -1 });
    const counts = await QuestionBankItem.aggregate([
      { $group: { _id: '$bank_id', count: { $sum: 1 } } },
    ]);
    const countById = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    res.json(groups.map((g) => ({ ...g.toJSON(), question_count: countById[String(g._id)] || 0 })));
  } catch (err) {
    console.error('GET /question-bank/groups error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /question-bank/groups — create a bank (admin) ───────────────────────
exports.createGroup = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    if (!req.body.name || !req.body.name.trim()) return res.status(400).json({ error: 'Bank name is required.' });

    const group = await QuestionBankGroup.create({
      name: req.body.name.trim(),
      description: req.body.description || '',
      created_by: req.admin.id,
    });
    res.status(201).json({ ...group.toJSON(), question_count: 0 });
  } catch (err) {
    console.error('POST /question-bank/groups error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /question-bank/groups/:id — rename/update a bank (admin) ────────────
exports.updateGroup = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const group = await QuestionBankGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Question bank not found.' });

    if (req.body.name != null) {
      if (!req.body.name.trim()) return res.status(400).json({ error: 'Bank name is required.' });
      group.name = req.body.name.trim();
    }
    if (req.body.description != null) group.description = req.body.description;
    await group.save();
    res.json(group.toJSON());
  } catch (err) {
    console.error('PUT /question-bank/groups/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /question-bank/groups/:id (admin) — cascades its questions ───────
exports.deleteGroup = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const group = await QuestionBankGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Question bank not found.' });

    const items = await QuestionBankItem.find({ bank_id: group._id });
    await Promise.all(items.map((item) => deleteItemImages(item)));
    await QuestionBankItem.deleteMany({ bank_id: group._id });
    await group.deleteOne();
    res.json({ message: 'Question bank deleted.' });
  } catch (err) {
    console.error('DELETE /question-bank/groups/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Items (questions within a bank)
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /question-bank/items — filterable list, scoped to one bank ──────────
exports.listItems = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const { bank_id, difficulty, knowledge, skill, initial, recurrent, type, topic, search } = req.query;
    if (!bank_id) return res.status(400).json({ error: 'bank_id is required.' });

    const filter = { bank_id };
    if (difficulty) {
      const list = String(difficulty).split(',').filter(Boolean);
      if (list.length > 0) filter.difficulty = { $in: list };
    }
    if (knowledge === '1') filter.is_knowledge = true;
    if (skill === '1') filter.is_skill = true;
    if (initial === '1') filter.is_initial = true;
    if (recurrent === '1') filter.is_recurrent = true;
    if (type) filter.type = type;
    if (topic) filter.section = topic;
    if (search) filter.prompt = { $regex: search, $options: 'i' };

    const items = await QuestionBankItem.find(filter).sort({ created_at: 1 });
    res.json(items.map((i) => i.toJSON()));
  } catch (err) {
    console.error('GET /question-bank/items error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /question-bank/topics — distinct topic labels within a bank ─────────
exports.listTopics = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const filter = { section: { $ne: '' } };
    if (req.query.bank_id) filter.bank_id = req.query.bank_id;
    const topics = await QuestionBankItem.distinct('section', filter);
    res.json(topics.sort());
  } catch (err) {
    console.error('GET /question-bank/topics error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /question-bank/items — create one item (admin) ─────────────────────
exports.createItem = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    if (!req.body.bank_id) return res.status(400).json({ error: 'bank_id is required.' });
    if (!req.body.type) return res.status(400).json({ error: 'type is required.' });

    const item = await QuestionBankItem.create({ ...req.body, created_by: req.admin.id });
    res.status(201).json(item.toJSON());
  } catch (err) {
    console.error('POST /question-bank/items error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /question-bank/items/:id — update (admin) ────────────────────────────
exports.updateItem = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const item = await QuestionBankItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Question not found.' });

    const { _id, id, created_by, bank_id, ...updatable } = req.body;
    Object.assign(item, updatable);
    await item.save();
    res.json(item.toJSON());
  } catch (err) {
    console.error('PUT /question-bank/items/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /question-bank/items/:id (admin) — cascades Cloudinary cleanup ───
exports.deleteItem = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const item = await QuestionBankItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Question not found.' });

    await deleteItemImages(item);
    await item.deleteOne();
    res.json({ message: 'Question deleted.' });
  } catch (err) {
    console.error('DELETE /question-bank/items/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

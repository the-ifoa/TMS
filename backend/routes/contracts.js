'use strict';
const express = require('express');
const router = express.Router();
const Airline  = require('../models/Airline');
const Contract = require('../models/Contract');
const { authMiddleware, adminOnly } = require('./auth');
const { generateContract, DEFAULT_FIELDS, DEFAULT_BLOCKS, buildDefaultBlocks } = require('../services/contractGenerator');
const { sendContractEmail } = require('../services/emailService');

router.use(authMiddleware, adminOnly);

const MAX_EXTRA = 30;

function sanitizeExtraBlocks(extraBlocks) {
  if (!Array.isArray(extraBlocks)) return [];
  return extraBlocks.slice(0, MAX_EXTRA).map(b => {
    if (b && b.type === 'image' && b.dataUrl) return { type: 'image', dataUrl: String(b.dataUrl) };
    if (b && b.type === 'text')  return { type: 'text', content: String(b.content || '') };
    return null;
  }).filter(Boolean);
}

function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return null;
  return blocks.map(b => ({
    id:   String(b.id   || ''),
    type: String(b.type || 'para'),
    text: String(b.text || ''),
  }));
}

// ─── GET /api/contracts/defaults ─────────────────────────────────────────────
router.get('/defaults', (req, res) => {
  res.json({
    blocks: DEFAULT_BLOCKS,
    fields: DEFAULT_FIELDS,
    meta:   { clientName: DEFAULT_FIELDS.clientName, clientAddress: DEFAULT_FIELDS.clientAddress, headerDate: 'OCTOBER 2024' },
  });
});

// ─── GET /api/contracts/defaults/:airlineId ───────────────────────────────────
// Returns blocks pre-filled with this airline's name + address.
router.get('/defaults/:airlineId', async (req, res) => {
  try {
    const airline = await Airline.findById(req.params.airlineId);
    if (!airline) return res.status(404).json({ error: 'Airline not found.' });
    const fields = {
      ...DEFAULT_FIELDS,
      clientName:    airline.airlineName,
      clientAddress: airline.address || '',
    };
    res.json({
      blocks: buildDefaultBlocks(fields),
      fields,
      meta: { clientName: airline.airlineName, clientAddress: airline.address || '', headerDate: 'OCTOBER 2024' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contracts/airlines ─────────────────────────────────────────────
// All airlines with contract status (sent / not sent).
router.get('/airlines', async (req, res) => {
  try {
    const [airlines, contracts] = await Promise.all([
      Airline.find({}).sort({ airlineName: 1 }).select('airlineName email address logo_url'),
      Contract.find({}).select('airlineId sentAt toEmail').lean(),
    ]);
    const contractMap = {};
    contracts.forEach(c => { contractMap[String(c.airlineId)] = c; });

    res.json(airlines.map(a => {
      const c = contractMap[String(a._id)];
      return {
        id:          String(a._id),
        airlineName: a.airlineName,
        email:       a.email,
        address:     a.address || '',
        logoUrl:     a.logo_url  || null,
        contractSent:   !!c,
        contractId:     c ? String(c._id) : null,
        contractSentAt: c ? c.sentAt      : null,
        contractEmail:  c ? c.toEmail     : null,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contracts ───────────────────────────────────────────────────────
// All saved contracts.
router.get('/', async (req, res) => {
  try {
    const contracts = await Contract.find({}).sort({ sentAt: -1 }).lean();
    res.json(contracts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contracts/pdf/:id ───────────────────────────────────────────────
// Re-generate PDF from stored blocks and return inline.
router.get('/pdf/:id', async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id).lean();
    if (!contract) return res.status(404).json({ error: 'Contract not found.' });

    const pdf = await generateContract(
      sanitizeBlocks(contract.blocks),
      sanitizeExtraBlocks(contract.extraBlocks),
      { headerDate: contract.headerDate }
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Contract_${(contract.airlineName || 'Unknown').replace(/\s+/g, '_')}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error('[GET /contracts/pdf] error:', err);
    res.status(500).json({ error: 'Failed to generate contract PDF.' });
  }
});

// ─── POST /api/contracts/preview ─────────────────────────────────────────────
router.post('/preview', async (req, res) => {
  try {
    const { blocks, extraBlocks, headerDate } = req.body;
    const pdf = await generateContract(sanitizeBlocks(blocks), sanitizeExtraBlocks(extraBlocks), { headerDate });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Contract_Preview.pdf"');
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error('[POST /contracts/preview] error:', err);
    res.status(500).json({ error: 'Failed to generate contract preview.' });
  }
});

// ─── POST /api/contracts/send ────────────────────────────────────────────────
// Generate + email + save/update contract record.
router.post('/send', async (req, res) => {
  try {
    const { toEmail, blocks, extraBlocks, message, airlineId, headerDate } = req.body;

    let recipient  = (toEmail || '').trim();
    let clientName = req.body.clientName;
    let airlineDoc = null;

    if (airlineId) {
      airlineDoc = await Airline.findById(airlineId);
      if (airlineDoc) {
        if (!recipient)   recipient  = airlineDoc.email;
        if (!clientName)  clientName = airlineDoc.airlineName;
      }
    }

    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return res.status(400).json({ error: 'A valid recipient email address is required.' });
    }

    const cleanBlocks = sanitizeBlocks(blocks);
    const cleanExtra  = sanitizeExtraBlocks(extraBlocks);
    const pdf = await generateContract(cleanBlocks, cleanExtra, { headerDate });
    await sendContractEmail({ toEmail: recipient, clientName, pdfBuffer: pdf, message });

    // Persist / update contract record (upsert per airline)
    if (airlineId) {
      await Contract.findOneAndUpdate(
        { airlineId },
        {
          airlineId,
          airlineName: clientName || airlineDoc?.airlineName || '',
          toEmail:     recipient,
          headerDate:  headerDate || 'OCTOBER 2024',
          blocks:      cleanBlocks || [],
          extraBlocks: cleanExtra  || [],
          message:     message || '',
          sentAt:      new Date(),
        },
        { upsert: true, new: true }
      );
    }

    res.json({ message: `Contract sent to ${recipient}.`, toEmail: recipient });
  } catch (err) {
    console.error('[POST /contracts/send] error:', err);
    res.status(500).json({ error: err.message || 'Failed to send contract.' });
  }
});

module.exports = router;

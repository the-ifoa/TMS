'use strict';
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Assets ───────────────────────────────────────────────────────────────────
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const LOGO_PATH   = path.join(ASSETS_DIR, 'logo.png');
const SIG_PATH    = path.join(ASSETS_DIR, 'sig_incammicia.png');

// ─── Layout constants (A4, top-left origin, points) ───────────────────────────
const PAGE_W   = 595.28;
const PAGE_H   = 841.89;
const ML       = 72;
const MR       = 72;
const CONTENT_W = PAGE_W - ML - MR;   // 451.28
const RIGHT_X   = PAGE_W - MR;        // 523.28
const TOP_TEXT  = 80;

const REG  = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const BOLDITAL = 'Helvetica-BoldOblique';

const INK   = '#1a1a1a';
const BODY  = 11;          // 11pt matches reference PDF
const HEADER_DATE = 'OCTOBER 2024';
const PARTY_INDENT = 108;  // BETWEEN/AND label→party text gap (matches reference)

// ─── Default dynamic field values (used to build the default blocks) ──────────
const DEFAULT_FIELDS = {
  effectiveDate: '14 OCTOBER 2025',
  clientName:    'AeroTransCargo',
  clientAddress: 'BD. Dacia 60/5, of 115, MD-2026, Chisinau, Moldova and Sharjah office located at Q4/174 Saif Zone, PO BOX 122487, Sharjah, United Arab Emirates.',
  termEndDate:   '31 DECEMBER 2025',
  currency:      'EURO',
  servicesList:  '2 days of Flight Dispatch recurrent/refresher training\n20-21 October 2025\nSynchronous Virtual Training',
  feesLine:      'Recurrent Training fees: 2 x 1,100 EUR = 2,200 EUR',
  paymentTerms:  'due within 30 days of receipt',
  latePenalty:   '2.00% per month',
  signatureDate: 'October 14, 2025',
};

// ─── Build the full default contract as an ordered list of editable blocks ────
// Markers:  **text**  = bold formatting only (static, renders bold in PDF)
//           {{value}} = dynamic/highlighted value (editable input in UI, renders bold in PDF)
function buildDefaultBlocks(f = DEFAULT_FIELDS) {
  return [
    { id: 'title',    type: 'title',   text: 'SERVICES AGREEMENT - TERMS AND CONDITIONS' },
    { id: 'eff',      type: 'lpara',   text: `This Service Agreement ("Agreement") is effective {{${f.effectiveDate}}}` },
    { id: 'between',  type: 'party',   text: `BETWEEN|{{${f.clientName}}} (the "Client"), having its principal office at {{${f.clientAddress}}}` },
    { id: 'and',      type: 'party',   text: `AND|International Flight Operational Academy GmbH (the "Service Provider"), a Limited Liability Company with its head office located at Oberdorf 26, 4314 Zeiningen, Switzerland.` },
    { id: 'parties',  type: 'italic',  text: 'The Service Provider and the Client shall be individually referred to as a "Party" and collectively referred to as the "Parties" as the context may require.' },
    { id: 'whereas',  type: 'heading', text: 'WHEREAS' },
    { id: 'wa',       type: 'para',    text: 'A.  The Service Provider has the experience and expertise in delivering Flight Operations training and, more specifically, Flight Dispatch and Flight Operations Officers training as per NEW EASA Part ORO GEN 110 (c) ICAO Doc 10106, IOSA Table 3.5 & 3.6, Ground Operations, Train The Trainer, and consulting services.' },
    { id: 'wb',       type: 'para',    text: 'B.  The Client desires to have the Service Provider deliver service for them.' },
    { id: 'wc',       type: 'para',    text: 'C.  The Service Provider desires to provide services to the Client on the terms and conditions set forth herein (the "Services")' },
    { id: 'now',      type: 'para',    text: 'NOW, THEREFORE, in consideration of the above recitals, the representations, warranties, and agreements contained in the Agreement and for other good and valuable reviews, the receipt and adequacy of which are now acknowledged, the Parties agree as follows:' },

    { id: 'h1',       type: 'heading', text: '1.  TERMS OF AGREEMENT' },
    { id: 's1a',      type: 'para',    text: `The terms of this Agreement (the "Terms") will begin on the date of this Agreement and will remain in full force and effect {{${f.termEndDate}}}, subject to earlier termination as provided in this Agreement.` },
    { id: 's1b',      type: 'para',    text: 'In the event that either Party breaches a material provision under this Agreement, the non-defaulting Party may terminate this Agreement immediately and require the defaulting Party to indemnify the non-defaulting Party against all reasonable damages.' },

    { id: 'h2',       type: 'heading', text: '2.  PERFORMANCE' },
    { id: 's2a',      type: 'para',    text: 'The Parties agree to do everything necessary to ensure that the terms of this Agreement take effect.' },
    { id: 's2b',      type: 'para',    text: 'The Client will monitor the performance of the Service Provider on a regular basis to ensure the Service Provider fulfills the operational requirements of the Client on a continuing basis.' },
    { id: 's2c',      type: 'para',    text: 'A meeting will be held between the Service Provider and the Client at least before the training process is started to review training materials. At all times, both parties shall always observe and ensure compliance with the training service standard and shall not compromise any safety regulations and/or procedures.' },

    { id: 'h3',       type: 'heading', text: '3.  SERVICES PROVIDED' },
    { id: 's3a',      type: 'para',    text: 'Beginning upon Agreement with this contract, the International Flight Operational Academy GmbH will provide the Client with the service (collectively, the "Services") described in Annex 1:' },
    { id: 's3bullet', type: 'bullet',  text: `{{${f.servicesList}}}` },

    { id: 'h4',       type: 'heading', text: '4.  PAYMENT' },
    { id: 's4a',      type: 'para',    text: `Except as otherwise provided in this Agreement, all monetary amounts referred to in this Agreement are in {{${f.currency}}}.` },
    { id: 's4b',      type: 'para',    text: 'In consideration for the Services to be performed by the Service Provider, the Client agrees to pay the services fees as:' },
    { id: 's4bullet', type: 'bullet',  text: `{{${f.feesLine}}}` },
    { id: 's4c',      type: 'para',    text: "Completion shall be defined as the fulfillment of Services as described in Section 3 following industry standards and not unreasonably withheld to the Client's approval." },
    { id: 's4d',      type: 'para',    text: `The Client will be invoiced when the Services are complete. Invoices submitted by the Service Provider to the Client are {{${f.paymentTerms}}}.` },
    { id: 's4e',      type: 'para',    text: 'In the event that the Client terminates this Agreement prior to completion of the Services, but where the Services have been partially performed, the Service Provider will be entitled to pro-rata payment of the service fees to the date of termination, provided that there has been no breach of contract on the part of the Service Provider.' },

    { id: 'h5',       type: 'heading', text: '5.  PENALTIES FOR LATE PAYMENT' },
    { id: 's5a',      type: 'para',    text: `Any late payment will trigger penalty fees of {{${f.latePenalty}}} on the amount still owing.` },

    { id: 'h6',       type: 'heading', text: '6.  REIMBURSEMENT OF EXPENSES' },
    { id: 's6a',      type: 'para',    text: 'The reimbursement of reasonable and necessary expenses incurred by the Service Provider in connection with providing the Services. All expenses must be pre-approved by the Client.' },

    { id: 'h7',       type: 'heading', text: '7.  CONFIDENTIALITY' },
    { id: 's7a',      type: 'para',    text: 'The Service Provider acknowledges that it will be necessary for the Client to disclose certain confidential and proprietary information to the Service Provider to perform their duties under this Agreement.' },
    { id: 's7b',      type: 'para',    text: "The Service Provider acknowledges that disclosure to a third party or misuse of this proprietary or confidential information would irreparably harm the Client. Accordingly, the Service Provider will not disclose or use, either during or after the term of this Agreement, any proprietary or confidential information of the Client without the Client's prior written permission except to the extent necessary to perform Services on the Client's behalf." },
    { id: 's7c',      type: 'para',    text: 'Proprietary or confidential information includes, but is not limited to: The written, printed, graphic, or electronically recorded materials furnished by the Client for Service Provider to use; Any written or tangible information stamped "confidential," "proprietary," or with a similar legend, or any information that Client makes reasonable efforts to maintain the secrecy of business or marketing plans or strategies, customer lists, operating procedures, trade secrets, design formulas, know-how and processes, computer programs and inventories, discoveries, and improvements of any kind, sales projections, and pricing information; and information belonging to customers and suppliers of the Client about whom the Service Provider gained knowledge as a result of the Service Provider\'s Services to the Client.' },
    { id: 's7d',      type: 'para',    text: "Upon termination of the Service Provider's Services to the Client, or at the Client's request, the Service Provider shall deliver all materials to the Client in the Service Provider's possession relating to the Client's business. The Service Provider acknowledges any breach or threatened breach of confidentiality that this Agreement will result in irreparable harm to the Client for which damages would be an inadequate remedy. Therefore, the Client shall be entitled to equitable relief, including an injunction, in the event of such breach or threatened breach of confidentiality. Such equitable relief shall be in addition to the Client's rights and remedies otherwise available at law." },

    { id: 'h8',       type: 'heading', text: '8.  PROPRIETARY INFORMATION' },
    { id: 's8a',      type: 'para',    text: 'Proprietary information, under this Agreement, shall include:' },
    { id: 's8b',      type: 'para',    text: 'The product of all work performed under this Agreement ("Work Product"), including without limitation all notes, reports, documentation, drawings, computer programs, inventions, creations, works, devices, models, work-in-progress, and deliverables, will be the sole property of the Client, and Service Provider hereby assigns to the Client all right, title and interest therein, including but not limited to all audiovisual, literary, moral rights and other copyrights, patent rights, trade secret rights and other proprietary rights therein. Service Provider retains no right to use the Work Product and agrees not to challenge the validity of the Client\'s ownership in the Work Product;' },
    { id: 's8c',      type: 'para',    text: "Service Provider hereby assigns to the Client all right, title, and interest in any and all photographic images and videos or audio recordings made by the Client during Service Provider's work for them, including, but not limited to, any royalties, proceeds, or other benefits derived from such photographs or recordings; and The Client will be entitled to use Service Provider's name and/or likeness in advertising and other materials." },
    { id: 's8d',      type: 'para',    text: "Upon the expiry or termination of this Agreement, the Service Provider will return to the Client any property, documentation, records, or Confidential Information, which is the Client's property." },

    { id: 'h9',       type: 'heading', text: '9.  TAXES AND HEALTH INSURANCE' },
    { id: 's9a',      type: 'para',    text: 'Under this Agreement, the Client shall not be responsible for:' },
    { id: 's9b',      type: 'para',    text: "Withholding Health Insurance, Social Security, or any other withholding taxes from the Service Provider's payments to employees or personnel or make payments on behalf of the Service Provider; Make unemployment compensation contributions on the Service Provider's behalf; and the payment of all taxes incurred related to or while performing the Services under this Agreement, including all applicable income taxes and, if the Service Provider is not a corporation, all applicable self-employment taxes. Upon demand, the Service Provider shall provide the Client with proof that such payments have been made." },

    { id: 'h10',      type: 'heading', text: '10.  INDEMNIFICATION' },
    { id: 's10a',     type: 'para',    text: 'The Service Provider shall indemnify and hold the Client harmless from any loss or liability from performing the Services under this Agreement. This indemnification will survive the termination of this Agreement.' },

    { id: 'h11',      type: 'heading', text: '11.  MODIFICATION OF AGREEMENT' },
    { id: 's11a',     type: 'para',    text: 'Any amendment or modification of this Agreement or additional obligation by either Party in connection with this Agreement will only be binding if evidenced in writing and signed by each Party or an authorized representative of each Party.' },

    { id: 'h12',      type: 'heading', text: '12.  TIME OF THE ESSENCE' },
    { id: 's12a',     type: 'para',    text: 'Time is of the essence in this Agreement. No extension or variation of this Agreement will operate as a waiver of this provision.' },

    { id: 'h13',      type: 'heading', text: '13.  ASSIGNMENT' },
    { id: 's13a',     type: 'para',    text: "The Service Provider will not voluntarily, or by operation of law, assign or otherwise transfer its obligations under this Agreement without the Client's prior written consent." },

    { id: 'h14',      type: 'heading', text: '14.  ENUREMENT' },
    { id: 's14a',     type: 'para',    text: 'This Agreement will enure to benefit and bind the Parties and their respective heirs, executors, administrators, and permitted successors and assigns.' },

    { id: 'h15',      type: 'heading', text: '15.  GOVERNING LAW' },
    { id: 's15a',     type: 'para',    text: "This Agreement will be governed by and construed following the laws of the Federal Republic of Switzerland. Any disputes are to be settled at the local court of the Service Providers' home address." },

    { id: 'h16',      type: 'heading', text: '16.  ENTIRE AGREEMENT' },
    { id: 's16a',     type: 'para',    text: 'The Agreement, along with any attachments or addendums, represents the entire Agreement between the parties.' },
    { id: 's16b',     type: 'para',    text: 'Therefore, this Agreement supersedes any prior agreements, promises, conditions, or understandings between the Service Provider and Client.' },
    { id: 's16c',     type: 'para',    text: 'By signing this Agreement, the Parties agree to the services proposal and terms and conditions as described above. Alterations to this Agreement can only be made by both parties and must be placed in writing.' },
    { id: 's16d',     type: 'para',    text: 'The parties will receive a printed or electronically signed copy of this Agreement and are responsible for upholding its terms.' },
    { id: 's16e',     type: 'lpara',   text: 'THUS, the Agreement has been executed by the Parties in duplicate on the signing date.' },

    { id: 'spacer1',  type: 'spacer',  text: '' },
    { id: 'sig_provider', type: 'lpara', text: 'For the International Flight Operational Academy GmbH ("Service Provider")' },
    { id: 'sig_name', type: 'sigrow',  text: `Incammicia Vincent|Date: {{${f.signatureDate}}}` },
    { id: 'sig_role', type: 'lpara',   text: 'Chief Executive Officer' },
    { id: 'sig_img',  type: 'sigimage', text: '' },
    { id: 'spacer2',  type: 'spacer',  text: '' },
    { id: 'cli_for',  type: 'lpara',   text: `For the {{${f.clientName}}} ("Client")` },
    { id: 'cli_name', type: 'lpara',   text: 'Name:' },
    { id: 'spacer3',  type: 'spacer',  text: '' },
    { id: 'cli_fn',   type: 'sigrow',  text: 'Function:|Date:' },
  ];
}

const DEFAULT_BLOCKS = buildDefaultBlocks();

// ─── Per-page decorations: watermark + header + footer ────────────────────────
function decorate(doc, pageNumber, headerDate = HEADER_DATE) {
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;   // keep absolute-positioned decorations from paginating

  // ── Watermark (drawn at absolute coords; cursor reset at end) ──
  try {
    if (fs.existsSync(LOGO_PATH)) {
      doc.opacity(0.06);
      const wmW = 340;
      doc.image(LOGO_PATH, (PAGE_W - wmW) / 2, (PAGE_H - wmW * 0.5) / 2 - 20, { width: wmW });
    }
  } catch { /* ignore */ }
  doc.opacity(0.09).font(REG).fontSize(17).fillColor('#9aa3ad');
  doc.text('INTERNATIONAL FLIGHT OPERATIONS ACADEMY', ML, PAGE_H / 2 + 115,
    { width: CONTENT_W, align: 'center', lineBreak: false });
  doc.opacity(1);

  // ── Header ──
  doc.font(BOLD).fontSize(9).fillColor(INK);
  doc.text('International Flight Operations Academy GmbH', ML, 42, { lineBreak: false });
  doc.text(headerDate, ML, 42, { width: CONTENT_W, align: 'right', lineBreak: false });
  doc.moveTo(ML, 60).lineTo(RIGHT_X, 60).lineWidth(0.75).strokeColor(INK).stroke();

  // ── Footer ──
  doc.moveTo(ML, PAGE_H - 49).lineTo(RIGHT_X, PAGE_H - 49).lineWidth(0.75).strokeColor(INK).stroke();
  doc.font(BOLD).fontSize(9).fillColor(INK);
  doc.text('CONFIDENTIAL', ML, PAGE_H - 41, { lineBreak: false });
  doc.text(String(pageNumber), ML, PAGE_H - 41, { width: CONTENT_W, align: 'right', lineBreak: false });

  // Reset cursor and state — do NOT reset font/size here.
  // If decorate() fires mid-doc.text() (page-add during rendering), resetting
  // the font would override the calling block's font and render it in the wrong weight.
  // Every block type sets its own font before doc.text(), so no reset needed.
  doc.page.margins.bottom = savedBottom;
  doc.opacity(1).fillColor(INK).fontSize(BODY);
  doc.x = ML;
  doc.y = TOP_TEXT;
}

// ─── Draw text: **bold** = formatting bold, {{dynamic}} = dynamic bold (both render bold in PDF)
function drawRich(doc, text, { baseFont = REG, size = BODY, align = 'justify', width = CONTENT_W }) {
  const re = /\*\*([\s\S]*?)\*\*|\{\{([\s\S]*?)\}\}/g;
  const segs = [];
  let last = 0, m;
  while ((m = re.exec(String(text))) !== null) {
    if (m.index > last) segs.push({ bold: false, text: text.slice(last, m.index) });
    // m[1] = **content**, m[2] = {{content}} — both render bold
    segs.push({ bold: true, text: m[1] !== undefined ? m[1] : (m[2] || '') });
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ bold: false, text: text.slice(last) });
  if (segs.length === 0) segs.push({ bold: false, text: ' ' });
  segs.forEach((s, i) => {
    doc.font(s.bold ? BOLD : baseFont).fontSize(size).fillColor(INK);
    doc.text(s.text, { width, align, continued: i < segs.length - 1 });
  });
}

// ─── Generate the contract PDF, returns a Buffer ──────────────────────────────
// blocks      : ordered editable blocks (falls back to the default contract)
// extraBlocks : admin-added trailing pages ({ type:'text'|'image', ... })
function generateContract(blocks, extraBlocks = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const content = Array.isArray(blocks) && blocks.length ? blocks : DEFAULT_BLOCKS;
    const headerDate = (opts.headerDate && String(opts.headerDate).trim()) || HEADER_DATE;

    const doc = new PDFDocument({
      size: 'A4',
      autoFirstPage: false,
      margins: { top: TOP_TEXT, bottom: 72, left: ML, right: MR },
    });

    const chunks = [];
    doc.on('data', d => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let pageNumber = 0;
    let decorating = false;
    doc.on('pageAdded', () => {
      if (decorating) return;
      decorating = true;
      pageNumber += 1;
      try { decorate(doc, pageNumber, headerDate); } finally { decorating = false; }
    });

    doc.addPage();

    // Gap constants — tuned to match the reference PDF's airy, professional spacing
    // PDFKit moveDown(1) ≈ 1 line height ≈ 13.3pt at 11pt font size
    const GAP_PARA    = 1.1;   // ≈14.5pt between paragraphs
    const GAP_PRE_H   = 1.9;   // ≈25pt before each numbered section heading
    const GAP_POST_H  = 0.75;  // ≈10pt after each heading
    const GAP_SMALL   = 0.9;   // ≈12pt for lpara / sigrow / bullet
    const GAP_SPACER  = 2.8;   // ≈37pt explicit spacer (signature area)

    for (const block of content) {
      if (!block) continue;
      const type = block.type;
      const text = block.text || '';

      // Keep signature block from being stranded near page bottom
      if (block.id === 'sig_provider' && doc.y > 600) doc.addPage();

      if (type === 'title') {
        doc.font(BOLD).fontSize(14).fillColor(INK);
        doc.text(text, { width: CONTENT_W, align: 'center' });
        doc.moveDown(1.4);

      } else if (type === 'heading') {
        doc.moveDown(GAP_PRE_H);
        // Re-assert font after moveDown — a page-add during the preceding doc.text()
        // could have left the font in an unexpected state.
        doc.font(BOLD).fontSize(BODY).fillColor(INK);
        doc.text(text, { width: CONTENT_W, align: 'left' });
        doc.font(BOLD).fontSize(BODY); // re-assert after text() in case page-add fired inside
        doc.moveDown(GAP_POST_H);

      } else if (type === 'italic') {
        doc.moveDown(0.4);
        doc.font(BOLDITAL).fontSize(BODY).fillColor(INK);
        doc.text(text, { width: CONTENT_W, align: 'justify' });
        doc.moveDown(GAP_PARA + 0.3);

      } else if (type === 'para') {
        drawRich(doc, text, { align: 'justify' });
        doc.moveDown(GAP_PARA);

      } else if (type === 'lpara') {
        drawRich(doc, text, { align: 'left' });
        doc.moveDown(GAP_SMALL);

      } else if (type === 'party') {
        // Two-column: bold label left | party text right (indented, matching reference)
        const [label, rest] = text.split('|');
        const startY = doc.y;
        doc.font(BOLD).fontSize(BODY).fillColor(INK);
        doc.text((label || '').trim(), ML, startY, { width: PARTY_INDENT, lineBreak: false });
        doc.x = ML + PARTY_INDENT;
        doc.y = startY;
        drawRich(doc, (rest || '').trim(), { align: 'left', width: CONTENT_W - PARTY_INDENT });
        doc.x = ML;
        doc.moveDown(GAP_PARA + 0.2);

      } else if (type === 'sigrow') {
        // Two-column: left text | right text
        const [left, right] = text.split('|');
        const startY = doc.y;
        drawRich(doc, (left || '').trim(), { align: 'left', width: CONTENT_W / 2 });
        const rightX = ML + CONTENT_W / 2;
        doc.x = rightX;
        doc.y = startY;
        drawRich(doc, (right || '').trim(), { align: 'left', width: CONTENT_W / 2 });
        doc.x = ML;
        doc.moveDown(GAP_SMALL);

      } else if (type === 'bullet') {
        const INDENT = 40;
        const startY = doc.y;
        doc.font(REG).fontSize(BODY).fillColor(INK);
        doc.text('•', ML + 14, startY, { lineBreak: false });
        doc.x = ML + INDENT;
        doc.y = startY;
        drawRich(doc, text, { align: 'left', width: CONTENT_W - INDENT });
        doc.x = ML;
        doc.moveDown(GAP_SMALL);

      } else if (type === 'spacer') {
        doc.moveDown(block.amount != null ? Number(block.amount) : GAP_SPACER);

      } else if (type === 'sigimage') {
        try {
          if (fs.existsSync(SIG_PATH)) {
            doc.image(SIG_PATH, ML, doc.y, { width: 110 });
            doc.y += 50;
          }
        } catch { /* ignore */ }
      }
    }

    // ── Admin-added extra pages (text / image) ──
    for (const eb of (extraBlocks || [])) {
      if (!eb) continue;
      doc.addPage();
      if (eb.type === 'image' && eb.dataUrl) {
        try {
          const b64 = String(eb.dataUrl).replace(/^data:image\/\w+;base64,/, '');
          const imgBuf = Buffer.from(b64, 'base64');
          doc.image(imgBuf, ML, TOP_TEXT, { fit: [CONTENT_W, 600], align: 'center' });
        } catch {
          doc.font(REG).fontSize(BODY).fillColor('#b91c1c');
          doc.text('[Image could not be rendered]', { width: CONTENT_W });
        }
      } else if (eb.type === 'text') {
        drawRich(doc, eb.content || '', { align: 'justify' });
      }
    }

    doc.end();
  });
}

module.exports = { generateContract, DEFAULT_FIELDS, DEFAULT_BLOCKS, buildDefaultBlocks };

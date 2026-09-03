const { PDFDocument, PDFName, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'DHL_ST001_FDR.pdf');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
// Instructor signature. The .png is the background-stripped version and is
// preferred — the source .jpeg has an opaque white box that covers the
// template's signature rule when drawn over it.
const SIGNATURE_CANDIDATES = [
  'sig_kronborg_dhl.png',
  'Kenneth Kronborg_sign.jpeg',
  'Kenneth Kronborg_sign.jpg',
];
function findSignaturePath() {
  for (const name of SIGNATURE_CANDIDATES) {
    const p = path.join(ASSETS_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function formatDateUpper(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const date  = new Date(y, m - 1, d);
  const day   = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-GB', { month: 'long' }).toUpperCase();
  return `${day} ${month} ${y}`;
}

function buildDhlCertId(sequence) {
  const seq = Number(sequence);
  if (!seq || seq <= 0) return 'DHL FORM ST-001';
  return `DHL FORM ST-${String(seq).padStart(3, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE ZONES (841.92 x 595.32 pt). The template is a fillable DHL form —
// it has real AcroForm fields for the name, training-type ("blue box"), and
// course-date boxes (extracted once via `pdfDoc.getForm().getFields()` and
// hardcoded below as native bottom-left rects: {x, y, width, height}).
// Signature1/QA-signature are PDFSignature fields (not fillable text), used
// here only as position references for the instructor name + signature image.
const FIELD = {
  name:         { x: 179.834, y: 403.132, width: 476.595, height: 55.073 }, // "Text3"
  trainingType: { x: 179.760, y: 311.598, width: 476.595, height: 55.073 }, // "Text4" — the blue box
  courseDate:   { x: 382.440, y: 247.560, width: 157.200, height: 28.800 },
  instructorSig:{ x: 277.590, y: 165.998, width: 157.358, height: 38.689 }, // "Signature1"
};
// Baked-in "DHL FORM ST-001" text ends at x=112.6, native y=47.1..58.2 (from
// `pdftotext -bbox`) — the running number is appended right after it.
// The template's form code reads "DHL FORM ST-001"; the trailing three digits
// ARE the running number, so they get replaced (not appended to). Measured off
// a 600dpi render of the template: the three digits occupy fixed slots of
// 5.28pt advance starting at x=96.72, on baseline y=49.95.
// Each digit is drawn into its own slot so the spacing matches the template
// exactly — the template's font (Calibri-like, digit advance 5.28 vs cap
// height 5.76) is not metric-compatible with any standard PDF font, so drawing
// the digits as one string would not line up with the surrounding "ST-".
const SEQ_DIGIT_SLOT_X = 96.72;
const SEQ_DIGIT_ADVANCE = 5.28;
const SEQ_DIGIT_BASELINE_Y = 49.95;
const SEQ_DIGIT_SIZE = 8;
// Bottom address block — "DHL Air (Bahrain) B.S.C (c)" occupies y 72.7..83.8,
// centered on x 420.6. The instructor signature sits just above it.
const ADDRESS_BLOCK_TOP_Y = 83.8;
const ADDRESS_BLOCK_CENTER_X = 420.6;

async function generateDhlCertificate(participant, sequence) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`DHL template not found: ${TEMPLATE_PATH}`);
  }

  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const templateDoc   = await PDFDocument.load(templateBytes);

  const pdfDoc = await PDFDocument.create();
  const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
  pdfDoc.addPage(templatePage);

  const page = pdfDoc.getPages()[0];

  // The template is a fillable form; its widget annotations render as shaded
  // (blue) boxes in most viewers. We draw the values ourselves, so drop the
  // annotations entirely — leaving only the plain certificate artwork.
  page.node.delete(PDFName.of('Annots'));

  const helvetica       = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const timesBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const black = rgb(0, 0, 0);

  // Centers `text` horizontally within `field`, vertically centered on its box.
  const drawInField = (text, field, font, fontSize, color = black) => {
    const tw = font.widthOfTextAtSize(text, fontSize);
    const x  = field.x + (field.width - tw) / 2;
    const y  = field.y + (field.height / 2) - (fontSize * 0.32);
    page.drawText(text, { x, y, size: fontSize, font, color });
  };

  // ── 1. Candidate name (inside the "Text3" blue box) ─────────────────────
  const nameText = (participant.participant_name || '').trim();
  let nameFontSize = 30;
  let nameWidth    = timesBoldItalic.widthOfTextAtSize(nameText, nameFontSize);
  while (nameWidth > FIELD.name.width - 20 && nameFontSize > 16) {
    nameFontSize -= 2;
    nameWidth = timesBoldItalic.widthOfTextAtSize(nameText, nameFontSize);
  }
  drawInField(nameText, FIELD.name, timesBoldItalic, nameFontSize);

  // ── 2. Training type (inside the "Text4" blue box) — the baked-in module ─
  //      list paragraph below it is template content and is left untouched.
  const trainingLine = 'Flight Dispatch Recurrent Training';
  drawInField(trainingLine, FIELD.trainingType, helveticaBold, 13);

  // ── 2b. Training duration — its own centered line in the gap just below the
  //      bold training-type line and above the baked module-list paragraph.
  //      Only shown when FDR hours were entered.
  const fdrHours = Number(participant.fdr_hours);
  if (Number.isFinite(fdrHours) && fdrHours > 0) {
    const hoursText = `Duration: ${Number.isInteger(fdrHours) ? fdrHours : fdrHours.toFixed(1)} Hours`;
    const hSize = 11;
    const hWidth = timesBoldItalic.widthOfTextAtSize(hoursText, hSize);
    const centerX = FIELD.trainingType.x + FIELD.trainingType.width / 2;
    page.drawText(hoursText, {
      x: centerX - hWidth / 2,
      y: FIELD.trainingType.y + 6.5,
      size: hSize, font: timesBoldItalic, color: black,
    });
  }

  // ── 3. Course Date (= end_date, fallback training_date) ─────────────────
  const certDateStr = (participant.end_date && participant.end_date.trim())
    ? participant.end_date : participant.training_date;
  if (certDateStr) {
    page.drawText(formatDateUpper(certDateStr), {
      x: FIELD.courseDate.x + 8,
      y: FIELD.courseDate.y + 6,
      size: 11, font: helveticaBold, color: black,
    });
  }

  // ── 4. Instructor (default: Kenneth Kronborg) + signature image ─────────
  const sig = FIELD.instructorSig;
  const instructorName = 'Kenneth Kronborg';
  page.drawText(instructorName, {
    x: sig.x + 6, y: sig.y + 4, size: 11, font: helvetica, color: black,
  });
  // Signature image sits directly under the "Kenneth Kronborg" name/rule,
  // centered under the name (not spanning into the QA field to its right).
  const signaturePath = findSignaturePath();
  if (signaturePath) {
    const sigBytes = fs.readFileSync(signaturePath);
    const isJpg    = /\.jpe?g$/i.test(signaturePath);
    const sigImage = isJpg ? await pdfDoc.embedJpg(sigBytes) : await pdfDoc.embedPng(sigBytes);
    const sigH = 34;
    const sigW = (sigImage.width / sigImage.height) * sigH;
    const nameCenterX = sig.x + 6 + helvetica.widthOfTextAtSize(instructorName, 11) / 2;
    page.drawImage(sigImage, {
      x: nameCenterX - sigW / 2,
      y: sig.y - sigH - 9,
      width: sigW, height: sigH,
    });
  } else {
    console.warn('[dhl-cert] No signature image found in assets — instructor line left text-only.');
  }

  // ── 5. Cert number — replaces the "001" in the baked "DHL FORM ST-001" ──
  //      e.g. sequence 2 renders as "DHL FORM ST-002".
  if (sequence) {
    const digits = String(sequence).padStart(3, '0');
    // Cover only the three baked digits — the hyphen ends at x=96.36, so
    // starting at 96.5 leaves "DHL FORM ST-" untouched.
    const slotsEnd = SEQ_DIGIT_SLOT_X + SEQ_DIGIT_ADVANCE * digits.length;
    page.drawRectangle({
      x: 96.5, y: 48.6, width: (slotsEnd + 0.5) - 96.5, height: 8.6, color: rgb(1, 1, 1),
    });
    digits.split('').forEach((d, i) => {
      const dw = helvetica.widthOfTextAtSize(d, SEQ_DIGIT_SIZE);
      page.drawText(d, {
        x: SEQ_DIGIT_SLOT_X + i * SEQ_DIGIT_ADVANCE + (SEQ_DIGIT_ADVANCE - dw) / 2,
        y: SEQ_DIGIT_BASELINE_Y,
        size: SEQ_DIGIT_SIZE, font: helvetica, color: black,
      });
    });
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { generateDhlCertificate, buildDhlCertId };

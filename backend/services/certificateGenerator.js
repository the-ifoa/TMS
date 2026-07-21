const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

const MODULES_LIST = [
  'Air Law',
  'Aircraft Systems',
  'Navigation',
  'Meteorology',
  'Flight Planning',
  'Human Performance',
  'Mass & Balance',
  'Operational Procedures',
  'Communications',
  'Flight Monitoring',
  'Aircraft Performance',
  'Air Traffic Management',
  'Principles of Flight',
];

// ─── Template directory ───────────────────────────────────────────────────────
const TEMPLATES_DIR = path.join(__dirname, '..', '..');
const GREEN_FALLBACK = 'recurrent_training_with_modules.pdf';

function resolveGreenFile(filename) {
  const full = path.join(TEMPLATES_DIR, filename);
  if (fs.existsSync(full)) return filename;
  console.warn(`[cert] WARNING: ${filename} missing, falling back to ${GREEN_FALLBACK}`);
  return GREEN_FALLBACK;
}

function getTemplatePath(rawType, variant) {
  const greenMap = {
    FDI: resolveGreenFile('Dispatch_graduate.pdf'),
    FDA: resolveGreenFile('Dispatch_graduate.pdf'),
    GD:  resolveGreenFile('Dispatch_graduate.pdf'),
    TCD: resolveGreenFile('Dispatch_graduate.pdf'),
    FDR: GREEN_FALLBACK,
    FTL: GREEN_FALLBACK,
    HF:  resolveGreenFile('HumanFactors.pdf'),
    NDG: resolveGreenFile('HumanFactors.pdf'),
    'Dispatch Graduate': resolveGreenFile('Dispatch_graduate.pdf'),
    'Human Factors':     resolveGreenFile('HumanFactors.pdf'),
    'Recurrent':         GREEN_FALLBACK,
  };

  const orangeMap = {
    FDI: 'Dispatch_graduate_orange.pdf',
    FDA: 'Dispatch_graduate_orange.pdf',
    GD:  'Dispatch_graduate_orange.pdf',
    TCD: 'Dispatch_graduate_orange.pdf',
    FDR: 'recurrent_training_orange.pdf',  // copy of Dispatch_graduate_orange
    FTL: 'recurrent_training_orange.pdf',  // same
    HF:  'HumanFactors_orange.pdf',
    NDG: 'HumanFactors_orange.pdf',
    'Dispatch Graduate': 'Dispatch_graduate_orange.pdf',
    'Human Factors':     'HumanFactors_orange.pdf',
    'Recurrent':         'recurrent_training_orange.pdf',
  };

  if (variant !== 'india') {
    const file = greenMap[rawType] || GREEN_FALLBACK;
    console.log(`[cert] GREEN template: ${file}`);
    return path.join(TEMPLATES_DIR, file);
  }

  const orangeFile = orangeMap[rawType];
  if (orangeFile) {
    const orangeFull = path.join(TEMPLATES_DIR, orangeFile);
    if (fs.existsSync(orangeFull)) {
      console.log(`[cert] ORANGE template: ${orangeFile}`);
      return orangeFull;
    }
  }
  const greenFile = greenMap[rawType] || GREEN_FALLBACK;
  console.log(`[cert] ORANGE not found, using GREEN fallback: ${greenFile}`);
  return path.join(TEMPLATES_DIR, greenFile);
}

const CANONICAL_TYPE = {
  FDI: 'Dispatch Graduate', FDA: 'Dispatch Graduate',
  GD:  'Dispatch Graduate', TCD: 'Dispatch Graduate',
  FDR: 'Recurrent',         FTL: 'Recurrent',
  HF:  'Human Factors',     NDG: 'Human Factors',
  'Dispatch Graduate': 'Dispatch Graduate',
  'Human Factors':     'Human Factors',
  'Recurrent':         'Recurrent',
};

const TO_SHORT_CODE = {
  'Dispatch Graduate': 'FDI',
  'Human Factors':     'HF',
  'Recurrent':         'FDR',
};

function formatDateUpper(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const date  = new Date(y, m - 1, d);
  const day   = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-GB', { month: 'long' }).toUpperCase();
  return `${day} ${month} ${y}`;
}

function buildCertId(participant) {
  const seq = Number(participant.cert_sequence);
  if (!seq || seq <= 0) return 'PREVIEW';
  const rawType = participant.training_type || '';
  const prefix  = TO_SHORT_CODE[rawType] || rawType || 'CERT';
  // Use cert_year_override if set, otherwise derive from date
  let year = participant.cert_year_override || null;
  if (!year) {
    const dateStr = (participant.end_date && participant.end_date.trim())
      ? participant.end_date : participant.training_date;
    year = dateStr ? new Date(dateStr.slice(0, 10)).getFullYear() : new Date().getFullYear();
  }
  return `${prefix}-${String(seq).padStart(5, '0')}-${year}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE ZONES (858.48 × 612.48 pt, top-left origin):
//
//  NEVER TOUCH:
//    top=  0 .. 219  : Header design + CERTIFICATE + OF TRAINING + THIS CERTIFIES THAT
//    top=453 .. 612  : Signatures, IFOA logo, FORM IFOA/TRN/01
//
//  REPLACE (whiteout + redraw):
//    top= 23 ..  39  : Cert ID          x=[764..838]
//    top= 75 ..  93  : Green subtitle   x=[406..619]  ← text zone only
//    top=219 .. 317  : Participant name
//    top=317 .. 453  : Body text
//
//  NOTE: "OF TRAINING" line (top=149..179) is left as-is from template.
//        We only redraw it when the type needs a different word (OF GRADUATION etc.)
//        by whiting out just that slim band.
// ─────────────────────────────────────────────────────────────────────────────
async function generateCertificate(participant) {
  const rawType      = participant.training_type;
  const trainingType = CANONICAL_TYPE[rawType] || rawType;
  const variant      = participant.templateVariant || 'default';

  const templatePath = getTemplatePath(rawType, variant);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const templateBytes = fs.readFileSync(templatePath);
  const templateDoc   = await PDFDocument.load(templateBytes);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
  pdfDoc.addPage(templatePage);

  const page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();   // 858.48 × 612.48

  const helvetica       = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const timesBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

  const flipY = (topY) => height - topY;
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const green = rgb(0.29, 0.65, 0.33);

  // whiteOut: coordinates in top-left space
  const whiteOut = (x, topY, w, h) =>
    page.drawRectangle({ x, y: flipY(topY + h), width: w, height: h, color: white });

  const drawCentered = (text, topY, font, fontSize, color = black) => {
    const tw = font.widthOfTextAtSize(text, fontSize);
    page.drawText(text, {
      x:    (width - tw) / 2,
      y:    flipY(topY),
      size: fontSize,
      font,
      color,
    });
  };

  // ── 0. WHITEOUT AREAS SPECIFIC TO HumanFactors_orange.pdf (india variant HF/NDG) ──
  if (variant === 'india' && (rawType === 'HF' || rawType === 'NDG' || trainingType === 'Human Factors')) {
    // a) Bottom-left old cert ID text: x=21..97, top=575..589
    whiteOut(21, 575, 76, 14);

    // b) Fly91 logo in HumanFactors_orange.pdf (pixel-accurate from rendered PDF at 144dpi):
    //    Horizontal green border:  y=18..21 (4px thick) — start whiteout at y=22
    //    Vertical green border:    x=839 (single pixel)  — width=137 ends at x=837, leaves x=838..839 untouched
    //    Logo pixel bounds:        x=713..838, y=22..74
    //    The cert ID (top=23..39) is re-drawn cleanly on top in step 1.
    whiteOut(700, 22, 137, 53);  // x=700..837, top=22..75 — logo gone, both green borders intact
  }

  // ── 0b. GD: hide baked-in unique number at bottom-left (cert ID stays top-right) ──
  if (rawType === 'GD') {
    whiteOut(21, 575, 90, 14);   // x=21..111, top=575..589
  }

  // ── 1. CERT ID ───────────────────────────────────────────────────────────────
  // Template cert ID: x=[764..838], top=26.7..36.7
  // Whiteout x=700..836, draw right-aligned to x=829 (clear of green line at 838)
  const certId  = buildCertId(participant);
  const certIdW = helvetica.widthOfTextAtSize(certId, 9);
  whiteOut(700, 23, 136, 16);
  page.drawText(certId, {
    x:    829 - certIdW,
    y:    flipY(36),
    size: 9,
    font: helvetica,
    color: black,
  });

  // ── 2. GREEN SUBTITLE (right-aligned, per cert type) ─────────────────────────
  // Template subtitle "FLIGHT DISPATCHER EASA STANDARDS": x=[406..619], top=79..91
  // We whiteout ONLY that text band (x=400..650, top=75..93) — does NOT touch
  // the CERTIFICATE text below (starts at top=93.7).
  // Right-align to x=619pt to match reference PDFs.
  const SUBTITLE_MAP = {
    FDR: 'FLIGHT DISPATCHER EASA STANDARDS',
    FDI: 'FLIGHT DISPATCHER EASA STANDARDS',
    GD:  'SLOT COORDINATOR',
    FDA: 'NAT HLA OPERATIONS & EDTO',
    FTL: 'CREW CONTROL EASA STANDARDS',
    HF:  'HUMAN FACTORS',
    NDG: 'DANGEROUS GOODS NO-CARRY',
    TCD: 'TRAIN THE TRAINER',
    'Dispatch Graduate': 'FLIGHT DISPATCHER EASA STANDARDS',
    'Human Factors':     'HUMAN FACTORS',
    'Recurrent':         'FLIGHT DISPATCHER EASA STANDARDS',
  };
  const subtitleText = SUBTITLE_MAP[rawType] || SUBTITLE_MAP[trainingType] || 'FLIGHT DISPATCHER EASA STANDARDS';

  // ── INDIA (orange) variant: template already has correct subtitle + big line ───────
  // The orange template has its own subtitle (e.g. "FLIGHT DISPATCHER DGCA REGULATIONS")
  // and big line (e.g. "OF GRADUATION") correctly baked in as part of its design.
  // We must NOT touch them — only replace cert ID, name, and body.
  //
  // GREEN variant: template always has "FLIGHT DISPATCHER EASA STANDARDS" + "OF TRAINING".
  // We replace both to match the actual training type.

  if (variant !== 'india') {
    // ── GREEN: replace subtitle — whiteout x=330..660, top=73..92
    whiteOut(330, 73, 330, 20);
    const subW = helveticaBold.widthOfTextAtSize(subtitleText, 11);
    // Right-align to x=607 (12pt left of template's 619) so it never overlaps
    // the 'E' of CERTIFICATE, and position at top=88 (3pt above the 91 baseline)
    // to create clear breathing room between subtitle and CERTIFICATE heading.
    // GD ('SLOT COORDINATOR') sits a touch further right so its end aligns above the 'E'.
    const subRightAnchor = rawType === 'GD' ? 613 : 607;
    page.drawText(subtitleText, {
      x:    subRightAnchor - subW,
      y:    flipY(88),
      size: 11,
      font: helveticaBold,
      color: green,
    });

    // ── GREEN: replace big line only when it differs from template "OF TRAINING"
    const BIG_LINE_MAP = {
      FDR: null, FTL: null, 'Recurrent': null,    // template already says OF TRAINING
      FDI: 'OF GRADUATION',  GD:  'OF ATTENDANCE',
      FDA: 'OF COMPLETION',  NDG: 'OF COMPLETION',
      TCD: 'OF COMPLETION',  HF:  'OF ATTENDANCE',
      'Dispatch Graduate': 'OF GRADUATION',
      'Human Factors':     'OF ATTENDANCE',
    };
    const bigLineText = BIG_LINE_MAP[rawType] ?? BIG_LINE_MAP[trainingType] ?? null;
    if (bigLineText) {
      whiteOut(280, 149, 335, 31);   // x=280..615, top=149..180
      const bigW = helvetica.widthOfTextAtSize(bigLineText, 30);
      page.drawText(bigLineText, {
        x:    (width - bigW) / 2,
        y:    flipY(178),
        size: 30,
        font: helvetica,
        color: black,
      });
    }
  }
  // For india variant: subtitle and big line left exactly as-is in orange template

  // ── 4. PARTICIPANT NAME ──────────────────────────────────────────────────────
  // Template name: top=239.1..309.1, safe x=61..740
  // NOTE: 'THIS CERTIFIES THAT' sits at top=221..234 and is INSIDE this whiteout zone.
  // We re-draw it immediately after for ALL variants.
  whiteOut(61, 219, 679, 98);

  // Re-draw 'THIS CERTIFIES THAT' only for india variant
  // (green templates already have it baked in above top=219 and it survives the whiteout)
  if (variant === 'india') {
    drawCentered('THIS CERTIFIES THAT', 233, helveticaBold, 10, green);
  }

  const nameText = (participant.participant_name || '').trim();
  let nameFontSize = 52;
  let nameWidth    = timesBoldItalic.widthOfTextAtSize(nameText, nameFontSize);
  while (nameWidth > 500 && nameFontSize > 20) {
    nameFontSize -= 2;
    nameWidth = timesBoldItalic.widthOfTextAtSize(nameText, nameFontSize);
  }
  page.drawText(nameText, {
    x:    (width - nameWidth) / 2,
    y:    flipY(287),
    size: nameFontSize,
    font: timesBoldItalic,
    color: black,
  });

  // ── 5. BODY WHITEOUT ────────────────────────────────────────────────────────
  // Safe zone x=61..740, top=317..453. NEVER below 453.
  whiteOut(61, 317, 679, 136);

  // ── 6. BODY TEXT ────────────────────────────────────────────────────────────
  const certDateStr  = (participant.end_date && participant.end_date.trim())
    ? participant.end_date : participant.training_date;
  if (!certDateStr) {
    throw new Error(`Missing training date for participant ${participant._id || participant.participant_name}`);
  }
  const dateText = formatDateUpper(certDateStr);
  // If online_synchronous is checked, always show 'Online Synchronous' instead of location
  const locationText = participant.online_synchronous
    ? 'Online Synchronous'
    : (participant.location || '').trim();

  // ── Validity text helper ────────────────────────────────────────────────────
  const validityLabel = (() => {
    const v = participant.cert_validity;
    if (!v || v === 'Unlimited') return 'Unlimited Period';
    return `${v} Months`;
  })();
  const validityLine = `This certificate is valid for ${validityLabel}`;

  if (rawType === 'FDA') {
    drawCentered('Has successfully completed the North Atlantic Operations and Extended Diversion Time Operations Training.', 330, helvetica, 11);
    drawCentered('This training has been delivered as per the', 348, helvetica, 11);
    drawCentered('ICAO DOC 10085 First Edition 2017 and EASA SPA EDTO 110', 362, helvetica, 11);
    drawCentered(validityLine, 384, helvetica, 8);
    drawCentered(dateText, 404, helveticaBold, 18);
    if (locationText) drawCentered(`Delivered in: ${locationText}`, 428, helvetica, 10);

  } else if (rawType === 'FTL') {
    drawCentered('Has successfully completed Crew Control Training as per EASA Annex 3 Part-ORO Subpart FTL', 330, helvetica, 11);
    drawCentered('Flight Duty Limitations and Rest Requirements', 344, helvetica, 11);
    drawCentered(validityLine, 370, helvetica, 8);
    drawCentered(dateText, 393, helveticaBold, 18);
    if (locationText) drawCentered(`Delivered in: ${locationText}`, 416, helvetica, 10);

  } else if (rawType === 'TCD') {
    drawCentered('Has successfully completed the Competency Development Training.', 330, helvetica, 11);
    drawCentered('This training has been delivered as prescribed in', 348, helvetica, 11);
    drawCentered('ICAO DOC 9868', 362, helvetica, 11);
    drawCentered(validityLine, 384, helvetica, 8);
    drawCentered(dateText, 404, helveticaBold, 18);
    if (locationText) drawCentered(`Delivered in: ${locationText}`, 428, helvetica, 10);

  } else if (rawType === 'NDG') {
    const ndgScore   = participant.ndg_score != null ? participant.ndg_score : null;
    const ndgSubtype = participant.ndg_subtype === 'R' ? 'Recurrent' : 'Initial';

    if (ndgScore !== null) {
      const scoreLine1     = `Has successfully completed the ${ndgSubtype} Dangerous Goods No Carry Virtual Training with a`;
      const scoreValueText = `score of ${ndgScore}%.`;
      const line1W = helvetica.widthOfTextAtSize(scoreLine1, 11);
      const scoreW = helveticaBold.widthOfTextAtSize(scoreValueText, 11);
      const totalW = line1W + 4 + scoreW;
      const startX = (width - totalW) / 2;
      page.drawText(scoreLine1,     { x: startX,                y: flipY(336), size: 11, font: helvetica,     color: black });
      page.drawText(scoreValueText, { x: startX + line1W + 4,  y: flipY(336), size: 11, font: helveticaBold, color: black });
      drawCentered('This training has been delivered as prescribed in', 357, helvetica, 11);
      drawCentered('ICAO DOC 9284 Ed. 2025-2026, IATA DGR Ed. 67 2026 and IATA DGR CBTA Training Guidance/Appendix H.', 371, helvetica, 9.5);
      drawCentered(validityLine, 392, helvetica, 8);
      drawCentered(dateText, 412, helveticaBold, 18);
      if (locationText) drawCentered(`Delivered in: ${locationText}`, 436, helvetica, 10);
    } else {
      drawCentered(`Has successfully completed the ${ndgSubtype} Dangerous Goods No Carry Training.`, 330, helvetica, 11);
      drawCentered('This training has been delivered as prescribed in', 348, helvetica, 11);
      drawCentered('ICAO DOC 9284 Ed. 2025-2026, IATA DGR Ed. 67 2026 and IATA DGR CBTA Training Guidance/Appendix H.', 362, helvetica, 9.5);
      drawCentered(validityLine, 384, helvetica, 8);
      drawCentered(dateText, 404, helveticaBold, 18);
      if (locationText) drawCentered(`Delivered in: ${locationText}`, 428, helvetica, 10);
    }

  } else if (rawType === 'GD') {
    drawCentered('Has attended the OPERATIONS COORDINATION AND SUPERVISION Training.', 330, helvetica, 11);
    drawCentered('This training covered the following topics:', 354, helvetica, 11);
    drawCentered('Flight Plan / Aeronautical Information / ATFM & Airport Slots theory / Basic A-CDM / Permits / Freedoms of Air', 368, helvetica, 11);
    drawCentered(validityLine, 390, helvetica, 8);
    drawCentered(dateText, 410, helveticaBold, 18);
    if (locationText) drawCentered(`Delivered in: ${locationText}`, 434, helvetica, 10);

  } else if (trainingType === 'Dispatch Graduate') {
    drawCentered('Has successfully completed ground school instruction required by the Initial Flight Dispatcher Course', 330, helvetica, 11);
    drawCentered('training as prescribed in ICAO Doc 10106, ICAO Doc 9868 and EASA Part ORO.GEN.110(c).', 344, helvetica, 11);
    drawCentered(validityLine, 370, helvetica, 8);
    drawCentered(dateText, 393, helveticaBold, 18);
    if (locationText) drawCentered(`Delivered in: ${locationText}`, 416, helvetica, 10);

  } else if (trainingType === 'Human Factors') {
    drawCentered('Has successfully attended the Human Factors Introduction Training for Flight Operations Personnel', 330, helvetica, 11);
    drawCentered('This training has been delivered as per the ICAO doc 9683 and ICAO doc 10106', 344, helvetica, 11);
    drawCentered('Prerequisite learning objectives: Human Factors in Aviation', 358, helvetica, 11);
    drawCentered(validityLine, 376, helvetica, 8);
    drawCentered(dateText, 399, helveticaBold, 18);
    if (locationText) drawCentered(`Delivered in: ${locationText}`, 422, helvetica, 10);

  } else if (trainingType === 'Recurrent') {
    // Optional hours figure, admin-entered — e.g. "Has successfully completed
    // the 40 Hours Flight Dispatch Recurrent Training delivered in English"
    const hours     = participant.fdr_hours;
    const hoursText = (hours != null && hours !== '') ? `${hours} Hour${Number(hours) === 1 ? '' : 's'} ` : '';
    drawCentered(`Has successfully completed the ${hoursText}Flight Dispatch Recurrent Training delivered in English`, 327, helvetica, 11);
    drawCentered('in accordance with ICAO Doc 10106, ICAO Doc 9868, EASA Part ORO.GEN.110(c) and IOSA ISM Table 3.6', 341, helvetica, 11);

    const modules = participant.modules
      ? (typeof participant.modules === 'string'
          ? participant.modules.split(',').map(m => m.trim()).filter(Boolean)
          : participant.modules)
      : [];

    let afterBodyY = 355;
    if (modules.length > 0) {
      drawCentered('In the following topics', 358, helvetica, 11);
      const separator    = ' / ';
      const modFontSize  = 11;
      const maxLineWidth = 620;
      const rows = [];
      let currentRow = [];
      for (const mod of modules) {
        const candidate = [...currentRow, mod];
        const lineW = helveticaBold.widthOfTextAtSize(candidate.join(separator), modFontSize);
        if (currentRow.length > 0 && lineW > maxLineWidth) {
          rows.push(currentRow);
          currentRow = [mod];
        } else {
          currentRow = candidate;
        }
      }
      if (currentRow.length > 0) rows.push(currentRow);
      const modStartY = 375;
      const lineH     = 15;
      rows.forEach((row, i) => {
        drawCentered(row.join(separator), modStartY + i * lineH, helveticaBold, modFontSize);
      });
      afterBodyY = modStartY + rows.length * lineH + 8;
    }

    drawCentered(validityLine, afterBodyY, helvetica, 8);
    drawCentered(dateText, afterBodyY + 18, helveticaBold, 18);
    if (locationText) drawCentered(`Delivered in: ${locationText}`, afterBodyY + 40, helvetica, 10);
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { generateCertificate, MODULES_LIST };

/**
 * examResultPdf.js
 * Generates an IFOA Exam Results PDF matching the official white-background template.
 *
 * Fixes in this version:
 *  - N/A subjects now correctly display "N/A" in both Marks Obtained & Grade columns
 *  - Header: logo enlarged and shifted LEFT; address block centred in the remaining space
 *  - Footer separator and ICAO line spacing preserved
 *  - All 12 standard subjects always appear in the table; missing ones are padded as N/A
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs   = require('fs');
const path = require('path');

const ASSETS    = path.join(__dirname, '..', 'assets');
const LOGO_PATH = path.join(ASSETS, 'IFOA_GREEN_white.png');

function findSig(base) {
  for (const ext of ['.png', '.jpg', '.jpeg']) {
    const p = path.join(ASSETS, base + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── Colour palette ─────────────────────────────────────────────────────────────
const C = {
  black:      rgb(0,    0,    0   ),
  white:      rgb(1,    1,    1   ),
  lightGrey:  rgb(0.85, 0.85, 0.85),
  midGrey:    rgb(0.35, 0.35, 0.35),
  darkGrey:   rgb(0.1,  0.1,  0.1 ),
  accentLine: rgb(0.5,  0.5,  0.5 ),
  tblHeader:  rgb(0.82, 0.82, 0.82),
  tblSubHdr:  rgb(0.70, 0.70, 0.70),
  rowAlt:     rgb(0.94, 0.94, 0.94),
  rowWhite:   rgb(1,    1,    1   ),
  greyBorder: rgb(0.5,  0.5,  0.5 ),
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const d = new Date(dateStr);
  if (!isNaN(d)) {
    return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  return dateStr;
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function embedImg(pdfDoc, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.png') return await pdfDoc.embedPng(bytes);
    if (ext === '.jpg' || ext === '.jpeg') return await pdfDoc.embedJpg(bytes);
  } catch (e) {
    console.warn(`Image embed failed (${filePath}):`, e.message);
  }
  return null;
}

/**
 * Determine if a subject is N/A.
 * A subject is N/A when marks_obtained is null, undefined, or the string 'N/A' / 'na'.
 */
function isSubjectNA(subject) {
  if (subject.marks_obtained === null || subject.marks_obtained === undefined) return true;
  if (typeof subject.marks_obtained === 'string') {
    const v = subject.marks_obtained.trim().toUpperCase();
    if (v === 'N/A' || v === 'NA' || v === '') return true;
  }
  return false;
}

function normalizeSubjectAbbr(abbr) {
  const key = String(abbr || '').trim().toUpperCase();
  const aliases = {
    HF: 'HPL',
    PER: 'POF',
    DRM: 'DGR',
  };
  return aliases[key] || key;
}

async function generateExamResultPdf(examResult) {
  const W = 595;
  const H = 842;
  const ML = 36;
  const MR = 36;
  const CONTENT_W = W - ML - MR;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage([W, H]);

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reg     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const logoImg    = await embedImg(pdfDoc, LOGO_PATH);
  const sigCooImg  = await embedImg(pdfDoc, findSig('sig_kronborg'));
  const sigCeoImg  = await embedImg(pdfDoc, findSig('sig_incammicia'));

  const toPdfY = (top) => H - top;
  const textY  = (top, size) => H - (top + size);

  const fillRect = (x, top, w, h, color) => {
    if (!color) return;
    page.drawRectangle({ x, y: toPdfY(top + h), width: w, height: h, color });
  };

  const strokeRect = (x, top, w, h, color, lw = 0.7) => {
    page.drawRectangle({
      x, y: toPdfY(top + h), width: w, height: h,
      borderColor: color, borderWidth: lw, color: undefined,
    });
  };

  const drawLine = (x1, y1, x2, y2, color = C.greyBorder, lw = 0.5) => {
    page.drawLine({
      start: { x: x1, y: toPdfY(y1) },
      end:   { x: x2, y: toPdfY(y2) },
      color, thickness: lw,
    });
  };

  const drawText = (val, x, top, font, size, color = C.black) => {
    page.drawText(String(val ?? ''), { x, y: textY(top, size), font, size, color });
  };

  const drawTextCenter = (val, cx, top, font, size, color = C.black) => {
    const text = String(val ?? '');
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: cx - (tw / 2), y: textY(top, size), font, size, color });
  };

  const drawTextRight = (val, right, top, font, size, color = C.black) => {
    const text = String(val ?? '');
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: right - tw, y: textY(top, size), font, size, color });
  };

  const drawCellTextCenter = (val, x, w, top, h, font, size, color = C.black) => {
    drawTextCenter(val, x + (w / 2), top + ((h - size) / 2), font, size, color);
  };

  const drawCellTextLeft = (val, x, top, h, font, size, color = C.black, pad = 5) => {
    drawText(val, x + pad, top + ((h - size) / 2), font, size, color);
  };

  fillRect(0, 0, W, H, C.white);

  const studentName = `${examResult.first_name || ''} ${examResult.last_name || ''}`.trim();
  const dateLabel   = formatDate(examResult.sheet_date || examResult.end_date || '');
  const resultHeaderText = String(examResult.result_header_text || examResult.course_name || '').trim();

  // ── All 12 standard subjects — always show in this order, N/A last ──────────
  const STANDARD_SUBJECTS = [
    { abbr: 'LAW', name: 'Air Law' },
    { abbr: 'SYS', name: 'Aircraft General Knowledge & Systems' },
    { abbr: 'MON', name: 'Flight Monitoring' },
    { abbr: 'M&B', name: 'Mass & Balance' },
    { abbr: 'ATM', name: 'Air Traffic Management' },
    { abbr: 'COM', name: 'Communication' },
    { abbr: 'NAV', name: 'Navigation' },
    { abbr: 'POF', name: 'Principles of Flight & Performance' },
    { abbr: 'DGR', name: 'Dangerous Goods' },
    { abbr: 'MET', name: 'Meteorology' },
    { abbr: 'FPL', name: 'Flight Planning' },
    { abbr: 'HPL', name: 'Human Factors' },
  ];

  // Build a lookup from stored subjects by abbreviation
  const storedByAbbr = {};
  (Array.isArray(examResult.subjects) ? examResult.subjects : []).forEach(s => {
    const normalizedAbbr = normalizeSubjectAbbr(s.abbr);
    if (normalizedAbbr) storedByAbbr[normalizedAbbr] = { ...s, abbr: normalizedAbbr };
  });

  const standardAbbrSet = new Set(STANDARD_SUBJECTS.map((s) => s.abbr));

  // Merge: every standard subject appears; stored data wins, missing ones become N/A
  const mergedSubjects = STANDARD_SUBJECTS.map(def => ({
    ...def,
    max_marks: 100,
    marks_obtained: null,
    grade: null,
    ...(storedByAbbr[def.abbr] || {}),
  }));

  // Also include any non-standard stored subjects (edge cases / future subjects)
  (Array.isArray(examResult.subjects) ? examResult.subjects : []).forEach(s => {
    const normalizedAbbr = normalizeSubjectAbbr(s.abbr);
    if (normalizedAbbr && !standardAbbrSet.has(normalizedAbbr)) {
      mergedSubjects.push({ ...s, abbr: normalizedAbbr });
    }
  });

  // Subjects with real marks first; N/A subjects at the bottom
  const subjectsWithMarks = mergedSubjects.filter(s => !isSubjectNA(s));
  const subjectsNA        = mergedSubjects.filter(s => isSubjectNA(s));
  const subjects          = [...subjectsWithMarks, ...subjectsNA];

  // ── HEADER ─────────────────────────────────────────────────────────────────
  // Logo: large, left-aligned
  const headerTop = 20;
  const logoBoxW  = 175;  // wider/taller logo box for stronger header presence
  const logoBoxH  = 96;

  if (logoImg) {
    const dims = logoImg.scaleToFit(logoBoxW, logoBoxH);
    // Centre logo vertically within its box, pin to left margin
    const lx = ML;
    const ly = headerTop - 10 + ((logoBoxH - dims.height) / 2);
    page.drawImage(logoImg, {
      x: lx,
      y: toPdfY(ly + dims.height),
      width:  dims.width,
      height: dims.height,
    });
  }

  // Address block: true top-centre across the full content width
  const addrCX = ML + (CONTENT_W / 2);

  drawTextCenter('International Flight Operations Academy', addrCX, headerTop + 6,  bold, 11,  C.black);
  drawTextCenter('Oberdorf 26, 4314 Zeiningen, Switzerland', addrCX, headerTop + 22, reg, 8.6, C.darkGrey);
  drawTextCenter('Tel: +41 78 227 3103',                     addrCX, headerTop + 34, reg, 8.4, C.darkGrey);
  drawTextCenter('Email: info@theifoa.com',                  addrCX, headerTop + 46, reg, 8.4, C.darkGrey);
  drawTextCenter('www.theifoa.com',                          addrCX, headerTop + 58, reg, 8.4, C.darkGrey);

  let y = 106;
  drawLine(ML, y, ML + CONTENT_W, y, C.greyBorder, 0.9);
  y += 8;

  // "EXAM RESULTS" centred across full content width
  drawTextCenter('EXAM RESULTS', ML + (CONTENT_W / 2), y, bold, 15, C.black);
  y += 21;
  const headerLine = resultHeaderText || String(examResult.course_name || '').toUpperCase();
  let headerFontSize = 8.2;
  while (headerFontSize > 6.5 && bold.widthOfTextAtSize(headerLine, headerFontSize) > (CONTENT_W - 10)) {
    headerFontSize -= 0.2;
  }
  drawTextCenter(headerLine, ML + (CONTENT_W / 2), y, bold, headerFontSize, C.darkGrey);
  y += 17;

  // ── STUDENT / DATE STRIP ──────────────────────────────────────────────────
  const stripH  = 24;
  const namePad = 10;

  strokeRect(ML, y, CONTENT_W, stripH, C.greyBorder, 0.7);
  drawText('Student:', ML + 8, y + 7, reg, 8.2, C.darkGrey);
  drawText(studentName, ML + 52 + namePad, y + 5, bold, 11.2, C.black);
  drawTextRight(`Date: ${dateLabel}`, ML + CONTENT_W - 8, y + 7, reg, 8.2, C.darkGrey);
  y += stripH + 8;

  // ── SUBJECTS TABLE ────────────────────────────────────────────────────────
  const tableX   = ML;
  const tableW   = CONTENT_W;
  const colName  = Math.round(tableW * 0.44);
  const colAbbr  = Math.round(tableW * 0.10);
  const colMax   = Math.round(tableW * 0.12);
  const colObt   = Math.round(tableW * 0.14);
  const colGrade = tableW - colName - colAbbr - colMax - colObt;

  const xName  = tableX;
  const xAbbr  = xName  + colName;
  const xMax   = xAbbr  + colAbbr;
  const xObt   = xMax   + colMax;
  const xGrade = xObt   + colObt;

  const hTopHeader = 18;
  const hSubHeader = 16;
  const hRow       = 18;
  const renderRows = subjects.length;  // always render every subject, including N/A ones
  const tableTop   = y;

  // Top-level header
  fillRect(tableX, y, tableW, hTopHeader, C.tblHeader);
  drawCellTextCenter('SUBJECTS', tableX, colName + colAbbr, y, hTopHeader, bold, 9);
  drawCellTextCenter('SCORE',    xMax,   colMax + colObt + colGrade, y, hTopHeader, bold, 9);
  drawLine(xMax, y, xMax, y + hTopHeader, C.greyBorder, 0.5);
  y += hTopHeader;

  // Sub-header row
  fillRect(tableX, y, tableW, hSubHeader, C.tblSubHdr);
  drawCellTextLeft('NAME',         xName,  y, hSubHeader, bold, 7.6);
  drawCellTextCenter('ABBR',       xAbbr,  colAbbr,  y, hSubHeader, bold, 7.4);
  drawCellTextCenter('MAX MARKS',  xMax,   colMax,   y, hSubHeader, bold, 7.2);
  drawCellTextCenter('MARKS OBT.', xObt,   colObt,   y, hSubHeader, bold, 7.2);
  drawCellTextCenter('GRADE',      xGrade, colGrade, y, hSubHeader, bold, 7.4);
  y += hSubHeader;

  // Data rows
  for (let i = 0; i < renderRows; i += 1) {
    const subject = subjects[i];
    fillRect(tableX, y, tableW, hRow, i % 2 === 0 ? C.rowWhite : C.rowAlt);

    if (subject) {
      const isNA  = isSubjectNA(subject);
      const name  = String(subject.name || subject.abbr || '').toUpperCase();
      const abbr  = String(subject.abbr || '').toUpperCase();
      // For N/A subjects: max marks is still 100, but obtained & grade show "N/A"
      const marks = isNA ? 'N/A' : String(Math.round(Number(subject.marks_obtained)));
      const grade = isNA ? 'N/A' : String(subject.grade || '').toUpperCase();

      let nameSize = 8;
      while (nameSize > 6 && reg.widthOfTextAtSize(name, nameSize) > colName - 10) nameSize -= 0.2;

      drawCellTextLeft(name,   xName,  y, hRow, reg,  nameSize, C.black);
      drawCellTextCenter(abbr,  xAbbr,  colAbbr,  y, hRow, bold, 8,   C.black);
      drawCellTextCenter('100', xMax,   colMax,   y, hRow, reg,  8,   C.black);  // max always 100
      drawCellTextCenter(marks, xObt,   colObt,   y, hRow, bold, 8,   C.black);  // N/A if no score
      drawCellTextCenter(grade, xGrade, colGrade, y, hRow, bold, 7.5, C.black);  // N/A if no score
    }

    drawLine(tableX, y + hRow, tableX + tableW, y + hRow, C.greyBorder, 0.25);
    y += hRow;
  }

  // Table border + vertical dividers
  const tableH = hTopHeader + hSubHeader + (renderRows * hRow);
  strokeRect(tableX, tableTop, tableW, tableH, C.greyBorder, 0.8);
  [xAbbr, xMax, xObt, xGrade].forEach((lineX) => {
    drawLine(lineX, tableTop + hTopHeader, lineX, tableTop + tableH, C.greyBorder, 0.4);
  });

  y += 12;

  // ── GRADE SCALE + TOTALS + SIGNATURES ────────────────────────────────────
  const sectionTop = y;
  const gradeW     = 168;
  const gap        = 14;
  const rightX     = ML + gradeW + gap;
  const rightW     = CONTENT_W - gradeW - gap;

  const gradeRows = [
    ['< 75',    'FAILED'],
    ['75',      'PASS'],
    ['76 - 89', 'MERIT'],
    ['90 - 95', 'DISTINCTION'],
    ['> 95',    'OUTSTANDING'],
  ];

  const gradeHeaderH = 16;
  const gradeRowH    = 13;
  const gradeCol1    = Math.round(gradeW * 0.36);
  const gradeCol2    = gradeW - gradeCol1;

  fillRect(ML, sectionTop, gradeW, gradeHeaderH, C.tblSubHdr);
  drawCellTextCenter('GRADE SCALE', ML, gradeW, sectionTop, gradeHeaderH, bold, 8.3);

  let gy = sectionTop + gradeHeaderH;
  for (let i = 0; i < gradeRows.length; i += 1) {
    fillRect(ML, gy, gradeW, gradeRowH, i % 2 === 0 ? C.rowWhite : C.rowAlt);
    drawCellTextCenter(gradeRows[i][0], ML,             gradeCol1, gy, gradeRowH, reg,  7.4);
    drawCellTextCenter(gradeRows[i][1], ML + gradeCol1, gradeCol2, gy, gradeRowH, bold, 7.0);
    drawLine(ML + gradeCol1, gy, ML + gradeCol1, gy + gradeRowH, C.greyBorder, 0.3);
    drawLine(ML, gy + gradeRowH, ML + gradeW, gy + gradeRowH, C.greyBorder, 0.25);
    gy += gradeRowH;
  }
  const gradeH = gradeHeaderH + (gradeRows.length * gradeRowH);
  strokeRect(ML, sectionTop, gradeW, gradeH, C.greyBorder, 0.8);

  // Total Marks block
  const totalMarks   = examResult.final_marks != null ? Number(examResult.final_marks).toFixed(2) : 'N/A';
  const overallGrade = String(examResult.overall_grade || 'N/A').toUpperCase();

  const tmHeaderH = 16;
  const tmBodyH   = 28;
  const tmCol1    = Math.round(rightW * 0.24);
  const tmCol2    = Math.round(rightW * 0.36);
  const tmCol3    = rightW - tmCol1 - tmCol2;

  fillRect(rightX, sectionTop, rightW, tmHeaderH, C.tblSubHdr);
  drawCellTextCenter('TOTAL MARKS', rightX, rightW, sectionTop, tmHeaderH, bold, 9);

  fillRect(rightX, sectionTop + tmHeaderH, rightW, tmBodyH, C.rowAlt);
  drawCellTextCenter('MAX',      rightX,                  tmCol1, sectionTop + tmHeaderH + 1, 9, reg,  6.1, C.midGrey);
  drawCellTextCenter('OBTAINED', rightX + tmCol1,         tmCol2, sectionTop + tmHeaderH + 1, 9, reg,  6.1, C.midGrey);
  drawCellTextCenter('GRADE',    rightX + tmCol1 + tmCol2, tmCol3, sectionTop + tmHeaderH + 1, 9, reg, 6.1, C.midGrey);

  drawCellTextCenter('100',        rightX,                  tmCol1, sectionTop + tmHeaderH + 9, tmBodyH - 9, bold, 11.5);
  drawCellTextCenter(totalMarks,   rightX + tmCol1,         tmCol2, sectionTop + tmHeaderH + 9, tmBodyH - 9, bold, 11.5);
  drawCellTextCenter(overallGrade, rightX + tmCol1 + tmCol2, tmCol3, sectionTop + tmHeaderH + 9, tmBodyH - 9, bold, 8.8);

  drawLine(rightX + tmCol1,           sectionTop + tmHeaderH, rightX + tmCol1,           sectionTop + tmHeaderH + tmBodyH, C.greyBorder, 0.4);
  drawLine(rightX + tmCol1 + tmCol2,  sectionTop + tmHeaderH, rightX + tmCol1 + tmCol2,  sectionTop + tmHeaderH + tmBodyH, C.greyBorder, 0.4);
  strokeRect(rightX, sectionTop, rightW, tmHeaderH + tmBodyH, C.greyBorder, 0.8);

  // Signatures
  const sigTop        = sectionTop + tmHeaderH + tmBodyH + 8;
  const sigColW       = rightW / 2;
  const cooX          = rightX;
  const ceoX          = rightX + sigColW;
  const sigImageMaxH  = 28;
  const sigImageMaxW  = sigColW - 16;

  drawCellTextCenter('IFOA Chief Operating Officer', cooX, sigColW, sigTop, 8, reg, 6.5, C.darkGrey);
  drawCellTextCenter('IFOA Chief Executive Officer', ceoX, sigColW, sigTop, 8, reg, 6.5, C.darkGrey);

  const signatureImageTop = sigTop + 10;
  if (sigCooImg) {
    const d  = sigCooImg.scaleToFit(sigImageMaxW, sigImageMaxH);
    const ix = cooX + ((sigColW - d.width) / 2);
    page.drawImage(sigCooImg, { x: ix, y: toPdfY(signatureImageTop + d.height), width: d.width, height: d.height });
  } else {
    drawCellTextCenter('K. Kronborg', cooX, sigColW, signatureImageTop + 8, sigImageMaxH, oblique, 11, C.darkGrey);
  }

  if (sigCeoImg) {
    const d  = sigCeoImg.scaleToFit(sigImageMaxW, sigImageMaxH);
    const ix = ceoX + ((sigColW - d.width) / 2);
    page.drawImage(sigCeoImg, { x: ix, y: toPdfY(signatureImageTop + d.height), width: d.width, height: d.height });
  } else {
    drawCellTextCenter('V. Incammicia', ceoX, sigColW, signatureImageTop + 8, sigImageMaxH, oblique, 11, C.darkGrey);
  }

  const sigLineY = signatureImageTop + sigImageMaxH + 3;
  drawLine(cooX + 6, sigLineY, cooX + sigColW - 6, sigLineY, C.greyBorder, 0.7);
  drawLine(ceoX + 6, sigLineY, ceoX + sigColW - 6, sigLineY, C.greyBorder, 0.7);
  drawCellTextCenter('Kenneth Kronborg',   cooX, sigColW, sigLineY + 3, 10, bold, 7.4, C.black);
  drawCellTextCenter('Vincent Incammicia', ceoX, sigColW, sigLineY + 3, 10, bold, 7.4, C.black);

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footerTop = Math.max(sectionTop + gradeH, sigLineY + 15) + 10;
  drawLine(ML, footerTop, ML + CONTENT_W, footerTop, C.greyBorder, 0.8);

  let fy    = footerTop + 8;
  const fsz = 7.4;
  const lineH = 10;

  // "We, the … confirms that <bold name> has achieved"
  const lead  = 'We, the International Flight Operations Academy GmbH, confirms that ';
  const tail  = ' has achieved';
  const leadW = reg.widthOfTextAtSize(lead, fsz);
  const nameW = bold.widthOfTextAtSize(studentName, fsz);
  drawText(lead,        ML,                fy, reg,  fsz, C.darkGrey);
  drawText(studentName, ML + leadW,        fy, bold, fsz, C.black);
  drawText(tail,        ML + leadW + nameW, fy, reg,  fsz, C.darkGrey);
  fy += lineH;

  const complianceLines = [
    'the Ground Instruction of the Flight Dispatch Initial Course delivered as per the prerequisites of ICAO Doc 10106 and the requirements',
    'of EASA GM1 ORO.GEN.110 and IOSA ISM DSP 2.1, and DSP table 3.6.',
  ];
  complianceLines.forEach((line) => {
    wrapText(line, reg, fsz, CONTENT_W - 2).forEach((wLine) => {
      drawText(wLine, ML, fy, reg, fsz, C.darkGrey);
      fy += lineH;
    });
  });

  fy += 6;
  drawText('The training has been delivered by ICAO (TIC 1 & TIC 2) certified instructors.', ML, fy, reg, fsz, C.darkGrey);

  return Buffer.from(await pdfDoc.save());
}

module.exports = { generateExamResultPdf };

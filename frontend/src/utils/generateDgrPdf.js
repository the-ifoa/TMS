import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ifoaLogoUrl from '../assets/Green_logo.png';
import sigIncammiciaUrl from '../assets/sig_incammicia.png';

// ─── Score helpers ────────────────────────────────────────────────────────────
const avg = (vals) => {
  const nums = vals.map(Number).filter((n) => !isNaN(n) && n !== null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
};

export function computeDgrScores(form = {}) {
  const knowledge = (form.knowledge_score === '' || form.knowledge_score == null)
    ? null : Number(form.knowledge_score);

  // Skills: 4 sub-scores on 1–5 scale → convert avg to %
  const skillsAvg = avg([
    form.skills?.input_response, form.skills?.response_time,
    form.skills?.number_of_errors, form.skills?.repeated_attempts,
  ]);
  const skills = skillsAvg != null ? (skillsAvg / 5) * 100 : null;

  // Attitude: 5 sub-scores on 1–5 scale → convert avg to %
  const attitudeAvg = avg([
    form.attitude?.shows_interest, form.attitude?.participation, form.attitude?.input,
    form.attitude?.co_operation, form.attitude?.asks_relevant_questions,
  ]);
  const attitude = attitudeAvg != null ? (attitudeAvg / 5) * 100 : null;

  let final = null;
  if (knowledge != null || skills != null || attitude != null) {
    final = (knowledge ?? 0) * 0.6 + (skills ?? 0) * 0.2 + (attitude ?? 0) * 0.2;
  }
  return { knowledge, skills, attitude, skillsAvg, attitudeAvg, final };
}

const JOB_FUNCTION_LABEL = {
  FC: 'F.C. - 7.7',
  FD: 'F.D. - 7.8',
  CC: 'C.C. - 7.9',
};

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? '' : String(v));

function loadImage(url, cache) {
  if (cache.data) return Promise.resolve(cache.data);
  return fetch(url).then(r => r.blob()).then(blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => { cache.data = reader.result; resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }));
}
const _logoCache = {};
const _sigCache  = {};
const loadLogo = () => loadImage(ifoaLogoUrl, _logoCache);
const loadSig  = () => loadImage(sigIncammiciaUrl, _sigCache);

/**
 * Generate the Dangerous Goods (DGR CBTA) training form PDF for one student.
 * Digital rebuild of Comlux "Appendix A.1.6 — DANGEROUS GOODS TRAINING FORM".
 */
export async function generateDgrPdf({ form = {}, applicantName = '', mode = 'download' }) {
  const [logoDataUrl, sigDataUrl] = await Promise.all([loadLogo(), loadSig()]);

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const ink  = [30, 30, 30];
  const grey = [90, 90, 90];

  // ── Header: IFOA logo + title ─────────────────────────────────────────────
  const hBoxTop = 5;
  const hBoxH   = 22;
  doc.setDrawColor(0); doc.setLineWidth(0.3);
  doc.rect(margin, hBoxTop, pageW - 2 * margin, hBoxH);

  // Divider between logo and title
  const logoW = 26;
  doc.line(margin + logoW, hBoxTop, margin + logoW, hBoxTop + hBoxH);

  doc.addImage(logoDataUrl, 'PNG', margin + 2, hBoxTop + 2, 20, 18);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...ink);
  doc.text(
    'DANGEROUS GOODS CBTA TRAINING FORM',
    margin + logoW + (pageW - 2 * margin - logoW) / 2,
    hBoxTop + hBoxH / 2 + 2,
    { align: 'center' }
  );

  // ── Applicant's Name (auto-filled) ────────────────────────────────────────
  const nameY = hBoxTop + hBoxH + 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink);
  doc.text("Applicant's Name:", margin, nameY);
  // Center name within the underline
  const nameLineX = margin + 29;
  const nameLineW = pageW - margin - nameLineX;
  doc.setFont('helvetica', 'bold');
  doc.text(applicantName || '', nameLineX + 1, nameY);
  doc.setDrawColor(120); doc.line(nameLineX, nameY + 1, pageW - margin, nameY + 1);

  // ── IATA items table — 4 columns: Main Item | Sub-Item | Description | Initials ──
  const init = form.initials || {};
  const cargo5label = form.show_item5 ? '6' : '5';
  const safety7label = form.show_item5 ? '7' : '6';
  autoTable(doc, {
    startY: nameY + 5,
    theme: 'grid',
    head: [['Item', 'Sub-Item', 'Description', 'Instructor\nInitials']],
    body: [
      // Item 0 parent row
      ['0', '', 'Understanding the basics of dangerous goods', init.item0 || ''],
      // Sub-items 0.1–0.6
      ['', '0.1', 'Dangerous goods applicability',                                  init.item0_1 || ''],
      ['', '0.2', 'Understanding the general limitations',                          init.item0_2 || ''],
      ['', '0.3', 'Identifying Roles and Responsibilities',                          init.item0_3 || ''],
      ['', '0.4', 'Understanding the importance of classification and packaging',    init.item0_4 || ''],
      ['', '0.5', 'Understanding hazard communication',                             init.item0_5 || ''],
      ['', '0.6', 'Familiarising with basic emergency response',                    init.item0_6 || ''],
      // Optional item 5 (passenger baggage)
      ...(form.show_item5 ? [
        ['5', '', 'Accepting passenger and crew baggage – (n/a for F/D and FOO)', init.item5 || ''],
      ] : []),
      // Cargo (always shown, renumbered)
      [cargo5label, '', 'Transporting cargo/baggage', init.item6 || ''],
      // Optional item 7 (safety data)
      ...(form.show_item7 ? [
        [safety7label, '', 'Collecting safety data – (n/a for F/D and FOO)', init.item7 || ''],
      ] : []),
    ],
    styles:           { fontSize: 8, cellPadding: 1.6, textColor: ink, lineColor: [160, 160, 160] },
    headStyles:       { fillColor: [240, 240, 240], textColor: ink, fontStyle: 'bold', halign: 'center', lineColor: [160, 160, 160], lineWidth: 0.3 },
    tableLineWidth:   0.4,
    tableLineColor:   [0, 0, 0],
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 26, halign: 'center' },
    },
    // Bold the item-0 parent row
    didParseCell(data) {
      if (data.section === 'body' && data.row.index === 0 && data.column.index !== 3) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: margin, right: margin },
  });

  // ── DECLARATION ────────────────────────────────────────────────────────────
  let y = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  doc.text('DECLARATION', pageW / 2, y, { align: 'center' });
  y += 7;

  const label = (text, x, yy) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...ink);
    doc.text(text, x, yy);
  };
  const fill = (text, x, yy, w, align = 'left') => {
    doc.setFont('helvetica', 'bold');
    if (align === 'center') {
      doc.text(text || '', x + w / 2, yy - 0.5, { align: 'center' });
    } else {
      doc.text(text || '', x + 1, yy - 0.5);
    }
    doc.setDrawColor(120); doc.line(x, yy, x + w, yy);
  };

  label('We,', margin, y);
  fill(form.ato_name_number || 'INTERNATIONAL FLIGHT OPERATIONAL ACADEMY', margin + 8, y, 80);
  label('(name and number of ATO/CCTO)', margin + 92, y);
  y += 8;

  label('confirm, that', margin, y);
  fill(applicantName, margin + 20, y, 70, 'center');
  label("(Participant's first and last name)", margin + 92, y);
  y += 8;

  const dgType = form.dg_training_type === 'Recurrent' ? 'Recurrent' : 'Initial';
  const dgLine = `has received ${dgType} Dangerous Goods Training on`;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const dgLineW = doc.getTextWidth(dgLine);
  label(dgLine, margin, y);
  fill(form.training_date, margin + dgLineW + 3, y, 38);
  label('(date / DD.MM.YYYY)', margin + dgLineW + 3 + 40, y);
  y += 10;

  // Reference lists
  doc.setFontSize(7.5); doc.setTextColor(...grey);
  const orgName = form.airline_name || 'Organisation';
  const refLines = [
    'ICAO reference list:',
    'ICAO Doc 9284-AN/905 "Technical Instructions for safe transportation of dangerous goods by air"',
    'ICAO Doc 10147 "Guidance on a Competency-based Approach to DG Training and Assessment"',
    `${orgName} OM (Operations Manual) reference list:`,
    'OM D Chapter 2 "Operations personnel including crew"',
    'OM A 9 "Dangerous Goods and Weapons"',
  ];
  refLines.forEach((ln, i) => {
    doc.setFont('helvetica', i === 0 || i === 3 ? 'bold' : 'normal');
    doc.text(ln, margin, y + i * 4);
  });
  y += refLines.length * 4 + 4;

  // ── Score table ────────────────────────────────────────────────────────────
  const s  = computeDgrScores(form);
  const sk = form.skills   || {};
  const at = form.attitude || {};

  const skillsItems = [
    ['Input response:',    num(sk.input_response)],
    ['Response time:',     num(sk.response_time)],
    ['Number of errors:',  num(sk.number_of_errors)],
    ['Repeated attempts:', num(sk.repeated_attempts)],
  ];
  const attitudeItems = [
    ['Shows interest:',          num(at.shows_interest)],
    ['Participation:',           num(at.participation)],
    ['Input:',                   num(at.input)],
    ['Co-operation:',            num(at.co_operation)],
    ['Asks relevant questions:', num(at.asks_relevant_questions)],
  ];

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['', 'Knowledge', 'Skills', 'Attitude']],
    body: [
      [
        `Job Function\n${JOB_FUNCTION_LABEL[form.job_function] || JOB_FUNCTION_LABEL.FC}`,
        'Final test, multiple choice questions based on result obtained.',
        'Intermediate multiple choice questions, interactive tasks and final practical tasks based on sub-scores (1–5):',
        'Observable behaviours and participation assessed across sub-scores (1–5):',
      ],
      [
        'Score',
        s.knowledge != null ? `${Math.round(s.knowledge)}%` : '',
        s.skills    != null ? `${Math.round(s.skills)}%`    : '',
        s.attitude  != null ? `${Math.round(s.attitude)}%`  : '',
      ],
    ],
    styles:         { fontSize: 7.5, cellPadding: 1.6, textColor: ink, lineColor: [160, 160, 160], valign: 'top' },
    headStyles:     { fillColor: [240, 240, 240], textColor: ink, fontStyle: 'bold', halign: 'center', lineColor: [160, 160, 160], lineWidth: 0.3 },
    tableLineWidth: 0.4,
    tableLineColor: [0, 0, 0],
    columnStyles:   { 0: { cellWidth: 26, fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index === 0 &&
          (data.column.index === 2 || data.column.index === 3)) {
        const count = data.column.index === 2 ? skillsItems.length : attitudeItems.length;
        data.cell.styles.minCellHeight = 18 + count * 6;
      }
      if (data.section === 'body' && data.row.index === 1 && data.column.index !== 0) {
        data.cell.styles.halign    = 'center';
        data.cell.styles.fontSize  = 12;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.valign    = 'middle';
      }
    },
    didDrawCell(data) {
      if (data.section !== 'body' || data.row.index !== 0) return;
      const items = data.column.index === 2 ? skillsItems
                  : data.column.index === 3 ? attitudeItems
                  : null;
      if (!items) return;

      const pad    = 1.6;
      const lineH  = 6;
      const startY = data.cell.y + pad + 17;
      const labelX = data.cell.x + pad + 1;
      const valueX = data.cell.x + data.cell.width - pad - 1;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...ink);

      items.forEach(([label, value], i) => {
        const iy = startY + i * lineH;
        doc.text(label, labelX, iy);
        if (value !== '') doc.text(value, valueX, iy, { align: 'right' });
      });
    },
  });

  y = doc.lastAutoTable.finalY + 7;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ink);
  doc.text(
    `Final Score = Knowledge 60% + Skills 20% + Attitude 20% = ${s.final != null ? Math.round(s.final) + ' %' : '_____ %'}`,
    margin, y
  );
  y += 12;

  // ── Instructor ────────────────────────────────────────────────────────────
  const instructorName = form.instructor_name || 'Vincent Incammicia';
  label('Name of Instructor:', margin, y);
  fill(instructorName, margin + 32, y, 55, 'center');
  label('Signature:', margin + 95, y);
  // Draw signature underline
  doc.setDrawColor(120);
  doc.line(margin + 113, y, pageW - margin, y);
  // Embed Vincent Incammicia's signature image above the line
  const sigX = margin + 113;
  const sigW = pageW - margin - sigX;
  doc.addImage(sigDataUrl, 'PNG', sigX, y - 7, sigW, 7);

  // ── Page 2: Marking Scheme ───────────────────────────────────────────────
  doc.addPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...ink);
  doc.text('ASSESSMENT MARKING SCHEME', pageW / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...grey);
  doc.text('Skills Score% = (avg of 4 ratings) ÷ 5 × 100   |   Attitude Score% = (avg of 5 ratings) ÷ 5 × 100', pageW / 2, 24, { align: 'center' });
  doc.text('Final Score = (Knowledge × 60%) + (Skills × 20%) + (Attitude × 20%)', pageW / 2, 29, { align: 'center' });

  const schemeHead = [['Criterion', '1 – Poor', '2 – Below Average', '3 – Adequate', '4 – Good', '5 – Excellent']];
  const schemeStyles = {
    styles:     { fontSize: 7, cellPadding: 1.5, textColor: ink, lineColor: [180, 180, 180], valign: 'top' },
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
  };

  // Skills
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink);
  doc.text('SKILLS  (1–5)', margin, 36);
  autoTable(doc, {
    startY: 39,
    head: schemeHead,
    body: [
      ['Input Response\n(Accuracy)', 'Incorrect / cannot complete without assistance', 'Limited understanding, significant correction needed', 'Generally correct but noticeable errors or gaps', 'Accurate with only minor omissions or corrections', 'Accurate, complete, requires no correction'],
      ['Response Time', 'Unable to complete within acceptable time limits', 'Frequently exceeds expected completion time', 'Completes tasks slightly slower than expected', 'Completes tasks within the expected time', 'Completes well within expected time, no quality compromise'],
      ['Number of Errors', 'Excessive errors demonstrating inadequate competence', 'Multiple significant errors affecting task performance', 'Several minor errors or one significant error', 'One or two minor errors that do not affect outcomes', 'No errors observed'],
      ['Repeated Attempts', 'Unable to complete successfully despite multiple attempts', 'Requires several attempts and frequent guidance', 'Requires two additional attempts', 'Requires one additional attempt', 'Successfully completes tasks on the first attempt'],
    ],
    ...schemeStyles,
  });

  // Attitude
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink);
  doc.text('ATTITUDE  (1–5)', margin, doc.lastAutoTable.finalY + 8);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 11,
    head: schemeHead,
    body: [
      ['Shows Interest', 'Appears disengaged and uninterested throughout training', 'Shows limited interest in learning activities', 'Demonstrates adequate interest when prompted', 'Frequently shows interest and engagement', 'Consistently demonstrates enthusiasm and commitment to learning'],
      ['Participation', 'Does not participate in activities or discussions', 'Rarely participates voluntarily', 'Participates occasionally when requested', 'Participates regularly with minimal prompting', 'Actively participates in all activities and discussions'],
      ['Input\n(Contribution)', 'Does not provide meaningful contributions', 'Contributions are infrequent or of limited value', 'Provides occasional relevant contributions', 'Regularly contributes useful ideas and observations', 'Provides valuable and constructive contributions consistently'],
      ['Co-operation', 'Frequently uncooperative or disruptive', 'Demonstrates difficulty working with others', 'Generally cooperative with occasional issues', 'Cooperates well with peers and instructors', 'Consistently works effectively with others and supports team objectives'],
      ['Asks Relevant\nQuestions', 'Does not ask questions or questions demonstrate lack of engagement', 'Rarely asks questions or questions are often not relevant', 'Occasionally asks relevant questions', 'Regularly asks relevant and constructive questions', 'Frequently asks insightful questions that enhance learning'],
    ],
    ...schemeStyles,
  });

  const safe = (applicantName || 'DGR').replace(/[^a-zA-Z0-9]/g, '_');
  if (mode === 'preview') {
    window.open(doc.output('bloburl'), '_blank');
  } else {
    doc.save(`DGR_Training_Form_${safe}.pdf`);
  }
}

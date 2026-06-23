import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ifoaLogoUrl from '../assets/Green_logo.png';

// ─── Score helpers ────────────────────────────────────────────────────────────
const avg = (vals) => {
  const nums = vals.map(Number).filter((n) => !isNaN(n) && n !== null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
};

export function computeDgrScores(form = {}) {
  const knowledge = (form.knowledge_score === '' || form.knowledge_score == null)
    ? null : Number(form.knowledge_score);
  const skills = avg([
    form.skills?.input_response, form.skills?.response_time,
    form.skills?.number_of_errors, form.skills?.repeated_attempts,
  ]);
  const attitude = avg([
    form.attitude?.shows_interest, form.attitude?.participation, form.attitude?.input,
    form.attitude?.co_operation, form.attitude?.asks_relevant_questions,
  ]);
  let final = null;
  if (knowledge != null || skills != null || attitude != null) {
    final = (knowledge ?? 0) * 0.6 + (skills ?? 0) * 0.2 + (attitude ?? 0) * 0.2;
  }
  return { knowledge, skills, attitude, final };
}

const JOB_FUNCTION_LABEL = {
  FC: 'F.C. - 7.7',
  FD: 'F.D. - 7.8',
  CC: 'C.C. - 7.9',
};

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? '' : String(v));

// Logo is cached after first load
let _logoCache = null;
async function loadLogo() {
  if (_logoCache) return _logoCache;
  const res = await fetch(ifoaLogoUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => { _logoCache = reader.result; resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate the Dangerous Goods (DGR CBTA) training form PDF for one student.
 * Digital rebuild of Comlux "Appendix A.1.6 — DANGEROUS GOODS TRAINING FORM".
 */
export async function generateDgrPdf({ form = {}, applicantName = '', mode = 'download' }) {
  const logoDataUrl = await loadLogo();

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const ink  = [30, 30, 30];
  const grey = [90, 90, 90];

  // ── Header box (mirrors reference PDF layout) ─────────────────────────────
  const hBoxTop = 5;
  const hBoxH   = 26;
  doc.setDrawColor(0); doc.setLineWidth(0.3);
  doc.rect(margin, hBoxTop, pageW - 2 * margin, hBoxH);

  const rightColX = pageW - margin - 52;
  doc.line(rightColX, hBoxTop, rightColX, hBoxTop + hBoxH);
  const rowH = hBoxH / 3;
  doc.line(rightColX, hBoxTop + rowH,     pageW - margin, hBoxTop + rowH);
  doc.line(rightColX, hBoxTop + rowH * 2, pageW - margin, hBoxTop + rowH * 2);

  // IFOA logo — left cell
  doc.addImage(logoDataUrl, 'PNG', margin + 3, hBoxTop + 2, 22, 22);

  // Centre title
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...ink);
  doc.text('Appendix A - Company Forms', (margin + rightColX) / 2, hBoxTop + hBoxH / 2 + 2, { align: 'center' });

  // Right column info
  const infoLabelX = rightColX + 3;
  const infoValX   = pageW - margin - 3;
  [
    ['Page:',      form.page_ref || 'Appendix A-13'],
    ['Date:',      form.doc_date || '01-11-2024'],
    ['Iss. / Rev:', form.iss_rev || '5 / 8'],
  ].forEach(([lbl, val], i) => {
    const yy = hBoxTop + rowH * i + rowH * 0.65;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(lbl, infoLabelX, yy);
    doc.setFont('helvetica', 'bold');   doc.text(val, infoValX, yy, { align: 'right' });
  });

  // ── Sub-header ────────────────────────────────────────────────────────────
  const ct = hBoxTop + hBoxH + 8; // content top
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...ink);
  doc.text('Appendix A.1.6 Dangerous Goods Training Course Form (MLMCXB-DG-1)', margin, ct);
  doc.setFontSize(10);
  doc.text('DANGEROUS GOODS TRAINING FORM', pageW / 2, ct + 8, { align: 'center' });

  // ── Applicant's Name (auto-filled) ────────────────────────────────────────
  const nameY = ct + 17;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink);
  doc.text("Applicant's Name:", margin, nameY);
  doc.setFont('helvetica', 'bold');
  doc.text(applicantName || '', margin + 30, nameY);
  doc.setDrawColor(120); doc.line(margin + 29, nameY + 1, pageW - margin, nameY + 1);

  // ── IATA items table ──────────────────────────────────────────────────────
  const init = form.initials || {};
  autoTable(doc, {
    startY: nameY + 5,
    theme: 'grid',
    head: [['IATA Item', 'Description', 'Instructor Initials']],
    body: [
      ['0',   'Understanding the basics of dangerous goods',                    init.item0   || ''],
      ['0.1', 'Dangerous goods applicability',                                  init.item0_1 || ''],
      ['0.2', 'Understanding the general limitations',                          init.item0_2 || ''],
      ['0.3', 'Identifying Roles and Responsibilities',                          init.item0_3 || ''],
      ['0.4', 'Understanding the importance of classification and packaging',    init.item0_4 || ''],
      ['0.5', 'Understanding hazard communication',                             init.item0_5 || ''],
      ['0.6', 'Familiarising with basic emergency response',                    init.item0_6 || ''],
      ['5',   'Accepting passenger and crew baggage – (n/a for F/D and FOO)',   init.item5   || ''],
      ['6',   'Transporting cargo/baggage',                                     init.item6   || ''],
      ['7',   'Collecting safety data – (n/a for F/D and FOO)',                 init.item7   || ''],
    ],
    styles:      { fontSize: 8, cellPadding: 1.6, textColor: ink, lineColor: [160, 160, 160] },
    headStyles:  { fillColor: [240, 240, 240], textColor: ink, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 30, halign: 'center' },
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
  const fill = (text, x, yy, w) => {
    doc.setFont('helvetica', 'bold'); doc.text(text || '', x + 1, yy - 0.5);
    doc.setDrawColor(120); doc.line(x, yy, x + w, yy);
  };

  label('We,', margin, y);
  fill(form.ato_name_number, margin + 8, y, 80);
  label('(name and number of ATO/CCTO)', margin + 92, y);
  y += 8;

  label('confirm, that', margin, y);
  fill(applicantName, margin + 20, y, 70);
  label("(Participant's first and last name)", margin + 92, y);
  y += 8;

  const dgType = form.dg_training_type === 'Recurrent' ? 'Recurrent' : 'Initial';
  label(`has received ${dgType} DG Training on`, margin, y);
  fill(form.training_date, margin + 52, y, 38);
  label('(date / DD.MM.YYYY)', margin + 92, y);
  y += 10;

  // Reference lists
  doc.setFontSize(7.5); doc.setTextColor(...grey);
  const refLines = [
    'ICAO reference list:',
    'ICAO Doc 9284-AN/905 "Technical Instructions for safe transportation of dangerous goods by air"',
    'ICAO Doc 10147 "Guidance on a Competency-based Approach to DG Training and Assessment"',
    'Comlux OM (Operations Manual) reference list:',
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
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['', 'Knowledge', 'Skills', 'Attitude']],
    body: [
      [
        `Job Function\n${JOB_FUNCTION_LABEL[form.job_function] || JOB_FUNCTION_LABEL.FC}`,
        'Final test, multiple choice questions based on result obtained.',
        `Intermediate multiple choice questions, interactive tasks and final practical tasks based on:\n`
          + `Input response: ${num(sk.input_response)}\nResponse time: ${num(sk.response_time)}\n`
          + `Number of errors: ${num(sk.number_of_errors)}\nRepeated attempts: ${num(sk.repeated_attempts)}`,
        `Shows interest: ${num(at.shows_interest)}\nParticipation: ${num(at.participation)}\n`
          + `Input: ${num(at.input)}\nCo-operation: ${num(at.co_operation)}\n`
          + `Asks relevant questions: ${num(at.asks_relevant_questions)}`,
      ],
      [
        'Score',
        s.knowledge != null ? `${Math.round(s.knowledge)}%` : '',
        s.skills    != null ? `${Math.round(s.skills)}%`    : '',
        s.attitude  != null ? `${Math.round(s.attitude)}%`  : '',
      ],
    ],
    styles:      { fontSize: 7.5, cellPadding: 1.6, textColor: ink, lineColor: [160, 160, 160], valign: 'top' },
    headStyles:  { fillColor: [240, 240, 240], textColor: ink, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 26, fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 7;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...ink);
  doc.text(
    `Final Score = Knowledge 60% + Skills 20% + Attitude 20% = ${s.final != null ? Math.round(s.final) + ' %' : '_____ %'}`,
    margin, y
  );
  y += 12;

  // ── Instructor ────────────────────────────────────────────────────────────
  label('Name of Instructor:', margin, y);
  fill(form.instructor_name, margin + 32, y, 55);
  label('Signature:', margin + 95, y);
  fill(form.instructor_signature, margin + 113, y, pageW - margin - (margin + 113));

  doc.setFontSize(7); doc.setTextColor(...grey);
  doc.text('MLM Operations Manual Part D', pageW / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

  const safe = (applicantName || 'DGR').replace(/[^a-zA-Z0-9]/g, '_');
  if (mode === 'preview') {
    window.open(doc.output('bloburl'), '_blank');
  } else {
    doc.save(`DGR_Training_Form_${safe}.pdf`);
  }
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ifoaLogo from '../assets/feedback/ifoa-logo.png';
import {
  courseDays, statusMatrix, summarise, defaultDetails, mergeDetails, recordNumber,
} from './attendanceRecord';
import { TRAINING_LABELS } from '../pages/airlines/helpers';

// ─── Training Attendance Record (PDF) ─────────────────────────────────────────
// A4 landscape: header, course details, one row per trainee with a status per
// day, hours, attendance % and remarks, summary figures and the instructor's
// certification. When the day columns would not fit next to a readable
// Remarks column, the table shows "days present"
// in the main table and add a day-by-day register (one week per table).

const INK = [12, 14, 38];
const HEAD = [8, 10, 36];
const TEXT = [30, 33, 45];
const MUTED = [100, 106, 120];
const LINE = [205, 209, 218];
const SOFT = [244, 246, 250];
const GREEN = [74, 222, 128];
const CODE_COLOR = { P: [22, 128, 61], L: [194, 95, 22], E: [194, 95, 22], A: [185, 28, 28] };
const LOGO_RATIO = 700 / 153;

// Column widths (mm). Day columns get whatever is left once every other
// column — including a readable Remarks column — has its room; when that is
// less than MIN_DAY_W per day the table switches to a "days present" summary
// and the daily register follows on its own pages.
const COL = { idx: 8, name: 46, hours: 22, pct: 26 };
const ORG_W = (dayCount) => (dayCount > 5 ? 32 : 40);
const REMARKS_MIN = 48;
const MIN_DAY_W = 8.5;
const MAX_DAY_W = 14;

// Fixed English month abbreviations (some browsers print "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const parts = (d) => { const x = new Date(`${d}T12:00:00`); return { day: x.getDate(), mon: MONTHS[x.getMonth()], year: x.getFullYear(), wd: WEEKDAYS[x.getDay()] }; };
const fmtDay = (d) => { const p = parts(d); return `${p.day} ${p.mon}`; };
const fmtLong = (d) => { if (!d) return ''; const p = parts(d); return `${p.day} ${p.mon} ${p.year}`; };
const fmtHours = (h) => (h == null ? '' : Number.isInteger(h) ? String(h) : String(Math.round(h * 10) / 10));

// The built-in PDF font only has Western European characters (Windows-1252).
// Anything else would print as garbage, so accents are dropped where that
// gives a plain letter (ł → l, ş → s) and other characters become "?".
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const FALLBACK = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ı: 'i', ħ: 'h', Ħ: 'H', ŋ: 'n', ŧ: 't', ſ: 's' };
const pdfSafe = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[^\u0000-\u00ff]/gu, (ch) => {
  if (CP1252_EXTRA.has(ch)) return ch;
  if (FALLBACK[ch]) return FALLBACK[ch];
  const plain = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /^[\u0000-\u00ff]+$/.test(plain) && plain ? plain : '?';
});
const LINE_H = (pt) => (pt * 1.18 * 25.4) / 72; // mm per text line

/**
 * @param {object} opts
 * @param {object} opts.sheet          saved sheet (participants, statuses/records, details, dates, company…)
 * @param {Array}  [opts.participants] override the sheet's participants (unsaved edits)
 * @param {object} [opts.matrix]       date → codes (unsaved edits); else built from the sheet
 * @param {object} [opts.details]      record details (unsaved edits); else the sheet's
 * @param {string} [opts.trainingLabel] readable training name, the default course title
 * @param {'download'|'preview'} [opts.mode]
 */
export function generateAttendancePdf({ sheet = {}, participants, matrix, details, trainingLabel, mode = 'download' }) {
  const people = (participants || sheet.participants || [])
    .filter((p) => (p.first_name || '').trim() || (p.last_name || '').trim())
    .map((p) => ({ ...p, first_name: pdfSafe(p.first_name), last_name: pdfSafe(p.last_name), remarks: pdfSafe(p.remarks) }));
  const days = courseDays(sheet.start_date, sheet.end_date);
  const codes = matrix || statusMatrix(sheet, people.length, days);
  const label = trainingLabel || TRAINING_LABELS[sheet.training_type] || sheet.training_type || '';
  const rawDetails = details || mergeDetails(sheet.details, defaultDetails({ company: sheet.airline_name || sheet.company, trainingLabel: label, endDate: sheet.end_date || sheet.start_date }));
  const d = Object.fromEntries(Object.entries(rawDetails).map(([k, v]) => [k, typeof v === 'string' ? pdfSafe(v) : v]));
  const org = d.client || pdfSafe(sheet.company);
  const sum = summarise({ participants: people, matrix: codes, days, details: d });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const innerW = W - M * 2;
  const orgW = ORG_W(days.length);
  const dayRoom = innerW - (COL.idx + COL.name + orgW + COL.hours + COL.pct + REMARKS_MIN);
  const dayCols = days.length > 0 && dayRoom / days.length >= MIN_DAY_W;
  const dayW = dayCols ? Math.min(MAX_DAY_W, dayRoom / days.length) : 0;
  const font = (style, size, color = TEXT) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };

  // ── Header ──
  const logoW = 12 * LOGO_RATIO;
  const fit = (text, maxW, maxLines) => {
    const lines = doc.splitTextToSize(text || '', maxW);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && doc.getTextWidth(`${last}…`) > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  };
  const header = () => {
    try { doc.addImage(ifoaLogo, 'PNG', M, 9, logoW, 12); } catch { /* logo optional */ }
    font('bold', 17, INK);
    doc.text('TRAINING ATTENDANCE RECORD', W - M, 15.5, { align: 'right' });
    font('normal', 7.6, MUTED);
    doc.text(fit(d.tagline, innerW - logoW - 12, 2), W - M, 20.5, { align: 'right', lineHeightFactor: 1.18 });
    doc.setDrawColor(...INK); doc.setLineWidth(0.9);
    doc.line(M, 26, W - M, 26);
  };

  // ── Labelled cell (label above value; value wraps up to maxLines) ──
  const cellLines = (w, value, valueSize, maxLines) => { font('bold', valueSize); return fit(value || '—', w - 6, maxLines); };
  const cellHeight = (lineCount, valueSize) => 6.4 + lineCount * LINE_H(valueSize) + 2;
  const cell = (x, y, w, h, label, value, { valueSize = 9.5, maxLines = 3 } = {}) => {
    doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.rect(x, y, w, h, 'S');
    font('normal', 6.8, MUTED);
    doc.text(label.toUpperCase(), x + 3, y + 4.6, { charSpace: 0.2 });
    const lines = cellLines(w, value, valueSize, maxLines);
    font('bold', valueSize, INK);
    doc.text(lines, x + 3, y + 6.4 + LINE_H(valueSize) * 0.78, { lineHeightFactor: 1.18 });
  };

  header();

  // ── Course details (3 × 2) ──
  const dates = sheet.start_date ? `${fmtLong(sheet.start_date)}${sheet.end_date && sheet.end_date !== sheet.start_date ? ` – ${fmtLong(sheet.end_date)}` : ''}` : '—';
  const colW = innerW / 3;
  let gy = 31;
  [
    [['Course title', d.course_title], ['Client / operator', d.client], ['Delivery mode', d.delivery_mode]],
    [['Venue', d.venue], ['Dates', dates], ['Scheduled hours', sum.scheduled ? `${fmtHours(sum.scheduled)} h` : '']],
  ].forEach((row) => {
    const h = Math.max(12, ...row.map(([, v]) => cellHeight(cellLines(colW, v, 9.5, 3).length, 9.5)));
    row.forEach(([label, value], i) => cell(M + i * colW, gy, colW, h, label, value));
    gy += h;
  });

  // ── Section title ──
  const sectionTitle = (y, text) => {
    doc.setFillColor(...GREEN); doc.rect(M, y - 3.6, 1.1, 4.6, 'F');
    font('bold', 9.5, INK);
    doc.text(text, M + 3.5, y, { charSpace: 0.5 });
  };
  sectionTitle(gy + 6, 'TRAINEE ATTENDANCE');

  // ── Main table ──
  const head = [
    { content: '#', styles: { halign: 'center' } },
    { content: 'TRAINEE NAME' },
    { content: 'ORGANISATION' },
    ...(dayCols
      // Narrow columns: "D1 / 22 Sep" in a smaller font so nothing wraps.
      ? days.map((day, i) => (dayW >= 12
        ? { content: `DAY ${i + 1}\n${fmtDay(day)}`, styles: { halign: 'center', fontSize: 6.8 } }
        : { content: `D${i + 1}\n${fmtDay(day)}`, styles: { halign: 'center', fontSize: 6, cellPadding: { top: 2.8, bottom: 2.8, left: 0.5, right: 0.5 } } }))
      : [{ content: 'DAYS PRESENT', styles: { halign: 'center' } }, { content: 'L · E · A', styles: { halign: 'center' } }]),
    { content: 'HOURS ATTENDED', styles: { halign: 'center' } },
    { content: 'ATTENDANCE %', styles: { halign: 'center' } },
    { content: 'REMARKS' },
  ];
  const firstDay = 3;
  const lastDay = dayCols ? firstDay + days.length - 1 : firstDay + 1;
  const body = people.map((p, i) => {
    const r = sum.rows[i];
    const mid = dayCols
      ? days.map((day) => (codes[day] || [])[i] || 'P')
      : days.length ? [`${r.counts.P + r.counts.L} / ${days.length}`, `${r.counts.L} · ${r.counts.E} · ${r.counts.A}`] : ['—', '—'];
    return [
      i + 1,
      `${(p.last_name || '').toUpperCase()}|${p.first_name || ''}`,
      org,
      ...mid,
      fmtHours(r.hours),
      r.pct == null ? '' : `${r.pct}%`,
      p.remarks || '',
    ];
  });

  const columnStyles = {
    0: { cellWidth: COL.idx, halign: 'center', textColor: MUTED },
    1: { cellWidth: COL.name },
    2: { cellWidth: orgW },
  };
  if (dayCols) days.forEach((_, k) => { columnStyles[firstDay + k] = { cellWidth: dayW, halign: 'center', fontStyle: 'bold' }; });
  else { columnStyles[firstDay] = { cellWidth: 24, halign: 'center' }; columnStyles[firstDay + 1] = { cellWidth: 20, halign: 'center' }; }
  columnStyles[lastDay + 1] = { cellWidth: COL.hours, halign: 'center' };
  columnStyles[lastDay + 2] = { cellWidth: COL.pct, halign: 'center' };
  columnStyles[lastDay + 3] = { cellWidth: 'auto', minCellWidth: REMARKS_MIN };

  // No trainees: one full-width row, so the fixed column widths still apply.
  const tableBody = body.length ? body : [[{ content: 'No trainees in this batch.', colSpan: head.length, styles: { halign: 'center', textColor: MUTED, fontStyle: 'italic' } }]];

  autoTable(doc, {
    startY: gy + 8.5,
    head: [head],
    body: tableBody,
    theme: 'grid',
    margin: { left: M, right: M, top: 32, bottom: 14 },
    styles: { font: 'helvetica', fontSize: 8.5, textColor: TEXT, lineColor: LINE, lineWidth: 0.2, cellPadding: { top: 2.2, bottom: 2.2, left: 2.2, right: 2.2 }, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: HEAD, textColor: 255, fontStyle: 'bold', fontSize: 7.4, valign: 'middle', cellPadding: { top: 2.8, bottom: 2.8, left: 2.2, right: 2.2 } },
    alternateRowStyles: { fillColor: SOFT },
    columnStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const c = data.column.index;
      if (c === 1 && body.length) {
        // Name: SURNAME in bold, first name regular — drawn by hand in
        // didDrawCell. Here we only work out the lines so the row gets tall
        // enough (blank placeholder lines) when a long name has to wrap.
        const [last, first] = String(data.cell.raw).split('|');
        const avail = COL.name - 4.4;
        font('bold', 8.5); const lastW = doc.getTextWidth(last);
        font('normal', 8.5); const restW = first ? doc.getTextWidth(`${last ? ', ' : ''}${first}`) : 0;
        let layout;
        if (lastW + restW <= avail) layout = [{ bold: last, rest: first ? `${last ? ', ' : ''}${first}` : '' }];
        else {
          font('bold', 8.5); const lastLines = doc.splitTextToSize(`${last}${first && last ? ',' : ''}`, avail);
          font('normal', 8.5); const firstLines = first ? doc.splitTextToSize(first, avail) : [];
          layout = [...lastLines.map((t) => ({ bold: t, rest: '' })), ...firstLines.map((t) => ({ bold: '', rest: t }))];
        }
        data.cell.nameLayout = layout;
        data.cell.text = layout.map(() => ' ');
      }
      if (dayCols && c >= firstDay && c <= lastDay) data.cell.styles.textColor = CODE_COLOR[data.cell.raw] || TEXT;
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1 || !data.cell.nameLayout) return;
      const { x, y, height } = data.cell;
      const lh = LINE_H(8.5);
      const lines = data.cell.nameLayout;
      let ty = y + (height - lines.length * lh) / 2 + lh * 0.78;
      lines.forEach(({ bold, rest }) => {
        let tx = x + 2.2;
        if (bold) { font('bold', 8.5, INK); doc.text(bold, tx, ty); tx += doc.getTextWidth(bold); }
        if (rest) { font('normal', 8.5, TEXT); doc.text(rest, tx, ty); }
        ty += lh;
      });
    },
    didDrawPage: (data) => { if (data.pageNumber > 1) header(); },
  });

  const bottom = H - 13; // keep clear of the footer
  let y = doc.lastAutoTable.finalY + 4.5;
  const legend = `P = Present · A = Absent · L = Late arrival / early departure (see remarks) · E = Excused absence · Minimum attendance for course completion: ${fmtHours(sum.minPct)}%`;
  const note = sum.scheduled && sum.rows.some((r) => !r.manualHours)
    ? `   Hours not entered by hand are calculated from days present × ${fmtHours(sum.perDay)} h per day.`
    : '';
  font('normal', 7, MUTED);
  const legendLines = doc.splitTextToSize(legend + note, innerW);
  if (y + legendLines.length * LINE_H(7) > bottom) { doc.addPage(); header(); y = 36; font('normal', 7, MUTED); }
  doc.text(legendLines, M, y, { lineHeightFactor: 1.18 });
  y += legendLines.length * LINE_H(7) + 2.5;

  // ── Certification block sizing (name / role wrap; block grows to fit) ──
  const widths = [0.33, 0.24, 0.24, 0.19].map((f) => f * innerW);
  font('bold', 10); const nameLines = fit(d.instructor_name, widths[1] - 6, 2);
  font('normal', 7.5); const titleLines = fit(d.instructor_title, widths[1] - 6, 3);
  const statement = 'I certify that the attendance recorded above is true and complete, that the training was delivered as scheduled in accordance with the approved curriculum, and that any absences or partial attendance are noted in the remarks.';
  font('normal', 7.8); const statementLines = doc.splitTextToSize(statement, widths[0] - 6);
  const certH = Math.max(
    29,
    8.5 + statementLines.length * LINE_H(7.8) + 3,
    8.5 + nameLines.length * LINE_H(10) + 1 + titleLines.length * LINE_H(7.5) + 3,
  );

  // Summary + certification must stay together; start a new page if they don't fit.
  if (y + 16.5 + certH > bottom) { doc.addPage(); header(); y = 36; }

  // ── Summary figures ──
  const gap = 4;
  const boxW = (innerW - gap * 3) / 4;
  [
    ['Trainees enrolled', String(sum.enrolled)],
    ['Met attendance requirement', String(sum.met)],
    ['Below requirement', String(sum.below)],
    ['Average attendance', sum.average == null ? '—' : `${sum.average}%`],
  ].forEach(([label, value], i) => cell(M + i * (boxW + gap), y, boxW, 13, label, value, { valueSize: 12.5 }));
  y += 16.5;

  // ── Instructor certification ──
  let x = M;
  // Statement
  doc.setFillColor(...SOFT); doc.rect(x, y, widths[0], certH, 'F');
  font('normal', 6.8, MUTED); doc.text('INSTRUCTOR CERTIFICATION', x + 3, y + 5, { charSpace: 0.2 });
  font('normal', 7.8, TEXT);
  doc.text(statementLines, x + 3, y + 10, { lineHeightFactor: 1.18 });
  x += widths[0];
  // Name + role
  font('normal', 6.8, MUTED); doc.text('INSTRUCTOR NAME', x + 3, y + 5, { charSpace: 0.2 });
  font('bold', 10, INK); doc.text(nameLines, x + 3, y + 11, { lineHeightFactor: 1.18 });
  font('normal', 7.5, MUTED); doc.text(titleLines, x + 3, y + 11 + nameLines.length * LINE_H(10) + 1, { lineHeightFactor: 1.18 });
  x += widths[1];
  // Signature
  font('normal', 6.8, MUTED); doc.text('INSTRUCTOR SIGNATURE', x + 3, y + 5, { charSpace: 0.2 });
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.3); doc.line(x + 3, y + certH - 7, x + widths[2] - 4, y + certH - 7);
  x += widths[2];
  // Date
  font('normal', 6.8, MUTED); doc.text('DATE', x + 3, y + 5, { charSpace: 0.2 });
  font('bold', 10, INK); doc.text(fmtLong(d.certified_on) || '', x + 3, y + 11);
  // Frame + dividers
  doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.rect(M, y, innerW, certH, 'S');
  doc.setDrawColor(...LINE); doc.setLineWidth(0.25);
  let dx = M;
  widths.slice(0, 3).forEach((w) => { dx += w; doc.line(dx, y, dx, y + certH); });

  // ── Day-by-day register for long courses ──
  if (!dayCols && days.length && people.length) {
    const weeks = [];
    let cur = [];
    days.forEach((day) => {
      if (new Date(`${day}T12:00:00`).getDay() === 1 && cur.length) { weeks.push(cur); cur = []; }
      cur.push(day);
    });
    if (cur.length) weeks.push(cur);
    doc.addPage(); header();
    let ry = 36;
    weeks.forEach((week, wi) => {
      if (ry + 24 > bottom) { doc.addPage(); header(); ry = 36; } // title + header + first row together
      sectionTitle(ry, `DAILY REGISTER · WEEK ${wi + 1} OF ${weeks.length} · ${fmtLong(week[0])} – ${fmtLong(week[week.length - 1])}`);
      autoTable(doc, {
        startY: ry + 3,
        head: [['#', { content: 'TRAINEE NAME', styles: { halign: 'left' } }, ...week.map((day) => `${parts(day).wd}\n${fmtDay(day)}`)]],
        body: people.map((p, i) => [i + 1, [(p.last_name || '').toUpperCase(), p.first_name].filter(Boolean).join(', '), ...week.map((day) => (codes[day] || [])[i] || 'P')]),
        theme: 'grid',
        margin: { left: M, right: M, top: 32, bottom: 14 },
        styles: { fontSize: 8, textColor: TEXT, lineColor: LINE, lineWidth: 0.2, cellPadding: 2, valign: 'middle', halign: 'center' },
        headStyles: { fillColor: HEAD, textColor: 255, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: SOFT },
        columnStyles: { 0: { cellWidth: 8, textColor: MUTED }, 1: { cellWidth: 60, halign: 'left' } },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index >= 2) {
            data.cell.styles.textColor = CODE_COLOR[data.cell.raw] || TEXT;
            data.cell.styles.fontStyle = 'bold';
          }
        },
        didDrawPage: (data) => { if (data.pageNumber > 1) header(); },
      });
      ry = doc.lastAutoTable.finalY + 10;
    });
  }

  // ── Footer on every page ──
  const total = doc.internal.getNumberOfPages();
  const stamp = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    font('normal', 7, MUTED);
    doc.text(fit(`${d.form_ref ? `${d.form_ref} · ` : ''}Record ${recordNumber(sheet)}`, innerW * 0.34, 1), M, H - 7);
    doc.text(`Generated by IFOA TMS · ${stamp}`, W / 2, H - 7, { align: 'center' });
    doc.text(`Page ${i} of ${total}`, W - M, H - 7, { align: 'right' });
  }

  const filename = `attendance_${(org || 'record').replace(/[^\w-]+/g, '_').slice(0, 60)}_${sheet.start_date || ''}.pdf`;
  if (mode === 'preview') window.open(doc.output('bloburl'), '_blank');
  else doc.save(filename);
}

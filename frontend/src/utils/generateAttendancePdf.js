import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import greenLogo from '../assets/IFOA_GREEN_white.png';

const NAVY       = [30, 58, 138];
const NAVY_SOFT  = [71, 85, 105];   // weekend header accent
const INK        = [30, 30, 30];
const MUTED      = [110, 116, 128];
const FAINT      = [170, 174, 182];
const ROW_ALT    = [246, 248, 251];
const WEEKEND_BG = [237, 241, 247];
const GREEN_BG   = [209, 247, 224];
const GREEN_TX   = [21, 128, 61];

/**
 * Build attendance boolean map from DB records array.
 * records: [{ date: 'YYYY-MM-DD', present: [indices] }]
 * participantCount: number
 */
export function buildAttendanceMap(records = [], participantCount = 0) {
  const map = {};
  records.forEach(r => {
    const arr = new Array(participantCount).fill(false);
    (r.present || []).forEach(i => { if (i < participantCount) arr[i] = true; });
    map[r.date] = arr;
  });
  return map;
}

/**
 * Generate attendance PDF — one calendar week (Mon-Sun) per page.
 * @param {object} opts
 * @param {Array}  opts.participants  - [{first_name, last_name}]
 * @param {string} opts.startDate    - YYYY-MM-DD
 * @param {string} opts.endDate      - YYYY-MM-DD
 * @param {string} opts.company
 * @param {string} opts.trainingType
 * @param {object} opts.attendance   - date -> boolean[] (from buildAttendanceMap)
 * @param {'download'|'preview'} opts.mode
 */
export function generateAttendancePdf({
  participants = [],
  startDate,
  endDate,
  company,
  trainingType,
  attendance = {},
  mode = 'download',
}) {
  const valid = participants.filter(p => (p.first_name || '').trim() || (p.last_name || '').trim());

  const allDates = [];
  if (startDate) {
    const start = new Date(startDate + 'T12:00:00');
    const end   = endDate ? new Date(endDate + 'T12:00:00') : new Date(start);
    const cur   = new Date(start);
    while (cur <= end && allDates.length < 366) {
      allDates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Chunk into calendar weeks (Mon-Sun) — a new chunk starts every Monday,
  // so a range that doesn't start/end on week boundaries gets short first/last pages.
  const weeks = [];
  let weekCur = [];
  allDates.forEach(d => {
    const dow = new Date(d + 'T12:00:00').getDay(); // 0=Sun..6=Sat
    if (dow === 1 && weekCur.length) { weeks.push(weekCur); weekCur = []; }
    weekCur.push(d);
  });
  if (weekCur.length) weeks.push(weekCur);
  if (weeks.length === 0) weeks.push([]);

  const doc    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 14;
  const idxW = 10, nameW = 58, totW = 22;

  const fmtLong = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const drawPageHeader = () => {
    // Accent bar + title
    doc.setFillColor(...NAVY);
    doc.rect(margin, 6.5, 1.6, 9.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY);
    doc.text('ATTENDANCE RECORD', margin + 5, 12.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text('Training Attendance & Compliance Log', margin + 5, 16.8);

    try {
      const logoH = 18;
      const logoW = Math.round(logoH * 1.1394 * 10) / 10;
      doc.addImage(greenLogo, 'PNG', pageW - margin - logoW, 5, logoW, logoH);
    } catch (_) {}

    doc.setFontSize(8.5);
    const col2 = pageW / 2 + 4;
    const bold = () => { doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); };
    const norm = () => { doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED); };
    norm(); doc.text('Company:', margin, 24);     bold(); doc.text(company || '—', margin + 21, 24);
    norm(); doc.text('Training:', margin, 29);    bold(); doc.text(trainingType || '—', margin + 21, 29);
    norm(); doc.text('Period:', col2, 24);        bold(); doc.text(`${startDate}${endDate && endDate !== startDate ? ` – ${endDate}` : ''}`, col2 + 17, 24);
    norm(); doc.text('Participants:', col2, 29);  bold(); doc.text(`${valid.length}  ·  ${allDates.length} day${allDates.length !== 1 ? 's' : ''}`, col2 + 25, 29);

    doc.setDrawColor(...NAVY); doc.setLineWidth(0.5);
    doc.line(margin, 33, pageW - margin, 33);
  };

  const drawWeekBanner = (weekDates, weekIdx) => {
    const y = 40;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...INK);
    const label = weekDates.length
      ? `${fmtLong(weekDates[0])}  –  ${fmtLong(weekDates[weekDates.length - 1])}`
      : '—';
    doc.text(label, margin, y);

    const tag = `WEEK ${weekIdx + 1} OF ${weeks.length}`;
    doc.setFontSize(7.5);
    const tagW = doc.getTextWidth(tag) + 8;
    const tagX = pageW - margin - tagW;
    doc.setFillColor(...NAVY);
    doc.roundedRect(tagX, y - 4.6, tagW, 6.4, 1.6, 1.6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(tag, tagX + tagW / 2, y - 0.5, { align: 'center' });
  };

  weeks.forEach((weekDates, weekIdx) => {
    if (weekIdx > 0) doc.addPage();
    drawPageHeader();
    drawWeekBanner(weekDates, weekIdx);

    const availW = pageW - margin * 2 - idxW - nameW - totW;
    const dColW  = weekDates.length ? availW / weekDates.length : availW;
    const weekendFlags = weekDates.map(d => [0, 6].includes(new Date(d + 'T12:00:00').getDay()));

    const headCols = [
      { content: 'S.No.' }, { content: 'Candidate Name' },
      ...weekDates.map((d, i) => {
        const dateObj = new Date(d + 'T12:00:00');
        const wd = dateObj.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
        const dm = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        return {
          content: `${wd}\n${dm}`,
          styles: weekendFlags[i] ? { fillColor: NAVY_SOFT } : {},
        };
      }),
      { content: 'Week\nTotal' },
    ];

    const body = valid.map((p, pIdx) => {
      const marks = weekDates.map(d => !!(attendance[d] || [])[pIdx]);
      const total = weekDates.filter(d => !!(attendance[d] || [])[pIdx]).length;
      return [pIdx + 1, `${p.first_name} ${p.last_name}`, ...marks.map(m => (m ? 'P' : '')), `${total}/${weekDates.length}`];
    });

    const colStyles = { 0: { cellWidth: idxW, halign: 'center' }, 1: { cellWidth: nameW, halign: 'center' } };
    weekDates.forEach((_, i) => { colStyles[i + 2] = { cellWidth: dColW, halign: 'center' }; });
    colStyles[weekDates.length + 2] = { cellWidth: totW, halign: 'center' };

    autoTable(doc, {
      startY: 44, head: [headCols], body, theme: 'grid',
      styles: { lineWidth: 0.15, lineColor: [214, 218, 226] },
      headStyles: {
        fillColor: NAVY, textColor: 255, fontSize: 7.5, fontStyle: 'bold',
        halign: 'center', valign: 'middle', cellPadding: { top: 3.2, bottom: 3.2, left: 1.5, right: 1.5 },
      },
      bodyStyles: { fontSize: 8.5, textColor: INK, cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2 }, valign: 'middle' },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: colStyles,
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const c = data.column.index;
        const isDateCol = c >= 2 && c < weekDates.length + 2;
        if (isDateCol) {
          if (weekendFlags[c - 2] && data.cell.raw !== 'P') data.cell.styles.fillColor = WEEKEND_BG;
          if (data.cell.raw === 'P') data.cell.text = []; // drawn manually as a pill in didDrawCell
        }
        if (c === weekDates.length + 2) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.textColor = NAVY;
        }
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const c = data.column.index;
        const isDateCol = c >= 2 && c < weekDates.length + 2;
        if (!isDateCol) return;
        const { x, y, width, height } = data.cell;
        if (data.cell.raw === 'P') {
          const pw = Math.min(width * 0.62, 9), ph = 5.4;
          const px = x + (width - pw) / 2, py = y + (height - ph) / 2;
          doc.setFillColor(...GREEN_BG);
          doc.roundedRect(px, py, pw, ph, 1.4, 1.4, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GREEN_TX);
          doc.text('P', x + width / 2, y + height / 2 + 0.2, { align: 'center', baseline: 'middle' });
        } else {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...FAINT);
          doc.text('–', x + width / 2, y + height / 2 + 0.2, { align: 'center', baseline: 'middle' });
        }
      },
      margin: { left: margin, right: margin },
    });

    const finalY = doc.lastAutoTable.finalY;
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.4);
    doc.rect(margin, 44, pageW - margin * 2, finalY - 44, 'S');
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(225, 227, 232); doc.setLineWidth(0.2);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...FAINT);
    doc.text(
      `Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}   ·   Page ${i} of ${pageCount}`,
      pageW / 2, pageH - 5, { align: 'center' }
    );
  }

  const filename = `attendance_${(company || 'record').replace(/\s+/g, '_')}_${startDate}.pdf`;
  if (mode === 'preview') {
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  } else {
    doc.save(filename);
  }
}

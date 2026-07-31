import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import greenLogo from '../assets/IFOA_GREEN_white.png';

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
 * Generate attendance PDF.
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

  const doc    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 14;
  const idxW = 9, nameW = 46, totW = 17, dColW = 11;
  const availW       = pageW - margin * 2 - idxW - nameW;
  const datesPerPage = Math.max(1, Math.floor(availW / dColW));

  const chunks = [];
  for (let i = 0; i < allDates.length; i += datesPerPage) chunks.push(allDates.slice(i, i + datesPerPage));
  if (chunks.length === 0) chunks.push([]);

  const drawPageHeader = () => {
    try {
      const logoH = 20;
      const logoW = Math.round(logoH * 1.1394 * 10) / 10; // ~22.8mm
      doc.addImage(greenLogo, 'PNG', pageW - margin - logoW, 4, logoW, logoH);
    } catch (_) {}
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30, 58, 138);
    doc.text('ATTENDANCE RECORD', margin, 11);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 90, 90);
    const col2 = pageW / 2 + 4;
    const bold = () => { doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30); };
    const norm = () => { doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 90, 90); };
    doc.text('Company:', margin, 19);     bold(); doc.text(company || '—', margin + 21, 19);                                                           norm();
    doc.text('Training:', margin, 24);    bold(); doc.text(trainingType || '—', margin + 21, 24);                                                      norm();
    doc.text('Period:', col2, 19);        bold(); doc.text(`${startDate}${endDate && endDate !== startDate ? ` - ${endDate}` : ''}`, col2 + 17, 19);   norm();
    doc.text('Participants:', col2, 24);  bold(); doc.text(`${valid.length}  ·  ${allDates.length} day${allDates.length !== 1 ? 's' : ''}`, col2 + 25, 24); norm();
    doc.setDrawColor(210, 210, 210); doc.line(margin, 28, pageW - margin, 28);
  };

  chunks.forEach((chunkDates, chunkIdx) => {
    const isLast = chunkIdx === chunks.length - 1;
    if (chunkIdx > 0) doc.addPage();
    drawPageHeader();

    const dateLabels = chunkDates.map(d =>
      new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    );
    const headCols = ['#', 'Candidate Name', ...dateLabels];
    if (isLast) headCols.push('Total');

    const body = valid.map((p, pIdx) => {
      const marks = chunkDates.map(d => !!(attendance[d] || [])[pIdx] ? 'P' : '');
      const row   = [pIdx + 1, `${p.first_name} ${p.last_name}`, ...marks];
      if (isLast) {
        const total = allDates.filter(d => !!(attendance[d] || [])[pIdx]).length;
        row.push(`${total}/${allDates.length}`);
      }
      return row;
    });

    const colStyles = { 0: { cellWidth: idxW, halign: 'center' }, 1: { cellWidth: nameW } };
    chunkDates.forEach((_, i) => { colStyles[i + 2] = { cellWidth: dColW, halign: 'center' }; });
    if (isLast) colStyles[chunkDates.length + 2] = { cellWidth: totW, halign: 'center' };

    autoTable(doc, {
      startY: 31, head: [headCols], body, theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 7.5, fontStyle: 'bold', halign: 'center', cellPadding: { top: 3, bottom: 3, left: 1.5, right: 1.5 }, valign: 'middle', overflow: 'linebreak' },
      bodyStyles: { fontSize: 8, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 }, valign: 'middle' },
      columnStyles: colStyles,
      didParseCell: (data) => {
        if (data.section === 'body') {
          const c = data.column.index;
          if (c >= 2 && c < chunkDates.length + 2) {
            if (data.cell.raw === 'P') { data.cell.styles.fillColor = [220, 252, 231]; data.cell.styles.textColor = [22, 101, 52]; data.cell.styles.fontStyle = 'bold'; }
            else { data.cell.styles.textColor = [190, 190, 190]; }
          }
          if (isLast && c === chunkDates.length + 2) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [241, 245, 249]; data.cell.styles.textColor = [30, 58, 138]; }
        }
      },
      margin: { left: margin, right: margin },
    });
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(160);
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

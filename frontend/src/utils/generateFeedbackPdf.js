import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Customer Training Feedback — review report PDF ───────────────────────────
// Cover → executive summary (totals + rating distribution + section averages)
// → one page per submitted review (details, every rating, comments). Built from
// exactly what participants submitted; nothing is summarised by hand.

const NAVY = [20, 48, 74];
const ACCENT = [75, 154, 181];
const HEADING = [31, 90, 130];
const INK = [30, 41, 59];
const MUTED = [100, 116, 139];
const TILE = [232, 240, 244];
const LINE = [214, 225, 232];
const SOFT = [246, 248, 250];

const W = 210;
const H = 297;
const M = 20;
const CW = W - 2 * M;
const TOP = 26; // first line under the page header band

const SMALL_WORDS = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'to', 'in', 'on', 'for', 'with']);
// "1. TRAINING CONTENT AND MATERIALS:" → "Training Content and Materials"
function sectionName(title) {
  const t = String(title || '').replace(/(\.\.\.|…|:)\s*$/, '').replace(/^\d+\.\s*/, '').trim();
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().split(' ').map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}
const noStop = (t) => String(t || '').replace(/\.\s*$/, '');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const pad2 = (n) => String(n).padStart(2, '0');

export function downloadFeedbackPdf({ examTitle, form, responses, sentCount }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const scale = [...form.scale].sort((a, b) => b.value - a.value); // Excellent first
  const ratingLabel = (v) => {
    const sc = form.scale.find((x) => x.value === v);
    return sc ? `${sc.label} (${v})` : '—';
  };
  const ratingOf = (r, key) => r.ratings.find((x) => x.key === key)?.value;

  // The one-question opening section is the "overall quality" headline.
  const overallSection = form.sections.find((s) => s.statements.length === 1) || null;
  const overallKey = overallSection?.statements[0].key;
  const detailSections = form.sections.filter((s) => s !== overallSection);

  const reviews = [...responses].sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
  const n = reviews.length;
  const values = reviews.flatMap((r) => r.ratings.map((x) => x.value)).filter((v) => Number.isFinite(v));
  const scored = values.length;
  const mean = scored ? values.reduce((a, b) => a + b, 0) / scored : null;
  const dist = Object.fromEntries(form.scale.map((sc) => [sc.value, values.filter((v) => v === sc.value).length]));
  const years = reviews.map((r) => new Date(r.submitted_at).getFullYear()).filter(Boolean);
  const period = years.length ? (Math.min(...years) === Math.max(...years) ? String(years[0]) : `${Math.min(...years)}-${Math.max(...years)}`) : '—';
  const withComments = reviews.filter((r) => String(r.comments || '').trim()).length;

  const text = (str, x, y, { size = 10, color = INK, bold = false, align = 'left', maxWidth } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(str, x, y, { align, maxWidth });
  };
  const wrapped = (str, size, width = CW) => {
    doc.setFontSize(size);
    return doc.splitTextToSize(String(str), width);
  };
  const lastY = () => doc.lastAutoTable.finalY;
  const ensure = (y, need) => {
    if (y + need <= H - 18) return y;
    doc.addPage();
    return TOP + 4;
  };
  const tableBase = {
    margin: { left: M, right: M, top: TOP, bottom: 18 },
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, lineColor: LINE, lineWidth: 0.2, cellPadding: 2, overflow: 'linebreak' },
  };

  // Headline numbers: big value over a small caption, one tile per column.
  const tiles = (y, items) => {
    autoTable(doc, {
      ...tableBase,
      startY: y,
      theme: 'grid',
      body: [items.map(([v]) => String(v)), items.map(([, l]) => l.toUpperCase())],
      styles: { ...tableBase.styles, halign: 'center', fillColor: TILE },
      didParseCell: (d) => {
        if (d.row.index === 0) { d.cell.styles.fontSize = 19; d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = NAVY; d.cell.styles.cellPadding = { top: 5, bottom: 3, left: 2, right: 2 }; }
        else { d.cell.styles.fontSize = 7.5; d.cell.styles.textColor = MUTED; d.cell.styles.cellPadding = { top: 2.5, bottom: 3.5, left: 2, right: 2 }; }
      },
    });
    return lastY();
  };

  // ── Cover ─────────────────────────────────────────────────────────────────
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1.3);
  doc.line(M, 58, W - M, 58);
  text('TRAINING FEEDBACK', M, 72, { size: 7.5, color: MUTED, bold: true });
  const titleLines = wrapped(examTitle, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...NAVY);
  doc.text(titleLines, M, 84, { lineHeightFactor: 1.15 });
  let y = 84 + titleLines.length * 10.5;
  text('Training review report · consolidated participant feedback', M, y, { size: 11, color: MUTED });
  y = tiles(y + 16, [[n, 'Reviews'], [period, 'Review period'], [scored, 'Scored responses']]);
  const prepared = wrapped(`Prepared from ${n} submitted training review${n === 1 ? '' : 's'}${sentCount ? ` (${sentCount} form${sentCount === 1 ? '' : 's'} sent)` : ''}. Ratings, names, dates and comments are shown exactly as submitted by participants.`, 10.5);
  text(prepared, M, y + 26, { size: 10.5, color: MUTED });
  const coverRuleY = y + 26 + prepared.length * 5 + 8;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, coverRuleY, W - M, coverRuleY);
  text('INTERNATIONAL FLIGHT OPERATIONS ACADEMY', M, coverRuleY + 7, { size: 7.5, color: MUTED, bold: true });
  text(`Generated ${fmtDate(new Date())}`, W - M, coverRuleY + 7, { size: 7.5, color: MUTED, align: 'right' });

  // ── Executive summary ───────────────────────────────────────────────────────
  doc.addPage();
  y = TOP + 8;
  text('Executive summary', M, y, { size: 18, color: NAVY, bold: true });
  const excellent = overallKey ? reviews.filter((r) => ratingOf(r, overallKey) === 5).length : null;
  const overallParts = overallKey
    ? scale.map((sc) => [sc, reviews.filter((r) => ratingOf(r, overallKey) === sc.value).length]).filter(([, c]) => c > 0)
    : [];
  const summaryText = [
    `This report covers ${n} submitted review${n === 1 ? '' : 's'} for ${examTitle}.`,
    overallParts.length ? `Overall quality of training: ${overallParts.map(([sc, c]) => `${c} rated it ${sc.label} (${sc.value})`).join(', ')}.` : '',
    mean != null ? `The mean of all ${scored} scored items is ${mean.toFixed(2)} out of 5.` : '',
    `${withComments} of ${n} review${n === 1 ? '' : 's'} include written comments or suggestions.`,
  ].filter(Boolean).join(' ');
  const summaryLines = wrapped(summaryText, 10.5);
  text(summaryLines, M, y + 9, { size: 10.5, color: INK });
  y = y + 9 + summaryLines.length * 5 + 5;
  y = tiles(y, [
    [n, 'Reviews'],
    [excellent != null ? `${excellent} / ${n}` : '—', 'Overall quality: Excellent (5)'],
    [mean != null ? `${mean.toFixed(2)} / 5` : '—', 'Mean of all scored items'],
  ]);

  text('Aggregate rating distribution', M, y + 11, { size: 11, color: HEADING, bold: true });
  autoTable(doc, {
    ...tableBase,
    startY: y + 14,
    theme: 'grid',
    head: [['Rating', 'Count', 'Share of scored items']],
    body: scale.map((sc) => [`${sc.label} (${sc.value})`, String(dist[sc.value] || 0), scored ? `${(((dist[sc.value] || 0) / scored) * 100).toFixed(1)}%` : '—']),
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [240, 245, 248] },
    columnStyles: { 1: { cellWidth: 32 }, 2: { cellWidth: 48 } },
  });
  y = lastY();
  const note = wrapped(`Distribution covers ${scored} scored responses across all review questions${overallSection ? ', including the overall quality rating' : ''}. Mean calculated from the numeric rating values; ratings are not weighted.`, 8.5);
  text(note, M, y + 5, { size: 8.5, color: MUTED });
  y += 5 + note.length * 4;

  // Average per section (and the overall-quality headline), from the same data.
  const sectionRows = form.sections.map((s) => {
    const vals = reviews.flatMap((r) => s.statements.map((st) => ratingOf(r, st.key))).filter((v) => Number.isFinite(v));
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return [s === overallSection ? 'Overall quality of training' : sectionName(s.title), avg != null ? avg.toFixed(2) : '—', avg != null ? ratingLabel(Math.round(avg)) : '—'];
  });
  y = ensure(y + 9, 40);
  text('Average by section', M, y, { size: 11, color: HEADING, bold: true });
  autoTable(doc, {
    ...tableBase,
    startY: y + 3,
    theme: 'grid',
    head: [['Section', 'Average (out of 5)', 'Nearest rating']],
    body: sectionRows,
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [240, 245, 248] },
    columnStyles: { 1: { cellWidth: 36 }, 2: { cellWidth: 44 } },
  });

  // ── One page per review ─────────────────────────────────────────────────────
  reviews.forEach((r, i) => {
    doc.addPage();
    y = TOP + 8;
    const who = r.company || r.airline_name || r.participant_name || 'Participant';
    const heading = wrapped(`Review ${pad2(i + 1)} | ${who}`, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(...NAVY);
    doc.text(heading, M, y);
    y += (heading.length - 1) * 7 + 5.5;
    text([r.participant_name, r.participant_email].filter(Boolean).join('  ·  '), M, y, { size: 9, color: MUTED });

    autoTable(doc, {
      ...tableBase,
      startY: y + 3,
      theme: 'grid',
      head: [['TRAINING', 'INSTRUCTOR', 'DATE']],
      body: [[r.training_title || '—', r.instructor_name || '—', fmtDate(r.submitted_at)]],
      styles: { ...tableBase.styles, fillColor: TILE },
      headStyles: { fillColor: TILE, textColor: MUTED, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: { 1: { cellWidth: 50 }, 2: { cellWidth: 38 } },
    });
    y = lastY();

    if (overallSection) {
      autoTable(doc, {
        ...tableBase,
        startY: y + 4,
        theme: 'grid',
        body: [['OVERALL QUALITY OF TRAINING', ratingLabel(ratingOf(r, overallKey))]],
        styles: { ...tableBase.styles, fillColor: SOFT, cellPadding: 3.2 },
        columnStyles: { 0: { fontStyle: 'bold', fontSize: 7.5, textColor: MUTED, cellWidth: 82 }, 1: { fontSize: 11, textColor: INK } },
      });
      y = lastY();
    }

    detailSections.forEach((s) => {
      y = ensure(y + 6, 22);
      text(sectionName(s.title), M, y, { size: 10.5, color: HEADING, bold: true });
      autoTable(doc, {
        ...tableBase,
        startY: y + 2,
        theme: 'grid',
        head: [['Question', 'Rating']],
        body: s.statements.map((st) => [noStop(st.text), ratingLabel(ratingOf(r, st.key))]),
        headStyles: { fillColor: [241, 245, 249], textColor: MUTED, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1: { cellWidth: 38 } },
      });
      y = lastY();
    });

    // Comments box with an accent bar.
    const comment = String(r.comments || '').trim();
    const lines = wrapped(comment || 'No comments.', 10, CW - 12);
    const boxH = lines.length * 5 + 7;
    y = ensure(y + 6, boxH + 6);
    text('COMMENTS / SUGGESTIONS', M, y, { size: 7.5, color: MUTED, bold: true });
    const boxY = y + 2;
    doc.setFillColor(...SOFT);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.rect(M, boxY, CW, boxH, 'FD');
    doc.setFillColor(...ACCENT);
    doc.rect(M, boxY, 1, boxH, 'F');
    doc.setFont('helvetica', comment ? 'normal' : 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...(comment ? INK : MUTED));
    doc.text(lines, M + 6, boxY + 6.2, { lineHeightFactor: 1.4 });
  });

  // ── Header band + footer on every page after the cover ──────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 2; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 14, 'F');
    text('IFOA  |  TRAINING FEEDBACK', M, 9, { size: 8, color: [255, 255, 255], bold: true });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M - 2, H - 14, W - M + 2, H - 14);
    text(`IFOA Training Feedback  |  Page ${p}`, W - M, H - 9, { size: 8, color: MUTED, align: 'right' });
  }

  doc.save(`Training_Feedback_${String(examTitle).replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`);
}

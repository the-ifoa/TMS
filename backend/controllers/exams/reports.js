const Exam = require('../../models/Exam');
const ExamAttempt = require('../../models/ExamAttempt');
const ExamInvite = require('../../models/ExamInvite');
const Airline = require('../../models/Airline');
const Participant = require('../../models/Participant');
const r2 = require('../../services/r2');
const { hasPermission } = require('../../middleware/permissions');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { isAdmin, authoringAirline, canManageExam, attemptScopeFilter, pct1 } = require('./access');

// ─── GET /exams/airlines — admin only: airlines with participants, for assigning ──
exports.listAirlines = async (req, res) => {
  try {
    // An exam-authoring airline gets the same picker, scoped to itself only.
    if (!isAdmin(req) && !(await authoringAirline(req))) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const airlineFilter = isAdmin(req) ? {} : { _id: req.admin.id };
    const airlines     = await Airline.find(airlineFilter).sort({ airlineName: 1 });
    // Only the fields the picker shows — the full records are large and this
    // runs every time the assign dialog opens.
    const participants = await Participant.find({})
      .select('participant_name training_type email cert_sequence cert_released submitted_by company airline_name')
      .sort({ created_at: -1 })
      .lean();

    const result = airlines.map((a) => ({
      airline: a.toJSON(),
      participants: participants
        .filter(
          (p) =>
            (p.submitted_by && String(p.submitted_by) === String(a._id)) ||
            // Legacy name-match only for the admin view — an airline/department
            // must never pick up un-owned records that merely share its name.
            (isAdmin(req) && !p.submitted_by && (p.company === a.airlineName || p.airline_name === a.airlineName))
        )
        .map((p) => ({
          _id: String(p._id), participant_name: p.participant_name, training_type: p.training_type, email: p.email || '',
          cert_sequence: p.cert_sequence ?? null, cert_released: !!p.cert_released,
        })),
    }));

    res.json(result.filter((r) => r.participants.length > 0));
  } catch (err) {
    console.error('GET /exams/airlines error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/airline-results — airline: their participants' invite + score status ──
// Defined BEFORE `GET /exams/:id` so the literal path isn't captured as an :id.
exports.airlineResults = async (req, res) => {
  try {
    if (isAdmin(req)) return res.status(403).json({ error: 'Airline access required.' });
    const invites = await ExamInvite.find({ airline_id: req.admin.id }).sort({ created_at: -1 });

    // Exams with an expired visibility cutoff drop out of the airline's list
    // — their invites/scores stay reachable via the participant performance
    // view (GET /exams/participants/:id/performance), which doesn't filter
    // on this at all, so historical data is never actually lost. A per-airline
    // override in airline_visibility wins over the exam's global visible_until.
    const examIds = [...new Set(invites.map((i) => String(i.exam_id)))];
    const exams = await Exam.find({ _id: { $in: examIds } }).select('visible_until airline_visibility owner_airline owner_department');
    const examById = Object.fromEntries(exams.map((e) => [String(e._id), e]));
    // Same rule deleteAttemptsByIds enforces: only for exams this account owns.
    const mayDelete = hasPermission(req, ['exams.author']);
    const now = new Date();
    const hiddenExamIds = new Set(
      exams.filter((e) => {
        const override = (e.airline_visibility || []).find((v) => String(v.airline_id) === String(req.admin.id));
        const effective = override ? override.visible_until : e.visible_until;
        return effective && effective <= now;
      }).map((e) => String(e._id))
    );
    const visibleInvites = invites.filter((i) => !hiddenExamIds.has(String(i.exam_id)));

    const attemptIds = visibleInvites.map((i) => i.attempt_id).filter(Boolean);
    const attempts = await ExamAttempt.find({ _id: { $in: attemptIds } })
      .select('score max_score percentage passed status submitted_at time_taken_seconds');
    const attemptById = Object.fromEntries(attempts.map((a) => [String(a._id), a]));

    res.json(visibleInvites.map((i) => {
      const json = i.toJSON();
      const att = i.attempt_id && attemptById[String(i.attempt_id)];
      json.attempt = att
        ? {
            id: String(att._id),
            score: att.score, max_score: att.max_score, percentage: att.percentage,
            passed: att.passed, status: att.status, submitted_at: att.submitted_at,
            time_taken_seconds: att.time_taken_seconds,
          }
        : null;
      const exam = examById[String(i.exam_id)];
      json.can_delete_result = !!(att && mayDelete && exam && canManageExam(req, exam));
      return json;
    }));
  } catch (err) {
    console.error('GET /exams/airline-results error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/assigned — airline: exams assigned to their participants ─────────
exports.listAssigned = async (req, res) => {
  try {
    if (isAdmin(req)) return res.status(403).json({ error: 'Airline access required.' });

    const exams = await Exam.find({
      status: 'published',
      'assignments.airline_id': req.admin.id,
    }).select('-questions').sort({ created_at: -1 });

    const examIds = exams.map((e) => e._id);
    const attempts = await ExamAttempt.find({ exam_id: { $in: examIds }, airline_id: req.admin.id })
      .select('-questions_snapshot -answers');
    const participantIds = [...new Set(exams.flatMap((e) => e.assignments.map((a) => String(a.participant_id))))];
    const participants = await Participant.find({ _id: { $in: participantIds } }).select('participant_name');
    const nameById = Object.fromEntries(participants.map((p) => [String(p._id), p.participant_name]));

    const result = exams.map((e) => {
      const json = e.toJSON();
      json.questions = undefined; // list view doesn't need the question bank
      const myAssignments = e.assignments.filter((a) => String(a.airline_id) === String(req.admin.id));
      json.assignments = myAssignments.map((a) => {
        const participantAttempts = attempts
          .filter((att) => String(att.participant_id) === String(a.participant_id) && String(att.exam_id) === String(e._id))
          .sort((x, y) => y.attempt_number - x.attempt_number);
        return {
          participant_id: a.participant_id,
          participant_name: nameById[String(a.participant_id)] || '',
          latest_attempt: participantAttempts[0] ? participantAttempts[0].toJSON() : null,
          attempts_used: participantAttempts.length,
        };
      });
      return json;
    });

    res.json(result);
  } catch (err) {
    console.error('GET /exams/assigned error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/team-performance — dashboard KPIs ─────────────────────────────
// Team-level version of the per-participant performance view: accuracy by
// section and question type across every finished attempt in scope, weakest
// first, so strengths (green) and weak areas (red) are visible at a glance.
exports.teamPerformance = async (req, res) => {
  try {
    const filter = { ...(await attemptScopeFilter(req)), status: { $ne: 'in_progress' } };
    const attempts = await ExamAttempt.find(filter).select(
      'participant_id exam_id exam_title_snapshot percentage passed status answers questions_snapshot'
    );

    const bySection = {};
    const byType = {};
    const byExam = {};
    const participants = new Set();
    attempts.forEach((a) => {
      participants.add(String(a.participant_id));
      const key = String(a.exam_id);
      if (!byExam[key]) byExam[key] = { exam_id: key, title: a.exam_title_snapshot, attempts: 0, passed: 0, scored: 0, pctSum: 0 };
      byExam[key].attempts += 1;
      if (a.passed === true) byExam[key].passed += 1;
      if (a.percentage != null) { byExam[key].scored += 1; byExam[key].pctSum += a.percentage; }

      a.answers.forEach((ans) => {
        if (ans.needs_manual_grading || ans.is_correct == null) return;
        const q = a.questions_snapshot.id(ans.question_id);
        const sec = q ? (q.section || '') : '';
        (bySection[sec] = bySection[sec] || { section: sec, total: 0, correct: 0 });
        bySection[sec].total += 1; if (ans.is_correct) bySection[sec].correct += 1;
        (byType[ans.type] = byType[ans.type] || { type: ans.type, total: 0, correct: 0 });
        byType[ans.type].total += 1; if (ans.is_correct) byType[ans.type].correct += 1;
      });
    });
    const withAccuracy = (obj) => Object.values(obj)
      .map((x) => ({ ...x, accuracy: x.total ? pct1((x.correct / x.total) * 100) : null }))
      .sort((x, y) => (x.accuracy ?? 101) - (y.accuracy ?? 101));

    const scored = attempts.filter((a) => a.percentage != null);
    const decided = attempts.filter((a) => a.passed != null);
    res.json({
      overall: {
        attempts: attempts.length,
        participants: participants.size,
        avg_percentage: scored.length ? pct1(scored.reduce((t, a) => t + a.percentage, 0) / scored.length) : null,
        pass_rate: decided.length ? pct1((decided.filter((a) => a.passed).length / decided.length) * 100) : null,
      },
      section_breakdown: withAccuracy(bySection),
      type_breakdown: withAccuracy(byType),
      exams: Object.values(byExam).map((e) => ({
        exam_id: e.exam_id, title: e.title, attempts: e.attempts,
        avg_percentage: e.scored ? pct1(e.pctSum / e.scored) : null,
        pass_rate: e.attempts ? pct1((e.passed / e.attempts) * 100) : null,
      })).sort((x, y) => (x.avg_percentage ?? 101) - (y.avg_percentage ?? 101)),
    });
  } catch (err) {
    console.error('GET /exams/team-performance error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/attempts/export?format=csv|xlsx|xml|pdf — downloadable report ─
exports.exportAttempts = async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    if (!['csv', 'xlsx', 'xml', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'format must be one of csv, xlsx, xml, pdf.' });
    }
    const attempts = await ExamAttempt.find({ ...(await attemptScopeFilter(req)), status: { $ne: 'in_progress' } })
      .select('-questions_snapshot -answers').sort({ submitted_at: -1 });
    const airlines = await Airline.find({ _id: { $in: [...new Set(attempts.map((a) => String(a.airline_id)).filter(Boolean))] } })
      .select('airlineName').lean();
    const airlineName = Object.fromEntries(airlines.map((a) => [String(a._id), a.airlineName]));

    const day = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '');
    const rows = attempts.map((a) => ({
      Participant: a.participant_name || '',
      Airline: airlineName[String(a.airline_id)] || '',
      Exam: a.exam_title_snapshot || '',
      Attempt: a.attempt_number,
      Status: a.status,
      Score: a.score ?? '',
      'Max score': a.max_score ?? '',
      'Percentage': a.percentage != null ? pct1(a.percentage) : '',
      Result: a.passed === true ? 'Passed' : a.passed === false ? 'Not passed' : '',
      Submitted: day(a.submitted_at),
      'Time (min)': a.time_taken_seconds != null ? Math.round(a.time_taken_seconds / 6) / 10 : '',
      Violations: a.violation_count || 0,
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `exam-results-${stamp}`;
    const send = (type, ext, body) => {
      res.setHeader('Content-Type', type);
      res.setHeader('Content-Disposition', `attachment; filename="${base}.${ext}"`);
      res.send(body);
    };

    // Shared summary — used by every format so the numbers always agree.
    const mean = (list) => {
      const nums = list.map((r) => parseFloat(r.Percentage)).filter((n) => Number.isFinite(n));
      return nums.length ? Math.round((nums.reduce((t, n) => t + n, 0) / nums.length) * 10) / 10 : null;
    };
    const graded = rows.filter((r) => r.Result);
    const passed = graded.filter((r) => r.Result === 'Passed').length;
    const avg = mean(rows);
    const passRate = graded.length ? Math.round((passed / graded.length) * 100) : null;
    const byExamMap = new Map();
    rows.forEach((r) => {
      const key = r.Exam || '(untitled)';
      if (!byExamMap.has(key)) byExamMap.set(key, []);
      byExamMap.get(key).push(r);
    });
    const byExam = [...byExamMap.entries()].map(([title, list]) => {
      const g = list.filter((r) => r.Result);
      const p = g.filter((r) => r.Result === 'Passed').length;
      return { title, attempts: list.length, passed: p, notPassed: g.length - p, average: mean(list) };
    });

    // Column order + headers for the tabular formats (xlsx attempts sheet, csv).
    const TABLE_COLS = [
      ['Participant', 'Participant'], ['Airline', 'Airline'], ['Exam', 'Exam'], ['Attempt', 'Attempt'],
      ['Status', 'Status'], ['Score', 'Score'], ['Max score', 'Max score'], ['Percentage', 'Score %'],
      ['Result', 'Result'], ['Submitted', 'Submitted'], ['Time (min)', 'Time (min)'], ['Violations', 'Violations'],
    ];
    const tableAoa = [TABLE_COLS.map(([, label]) => label), ...rows.map((r) => TABLE_COLS.map(([k]) => r[k] ?? ''))];
    const fitWidths = (aoa) => aoa[0].map((_, c) => ({
      wch: Math.min(48, Math.max(8, ...aoa.map((row) => String(row[c] ?? '').length)) + 2),
    }));

    if (format === 'csv') {
      return send('text/csv; charset=utf-8', 'csv', '﻿' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(tableAoa)));
    }

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const summaryAoa = [
        ['Exam Results Report'],
        ['Generated', stamp],
        [],
        ['Overview'],
        ['Metric', 'Value'],
        ['Attempts', rows.length],
        ['Passed', passed],
        ['Not passed', graded.length - passed],
        ['Pass rate (%)', passRate ?? ''],
        ['Average score (%)', avg ?? ''],
        [],
        ['By exam'],
        ['Exam', 'Attempts', 'Passed', 'Not passed', 'Average score (%)'],
        ...byExam.map((e) => [e.title, e.attempts, e.passed, e.notPassed, e.average ?? '']),
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
      wsSummary['!cols'] = fitWidths(summaryAoa.slice(4));
      const wsAttempts = XLSX.utils.aoa_to_sheet(tableAoa);
      wsAttempts['!cols'] = fitWidths(tableAoa);
      wsAttempts['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: TABLE_COLS.length - 1 } }) };
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
      XLSX.utils.book_append_sheet(wb, wsAttempts, 'Attempts');
      return send('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx',
        XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    }

    if (format === 'xml') {
      const esc = (v) => String(v ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
      const el = (name, v, ind) => `${ind}<${name}>${esc(v)}</${name}>`;
      const exams = byExam.map((e) => [
        `      <exam title="${esc(e.title)}">`,
        el('attempts', e.attempts, '        '), el('passed', e.passed, '        '),
        el('notPassed', e.notPassed, '        '), el('averagePercentage', e.average ?? '', '        '),
        '      </exam>',
      ].join('\n'));
      const attemptsXml = rows.map((r, i) => [
        `    <attempt number="${i + 1}">`,
        el('participant', r.Participant, '      '), el('airline', r.Airline, '      '), el('exam', r.Exam, '      '),
        el('attemptNumber', r.Attempt, '      '), el('status', r.Status, '      '),
        el('score', r.Score, '      '), el('maxScore', r['Max score'], '      '), el('percentage', r.Percentage, '      '),
        el('result', r.Result, '      '), el('submitted', r.Submitted, '      '),
        el('timeMinutes', r['Time (min)'], '      '), el('violations', r.Violations, '      '),
        '    </attempt>',
      ].join('\n'));
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<examResultsReport generated="${esc(new Date().toISOString())}">`,
        '  <summary>',
        el('attempts', rows.length, '    '), el('passed', passed, '    '), el('notPassed', graded.length - passed, '    '),
        el('passRatePercentage', passRate ?? '', '    '), el('averagePercentage', avg ?? '', '    '),
        '    <byExam>', ...exams, '    </byExam>',
        '  </summary>',
        `  <attempts count="${rows.length}">`, ...attemptsXml, '  </attempts>',
        '</examResultsReport>',
      ].join('\n');
      return send('application/xml; charset=utf-8', 'xml', xml);
    }

    // PDF — landscape, bordered table with banded rows, repeating header, page footer
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on('end', resolve));

    const INK = '#0f172a', MUTED = '#64748b', LINE = '#e2e8f0', BAND = '#f8fafc';
    const GOOD = '#15803d', BAD = '#b91c1c';
    const X0 = 36, PAGE_W = doc.page.width, PAGE_H = doc.page.height;
    const cols = [
      { key: 'Participant', label: 'Participant', w: 124 },
      { key: 'Airline',     label: 'Airline',     w: 100 },
      { key: 'Exam',        label: 'Exam',        w: 158 },
      { key: 'Attempt',     label: 'Attempt',     w: 56, align: 'center' },
      { key: 'Score',       label: 'Score',       w: 56, align: 'center' },
      { key: 'Percentage',  label: 'Score %',     w: 52, align: 'center' },
      { key: 'Result',      label: 'Result',      w: 62, align: 'center' },
      { key: 'Submitted',   label: 'Submitted',   w: 90 },
      { key: 'Violations',  label: 'Violations',  w: 68, align: 'center' },
    ];
    const TABLE_W = cols.reduce((t, c) => t + c.w, 0);
    const ROW_H = 22, HEAD_H = 26, PAD = 6, BOTTOM = PAGE_H - 54;

    const cellText = (r, c) => {
      if (c.key === 'Score') return r.Score === '' ? '—' : `${r.Score} / ${r['Max score']}`;
      if (c.key === 'Percentage') return r.Percentage === '' ? '—' : `${r.Percentage}%`;
      const v = r[c.key];
      return v === '' || v == null ? '—' : String(v);
    };

    // Title band + summary
    doc.rect(0, 0, PAGE_W, 74).fill(INK);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff').text('Exam Results Report', X0, 22, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#cbd5e1')
      .text(`Generated ${stamp}`, X0, 47, { lineBreak: false });
    const stats = [
      ['Attempts', String(rows.length)],
      ['Passed', String(passed)],
      ['Not passed', String(graded.length - passed)],
      ['Pass rate', graded.length ? `${Math.round((passed / graded.length) * 100)}%` : '—'],
      ['Avg score', avg != null ? `${avg}%` : '—'],
    ];
    const boxW = TABLE_W / stats.length;
    stats.forEach(([label, value], i) => {
      const bx = X0 + i * boxW;
      doc.rect(bx, 90, boxW - 8, 48).lineWidth(0.75).strokeColor(LINE).fillAndStroke(BAND, LINE);
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), bx + 10, 99, { width: boxW - 28, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(value, bx + 10, 114, { width: boxW - 28, lineBreak: false });
    });

    const drawHeader = (y) => {
      doc.rect(X0, y, TABLE_W, HEAD_H).fill(INK);
      let x = X0;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      cols.forEach((c) => {
        doc.text(c.label.toUpperCase(), x + PAD, y + 9, { width: c.w - PAD * 2, align: c.align || 'left', lineBreak: false });
        x += c.w;
      });
      return y + HEAD_H;
    };

    let y = drawHeader(158);
    if (!rows.length) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED)
        .text('No finished exam attempts to report.', X0, y + 14, { width: TABLE_W, align: 'center' });
    }
    rows.forEach((r, i) => {
      if (y + ROW_H > BOTTOM) { doc.addPage(); y = drawHeader(36); }
      if (i % 2 === 1) doc.rect(X0, y, TABLE_W, ROW_H).fill(BAND);
      let x = X0;
      cols.forEach((c) => {
        let color = INK, font = 'Helvetica';
        if (c.key === 'Result') {
          font = 'Helvetica-Bold';
          color = r.Result === 'Passed' ? GOOD : r.Result === 'Not passed' ? BAD : MUTED;
        } else if (c.key === 'Participant') font = 'Helvetica-Bold';
        else if (['Attempt', 'Score', 'Percentage', 'Violations', 'Submitted'].includes(c.key)) color = '#334155';
        doc.font(font).fontSize(8.5).fillColor(color)
          .text(cellText(r, c), x + PAD, y + 7, { width: c.w - PAD * 2, height: 12, ellipsis: true, lineBreak: false, align: c.align || 'left' });
        x += c.w;
      });
      doc.moveTo(X0, y + ROW_H).lineTo(X0 + TABLE_W, y + ROW_H).lineWidth(0.5).strokeColor(LINE).stroke();
      y += ROW_H;
    });
    doc.moveTo(X0, y).lineTo(X0 + TABLE_W, y).lineWidth(1).strokeColor(INK).stroke();

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p += 1) {
      doc.switchToPage(range.start + p);
      doc.page.margins.bottom = 0; // allow drawing in the bottom margin without spawning pages
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text('Exam Results Report', X0, PAGE_H - 30, { width: TABLE_W / 2, align: 'left', lineBreak: false })
        .text(`Page ${p + 1} of ${range.count}`, X0 + TABLE_W / 2, PAGE_H - 30, { width: TABLE_W / 2, align: 'right', lineBreak: false });
    }
    doc.end();
    await done;
    return send('application/pdf', 'pdf', Buffer.concat(chunks));
  } catch (err) {
    console.error('GET /exams/attempts/export error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE attempts — remove results created by mistake / during testing ────
// IFOA admin: attempts of IFOA-owned (global) exams. Airline: attempts of exams
// it owns. Anything else is skipped, never silently deleted.
async function deleteAttemptsByIds(req, ids) {
  const attempts = await ExamAttempt.find({ _id: { $in: ids } }).select('exam_id participant_id certificate');
  const exams = await Exam.find({ _id: { $in: [...new Set(attempts.map((a) => String(a.exam_id)))] } })
    .select('owner_airline owner_department');
  const examById = Object.fromEntries(exams.map((e) => [String(e._id), e]));

  const allowed = attempts.filter((a) => {
    const exam = examById[String(a.exam_id)];
    return exam ? canManageExam(req, exam) : isAdmin(req); // orphaned attempt (exam gone) → admin only
  });
  const allowedIds = allowed.map((a) => a._id);
  if (allowedIds.length) {
    // Uploaded certificates go with the result (best effort — never blocks the delete).
    await Promise.all(allowed
      .filter((a) => a.certificate && a.certificate.r2_key)
      .map((a) => r2.deleteObject(a.certificate.r2_key).catch(() => {})));
    await ExamAttempt.deleteMany({ _id: { $in: allowedIds } });
    // Invites that pointed at a deleted attempt go back to "opened" so the
    // candidate's link is usable again and the invite doesn't show a dead score.
    await ExamInvite.updateMany(
      { attempt_id: { $in: allowedIds } },
      { $set: { status: 'opened', attempt_id: null, completed_at: null } }
    );
  }
  return { deleted: allowedIds.length, skipped: ids.length - allowedIds.length };
}

exports.deleteAttempt = async (req, res) => {
  try {
    const result = await deleteAttemptsByIds(req, [req.params.attemptId]);
    if (!result.deleted) return res.status(403).json({ error: 'Attempt not found or you cannot delete it.' });
    res.json({ message: 'Result deleted.', ...result });
  } catch (err) {
    console.error('DELETE /exams/attempts/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.bulkDeleteAttempts = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids is required.' });
    res.json(await deleteAttemptsByIds(req, ids));
  } catch (err) {
    console.error('POST /exams/attempts/bulk-delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

Object.assign(exports, { deleteAttemptsByIds });

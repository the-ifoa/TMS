const mongoose = require('mongoose');
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
    // Temporary participants (added "only for this exam" from an Assign dialog)
    // show only in that exam's dialog: ?exam_id= — the exam they were added for,
    // or one they are assigned to.
    const examId = mongoose.isValidObjectId(req.query.exam_id) ? String(req.query.exam_id) : null;
    const assignedHere = examId
      ? ((await Exam.findById(examId).select('assignments.participant_id').lean())?.assignments || []).map((a) => a.participant_id)
      : [];
    const tempVisible = examId ? [{ temporary_exam_id: examId }, { _id: { $in: assignedHere } }] : [];
    // Only the fields the picker shows — the full records are large and this
    // runs every time the assign dialog opens.
    const participants = await Participant.find({ $or: [{ temporary: { $ne: true } }, ...tempVisible] })
      .select('participant_name training_type email cert_sequence cert_released submitted_by company airline_name temporary')
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
          cert_sequence: p.cert_sequence ?? null, cert_released: !!p.cert_released, temporary: !!p.temporary,
        })),
    }));

    // Admin: participants with no airline at all (added as individuals, or old
    // records whose company matches no airline) under a "No airline" group.
    if (isAdmin(req)) {
      const shown = new Set(result.flatMap((r) => r.participants.map((p) => p._id)));
      const loose = participants.filter((p) => !p.submitted_by && !shown.has(String(p._id)));
      if (loose.length || req.query.include_empty) {
        result.push({
          airline: { _id: 'none', id: 'none', airlineName: 'No airline', is_none: true },
          participants: loose.map((p) => ({
            _id: String(p._id), participant_name: p.participant_name, training_type: p.training_type, email: p.email || '',
            cert_sequence: p.cert_sequence ?? null, cert_released: !!p.cert_released, temporary: !!p.temporary,
          })),
        });
      }
    }

    // ?include_empty=1 — also airlines with nobody yet (the "add participant" picker).
    res.json(req.query.include_empty ? result : result.filter((r) => r.participants.length > 0));
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

    // PDF — landscape. One block per candidate (per exam) with their attempts
    // listed inside it, so a candidate who sat the exam three times reads as
    // one person with three attempts, not three unrelated rows.
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on('end', resolve));

    const NAVY = '#000021', INK = '#0f172a', MUTED = '#64748b', SUBTLE = '#94a3b8';
    const LINE = '#e2e8f0', GROUP_BG = '#f1f5f9', TILE_BG = '#f8fafc';
    const GOOD = '#15803d', BAD = '#b91c1c', WAIT = '#b45309';
    const X0 = 36, PAGE_W = doc.page.width, PAGE_H = doc.page.height, TABLE_W = PAGE_W - 72;
    const BOTTOM = PAGE_H - 42; // footer rule sits at PAGE_H - 34
    const pdfDate = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '—');
    const resultOf = (a) => (a.passed === true ? ['Passed', GOOD] : a.passed === false ? ['Not passed', BAD] : a.status === 'pending_review' ? ['Pending review', WAIT] : ['—', MUTED]);

    // Group attempts: candidate × exam, attempts oldest → newest, candidates A → Z.
    const groupMap = new Map();
    attempts.forEach((a) => {
      const key = `${a.participant_id}|${a.exam_id}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { name: a.participant_name || 'Unnamed participant', airline: airlineName[String(a.airline_id)] || '', exam: a.exam_title_snapshot || '', attempts: [] });
      }
      groupMap.get(key).attempts.push(a);
    });
    const groups = [...groupMap.values()].map((g) => {
      g.attempts.sort((x, y) => (x.attempt_number || 0) - (y.attempt_number || 0) || new Date(x.submitted_at) - new Date(y.submitted_at));
      const scoredA = g.attempts.filter((a) => a.percentage != null);
      g.best = scoredA.length ? scoredA.reduce((b, a) => (a.percentage > b.percentage ? a : b)) : null;
      g.passed = g.attempts.some((a) => a.passed === true);
      g.pending = !g.passed && g.attempts.some((a) => a.status === 'pending_review');
      return g;
    }).sort((x, y) => x.name.localeCompare(y.name) || x.exam.localeCompare(y.exam));

    const candidates = groups.length;
    const passedCandidates = groups.filter((g) => g.passed).length;
    const decided = groups.filter((g) => g.passed || g.attempts.some((a) => a.passed === false)).length;
    const examTitles = [...new Set(groups.map((g) => g.exam))];

    // Columns of an attempt row (the candidate header row spans them all).
    const cols = [
      { key: 'attempt', label: 'Attempt', w: 150 },
      { key: 'score', label: 'Score', w: 100, align: 'center' },
      { key: 'pct', label: 'Score %', w: 90, align: 'center' },
      { key: 'result', label: 'Result', w: 110, align: 'center' },
      { key: 'submitted', label: 'Submitted (UTC)', w: 150 },
      { key: 'time', label: 'Time taken', w: 85, align: 'center' },
      { key: 'violations', label: 'Violations', w: 85, align: 'center' },
    ];
    const HEAD_H = 24, GROUP_H = 34, ROW_H = 22, PAD = 10, GAP = 10;

    // ── Page 1 header band + summary tiles ──
    doc.rect(0, 0, PAGE_W, 70).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff').text('Exam Results Report', X0, 20, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#c7d2fe')
      .text(`${examTitles.length === 1 ? `${examTitles[0]}  ·  ` : ''}Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, X0, 46, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff').text('IFOA', X0, 26, { width: TABLE_W, align: 'right', lineBreak: false });

    const stats = [
      ['Candidates', String(candidates)],
      ['Attempts', String(rows.length)],
      ['Passed', `${passedCandidates} of ${candidates}`],
      ['Pass rate', decided ? `${Math.round((passedCandidates / decided) * 100)}%` : '—'],
      ['Average score', avg != null ? `${avg}%` : '—'],
    ];
    const tileGap = 10;
    const tileW = (TABLE_W - tileGap * (stats.length - 1)) / stats.length;
    stats.forEach(([label, value], i) => {
      const bx = X0 + i * (tileW + tileGap);
      doc.roundedRect(bx, 88, tileW, 52, 6).lineWidth(0.75).fillAndStroke(TILE_BG, LINE);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), bx + 12, 98, { width: tileW - 24, lineBreak: false, characterSpacing: 0.4 });
      doc.font('Helvetica-Bold').fontSize(17).fillColor(INK).text(value, bx + 12, 113, { width: tileW - 24, lineBreak: false });
    });
    doc.font('Helvetica').fontSize(7.5).fillColor(SUBTLE)
      .text('Passed and pass rate count each candidate once, by their best attempt. Average score is over all attempts.', X0, 147, { width: TABLE_W, lineBreak: false });

    const drawColumnHeader = (y) => {
      doc.roundedRect(X0, y, TABLE_W, HEAD_H, 4).fill(NAVY);
      let x = X0;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');
      cols.forEach((c, i) => {
        doc.text(c.label.toUpperCase(), x + (i === 0 ? PAD : 6), y + 8.5, { width: c.w - (i === 0 ? PAD : 12), align: c.align || 'left', lineBreak: false, characterSpacing: 0.3 });
        x += c.w;
      });
      return y + HEAD_H + 6;
    };
    const newPage = () => { doc.addPage(); return drawColumnHeader(36); };

    let y = drawColumnHeader(164);
    if (!groups.length) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No finished exam attempts to report.', X0, y + 14, { width: TABLE_W, align: 'center' });
    }

    groups.forEach((g) => {
      const need = GROUP_H + g.attempts.length * ROW_H;
      if (y + Math.min(need, GROUP_H + ROW_H * 2) > BOTTOM || (need <= BOTTOM - 70 && y + need > BOTTOM)) y = newPage();

      // Candidate header row: name · airline · exam  |  best score + overall result
      doc.roundedRect(X0, y, TABLE_W, GROUP_H, 4).fill(GROUP_BG);
      doc.rect(X0, y, 3, GROUP_H).fill(g.passed ? GOOD : g.pending ? WAIT : BAD);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(g.name, X0 + 14, y + 7, { width: 330, lineBreak: false, ellipsis: true });
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text([g.airline, g.exam].filter(Boolean).join('  ·  ') || '—', X0 + 14, y + 20.5, { width: 400, lineBreak: false, ellipsis: true });
      const [overall, overallColor] = g.passed ? ['Passed', GOOD] : g.pending ? ['Pending review', WAIT] : ['Not passed', BAD];
      const bestTxt = g.best ? `Best ${pct1(g.best.percentage)}%` : 'Not scored';
      const countTxt = `${g.attempts.length} attempt${g.attempts.length === 1 ? '' : 's'}`;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`${countTxt}  ·  ${bestTxt}`, X0, y + 8, { width: TABLE_W - 14, align: 'right', lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(overallColor).text(overall, X0, y + 20, { width: TABLE_W - 14, align: 'right', lineBreak: false });
      y += GROUP_H;

      // Attempt rows
      g.attempts.forEach((a, i) => {
        if (y + ROW_H > BOTTOM) y = newPage();
        const [res, resColor] = resultOf(a);
        const isBest = g.best && a === g.best && g.attempts.length > 1;
        const cells = {
          attempt: `Attempt ${a.attempt_number || i + 1}${isBest ? '  (best)' : ''}`,
          score: a.score != null && a.max_score != null ? `${a.score} / ${a.max_score}` : '—',
          pct: a.percentage != null ? `${pct1(a.percentage)}%` : '—',
          result: res,
          submitted: pdfDate(a.submitted_at),
          time: a.time_taken_seconds != null ? `${Math.round(a.time_taken_seconds / 60)} min` : '—',
          violations: String(a.violation_count || 0),
        };
        let x = X0;
        cols.forEach((c, ci) => {
          let font = 'Helvetica', color = '#334155';
          if (c.key === 'attempt') { color = INK; if (isBest) font = 'Helvetica-Bold'; }
          if (c.key === 'result') { font = 'Helvetica-Bold'; color = resColor; }
          if (c.key === 'violations' && a.violation_count) { font = 'Helvetica-Bold'; color = WAIT; }
          doc.font(font).fontSize(8.5).fillColor(color)
            .text(cells[c.key], x + (ci === 0 ? 24 : 6), y + 7, { width: c.w - (ci === 0 ? 30 : 12), align: c.align || 'left', lineBreak: false, ellipsis: true });
          x += c.w;
        });
        doc.moveTo(X0 + 14, y + ROW_H).lineTo(X0 + TABLE_W, y + ROW_H).lineWidth(0.5).strokeColor(LINE).stroke();
        y += ROW_H;
      });
      y += GAP;
    });

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p += 1) {
      doc.switchToPage(range.start + p);
      doc.page.margins.bottom = 0; // allow drawing in the bottom margin without spawning pages
      doc.moveTo(X0, PAGE_H - 34).lineTo(X0 + TABLE_W, PAGE_H - 34).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text('IFOA  ·  Exam Results Report', X0, PAGE_H - 26, { width: TABLE_W / 2, align: 'left', lineBreak: false })
        .text(`Page ${p + 1} of ${range.count}`, X0 + TABLE_W / 2, PAGE_H - 26, { width: TABLE_W / 2, align: 'right', lineBreak: false });
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

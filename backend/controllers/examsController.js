const crypto = require('crypto');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const ExamInvite = require('../models/ExamInvite');
const Airline = require('../models/Airline');
const Participant = require('../models/Participant');
const { examImageUpload, deleteCloudinaryImage } = require('../services/upload');
const { sanitizeQuestionForTaking, computeAttemptScore } = require('../services/examGrading');
const { finalizeAttempt, schedulingError, closeOpenAttempts, checkAnswer, lockedFeedback } = require('../services/examAttemptFlow');
const { sendExamInviteEmail, sendExamCertificateEmail } = require('../services/emailService');
const { brandingResolver, resolveEmailBranding } = require('../services/emailBranding');
const r2 = require('../services/r2');
const { frontendLink } = require('../config/appUrls');
const { accessibleParticipantFilter } = require('./internalCertificatesController');
const { hasPermission } = require('../middleware/permissions');
const { hasExamPower } = require('../config/permissions');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

function isAdmin(req) {
  return req.admin?.role === 'admin' || req.admin?.role === 'Administrator';
}

// Non-admin caller who is an airline with the admin-granted exam-authoring
// permission — resolves to the Airline doc, or null if not permitted.
async function authoringAirline(req) {
  if (isAdmin(req)) return null;
  const airline = await Airline.findById(req.admin.id).select('can_author_exams parent_airline permissions');
  if (!airline) return null;
  // A department gets in with any exam power (author / assign / grade); the
  // routes then gate each action by its own key.
  const allowed = airline.parent_airline ? hasExamPower(airline.permissions) : airline.can_author_exams;
  return allowed ? airline : null;
}

// True when this airline caller owns the given exam. A department owns exams
// tagged with its id; a top-level airline owns exams whose owner_airline is its
// id (which also covers every exam its departments authored).
function ownsExam(req, exam) {
  if (isAdmin(req)) return false;
  const me = String(req.admin.id);
  if (exam.owner_department && String(exam.owner_department) === me) return true;
  return exam.owner_airline && String(exam.owner_airline) === me;
}

// True when the caller may assign / send / view invites for this exam.
//  • IFOA admin        → any global (admin-owned) exam
//  • owning airline    → its own exams
//  • department        → its own exams, plus exams owned by its parent airline
//    (assigning them to its own team roster only)
function canAssignExam(req, exam) {
  if (isAdmin(req)) return !exam.owner_airline;
  if (ownsExam(req, exam)) return true;
  const s = req.scope;
  return !!(s && s.isDepartment && exam.owner_airline
    && String(exam.owner_airline) === String(s.topAirlineId));
}

// Owner ids a caller may assign / invite from. A department is limited to its
// own "My Team" roster; everyone else uses their full visible scope.
function assignableOwnerIds(req) {
  const s = req.scope;
  if (s && s.isDepartment) return [String(req.admin.id)];
  return (s && s.visibleAirlineIds) || [req.admin.id];
}

// Who may edit/publish/assign/send/delete an exam: an IFOA admin for global
// (admin-owned) exams, or the owning airline for its own. IFOA admins are
// view-only on airline-owned exams.
function canManageExam(req, exam) {
  if (ownsExam(req, exam)) return true;
  return isAdmin(req) && !exam.owner_airline;
}

async function deleteExamImages(exam) {
  const ids = [];
  exam.questions.forEach((q) => {
    if (q.image_public_id) ids.push(q.image_public_id);
    (q.images || []).forEach((img) => img.public_id && ids.push(img.public_id));
    (q.options || []).forEach((o) => o.image_public_id && ids.push(o.image_public_id));
  });
  await Promise.all(ids.map((id) => deleteCloudinaryImage(id)));
}

// ─── GET /exams/airlines — admin only: airlines with participants, for assigning ──
exports.listAirlines = async (req, res) => {
  try {
    // An exam-authoring airline gets the same picker, scoped to itself only.
    if (!isAdmin(req) && !(await authoringAirline(req))) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const airlineFilter = isAdmin(req) ? {} : { _id: req.admin.id };
    const airlines     = await Airline.find(airlineFilter).sort({ airlineName: 1 });
    const participants = await Participant.find({}).sort({ created_at: -1 });

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


// ─── Shared attempt scoping ────────────────────────────────────────────────────
// Same visibility rule as listAttempts: IFOA admin sees every attempt, an
// airline only its own. Optional exam_id / airline_id (admin only) narrow it.
// Which attempts a caller may list. An airline normally sees only attempts by
// its own candidates — but for an exam it OWNS it sees every attempt, the same
// set it can already grade and that its analytics count (e.g. candidates of a
// department that assigned the airline's exam to its own team).
async function attemptScopeFilter(req) {
  const filter = {};
  if (req.query.exam_id) filter.exam_id = req.query.exam_id;
  if (isAdmin(req)) {
    if (req.query.airline_id) filter.airline_id = req.query.airline_id;
    return filter;
  }
  if (req.query.exam_id) {
    const exam = await Exam.findById(req.query.exam_id).select('owner_airline owner_department').catch(() => null);
    if (exam && ownsExam(req, exam)) return filter;
  }
  filter.airline_id = req.admin.id;
  return filter;
}

// May this caller read one attempt? Its own candidate's, or any attempt of an
// exam it owns (matches gradeAttempt / getAnalytics).
async function canReadAttempt(req, attempt) {
  if (isAdmin(req)) return true;
  if (String(attempt.airline_id) === String(req.admin.id)) return true;
  const exam = await Exam.findById(attempt.exam_id).select('owner_airline owner_department');
  return !!(exam && ownsExam(req, exam));
}

const pct1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10);

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

// ─── Airline-uploaded certificates (one per passed attempt) ────────────────────
// The airline uploads its own certificate for a candidate who passed, then
// emails it to them. Nothing is generated, and the candidate never downloads
// it from the exam link — the email is the only delivery channel.

// What the client may know about an attempt's certificate (never the storage key).
function certificateSummary(attempt) {
  const c = attempt.certificate;
  if (!c || !c.r2_key) return null;
  return {
    original_name: c.original_name, content_type: c.content_type, size: c.size,
    uploaded_at: c.uploaded_at, emailed_at: c.emailed_at, emailed_to: c.emailed_to,
  };
}

// Loads the attempt + its exam and checks the caller may manage that exam.
// Sends the error response itself and returns null when access is refused.
async function loadManagedAttempt(req, res) {
  const attempt = await ExamAttempt.findById(req.params.attemptId).select('-questions_snapshot -answers');
  if (!attempt) { res.status(404).json({ error: 'Attempt not found.' }); return null; }
  const exam = await Exam.findById(attempt.exam_id).select('title owner_airline owner_department');
  if (!exam || !canManageExam(req, exam)) { res.status(403).json({ error: 'Access denied.' }); return null; }
  return { attempt, exam };
}

const CERT_EXT = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };

// ─── POST /exams/attempts/:attemptId/certificate — upload / replace ────────────
exports.uploadAttemptCertificate = async (req, res) => {
  try {
    const loaded = await loadManagedAttempt(req, res);
    if (!loaded) return;
    const { attempt } = loaded;
    if (attempt.passed !== true) {
      return res.status(400).json({ error: 'A certificate can only be uploaded for a candidate who passed.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Choose a certificate file to upload.' });

    const ext = CERT_EXT[req.file.mimetype];
    const key = `exam-certificates/${attempt.exam_id}/${attempt._id}-${Date.now()}.${ext}`;
    await r2.putObject(key, req.file.buffer, req.file.mimetype);
    const previousKey = attempt.certificate && attempt.certificate.r2_key;

    attempt.certificate = {
      r2_key: key,
      original_name: req.file.originalname || `certificate.${ext}`,
      content_type: req.file.mimetype,
      size: req.file.size,
      uploaded_at: new Date(),
      emailed_at: null, // a replaced file has not been sent yet
      emailed_to: '',
    };
    await attempt.save();
    if (previousKey) await r2.deleteObject(previousKey).catch(() => {});
    res.json({ certificate: certificateSummary(attempt) });
  } catch (err) {
    console.error('POST /exams/attempts/:id/certificate error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── GET /exams/attempts/:attemptId/certificate — view the uploaded file ───────
exports.getAttemptCertificate = async (req, res) => {
  try {
    const loaded = await loadManagedAttempt(req, res);
    if (!loaded) return;
    const c = loaded.attempt.certificate;
    if (!c || !c.r2_key) return res.status(404).json({ error: 'No certificate has been uploaded.' });
    const obj = await r2.getObject(c.r2_key);
    const safeName = (c.original_name || 'certificate').replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Type', c.content_type || 'application/octet-stream');
    if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    obj.Body.pipe(res);
  } catch (err) {
    console.error('GET /exams/attempts/:id/certificate error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── DELETE /exams/attempts/:attemptId/certificate — remove the file ───────────
exports.deleteAttemptCertificate = async (req, res) => {
  try {
    const loaded = await loadManagedAttempt(req, res);
    if (!loaded) return;
    const { attempt } = loaded;
    const key = attempt.certificate && attempt.certificate.r2_key;
    if (!key) return res.status(404).json({ error: 'No certificate has been uploaded.' });
    attempt.certificate = undefined;
    await attempt.save();
    await r2.deleteObject(key).catch(() => {});
    res.json({ certificate: null });
  } catch (err) {
    console.error('DELETE /exams/attempts/:id/certificate error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── POST /exams/attempts/:attemptId/certificate/send — email it to the candidate ─
exports.sendAttemptCertificate = async (req, res) => {
  try {
    const loaded = await loadManagedAttempt(req, res);
    if (!loaded) return;
    const { attempt, exam } = loaded;
    const c = attempt.certificate;
    if (!c || !c.r2_key) return res.status(400).json({ error: 'Upload the certificate first.' });

    const participant = await Participant.findById(attempt.participant_id).select('email participant_name');
    const toEmail = participant && participant.email;
    if (!toEmail) return res.status(400).json({ error: 'This candidate has no email address on file.' });

    const obj = await r2.getObject(c.r2_key);
    const content = Buffer.from(await obj.Body.transformToByteArray());
    const issuerId = attempt.airline_id || exam.owner_airline;
    const issuer = issuerId ? await Airline.findById(issuerId).select('airlineName').lean() : null;
    const pct = attempt.percentage != null ? `${pct1(attempt.percentage)}%` : '';

    await sendExamCertificateEmail({
      toEmail,
      participantName: attempt.participant_name || (participant && participant.participant_name),
      examTitle: attempt.exam_title_snapshot || exam.title,
      scoreText: pct,
      file: { content, filename: c.original_name || 'certificate', contentType: c.content_type },
      issuerName: issuer && issuer.airlineName,
      branding: await resolveEmailBranding(issuerId).catch(() => null),
    });

    attempt.certificate.emailed_at = new Date();
    attempt.certificate.emailed_to = toEmail;
    await attempt.save();
    res.json({ certificate: certificateSummary(attempt) });
  } catch (err) {
    console.error('POST /exams/attempts/:id/certificate/send error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── GET /exams/attempts — list attempts ─────────────────────────────────────────
exports.listAttempts = async (req, res) => {
  try {
    const filter = await attemptScopeFilter(req);

    // The list never shows questions or answers (grading fetches the full
    // attempt on demand), so don't pull those heavy arrays out of the DB.
    const attempts = await ExamAttempt.find(filter)
      .select('-questions_snapshot -answers')
      .sort({ created_at: -1 });
    // Candidate emails — the UI needs them to offer "email certificate".
    const people = await Participant.find({ _id: { $in: attempts.map((a) => a.participant_id) } }).select('email').lean();
    const emailById = Object.fromEntries(people.map((p) => [String(p._id), p.email || '']));
    res.json(attempts.map((a) => {
      const json = a.toJSON();
      json.participant_email = emailById[String(a.participant_id)] || '';
      json.certificate = certificateSummary(a);
      return json;
    }));
  } catch (err) {
    console.error('GET /exams/attempts error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/attempts/:attemptId — resume in-progress attempt (sanitized) ────
exports.getAttempt = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const json = attempt.toJSON();
    if (attempt.status === 'in_progress') {
      json.questions_snapshot = attempt.questions_snapshot.map(sanitizeQuestionForTaking);
      json.answers = json.answers.map((a) => ({ question_id: a.question_id, type: a.type, response: a.response }));
      json.server_now = new Date(); // lets the client correct for a skewed clock
      // Instant-feedback exams: restore the already-checked (locked) answers on resume.
      const examDoc = await Exam.findById(attempt.exam_id).select('instant_feedback');
      if (examDoc && examDoc.instant_feedback) Object.assign(json, lockedFeedback(attempt));
    }
    res.json(json);
  } catch (err) {
    console.error('GET /exams/attempts/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/attempts/:attemptId/result — full result incl. correct answers ──
exports.getAttemptResult = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!(await canReadAttempt(req, attempt))) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (attempt.status === 'in_progress') {
      return res.status(400).json({ error: 'Attempt has not been submitted yet.' });
    }
    res.json(attempt.toJSON());
  } catch (err) {
    console.error('GET /exams/attempts/:id/result error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/participants/:participantId/performance — cross-exam profile ────
// Admin: any participant. Airline: the participants it can see (see
// internalCertificatesController.accessibleParticipantFilter).
exports.participantPerformance = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.participantId);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });
    if (!isAdmin(req)) {
      // Own candidates, a top-level airline's departments' candidates, and
      // owner-less legacy records matched by airline name.
      const visible = await Participant.exists({ $and: [{ _id: participant._id }, accessibleParticipantFilter(req) || {}] });
      if (!visible) return res.status(403).json({ error: 'Access denied.' });
    }

    // Only what the report reads — skip question text, options and responses.
    const attempts = await ExamAttempt.find({
      participant_id: participant._id,
      status: { $ne: 'in_progress' },
    })
      .select([
        'exam_id', 'exam_title_snapshot', 'attempt_number', 'percentage', 'passed', 'status',
        'submitted_at', 'time_taken_seconds',
        'answers.question_id', 'answers.type', 'answers.is_correct', 'answers.needs_manual_grading',
        'questions_snapshot._id', 'questions_snapshot.section',
      ].join(' '))
      .sort({ submitted_at: 1 });

    // Aggregate every scored answer across every finished attempt, broken
    // down by section (where in the syllabus they lag) and by question type
    // (what kind of question trips them up).
    // Each attempt also keeps its own per-section tally so the report can be
    // narrowed to a single exam on the client.
    const bySection = {};
    const byType = {};
    const attemptSections = new Map();
    attempts.forEach((a) => {
      const own = {};
      attemptSections.set(String(a._id), own);
      a.answers.forEach((ans) => {
        if (ans.needs_manual_grading || ans.is_correct == null) return;
        const q = a.questions_snapshot.id(ans.question_id);
        const sectionName = q ? (q.section || '') : '';

        if (!bySection[sectionName]) bySection[sectionName] = { section: sectionName, total: 0, correct: 0 };
        bySection[sectionName].total += 1;
        if (ans.is_correct) bySection[sectionName].correct += 1;

        if (!own[sectionName]) own[sectionName] = { section: sectionName, total: 0, correct: 0 };
        own[sectionName].total += 1;
        if (ans.is_correct) own[sectionName].correct += 1;

        if (!byType[ans.type]) byType[ans.type] = { type: ans.type, total: 0, correct: 0 };
        byType[ans.type].total += 1;
        if (ans.is_correct) byType[ans.type].correct += 1;
      });
    });
    const withAccuracy = (obj) => Object.values(obj)
      .map((s) => ({ ...s, accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 10000) / 100 : null }))
      .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101)); // weakest first

    const exams = await Exam.find({ _id: { $in: [...new Set(attempts.map((a) => String(a.exam_id)))] } }).select('pass_percentage');
    const passMark = new Map(exams.map((e) => [String(e._id), e.pass_percentage]));

    const scored = attempts.filter((a) => a.percentage != null);
    res.json({
      participant: { id: String(participant._id), name: participant.participant_name, company: participant.company },
      overall: {
        total_exams_taken: attempts.length,
        avg_percentage: scored.length > 0
          ? Math.round((scored.reduce((sum, a) => sum + a.percentage, 0) / scored.length) * 100) / 100
          : null,
        passed_count: attempts.filter((a) => a.passed === true).length,
        failed_count: attempts.filter((a) => a.passed === false).length,
      },
      attempts: attempts.map((a) => ({
        id: String(a._id), exam_id: String(a.exam_id), exam_title: a.exam_title_snapshot,
        attempt_number: a.attempt_number, percentage: a.percentage, passed: a.passed, status: a.status,
        submitted_at: a.submitted_at, time_taken_seconds: a.time_taken_seconds,
        pass_percentage: passMark.get(String(a.exam_id)) ?? null,
        sections: Object.values(attemptSections.get(String(a._id)) || {}),
      })),
      section_breakdown: withAccuracy(bySection),
      type_breakdown: withAccuracy(byType),
    });
  } catch (err) {
    console.error('GET /exams/participants/:id/performance error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /exams/attempts/:attemptId/answer — autosave one answer ────────────────
exports.saveAttemptAnswer = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'This attempt has already been submitted.' });
    }

    const { question_id, response } = req.body;
    const question = attempt.questions_snapshot.id(question_id);
    if (!question) return res.status(404).json({ error: 'Question not found in this attempt.' });

    const existing = attempt.answers.find((a) => String(a.question_id) === String(question_id));
    if (existing && existing.locked) {
      return res.status(409).json({ error: 'This answer has been checked and can no longer be changed.', locked: true });
    }
    if (existing) {
      existing.response = response;
    } else {
      attempt.answers.push({ question_id, type: question.type, response });
    }
    await attempt.save();
    res.json({ saved: true });
  } catch (err) {
    console.error('PUT /exams/attempts/:id/answer error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/attempts/:attemptId/check — instant feedback for one answer ────
// Grades the answer, locks it (no more edits) and returns right/wrong, the
// correct answer, the explanation and the running score. Only for exams that
// have instant feedback switched on.
exports.checkAttemptAnswer = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'This attempt has already been submitted.' });
    }
    const exam = await Exam.findById(attempt.exam_id).select('instant_feedback');
    if (!exam || !exam.instant_feedback) {
      return res.status(400).json({ error: 'Instant feedback is not enabled for this exam.' });
    }
    const { question_id, response } = req.body;
    const result = checkAnswer(attempt, question_id, response);
    if (!result) return res.status(404).json({ error: 'Question not found in this attempt.' });
    await attempt.save();
    res.json(result);
  } catch (err) {
    console.error('POST /exams/attempts/:id/check error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/attempts/:attemptId/submit — grade + finalize ──────────────────
exports.submitAttempt = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'This attempt has already been submitted.' });
    }

    await finalizeAttempt(attempt);
    await attempt.save();
    res.json(attempt.toJSON());
  } catch (err) {
    console.error('POST /exams/attempts/:id/submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/attempts/:attemptId/violation — record a lockdown-mode violation ─
// (fullscreen exit, tab switch, ...). Auto-submits the attempt once the exam's
// max_violations threshold is reached.
exports.reportViolation = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (attempt.status !== 'in_progress') {
      return res.json(attempt.toJSON()); // already finished — nothing to do
    }

    const { type } = req.body;
    const validTypes = ['fullscreen_exit', 'tab_switch', 'devtools_suspected'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid violation type.' });

    attempt.violations.push({ type, at: new Date() });
    attempt.violation_count = attempt.violations.length;

    const exam = await Exam.findById(attempt.exam_id).select('max_violations');
    const maxViolations = exam?.max_violations ?? 4;

    let autoSubmitted = false;
    if (attempt.violation_count >= maxViolations) {
      attempt.auto_submitted = true;
      await finalizeAttempt(attempt);
      autoSubmitted = true;
    }

    await attempt.save();
    res.json({ ...attempt.toJSON(), auto_submitted_now: autoSubmitted });
  } catch (err) {
    console.error('POST /exams/attempts/:id/violation error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /exams/attempts/:attemptId/grade — admin manually grades pending items ─
exports.gradeAttempt = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req)) {
      const ownerExam = await Exam.findById(attempt.exam_id).select('owner_airline owner_department');
      if (!ownerExam || !ownsExam(req, ownerExam)) return res.status(403).json({ error: 'Access denied.' });
    }
    // Admin can grade a pending attempt AND override points on an already
    // scored one (submitted/graded) — never touch an in-progress attempt.
    if (attempt.status === 'in_progress') {
      return res.status(400).json({ error: 'Attempt has not been submitted yet.' });
    }

    const { answers = [], total_override } = req.body; // [{ question_id, points_awarded, feedback }]
    answers.forEach(({ question_id, points_awarded, feedback }) => {
      const entry = attempt.answers.find((a) => String(a.question_id) === String(question_id));
      if (!entry) return;
      const question = attempt.questions_snapshot.id(question_id);
      const capped = Math.max(0, Math.min(Number(points_awarded) || 0, question ? question.points : Infinity));
      entry.points_awarded = capped;
      entry.is_correct = question ? capped >= question.points : null;
      entry.needs_manual_grading = false;
      entry.feedback = feedback || '';
    });

    const stillPending = attempt.answers.some((a) => a.needs_manual_grading);
    if (stillPending) {
      return res.status(400).json({ error: 'Not all manually-graded questions have a score yet.' });
    }

    // Normally the total is the sum of every question's points_awarded (or a
    // weighted-by-section percentage, if the exam configures section
    // weights). An admin can instead directly override the total (e.g. a
    // blanket adjustment) — the per-question points above are still saved
    // for the record, but the final score/percentage use the override value,
    // and weighting doesn't apply since a single override can't be
    // decomposed back into per-section shares.
    const exam = await Exam.findById(attempt.exam_id).select('pass_percentage section_settings');
    const summedScore = attempt.answers.reduce((sum, a) => sum + (a.points_awarded || 0), 0);

    let score;
    let percentage;
    if (total_override != null) {
      score = Math.max(0, Math.min(Number(total_override) || 0, attempt.max_score || summedScore));
      percentage = attempt.max_score > 0 ? Math.round((score / attempt.max_score) * 10000) / 100 : 0;
    } else {
      const computed = computeAttemptScore(attempt.questions_snapshot, attempt.answers, exam ? exam.section_settings : []);
      score = computed.score;
      percentage = computed.percentage;
    }

    attempt.score = score;
    attempt.percentage = percentage;
    attempt.passed = attempt.percentage >= (exam ? exam.pass_percentage : 75);
    attempt.status = 'graded';
    attempt.graded_by = req.admin.id;
    attempt.graded_at = new Date();

    await attempt.save();
    res.json(attempt.toJSON());
  } catch (err) {
    console.error('PUT /exams/attempts/:id/grade error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/questions/upload-image — admin uploads a question image ────────
// examImageUpload runs the actual Cloudinary upload as multer middleware, so a
// failure there (bad credentials, network block, etc.) throws before the
// handler body below ever runs — invoke it manually to catch and report that.
exports.uploadQuestionImage = (req, res) => {
  examImageUpload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) {
      console.error('POST /exams/questions/upload-image upload error:', uploadErr.message);
      return res.status(500).json({ error: uploadErr.message || 'Image upload failed.' });
    }
    try {
      if (!isAdmin(req) && !(await authoringAirline(req))) {
        return res.status(403).json({ error: 'Admin access required.' });
      }
      if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
      res.json({ url: req.file.path, public_id: req.file.filename });
    } catch (err) {
      console.error('POST /exams/questions/upload-image error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
};

// ─── DELETE /exams/questions/image/:publicId — admin removes an unsaved upload ──
exports.deleteQuestionImage = async (req, res) => {
  try {
    if (!isAdmin(req) && !(await authoringAirline(req))) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    await deleteCloudinaryImage(req.params.publicId);
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /exams/questions/image error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams — list exams ──────────────────────────────────────────────────
// The list page only needs a question count, not every question (with its
// answers and image URLs) — so skip the array and count it in the database.
const LIST_EXCLUDE = '-questions';
async function withQuestionCounts(exams) {
  if (!exams.length) return {};
  const rows = await Exam.aggregate([
    { $match: { _id: { $in: exams.map((e) => e._id) } } },
    { $project: { n: { $size: { $ifNull: ['$questions', []] } } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
}

exports.listExams = async (req, res) => {
  try {
    let exams;
    if (isAdmin(req)) {
      exams = await Exam.find({}).select(LIST_EXCLUDE).sort({ created_at: -1 });
      const counts = await withQuestionCounts(exams);
      // Tag airline/department-created exams with readable owner names for the admin UI.
      const airlineIds = [...new Set([
        ...exams.filter((e) => e.owner_airline).map((e) => String(e.owner_airline)),
        ...exams.filter((e) => e.owner_department).map((e) => String(e.owner_department)),
      ])];
      if (airlineIds.length) {
        const owners = await Airline.find({ _id: { $in: airlineIds } })
          .select('airlineName department_name is_department');
        const byId = Object.fromEntries(owners.map((a) => [String(a._id), a]));
        return res.json(exams.map((e) => {
          const json = e.toJSON();
          json.question_count = counts[String(e._id)] || 0;
          if (json.owner_airline) json.owner_airline_name = byId[String(json.owner_airline)]?.airlineName || 'Airline';
          if (json.owner_department) {
            const d = byId[String(json.owner_department)];
            json.owner_department_name = d?.department_name || d?.name || 'Department';
          }
          return json;
        }));
      }
      return res.json(exams.map((e) => ({ ...e.toJSON(), question_count: counts[String(e._id)] || 0 })));
    } else if (req.scope && req.scope.isDepartment) {
      // A plain department manages ONLY the exams it authored itself. It must not
      // see the parent airline's own exams or sibling departments' exams (both
      // carry owner_airline = topAirlineId). It still sees published exams
      // assigned to its own team so it can monitor / assign them.
      const selfId = String(req.admin.id);
      exams = await Exam.find({
        $or: [
          { owner_department: selfId },
          { status: 'published', 'assignments.airline_id': selfId },
        ],
      }).select(LIST_EXCLUDE).sort({ created_at: -1 });
    } else {
      // Top-level airline: exams it owns (any status, which covers every exam its
      // departments authored) + published exams assigned anywhere in its tree.
      const visibleIds = (req.scope && req.scope.visibleAirlineIds) || [req.admin.id];
      exams = await Exam.find({
        $or: [
          { owner_airline: { $in: visibleIds } },
          { owner_department: { $in: visibleIds } },
          { status: 'published', 'assignments.airline_id': { $in: visibleIds } },
        ],
      }).select(LIST_EXCLUDE).sort({ created_at: -1 });
    }
    const counts = await withQuestionCounts(exams);
    res.json(exams.map((e) => ({ ...e.toJSON(), question_count: counts[String(e._id)] || 0 })));
  } catch (err) {
    console.error('GET /exams error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams — create (admin, draft) ──────────────────────────────────────
exports.createExam = async (req, res) => {
  try {
    const airline = isAdmin(req) ? null : await authoringAirline(req);
    if (!isAdmin(req) && !airline) return res.status(403).json({ error: 'Admin access required.' });
    if (!req.body.title) return res.status(400).json({ error: 'title is required.' });

    const { owner_airline, owner_department, created_by, ...body } = req.body;
    // A department's exams are owned by the top-level airline (so the main
    // account still sees them) and tagged with the department that manages them.
    const isDept = !isAdmin(req) && req.scope && req.scope.isDepartment;
    const exam = await Exam.create({
      ...body,
      created_by: isAdmin(req) ? req.admin.id : undefined,
      owner_airline: airline ? (isDept ? req.scope.topAirlineId : req.admin.id) : null,
      owner_department: isDept ? req.admin.id : null,
      status: 'draft',
    });
    res.status(201).json(exam.toJSON());
  } catch (err) {
    console.error('POST /exams error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/:id — single exam ─────────────────────────────────────────────
exports.getExam = async (req, res) => {
  try {
    // ?summary=1 — just the header fields (results page), skipping the
    // question list. Same access rules as the full fetch below.
    if (req.query.summary) {
      const exam = await Exam.findById(req.params.id)
        .select('title status pass_percentage owner_airline owner_department assignments.airline_id');
      if (!exam) return res.status(404).json({ error: 'Exam not found.' });
      if (!isAdmin(req) && !ownsExam(req, exam)) {
        const assigned = exam.assignments.some((a) => String(a.airline_id) === String(req.admin.id));
        if (exam.status !== 'published' || !assigned) return res.status(403).json({ error: 'Access denied.' });
      }
      const { _id, title, status, pass_percentage, owner_airline, owner_department } = exam;
      return res.json({ id: String(_id), _id, title, status, pass_percentage, owner_airline, owner_department });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    if (!isAdmin(req)) {
      // The owning airline gets the full exam for editing.
      if (ownsExam(req, exam)) return res.json(exam.toJSON());
      const assigned = exam.assignments.some((a) => String(a.airline_id) === String(req.admin.id));
      if (exam.status !== 'published' || !assigned) return res.status(403).json({ error: 'Access denied.' });
      const json = exam.toJSON();
      json.questions = json.questions.map(sanitizeQuestionForTaking);
      return res.json(json);
    }
    res.json(exam.toJSON());
  } catch (err) {
    console.error('GET /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /exams/:id — update meta + questions (admin) ─────────────────────────
exports.updateExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    const { created_by, owner_airline, _id, id, assignments, status, ...updatable } = req.body;
    Object.assign(exam, updatable);
    await exam.save();
    res.json(exam.toJSON());
  } catch (err) {
    console.error('PUT /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/:id/publish — draft/archived -> published (admin) ───────────
exports.publishExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
    if (exam.questions.length === 0) return res.status(400).json({ error: 'Add at least one question before publishing.' });

    exam.status = 'published';
    await exam.save();
    res.json(exam.toJSON());
  } catch (err) {
    console.error('POST /exams/:id/publish error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/:id/assign — assign to participants (admin) ─────────────────
exports.assignExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canAssignExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    const { participant_ids = [] } = req.body;
    const query = { _id: { $in: participant_ids } };
    // An airline can only assign participants within its own scope (a department:
    // just its own "My Team"; a top-level airline: its own + every department's).
    if (!isAdmin(req)) {
      query.submitted_by = { $in: assignableOwnerIds(req) };
    }
    const participants = await Participant.find(query);

    participants.forEach((p) => {
      const already = exam.assignments.some((a) => String(a.participant_id) === String(p._id));
      if (!already) {
        exam.assignments.push({ participant_id: p._id, airline_id: p.submitted_by });
      }
    });

    await exam.save();
    res.json(exam.toJSON());
  } catch (err) {
    console.error('POST /exams/:id/assign error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/:id/send-invites — admin emails the take-link to participants ──
// Ensures each participant is assigned, creates/refreshes their ExamInvite (one
// per participant, stable token), and emails the passwordless take link.
exports.sendInvites = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canAssignExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
    if (exam.status !== 'published') return res.status(400).json({ error: 'Publish the exam before sending invites.' });

    const { participant_ids = [], valid_days, expires_at, reassign = false } = req.body;
    if (participant_ids.length === 0) return res.status(400).json({ error: 'Select at least one participant.' });

    // Optional validity window: an explicit ISO cutoff, or "valid for N days"
    // from now. When neither is supplied on this send, existing invites keep
    // whatever expiry they already had.
    const expiryProvided = valid_days != null || expires_at != null;
    let expiresAt = null;
    if (expires_at != null && expires_at !== '') {
      const d = new Date(expires_at);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid expiry date.' });
      expiresAt = d;
    } else if (valid_days != null && valid_days !== '') {
      const n = Number(valid_days);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'Validity period must be a positive number of days.' });
      expiresAt = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    }

    const query = { _id: { $in: participant_ids } };
    // An airline can only invite participants within its own scope (a department:
    // just its own "My Team").
    if (!isAdmin(req)) {
      query.submitted_by = { $in: assignableOwnerIds(req) };
    }
    const participants = await Participant.find(query);
    const airlines = await Airline.find({});
    const airlineName = (id) => airlines.find((a) => String(a._id) === String(id))?.airlineName || '';

    const sent = [];
    const brandingFor = brandingResolver();
    const skipped = [];
    // One batch per send action — every invite dispatched in this call shares it.
    const batchId = crypto.randomBytes(8).toString('hex');

    for (const p of participants) {
      if (!p.email) { skipped.push({ id: String(p._id), name: p.participant_name, reason: 'no email' }); continue; }

      // Make sure the participant is assigned (send implies assign).
      const alreadyAssigned = exam.assignments.some((a) => String(a.participant_id) === String(p._id));
      if (!alreadyAssigned) exam.assignments.push({ participant_id: p._id, airline_id: p.submitted_by });

      let invite = await ExamInvite.findOne({ exam_id: exam._id, participant_id: p._id });

      if (!invite) {
        invite = new ExamInvite({
          token: crypto.randomBytes(24).toString('hex'),
          exam_id: exam._id,
          exam_title_snapshot: exam.title,
          participant_id: p._id,
          participant_name: p.participant_name,
          participant_email: p.email,
          airline_id: p.submitted_by,
          airline_name: airlineName(p.submitted_by),
          batch_id: batchId,
          expires_at: expiresAt,
        });
      } else {
        invite.participant_email = p.email;
        invite.participant_name = p.participant_name;
        invite.exam_title_snapshot = exam.title;
        invite.sent_at = new Date();
        invite.sent_count = (invite.sent_count || 1) + 1;
        invite.batch_id = batchId; // re-sending moves it into the new batch
        if (expiryProvided) invite.expires_at = expiresAt; // null clears it
      }

      // A reassign is a clean slate: close any attempt still open so the new
      // link can't resume the previous one or show anything from it.
      if (reassign) await closeOpenAttempts(exam, p._id);

      const [used, active] = await Promise.all([
        ExamAttempt.countDocuments({ exam_id: exam._id, participant_id: p._id }),
        ExamAttempt.exists({ exam_id: exam._id, participant_id: p._id, status: 'in_progress' }),
      ]);
      // Re-sending the link to someone who has used every attempt would only
      // land them on "You have completed this exam" — treat it as a reassign.
      const exhausted = !active && used >= exam.max_attempts + (invite.bonus_attempts || 0);

      // A reassign must always leave the link startable: at least one attempt
      // left (even if max_attempts was lowered since), no stale expiry, and the
      // exam's close date no longer applies to this participant.
      if (reassign || exhausted) {
        invite.bonus_attempts = Math.max((invite.bonus_attempts || 0) + 1, used + 1 - exam.max_attempts);
        invite.ignore_close = true;
        if (!expiryProvided && invite.expires_at && invite.expires_at < new Date()) invite.expires_at = null;
        if (!active) {
          invite.status = 'sent';
          invite.attempt_id = null;
          invite.completed_at = null;
          invite.opened_at = null;
        }
      }
      await invite.save();

      try {
        const branding = await brandingFor(p.submitted_by || exam.owner_department || exam.owner_airline);
        await sendExamInviteEmail({
          toEmail: p.email,
          participantName: p.participant_name,
          examTitle: exam.title,
          durationMinutes: exam.duration_minutes,
          maxAttempts: exam.max_attempts,
          link: frontendLink(`/exam/${invite.token}`),
          expiresAt: invite.expires_at,
          branding,
        });
        sent.push({ id: String(p._id), name: p.participant_name, email: p.email });
      } catch (mailErr) {
        skipped.push({ id: String(p._id), name: p.participant_name, reason: mailErr.message });
      }
    }

    await exam.save();
    res.json({ sent, skipped });
  } catch (err) {
    console.error('POST /exams/:id/send-invites error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /exams/:id/candidates/:participantId — take one person off an exam ──
// Removes that candidate's assignment and invite link for this exam, plus any
// result they already have. Same reach as assigning: IFOA admin on IFOA exams;
// an airline on its own exams; a department on its own team only. Deleting an
// existing RESULT additionally needs what deleting results always needs —
// ownership of the exam and the `exams.author` power.
exports.removeCandidate = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    const allowed = isAdmin(req) ? canManageExam(req, exam) : canAssignExam(req, exam);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });

    const pid = req.params.participantId;
    const scope = { exam_id: exam._id, participant_id: pid };
    if (!isAdmin(req)) scope.airline_id = { $in: assignableOwnerIds(req) };

    const [invites, attempts] = await Promise.all([
      ExamInvite.find(scope).select('_id'),
      ExamAttempt.find(scope).select('certificate'),
    ]);
    const assigned = exam.assignments.some((a) => String(a.participant_id) === String(pid));
    if (!invites.length && !attempts.length && !assigned) {
      return res.status(404).json({ error: 'This candidate is not on this exam.' });
    }
    if (attempts.length && !(canManageExam(req, exam) && hasPermission(req, ['exams.author']))) {
      return res.status(403).json({ error: 'This candidate already has a result. Only the exam owner with the "Create & edit exams" power can remove it.' });
    }

    // Uploaded certificates go with the result (best effort).
    await Promise.all(attempts
      .filter((a) => a.certificate && a.certificate.r2_key)
      .map((a) => r2.deleteObject(a.certificate.r2_key).catch(() => {})));
    await ExamAttempt.deleteMany({ _id: { $in: attempts.map((a) => a._id) } });
    await ExamInvite.deleteMany({ _id: { $in: invites.map((i) => i._id) } });
    if (assigned) {
      exam.assignments = exam.assignments.filter((a) => String(a.participant_id) !== String(pid));
      await exam.save();
    }
    res.json({ message: 'Candidate removed from the exam.', invites: invites.length, results: attempts.length });
  } catch (err) {
    console.error('DELETE /exams/:id/candidates/:participantId error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/:id/invites — admin: invite + attempt status for an exam ────────
exports.listInvites = async (req, res) => {
  try {
    const inviteQuery = { exam_id: req.params.id };
    if (!isAdmin(req)) {
      const exam = await Exam.findById(req.params.id).select('owner_airline owner_department');
      if (!exam || !canAssignExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
      // Only show invites for participants in this caller's own scope (a
      // department: just its own "My Team").
      inviteQuery.airline_id = { $in: assignableOwnerIds(req) };
    }
    const invites = await ExamInvite.find(inviteQuery).sort({ created_at: -1 });
    const attemptIds = invites.map((i) => i.attempt_id).filter(Boolean);
    const attempts = await ExamAttempt.find({ _id: { $in: attemptIds } })
      .select('score max_score percentage passed status');
    const attemptById = Object.fromEntries(attempts.map((a) => [String(a._id), a]));

    res.json(invites.map((i) => {
      const json = i.toJSON();
      const att = i.attempt_id && attemptById[String(i.attempt_id)];
      json.attempt = att
        ? { score: att.score, max_score: att.max_score, percentage: att.percentage, passed: att.passed, status: att.status }
        : null;
      return json;
    }));
  } catch (err) {
    console.error('GET /exams/:id/invites error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/:id/analytics — admin: per-question miss rate + pass-rate over time ──
exports.getAnalytics = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).select('questions title owner_airline owner_department');
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!isAdmin(req) && !ownsExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    const attempts = await ExamAttempt.find({ exam_id: exam._id, status: { $ne: 'in_progress' } })
      .select('answers status passed percentage submitted_at');

    // Per-question stats, seeded from the CURRENT question bank so questions
    // with zero attempts still show up (with total 0), and ones removed from
    // the exam since don't clutter the list.
    const byQuestion = {};
    exam.questions.forEach((q) => {
      byQuestion[String(q._id)] = {
        question_id: String(q._id), prompt: q.prompt, type: q.type, section: q.section || '',
        total: 0, correct: 0, incorrect: 0, pending: 0,
      };
    });
    attempts.forEach((a) => {
      a.answers.forEach((ans) => {
        const stat = byQuestion[String(ans.question_id)];
        if (!stat) return;
        if (ans.needs_manual_grading) { stat.pending += 1; return; }
        if (ans.is_correct == null) return; // unscored (e.g. likert)
        stat.total += 1;
        if (ans.is_correct) stat.correct += 1; else stat.incorrect += 1;
      });
    });
    const perQuestion = Object.values(byQuestion)
      .map((s) => ({ ...s, miss_rate: s.total > 0 ? Math.round((s.incorrect / s.total) * 10000) / 100 : null }))
      .sort((a, b) => (b.miss_rate ?? -1) - (a.miss_rate ?? -1));

    // Pass-rate over time, bucketed by the day the attempt was submitted.
    const finished = attempts.filter((a) => a.status !== 'in_progress' && a.submitted_at);
    const byDate = {};
    finished.forEach((a) => {
      const day = a.submitted_at.toISOString().slice(0, 10);
      if (!byDate[day]) byDate[day] = { date: day, total: 0, passed: 0 };
      byDate[day].total += 1;
      if (a.passed) byDate[day].passed += 1;
    });
    const passRateOverTime = Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, pass_rate: d.total > 0 ? Math.round((d.passed / d.total) * 10000) / 100 : 0 }));

    const gradedOrScored = finished.filter((a) => a.percentage != null);
    res.json({
      overall: {
        total_attempts: attempts.length,
        finished_attempts: finished.length,
        passed: finished.filter((a) => a.passed).length,
        avg_percentage: gradedOrScored.length > 0
          ? Math.round((gradedOrScored.reduce((sum, a) => sum + a.percentage, 0) / gradedOrScored.length) * 100) / 100
          : null,
      },
      per_question: perQuestion,
      pass_rate_over_time: passRateOverTime,
    });
  } catch (err) {
    console.error('GET /exams/:id/analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/:id/attempts — start an attempt (airline, on behalf of a participant) ──
exports.startAttempt = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status !== 'published') return res.status(400).json({ error: 'This exam is not published yet.' });
    const schedErr = schedulingError(exam);
    if (schedErr) return res.status(403).json({ error: schedErr });

    const { participant_id } = req.body;
    if (!participant_id) return res.status(400).json({ error: 'participant_id is required.' });

    const assignment = exam.assignments.find((a) => String(a.participant_id) === String(participant_id));
    if (!assignment) return res.status(403).json({ error: 'This participant is not assigned to this exam.' });
    if (!isAdmin(req) && String(assignment.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const priorAttempts = await ExamAttempt.countDocuments({ exam_id: exam._id, participant_id });
    if (priorAttempts >= exam.max_attempts) {
      return res.status(400).json({ error: 'Maximum attempts reached for this exam.' });
    }

    const participant = await Participant.findById(participant_id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    let questions = exam.questions.map((q) => q.toObject());
    if (exam.shuffle_questions) questions = questions.sort(() => Math.random() - 0.5);

    const attempt = await ExamAttempt.create({
      exam_id: exam._id,
      exam_title_snapshot: exam.title,
      participant_id: participant._id,
      participant_name: participant.participant_name,
      airline_id: assignment.airline_id,
      attempt_number: priorAttempts + 1,
      questions_snapshot: questions,
      status: 'in_progress',
      started_at: new Date(),
    });

    const json = attempt.toJSON();
    json.questions_snapshot = attempt.questions_snapshot.map(sanitizeQuestionForTaking);
    json.server_now = new Date(); // lets the client correct for a skewed clock
    res.status(201).json(json);
  } catch (err) {
    console.error('POST /exams/:id/attempts error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /exams/:id (admin) — cascades Cloudinary image cleanup ───────────
exports.deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    await deleteExamImages(exam);
    await exam.deleteOne();
    res.json({ message: 'Exam deleted.' });
  } catch (err) {
    console.error('DELETE /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

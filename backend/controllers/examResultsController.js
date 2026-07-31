const XLSX    = require('xlsx');
const ExamResult = require('../models/ExamResult');
const { generateExamResultPdf } = require('../services/examResultPdf');

// ── Helper: grade from mark ───────────────────────────────────────────────────
function gradeFromMark(m) {
  if (m == null) return null;
  if (m > 95)    return 'OUTSTANDING';
  if (m >= 90)   return 'DISTINCTION';
  if (m >= 76)   return 'MERIT';
  if (m >= 75)   return 'PASS';
  return 'FAILED';
}

/**
 * Returns true if the cell value should be treated as N/A (no marks).
 * Handles: null, empty string, "NA", "N/A", "n/a", "na", "-", "--"
 */
function isNA(val) {
  if (val == null || val === '') return true;
  const s = val.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
  return s === 'NA' || s === 'N/A' || s === '';
}

function extractResultHeaderTextFromRaw(raw, fallback = '') {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;

  const banned = [
    'INTERNATIONAL FLIGHT OPERATIONS ACADEMY',
    'OBERDORF',
    'TEL',
    'EMAIL',
    'WWW.',
    'STUDENT',
    'DATE',
    'SUBJECTS',
    'SCORE',
    'GRADE',
    'TOTAL MARKS',
  ];

  const rowText = (r) => (Array.isArray(raw[r]) ? raw[r] : [])
    .map(v => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (let r = 0; r < raw.length; r++) {
    const cur = rowText(r).toUpperCase();
    if (!cur) continue;
    if (cur.includes('EXAM RESULTS')) {
      for (let rr = r + 1; rr <= Math.min(raw.length - 1, r + 8); rr++) {
        const candidate = rowText(rr);
        const candUpper = candidate.toUpperCase();
        if (!candidate || candidate.length < 20) continue;
        if (banned.some(k => candUpper.includes(k))) continue;
        return candidate;
      }
    }
  }

  for (let r = 0; r < Math.min(raw.length, 20); r++) {
    const candidate = rowText(r);
    const candUpper = candidate.toUpperCase();
    if (!candidate || candidate.length < 25) continue;
    if (banned.some(k => candUpper.includes(k))) continue;
    if (candUpper.includes('COURSE') || candUpper.includes('PROMOTION') || candUpper.includes('/')) {
      return candidate;
    }
  }

  return fallback;
}

function normalizeName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractStudentNameFromRaw(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return '';

  for (let r = 0; r < Math.min(raw.length, 20); r++) {
    const row = Array.isArray(raw[r]) ? raw[r] : [];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] == null ? '' : row[c]).trim();
      const upper = cell.toUpperCase();

      if (upper === 'STUDENT' || upper === 'STUDENT NAME' || upper === 'NAME') {
        const next = String(row[c + 1] == null ? '' : row[c + 1]).trim();
        if (next && !/^(STUDENT|NAME|DATE)$/i.test(next)) return next;
      }

      const inline = cell.match(/^\s*STUDENT\s*:?\s*(.+)$/i) || cell.match(/^\s*NAME\s*:?\s*(.+)$/i);
      if (inline && inline[1] && inline[1].trim()) return inline[1].trim();
    }
  }

  return '';
}

function findHeaderForStudent(firstName, lastName, headerByStudentName, fallback = '', studentIndex = -1) {
  const full = normalizeName(`${firstName || ''} ${lastName || ''}`);
  if (!full) return fallback;

  if (headerByStudentName.has(full)) return headerByStudentName.get(full) || fallback;

  const first = normalizeName(firstName);
  const last = normalizeName(lastName);
  if (!first || !last) return fallback;

  const fwdKey = `${first} ${last}`;
  const revKey = `${last} ${first}`;
  if (headerByStudentName.has(fwdKey)) return headerByStudentName.get(fwdKey) || fallback;
  if (headerByStudentName.has(revKey)) return headerByStudentName.get(revKey) || fallback;

  if (studentIndex >= 0) {
    const sheetKey = normalizeName(`Student ${studentIndex + 1}`);
    if (headerByStudentName.has(sheetKey)) return headerByStudentName.get(sheetKey) || fallback;
  }

  for (const [candidate, header] of headerByStudentName.entries()) {
    if (!candidate) continue;
    const hasForward = candidate.includes(`${first} ${last}`);
    const hasReverse = candidate.includes(`${last} ${first}`);
    const hasBothTokens = candidate.split(' ').includes(first) && candidate.split(' ').includes(last);
    if (hasForward || hasReverse || hasBothTokens) return header || fallback;
  }

  return fallback;
}

// ── Helper: parse an IFOA exam-results workbook ───────────────────────────────
function parseIfoaWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const summaryName = wb.SheetNames[0];
  const summaryWs   = wb.Sheets[summaryName];
  const summaryRaw  = XLSX.utils.sheet_to_json(summaryWs, { header: 1, defval: null });

  const sheetRef   = summaryWs['!ref'] || 'A1';
  const sheetRange = XLSX.utils.decode_range(sheetRef);
  const rowOffset  = sheetRange.s.r;

  const cellVal = (excelRow, col) =>
    (summaryRaw[excelRow - 1 - rowOffset]?.[col] || '').toString().trim();

  const courseTitle = cellVal(2, 3);
  if (!courseTitle) throw new Error('Could not find course title in the summary sheet (expected cell D2).');

  let resultHeaderText = extractResultHeaderTextFromRaw(summaryRaw, courseTitle);

  const trainingModeRaw = cellVal(4, 3).toUpperCase() || 'HYBRID';
  const trainingMode    = trainingModeRaw.includes('ONLINE')    ? 'ONLINE'
                        : trainingModeRaw.includes('IN-PERSON') ? 'IN-PERSON'
                        : 'HYBRID';

  const dateRangeRaw = cellVal(4, 7);
  let startDate = '', endDate = '';
  const dateMatch = dateRangeRaw.match(/^(.+?)\s*-\s*(.+)$/);
  if (dateMatch) {
    const parseDate = (s) => {
      const d = new Date(s.trim());
      return isNaN(d) ? s.trim() : d.toISOString().split('T')[0];
    };
    startDate = parseDate(dateMatch[1]);
    endDate   = parseDate(dateMatch[2]);
  }

  const leadInstructor = cellVal(4, 14);
  const instructors    = [cellVal(5, 14), cellVal(6, 14), cellVal(7, 14)].filter(Boolean);

  let headerRowIdx = -1;
  let headerRow    = [];
  for (let r = 0; r < summaryRaw.length; r++) {
    const row = summaryRaw[r];
    if (row && row[0] && row[0].toString().toLowerCase().includes('first')) {
      headerRowIdx = r;
      headerRow    = row.map(v => (v || '').toString().trim());
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error('Could not locate the student header row in the summary sheet.');

  const subjectCols = [];
  let finalExamCol  = -1;
  let finalMarksCol = -1;
  for (let c = 2; c < headerRow.length; c++) {
    const h = headerRow[c].trim();
    if (!h) continue;
    if (h.toUpperCase().replace(/\s/g,'') === 'FINALEXAM') { finalExamCol  = c; continue; }
    if (h.toLowerCase().replace(/\s/g,'') === 'finalmarks') { finalMarksCol = c; continue; }
    subjectCols.push({ abbr: h, colIdx: c });
  }

  const abbrToName = {};
  const headerByStudentName = new Map();
  for (let si = 1; si < wb.SheetNames.length; si++) {
    const ws  = wb.Sheets[wb.SheetNames[si]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    const studentHeaderText = extractResultHeaderTextFromRaw(raw, courseTitle);
    const studentNameRaw = extractStudentNameFromRaw(raw) || '';

    const sheetKey = normalizeName(wb.SheetNames[si]);
    if (sheetKey && studentHeaderText) {
      headerByStudentName.set(sheetKey, studentHeaderText);
    }

    if (studentNameRaw) {
      const normalizedStudentName = normalizeName(studentNameRaw);
      if (normalizedStudentName && studentHeaderText) {
        headerByStudentName.set(normalizedStudentName, studentHeaderText);
      }
      const parts = normalizedStudentName.split(' ').filter(Boolean);
      if (parts.length >= 2) {
        const firstPart = parts[0];
        const lastPart  = parts[parts.length - 1];
        const fwdKey = `${firstPart} ${lastPart}`;
        const revKey = `${lastPart} ${firstPart}`;
        if (!headerByStudentName.has(fwdKey)) headerByStudentName.set(fwdKey, studentHeaderText);
        if (!headerByStudentName.has(revKey)) headerByStudentName.set(revKey, studentHeaderText);
      }
    }

    if (!resultHeaderText || resultHeaderText === courseTitle) {
      resultHeaderText = studentHeaderText || resultHeaderText;
    }

    for (let r = 15; r < raw.length; r++) {
      const abbr = (raw[r]?.[5] || '').toString().trim();
      const name = (raw[r]?.[0] || '').toString().trim();
      if (abbr && name && !['NAME','GRADE','TOTAL MARKS','SUBJECTS'].includes(name.toUpperCase())) {
        abbrToName[abbr] = name;
      }
    }
  }

  const DEFAULT_ABBR_NAMES = {
    LAW: 'Air Law',
    SYS: 'Aircraft General Knowledge & Systems',
    MON: 'Flight Monitoring',
    'M&B': 'Mass & Balance',
    ATM: 'Air Traffic Management',
    COM: 'Communication',
    NAV: 'Navigation',
    POF: 'Principles of Flight & Performance',
    PER: 'Principles of Flight & Performance',
    DGR: 'Dangerous Goods',
    DRM: 'Dangerous Goods',
    MET: 'Meteorology',
    FPL: 'Flight Planning',
    HPL: 'Human Factors',
    HF:  'Human Factors',
  };

  const students = [];
  for (let r = headerRowIdx + 1; r < summaryRaw.length; r++) {
    const row = summaryRaw[r];
    if (!row) continue;
    const firstName = (row[0] || '').toString().trim();
    const lastName  = (row[1] || '').toString().trim();
    if (!firstName && !lastName) continue;
    if (!firstName || !lastName) continue;

    const subjects = subjectCols
      .map(({ abbr, colIdx }) => {
        const rawVal = row[colIdx];
        const mo     = isNA(rawVal) ? null : Number(rawVal);
        const name   = abbrToName[abbr] || DEFAULT_ABBR_NAMES[abbr] || abbr;
        return { abbr, name, max_marks: 100, marks_obtained: mo, grade: gradeFromMark(mo) };
      })
      .filter(s => s.abbr);

    const withMarks    = subjects.filter(s => s.marks_obtained != null);
    const withoutMarks = subjects.filter(s => s.marks_obtained == null);
    const sortedSubjects = [...withMarks, ...withoutMarks];

    const finalExamScore = finalExamCol  !== -1 && !isNA(row[finalExamCol])  ? Number(row[finalExamCol])  : null;
    const finalMarks     = finalMarksCol !== -1 && !isNA(row[finalMarksCol]) ? Number(row[finalMarksCol]) : null;
    const studentHeaderText = findHeaderForStudent(firstName, lastName, headerByStudentName, resultHeaderText || courseTitle, r - headerRowIdx - 1);

    students.push({
      first_name: firstName, last_name: lastName,
      batch_name: '', course_name: courseTitle, course_type: 'FDI',
      result_header_text: studentHeaderText,
      training_mode: trainingMode, start_date: startDate, end_date: endDate,
      lead_instructor: leadInstructor, instructors, subjects: sortedSubjects,
      final_exam_score: finalExamScore,
      final_marks: finalMarks != null ? Math.round(finalMarks * 1000) / 1000 : null,
      sheet_date: endDate, sheet_issued: false,
    });
  }

  if (students.length === 0) throw new Error('No student rows found in the summary sheet.');
  return { batchMeta: { courseTitle, resultHeaderText, trainingMode, startDate, endDate, leadInstructor, instructors }, students };
}

// ── GET all exam results ──────────────────────────────────────────────────────
exports.listResults = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });
    const { batch_name, course_type, search } = req.query;
    const filter = {};
    if (batch_name)  filter.batch_name  = batch_name;
    if (course_type) filter.course_type = course_type;
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ participant_name: re }, { first_name: re }, { last_name: re }, { company: re }, { batch_name: re }];
    }
    const results = await ExamResult.find(filter).sort({ created_at: -1 });
    res.json(results);
  } catch (err) {
    console.error('GET /exam-results error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── GET batch summary list ────────────────────────────────────────────────────
exports.listBatches = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });
    const batches = await ExamResult.aggregate([
      {
        $group: {
          _id: {
            // Normalize batch_name to lowercase+trimmed so "batch" and "Batch" collapse to one
            batch_name: { $toLower: { $trim: { input: '$batch_name' } } },
          },
          // Keep the original casing of the first occurrence for display
          batch_name_display: { $first: { $trim: { input: '$batch_name' } } },
          count:      { $sum: 1 },
          avg_mark:   { $avg: '$final_marks' },
          start_date: { $first: '$start_date' },
          end_date:   { $first: '$end_date' },
        },
      },
      { $sort: { '_id.batch_name': -1 } },
      {
        // Re-shape so the frontend still sees _id.batch_name (original casing)
        $addFields: { '_id.batch_name': '$batch_name_display' },
      },
    ]);
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST parse Excel preview (no DB write) ────────────────────────────────────
exports.parseExcel = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { batchMeta, students } = parseIfoaWorkbook(req.file.buffer);
    res.json({ batchMeta, students });
  } catch (err) {
    console.error('POST /exam-results/parse-excel error:', err.message);
    res.status(422).json({ error: err.message });
  }
};

// ── POST import Excel → DB ────────────────────────────────────────────────────
exports.importExcel = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const { students } = parseIfoaWorkbook(req.file.buffer);
    const batchName  = (req.body.batch_name  || '').trim();
    const courseType = (req.body.course_type || 'FDI').trim();
    const company    = (req.body.company     || '').trim();
    const resultHeaderText = (req.body.result_header_text || '').trim();

    if (!batchName) return res.status(400).json({ error: 'batch_name is required.' });

    const saved = [], failed = [];
    for (const s of students) {
      try {
        const doc = new ExamResult({
          ...s,
          batch_name: batchName,
          course_type: courseType,
          company,
          result_header_text: resultHeaderText || s.result_header_text || s.course_name || '',
          created_by: req.admin.id,
        });
        await doc.save();
        saved.push({ participant_name: doc.participant_name, id: doc._id });
      } catch (err) {
        failed.push({ participant_name: `${s.first_name} ${s.last_name}`, error: err.message });
      }
    }

    res.status(207).json({ message: `Imported ${saved.length} of ${students.length} records.`, successCount: saved.length, failCount: failed.length, saved, failed });
  } catch (err) {
    console.error('POST /exam-results/import-excel error:', err.message);
    res.status(422).json({ error: err.message });
  }
};

// ── GET single exam result ────────────────────────────────────────────────────
exports.getResult = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });
    const doc = await ExamResult.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Exam result not found.' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET result sheet PDF (only if sheet has been issued by admin) ─────────────
exports.getResultPdf = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });

    const doc = await ExamResult.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Exam result not found.' });

    if (!doc.sheet_issued) {
      return res.status(403).json({
        error: 'Result sheet has not been issued yet. Please issue the sheet first before downloading the PDF.',
      });
    }

    const pdfBuffer = await generateExamResultPdf(doc.toObject());

    const safeName = `${doc.first_name}_${doc.last_name}`.replace(/[^a-zA-Z0-9_]/g, '_');
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="IFOA_ExamResult_${safeName}.pdf"`,
      'Content-Length':      pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('GET /exam-results/:id/pdf error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST create exam result ───────────────────────────────────────────────────
exports.createResult = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });

    const { first_name, last_name, batch_name, course_name, course_type,
          result_header_text, training_mode, start_date, end_date, company, lead_instructor,
            instructors, subjects, final_exam_score, final_marks, sheet_date, sheet_issued } = req.body;

    const missing = [];
    if (!first_name)  missing.push('first_name');
    if (!last_name)   missing.push('last_name');
    if (!batch_name)  missing.push('batch_name');
    if (!course_name) missing.push('course_name');
    if (!course_type) missing.push('course_type');
    if (!start_date)  missing.push('start_date');
    if (!end_date)    missing.push('end_date');
    if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });

    const doc = new ExamResult({
      first_name: first_name.trim(), last_name: last_name.trim(),
      batch_name: batch_name.trim(), course_name, course_type,
      result_header_text: result_header_text || course_name,
      training_mode: training_mode || 'HYBRID',
      start_date, end_date,
      company: company || '', lead_instructor: lead_instructor || '',
      instructors: instructors || [], subjects: subjects || [],
      final_exam_score: final_exam_score != null ? Number(final_exam_score) : null,
      final_marks:      final_marks      != null ? Number(final_marks)      : null,
      sheet_date: sheet_date || end_date,
      sheet_issued: sheet_issued || false,
      created_by: req.admin.id,
    });

    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    console.error('POST /exam-results error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── POST bulk create ──────────────────────────────────────────────────────────
exports.bulkCreate = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });
    const rows = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Expected a non-empty array.' });
    const results = [];
    for (const row of rows) {
      try {
        const doc = new ExamResult({ ...row, created_by: req.admin.id });
        await doc.save();
        results.push({ success: true, id: doc._id, participant_name: doc.participant_name });
      } catch (err) {
        results.push({ success: false, error: err.message });
      }
    }
    const successCount = results.filter(r => r.success).length;
    res.status(207).json({ results, successCount, failCount: rows.length - successCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── PUT update exam result ────────────────────────────────────────────────────
exports.updateResult = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });
    const doc = await ExamResult.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Exam result not found.' });
    const fields = ['first_name','last_name','batch_name','course_name','course_type',
                    'result_header_text',
                    'training_mode','start_date','end_date','company','lead_instructor',
                    'instructors','subjects','final_exam_score','final_marks','sheet_date','sheet_issued'];
    fields.forEach(f => { if (req.body[f] !== undefined) doc[f] = req.body[f]; });
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('PUT /exam-results/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── PATCH mark sheet as issued ────────────────────────────────────────────────
exports.issueSheet = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });
    const doc = await ExamResult.findByIdAndUpdate(
      req.params.id,
      { sheet_issued: true, sheet_date: req.body.sheet_date || new Date().toISOString().split('T')[0] },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Exam result not found.' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── DELETE exam result ────────────────────────────────────────────────────────
exports.deleteResult = async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admin access required.' });
    const deleted = await ExamResult.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Exam result not found.' });
    res.json({ message: 'Exam result deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

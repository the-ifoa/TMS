const Exam = require('../../models/Exam');
const Airline = require('../../models/Airline');
const { deleteImagesIfUnused, questionImageIds } = require('../../services/upload');
const { hasExamPower } = require('../../config/permissions');

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

// Call after the exam document is deleted: images still used elsewhere (a copy
// of the question, the bank, a candidate's attempt) are kept.
async function deleteExamImages(exam) {
  await deleteImagesIfUnused(exam.questions.flatMap(questionImageIds));
}

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

// Written-to endpoints refuse a soft-deleted exam (see Exam.deleted_at).
const EXAM_DELETED = 'This exam was deleted. Its results are kept, but it can no longer be changed or assigned.';
function rejectDeleted(res, exam) {
  if (!exam || !exam.deleted_at) return false;
  res.status(410).json({ error: EXAM_DELETED, deleted: true });
  return true;
}

const pct1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10);

Object.assign(exports, { isAdmin, authoringAirline, ownsExam, canAssignExam, assignableOwnerIds, canManageExam, deleteExamImages, attemptScopeFilter, canReadAttempt, pct1, rejectDeleted });

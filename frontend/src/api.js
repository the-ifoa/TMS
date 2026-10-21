import axios from 'axios';

// In local development always go through Vite proxy (/api -> localhost:5000).
// This avoids accidentally pointing dev to a remote/stale backend via .env.
export const API_BASE = import.meta.env.DEV
  ? '/api'
  : ((import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim())
      ? import.meta.env.VITE_API_URL.trim()
      : '/api');

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Short-lived cache for GET requests. Going back to a page within a few
// seconds reuses the last response instead of waiting on the network again,
// and identical requests fired at once share one call. Any write
// (POST/PUT/PATCH/DELETE) clears the whole cache so edits always show up.
const GET_CACHE_MS = 30_000;
const NEVER_CACHE = [/\/notifications/, /\/auth\/me/, /\/public-feedback\//, /\/live\//, /\/public-live\//];
const getCache = new Map();     // key -> { at, res }
const inFlight = new Map();     // key -> Promise<res>
const networkAdapter = axios.getAdapter(axios.defaults.adapter);

export function clearApiCache() {
  getCache.clear();
}

api.defaults.adapter = async (config) => {
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get') {
    getCache.clear();
    return networkAdapter(config);
  }
  if (config.responseType === 'blob' || config.responseType === 'arraybuffer' || config.cache === false
    || NEVER_CACHE.some((rx) => rx.test(config.url || ''))) {
    return networkAdapter(config);
  }
  // Keyed per signed-in user so switching accounts never shows the other's data.
  const key = `${config.headers?.Authorization || ''}|${axios.getUri(config)}`;
  const hit = getCache.get(key);
  if (hit && Date.now() - hit.at < GET_CACHE_MS) return { ...hit.res, config };
  if (inFlight.has(key)) return { ...(await inFlight.get(key)), config };

  const pending = networkAdapter(config)
    .then((res) => {
      if (res.status >= 200 && res.status < 300) getCache.set(key, { at: Date.now(), res });
      return res;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
};

// Attach token to every request if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// For blob responses: if the server returns an error, parse the JSON from the blob
// so the real error message is visible instead of a silent blob
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.config?.responseType === 'blob' && err.response.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        err.response.data = json;
        err.message = json.error || err.message;
      } catch { /* keep original */ }
    }
    return Promise.reject(err);
  }
);

// ── Admin Auth ──────────────────────────────────────────────────────────────
export const signup        = (data) => api.post('/auth/signup', data);
export const login         = (data) => api.post('/auth/login', data);
export const getMe         = ()     => api.get('/auth/me');
export const updateProfile = (data) => api.put('/auth/profile', data);

// Admin: edit an airline's name + address
export const updateAirline = (id, data) => api.patch(`/auth/admin/airline/${id}`, data);
export const getAirlineSettings = () => api.get('/auth/admin/airlines/settings');
export const bulkUpdateAirlineSettings = (updates) => api.patch('/auth/admin/airlines/settings', { updates });

// Admin: create an airline account on the airline's behalf (no email verification)
export const adminCreateAirline = (data) => api.post('/auth/admin/airline', data);

// ── Contracts (admin) ─────────────────────────────────────────────────────────
export const getContractDefaults = () => api.get('/contracts/defaults');
export const getContractAirlines = () => api.get('/contracts/airlines');
export const getContractDefaultsForAirline = (airlineId) => api.get(`/contracts/defaults/${airlineId}`);
export const getContractPdf      = (contractId) => api.get(`/contracts/pdf/${contractId}`, { responseType: 'blob' });
export const previewContract     = (data) => api.post('/contracts/preview', data, { responseType: 'blob' });
export const sendContract        = (data) => api.post('/contracts/send', data);

// ── Notifications ──────────────────────────────────────────────
export const getNotifications = () => api.get('/notifications');

// ── Certificates ────────────────────────────────────────────────────────────
export const generateCertificateBlob = (id, params = {}) =>
  api.get(`/certificates/generate/${id}`, { params, responseType: 'blob' });
export const generateCertificatePost = (id, body = {}) =>
  api.post(`/certificates/generate/${id}`, body, { responseType: 'blob' });
export const revokeCertificateById = (id) =>
  api.delete(`/certificates/revoke/${id}`);
export const downloadIssuedCertificate = (id) =>
  api.get(`/certificates/download/${id}`, { responseType: 'blob' });
export const previewIssuedCertificate = (id) =>
  api.get(`/certificates/preview/${id}`, { responseType: 'blob' });
export const generateDhlCertificateBlob = (id) =>
  api.post(`/certificates/dhl-generate/${id}`, {}, { responseType: 'blob' });
export const downloadDhlCertificate = (id) =>
  api.get(`/certificates/dhl-download/${id}`, { responseType: 'blob' });

// ── Airline Auth ────────────────────────────────────────────────────────────
export const airlineSignup     = (data) => api.post('/auth/airline/signup', data);
export const airlineVerifyOtp  = (email, otp) => api.post('/auth/airline/verify-otp', { email, otp });
export const airlineResendOtp  = (email) => api.post('/auth/airline/resend-otp', { email });
export const airlineLogin      = (data) => api.post('/auth/airline/login', data);
export const uploadAirlineLogo = (file) => {
  const fd = new FormData();
  fd.append('logo', file);
  return api.post('/auth/airline/upload-logo', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ─── Internal (airline-uploaded) certificates — stored in Cloudflare R2 ──────
export const listAllInternalCertificates = () => api.get('/internal-certificates');
export const listInternalCertificates  = (participantId) => api.get(`/internal-certificates/participant/${participantId}`);
export const uploadInternalCertificate = (participantId, file, meta = {}) => {
  const fd = new FormData();
  fd.append('file', file);
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return api.post(`/internal-certificates/participant/${participantId}`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const getInternalCertificateFile = (id) => api.get(`/internal-certificates/${id}/file`, { responseType: 'blob' });
export const deleteInternalCertificate  = (id) => api.delete(`/internal-certificates/${id}`);

// ─── Internal assessments — an airline's own assessments + per-candidate certificate ──
export const listInternalAssessments   = () => api.get('/internal-assessments');
export const createInternalAssessment  = (body) => api.post('/internal-assessments', body);
export const updateInternalAssessment  = (id, body) => api.patch(`/internal-assessments/${id}`, body);
export const deleteInternalAssessment  = (id) => api.delete(`/internal-assessments/${id}`);
// body: { participant_ids: [], manual: [{ name, email }] }
export const addAssessmentCandidates   = (id, body) => api.post(`/internal-assessments/${id}/candidates`, body);
export const removeAssessmentCandidate = (id, candidateId) => api.delete(`/internal-assessments/${id}/candidates/${candidateId}`);
export const uploadAssessmentCertificate = (id, candidateId, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/internal-assessments/${id}/candidates/${candidateId}/certificate`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const getAssessmentCertificate    = (id, candidateId) =>
  api.get(`/internal-assessments/${id}/candidates/${candidateId}/certificate`, { responseType: 'blob' });
export const deleteAssessmentCertificate = (id, candidateId) =>
  api.delete(`/internal-assessments/${id}/candidates/${candidateId}/certificate`);

// ── Participants ────────────────────────────────────────────────────────────
export const getParticipantsByAirline = () => api.get('/participants/by-airline');
export const getAirlinesList          = () => api.get('/participants/airlines');
export const getParticipants          = (params) => api.get('/participants', { params });
export const getParticipant           = (id)     => api.get(`/participants/${id}`);
export const createParticipant        = (data)   => api.post('/participants', data);
export const createCandidate          = (data)   => api.post('/participants/candidate', data);
export const bulkCreateParticipants   = (rows)   => api.post('/participants/bulk', rows);
export const updateParticipant        = (id, data) => api.put(`/participants/${id}`, data);
export const deleteParticipant        = (id)       => api.delete(`/participants/${id}`);
export const deleteAirlineData        = (airlineName) => api.delete(`/participants/airline/${encodeURIComponent(airlineName)}`);
export const deleteAirlineById        = (airlineId)   => api.delete(`/participants/airline-by-id/${airlineId}`);
export const deleteAirlineAccount     = (airlineId)   => api.delete(`/participants/airline-account/${airlineId}`);
export const updateCertSequence       = (id, cert_sequence) => api.patch(`/participants/${id}/cert-sequence`, { cert_sequence });
export const updateFullCertId         = (id, cert_sequence, cert_year) => api.patch(`/participants/${id}/full-cert-id`, { cert_sequence, cert_year });
export const updateNdgScore           = (id, ndg_score) => api.patch(`/participants/${id}/ndg-score`, { ndg_score });
export const updateFdrHours           = (id, fdr_hours) => api.patch(`/participants/${id}/fdr-hours`, { fdr_hours });
export const revokeCertificate        = (id)            => api.patch(`/participants/${id}/revoke-cert`);
export const revokeDhlCertificate     = (id)            => api.patch(`/participants/${id}/revoke-dhl-cert`);
export const updateValidity           = (id, cert_validity) => api.patch(`/participants/${id}/validity`, { cert_validity });
export const sendExpiryReminder       = (participantIds, message = '') => api.post('/participants/expiry-reminder', { participantIds, message });
export const sendSubmissionConfirmation = (data) => api.post('/participants/send-confirmation', data);
export const getCertCounters          = () => api.get('/certificates/counters');
export const resetCertCounter         = (training_type, startFrom = 0) => api.post('/certificates/counters/reset', { training_type, startFrom, mode: 'hard' });
export const resetAllCertCounters     = (startFrom = 0) => api.post('/certificates/counters/reset', { all: true, startFrom, mode: 'hard' });

// ── Certificates (remaining helpers) ─────────────────────────────────────────
export const getModulesList                 = ()                          => api.get('/certificates/modules');
export const generateCertificateUrl         = (id)                        => `${API_BASE}/certificates/generate/${id}`;
export const previewCertificateUrl          = (id)                        => `${API_BASE}/certificates/preview/${id}`;
export const generateCertificateWithModules = (id, modules, variant = 'default') =>
  api.post(`/certificates/generate/${id}`, { modules, templateVariant: variant }, { responseType: 'blob' });

// ── Attendance Sheets ─────────────────────────────────────────────────────────
export const listAttendanceSheets  = (params = {}) => api.get('/attendance', { params });
export const getAttendanceSheet    = (id)           => api.get(`/attendance/${id}`);
export const saveAttendanceSheet   = (data)         => api.post('/attendance', data);
export const updateAttendanceSheet = (id, data)     => api.put(`/attendance/${id}`, data);
export const bulkEnsureAttendanceSheets = (participantIds) => api.post('/attendance/bulk', { participantIds });

// ── DGR CBTA Forms ────────────────────────────────────────────────────────────
export const getDgrAirlines = ()           => api.get('/dgr/airlines');          // admin: airlines + students
export const getDgrForms    = (params = {}) => api.get('/dgr', { params });
export const getDgrForm     = (id)          => api.get(`/dgr/${id}`);
export const createDgrForm  = (data)        => api.post('/dgr', data);
export const updateDgrForm  = (id, data)    => api.put(`/dgr/${id}`, data);
export const deleteDgrForm  = (id)          => api.delete(`/dgr/${id}`);

// ── Exam System ───────────────────────────────────────────────────────────────
export const getExamAirlines  = (params = {}) => api.get('/exams/airlines', { params }); // admin: airlines + students
export const getExamAirlineOptions = ()      => api.get('/exams/airline-options'); // admin: airlines an exam can be "for"
export const listExams        = (params = {}) => api.get('/exams', { params });
export const getExam          = (id)       => api.get(`/exams/${id}`);
export const getExamSummary   = (id)       => api.get(`/exams/${id}`, { params: { summary: 1 } });
export const createExam       = (data)     => api.post('/exams', data);
export const updateExam       = (id, data) => api.put(`/exams/${id}`, data);
export const previewExamRemark = (id, data) => api.post(`/exams/${id}/remark-preview`, data);
export const deleteExam       = (id, { purge = false } = {}) => api.delete(`/exams/${id}${purge ? '?purge=1' : ''}`);
export const publishExam      = (id)       => api.post(`/exams/${id}/publish`);
export const assignExam       = (id, participantIds) => api.post(`/exams/${id}/assign`, { participant_ids: participantIds });
export const uploadExamImage  = (file) => {
  const fd = new FormData();
  fd.append('image', file);
  return api.post('/exams/questions/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const deleteExamImage  = (publicId) => api.delete(`/exams/questions/image/${encodeURIComponent(publicId)}`);

export const getAssignedExams     = ()                        => api.get('/exams/assigned');
export const startExamAttempt     = (examId, participantId)   => api.post(`/exams/${examId}/attempts`, { participant_id: participantId });
export const getExamAttempt       = (attemptId)                => api.get(`/exams/attempts/${attemptId}`);
export const checkExamAnswer      = (attemptId, questionId, response) => api.post(`/exams/attempts/${attemptId}/check`, { question_id: questionId, response });
// keepalive: the exam page is closing — a fetch keepalive request survives the
// unload (Safari cancels a normal XHR, losing the last answers).
const KEEPALIVE = { adapter: 'fetch', fetchOptions: { keepalive: true } };
// Autosave: { answers: [{ question_id, response }], timers: { key: seconds } } in one request.
export const saveExamAnswers      = (attemptId, payload, { keepalive } = {}) => api.put(`/exams/attempts/${attemptId}/answers`, payload, keepalive ? KEEPALIVE : undefined);
export const submitExamAttempt    = (attemptId)                => api.post(`/exams/attempts/${attemptId}/submit`);
export const reportExamViolation  = (attemptId, type)           => api.post(`/exams/attempts/${attemptId}/violation`, { type });
export const listExamAttempts     = (params = {})              => api.get('/exams/attempts', { params });
export const getExamAttemptResult = (attemptId)                => api.get(`/exams/attempts/${attemptId}/result`);
export const gradeExamAttempt     = (attemptId, data)           => api.put(`/exams/attempts/${attemptId}/grade`, data);
export const getExamAnalytics     = (examId)                   => api.get(`/exams/${examId}/analytics`);
export const getParticipantExamPerformance = (participantId)   => api.get(`/exams/participants/${participantId}/performance`);

// ── Question Bank — named banks of reusable questions, tagged for filtering ───
export const listQuestionBankGroups   = ()         => api.get('/question-bank/groups');
export const createQuestionBankGroup  = (data)     => api.post('/question-bank/groups', data);
export const updateQuestionBankGroup  = (id, data) => api.put(`/question-bank/groups/${id}`, data);
export const deleteQuestionBankGroup  = (id)       => api.delete(`/question-bank/groups/${id}`);

export const listQuestionBankItems    = (params = {}) => api.get('/question-bank/items', { params });
export const getQuestionBankTopics    = (bankId)      => api.get('/question-bank/topics', { params: bankId ? { bank_id: bankId } : {} });
export const createQuestionBankItem   = (data)        => api.post('/question-bank/items', data);
export const updateQuestionBankItem   = (id, data)    => api.put(`/question-bank/items/${id}`, data);
export const deleteQuestionBankItem   = (id)          => api.delete(`/question-bank/items/${id}`);

// ── Additional logins for the same airline account (admin-granted) ───────────
export const getSecondaryLogins    = ()          => api.get('/auth/airline/secondary-logins');
export const getSecondaryLoginPowers = ()        => api.get('/auth/airline/secondary-logins/powers');
export const addSecondaryLogin     = (data)      => api.post('/auth/airline/secondary-logins', data);
export const updateSecondaryLogin  = (id, data)  => api.patch(`/auth/airline/secondary-logins/${id}`, data);
export const deleteSecondaryLogin  = (id)        => api.delete(`/auth/airline/secondary-logins/${id}`);

export const updateParticipantEmail = (id, email) => api.patch(`/participants/${id}/email`, { email });

// ── Exam invites (email a passwordless take-link to participants) ─────────────
export const sendExamInvites       = (examId, participantIds, opts = {}) => api.post(`/exams/${examId}/send-invites`, { participant_ids: participantIds, ...opts });
// Add a candidate on the go from the Assign dialog ({ name, email, airline_id, keep }).
export const addQuickParticipant   = (examId, body) => api.post(`/exams/${examId}/quick-participant`, body);
export const keepQuickParticipant  = (examId, participantId) => api.patch(`/exams/${examId}/quick-participant/${participantId}`, { keep: true });
// Reassign — grants one fresh attempt on top of max_attempts and re-emails the
// same link, so a participant who already finished can take the exam again.
export const reassignExamInvites   = (examId, participantIds, opts = {}) => api.post(`/exams/${examId}/send-invites`, { participant_ids: participantIds, reassign: true, ...opts });
export const getExamInvites        = (examId)                 => api.get(`/exams/${examId}/invites`);
export const getExamAssignments    = (examId)                 => api.get(`/exams/${examId}/assignments`);
// Take one candidate off an exam: their assignment, invite link and any result.
export const removeExamCandidate   = (examId, participantId)  => api.delete(`/exams/${examId}/candidates/${participantId}`);
export const getAirlineExamResults = ()                       => api.get('/exams/airline-results');
export const getLatestExamResults  = ()                       => api.get('/exams/latest-results');

// ── Team / sub-user management ──────────────────────────────────────────────
export const getTeamCatalog  = ()         => api.get('/team/catalog');
export const getTeamAirlines = ()         => api.get('/team/airlines');
export const getTeamMembers  = ()         => api.get('/team/members');
export const createTeamMember = (data)    => api.post('/team/members', data);
export const updateTeamMember = (id, data) => api.patch(`/team/members/${id}`, data);
export const deleteTeamMember = (id)      => api.delete(`/team/members/${id}`);

// ── Public token-based exam taking (no auth) ─────────────────────────────────
export const getPublicExam        = (token)                          => api.get(`/public-exam/${token}`);
// body { resume: 'refresh' } — the candidate refreshed the exam page: resume without counting a window close.
export const startPublicExam      = (token, body)                    => api.post(`/public-exam/${token}/start`, body);
export const checkPublicAnswer    = (token, attemptId, questionId, response) => api.post(`/public-exam/${token}/attempts/${attemptId}/check`, { question_id: questionId, response });
export const savePublicAnswers    = (token, attemptId, payload, { keepalive } = {}) => api.put(`/public-exam/${token}/attempts/${attemptId}/answers`, payload, keepalive ? KEEPALIVE : undefined);
export const submitPublicExam     = (token, attemptId)              => api.post(`/public-exam/${token}/attempts/${attemptId}/submit`);
export const reportPublicViolation = (token, attemptId, type)       => api.post(`/public-exam/${token}/attempts/${attemptId}/violation`, { type });
export const getPublicExamResult  = (token, attemptId)              => api.get(`/public-exam/${token}/attempts/${attemptId}/result`);

// ── Customer Training Feedback ──────────────────────────────────────────────
// Admin (IFOA exams only): send status + responses, and email the form.
export const getExamFeedback      = (examId)                 => api.get(`/feedback/exams/${examId}`);
export const sendExamFeedback     = (examId, participantIds) => api.post(`/feedback/exams/${examId}/send`, { participant_ids: participantIds });
export const deleteExamFeedback   = (examId, feedbackId, { resend = false } = {}) => api.delete(`/feedback/exams/${examId}/responses/${feedbackId}${resend ? '?resend=1' : ''}`);
export const bulkDeleteExamFeedback = (examId, ids)       => api.post(`/feedback/exams/${examId}/responses/bulk-delete`, { ids });
export const deleteFeedbackResponse = (feedbackId)       => api.delete(`/feedback/responses/${feedbackId}`);
export const getFeedbackDashboard = (params = {})             => api.get('/feedback/dashboard', { params });
export const emailFeedbackReport  = (examId, body)           => api.post(`/feedback/exams/${examId}/email-report`, body);
// Public, passwordless form opened from the emailed link.
export const getPublicFeedback    = (token)                  => api.get(`/public-feedback/${token}`);
export const submitPublicFeedback = (token, data)            => api.post(`/public-feedback/${token}/submit`, data);

// ── Exam results: team KPIs, downloadable report, delete ─────────────────────
export const getTeamPerformance   = (params)       => api.get('/exams/team-performance', { params });
export const exportExamAttempts   = (format, params) => api.get('/exams/attempts/export', { params: { format, ...params }, responseType: 'blob' });
// Certificate the airline uploads for a passed attempt, then emails to the candidate
export const uploadAttemptCertificate = (attemptId, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/exams/attempts/${attemptId}/certificate`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const getAttemptCertificate    = (attemptId) => api.get(`/exams/attempts/${attemptId}/certificate`, { responseType: 'blob' });
export const deleteAttemptCertificate = (attemptId) => api.delete(`/exams/attempts/${attemptId}/certificate`);
export const sendAttemptCertificate   = (attemptId) => api.post(`/exams/attempts/${attemptId}/certificate/send`);
export const deleteExamAttempt    = (attemptId)    => api.delete(`/exams/attempts/${attemptId}`);
export const bulkDeleteExamAttempts = (ids)        => api.post('/exams/attempts/bulk-delete', { ids });
// Live monitor: who is taking an exam now; add time; submit for a candidate.
export const getExamLive          = (examId)              => api.get(`/exams/${examId}/live`, { cache: false });
export const extendExamAttempt    = (attemptId, minutes)  => api.post(`/exams/attempts/${attemptId}/extend`, { minutes });
export const extendExamAll        = (examId, minutes)     => api.post(`/exams/${examId}/live/extend`, { minutes });
export const forceSubmitAttempt   = (attemptId)           => api.post(`/exams/attempts/${attemptId}/force-submit`);

// ── Password Reset ────────────────────────────────────────────────────────────
export const forgotPassword = (email)                     => api.post('/auth/airline/forgot-password', { email });
export const resetPassword  = (email, token, newPassword) => api.post('/auth/airline/reset-password', { email, token, newPassword });

// ── Exam Results ─────────────────────────────────────────────────────────────
export const getExamResults        = (params) => api.get('/exam-results', { params });
export const getExamBatches        = ()       => api.get('/exam-results/batches');
export const getExamResult         = (id)     => api.get(`/exam-results/${id}`);
export const createExamResult      = (data)   => api.post('/exam-results', data);
export const bulkCreateExamResults = (rows)   => api.post('/exam-results/bulk', rows);
export const updateExamResult      = (id, data) => api.put(`/exam-results/${id}`, data);
export const deleteExamResult      = (id)       => api.delete(`/exam-results/${id}`);

export const issueResultSheet = (id, date) =>
  api.patch(`/exam-results/${id}/issue-sheet`, { sheet_date: date });

// Download exam result PDF — only succeeds if sheet_issued === true
export const getExamResultPdf = (id) =>
  api.get(`/exam-results/${id}/pdf`, { responseType: 'blob' });

// Excel import helpers
export const parseExamResultsExcel = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/exam-results/parse-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const importExamResultsExcel = (file, meta) => {
  const fd = new FormData();
  fd.append('file', file);
  if (meta.batch_name)  fd.append('batch_name',  meta.batch_name);
  if (meta.course_type) fd.append('course_type', meta.course_type);
  if (meta.company)     fd.append('company',     meta.company);
  if (meta.result_header_text) fd.append('result_header_text', meta.result_header_text);
  return api.post('/exam-results/import-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// ── Live quiz (Kahoot-style) ────────────────────────────────────────────────
export const listLiveGames        = ()                 => api.get('/live/games');
export const getLiveGame          = (id)               => api.get(`/live/games/${id}`);
export const createLiveGame       = (data)             => api.post('/live/games', data);
export const updateLiveGame       = (id, data)         => api.put(`/live/games/${id}`, data);
export const deleteLiveGame       = (id)               => api.delete(`/live/games/${id}`);
export const listLiveSessions     = (id)               => api.get(`/live/games/${id}/sessions`);
export const startLiveSession     = (id)               => api.post(`/live/games/${id}/sessions`);
export const getLiveExamQuestions = (examId)           => api.get(`/live/exam-questions/${examId}`);
export const liveGameFromExam     = (examId)           => api.post(`/live/from-exam/${examId}`);   // exam → new live game
export const examFromLiveGame     = (id)               => api.post(`/live/games/${id}/to-exam`);    // live game → draft exam
export const getLiveHostState     = (sessionId)        => api.get(`/live/sessions/${sessionId}`);
export const deleteLiveSession    = (sessionId)        => api.delete(`/live/sessions/${sessionId}`);
export const liveHostAction       = (sessionId, action, extra = {}) => api.post(`/live/sessions/${sessionId}/action`, { action, ...extra });
// Players (no login) — the player token goes in the X-Player-Token header.
const playerHdr = (token) => ({ headers: { 'X-Player-Token': token } });
export const resolveLivePin       = (pin)              => api.get(`/public-live/pin/${pin}`);
export const getLivePublic        = (code)             => api.get(`/public-live/${code}`);
export const joinLiveGame         = (code, data)       => api.post(`/public-live/${code}/join`, data);
// `version` (from the last reply) lets the server answer { unchanged: true } when nothing moved on.
export const getLivePlayerState   = (code, token, version) => api.get(`/public-live/${code}/state`, { ...playerHdr(token), params: version ? { v: version } : undefined });
export const answerLive           = (code, token, data) => api.post(`/public-live/${code}/answer`, data, playerHdr(token));
export const reactLive            = (code, token, sticker) => api.post(`/public-live/${code}/react`, { sticker }, playerHdr(token));
export const chooseLiveTeam       = (code, token, team) => api.post(`/public-live/${code}/team`, { team }, playerHdr(token));

export default api;

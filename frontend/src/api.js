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

// ── Participants ────────────────────────────────────────────────────────────
export const getParticipantsByAirline = () => api.get('/participants/by-airline');
export const getAirlinesList          = () => api.get('/participants/airlines');
export const getParticipants          = (params) => api.get('/participants', { params });
export const getParticipant           = (id)     => api.get(`/participants/${id}`);
export const createParticipant        = (data)   => api.post('/participants', data);
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
export const getExamAirlines  = ()         => api.get('/exams/airlines');        // admin: airlines + students
export const listExams        = (params = {}) => api.get('/exams', { params });
export const getExam          = (id)       => api.get(`/exams/${id}`);
export const createExam       = (data)     => api.post('/exams', data);
export const updateExam       = (id, data) => api.put(`/exams/${id}`, data);
export const deleteExam       = (id)       => api.delete(`/exams/${id}`);
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
export const saveExamAnswer       = (attemptId, questionId, response) => api.put(`/exams/attempts/${attemptId}/answer`, { question_id: questionId, response });
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

export const updateParticipantEmail = (id, email) => api.patch(`/participants/${id}/email`, { email });

// ── Exam invites (email a passwordless take-link to participants) ─────────────
export const sendExamInvites       = (examId, participantIds) => api.post(`/exams/${examId}/send-invites`, { participant_ids: participantIds });
export const getExamInvites        = (examId)                 => api.get(`/exams/${examId}/invites`);
export const getAirlineExamResults = ()                       => api.get('/exams/airline-results');
export const getDepartmentExamResults = ()                    => api.get('/exams/department-results');

// ── Team / sub-user management ──────────────────────────────────────────────
export const getTeamCatalog  = ()         => api.get('/team/catalog');
export const getTeamAirlines = ()         => api.get('/team/airlines');
export const getTeamMembers  = ()         => api.get('/team/members');
export const createTeamMember = (data)    => api.post('/team/members', data);
export const updateTeamMember = (id, data) => api.patch(`/team/members/${id}`, data);
export const deleteTeamMember = (id)      => api.delete(`/team/members/${id}`);

// ── Public token-based exam taking (no auth) ─────────────────────────────────
export const getPublicExam        = (token)                          => api.get(`/public-exam/${token}`);
export const startPublicExam      = (token)                          => api.post(`/public-exam/${token}/start`);
export const savePublicAnswer     = (token, attemptId, questionId, response) => api.put(`/public-exam/${token}/attempts/${attemptId}/answer`, { question_id: questionId, response });
export const submitPublicExam     = (token, attemptId)              => api.post(`/public-exam/${token}/attempts/${attemptId}/submit`);
export const reportPublicViolation = (token, attemptId, type)       => api.post(`/public-exam/${token}/attempts/${attemptId}/violation`, { type });
export const getPublicExamResult  = (token, attemptId)              => api.get(`/public-exam/${token}/attempts/${attemptId}/result`);

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

export default api;

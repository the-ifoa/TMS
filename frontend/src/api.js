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
export const updateCertSequence       = (id, cert_sequence) => api.patch(`/participants/${id}/cert-sequence`, { cert_sequence });
export const updateFullCertId         = (id, cert_sequence, cert_year) => api.patch(`/participants/${id}/full-cert-id`, { cert_sequence, cert_year });
export const updateNdgScore           = (id, ndg_score) => api.patch(`/participants/${id}/ndg-score`, { ndg_score });
export const revokeCertificate        = (id)            => api.patch(`/participants/${id}/revoke-cert`);
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

// ── DGR CBTA Forms ────────────────────────────────────────────────────────────
export const getDgrAirlines = ()           => api.get('/dgr/airlines');          // admin: airlines + students
export const getDgrForms    = (params = {}) => api.get('/dgr', { params });
export const getDgrForm     = (id)          => api.get(`/dgr/${id}`);
export const createDgrForm  = (data)        => api.post('/dgr', data);
export const updateDgrForm  = (id, data)    => api.put(`/dgr/${id}`, data);
export const deleteDgrForm  = (id)          => api.delete(`/dgr/${id}`);

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

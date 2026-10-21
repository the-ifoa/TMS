// Exam handlers live in ./exams, grouped by area. This file keeps the single
// `examsController.<handler>` entry point that routes/exams.js uses.
module.exports = {
  ...require('./exams/reports'),
  ...require('./exams/attemptCertificates'),
  ...require('./exams/attempts'),
  ...require('./exams/authoring'),
  ...require('./exams/invites'),
  ...require('./exams/monitor'),
};

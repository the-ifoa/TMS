// ─── iSpring "Customer Training Feedback" mail parser ─────────────────────────
// Turns the plain-text body of an iSpring "[Complete] Survey results" email into
// a feedback record shaped like TrainingFeedback (config/feedbackForm.js keys).
// The iSpring survey is the form the TMS one was copied from, so the sections
// and statements line up one to one, in the same order.
const { FEEDBACK_FORM } = require('../config/feedbackForm');

const SCALE = { 'Excellent': 5, 'Above Average': 4, 'Average': 3, 'Below Average': 2, 'Poor': 1 };
const RATING_RE = /(Excellent|Above Average|Below Average|Average|Poor)\s*\((\d)\)/g;

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const words = (s) => squash(s).toLowerCase().replace(/[^a-z0-9 ]/g, '');

// "Company X Training Title Y Instructor name Z" — any of the three can wrap.
function parseHeader(text) {
  const block = (text.match(/survey results for "[^"]*"\.\s*([\s\S]*?)Date\/Time:/) || [])[1] || '';
  const line = squash(block);
  const m = line.match(/^Company\s*(.*?)\s*Training Title\s*(.*?)\s*Instructor\s+name\s*(.*)$/i);
  if (!m) return { company: '', training_title: '', instructor_name: '' };
  return { company: squash(m[1]), training_title: squash(m[2]), instructor_name: squash(m[3]) };
}

// Text between "Question N Survey" markers, keyed by N.
function questionBlocks(text) {
  const parts = text.split(/\n\s*Question (\d+) Survey\s*\n/);
  const out = {};
  for (let i = 1; i < parts.length; i += 2) out[Number(parts[i])] = parts[i + 1] || '';
  return out;
}

const answerOf = (block) => {
  const i = block.indexOf('User Answer');
  return i === -1 ? '' : block.slice(i + 'User Answer'.length);
};

// Ratings in one section: each statement is followed by "Label(n)". Statements
// are matched by text (first words) so a skipped statement is never shifted
// onto the next one; anything unmatched falls back to its position.
function sectionRatings(answer, statements) {
  const found = [];
  let last = 0;
  let m;
  RATING_RE.lastIndex = 0;
  while ((m = RATING_RE.exec(answer))) {
    found.push({ text: words(answer.slice(last, m.index)), value: Number(m[2]) || SCALE[m[1]] });
    last = RATING_RE.lastIndex;
  }
  const used = new Set();
  const ratings = [];
  statements.forEach((st, idx) => {
    const head = words(st.text).split(' ').slice(0, 6).join(' ');
    let hit = found.findIndex((f, i) => !used.has(i) && f.text.startsWith(head));
    if (hit === -1 && found.length === statements.length && !used.has(idx)) hit = idx;
    if (hit === -1) return;
    used.add(hit);
    const v = found[hit].value;
    if (v >= 1 && v <= 5) ratings.push({ key: st.key, value: v });
  });
  return ratings;
}

function parseSurveyMail(mail) {
  const text = String(mail.text || '').replace(/\r/g, '');
  if (!/survey results for "Customer Training Feedback"/i.test(text)) return null;
  const blocks = questionBlocks(text);
  const ratings = FEEDBACK_FORM.sections.flatMap((section, i) => sectionRatings(answerOf(blocks[i + 1] || ''), section.statements));
  const comments = answerOf(blocks[FEEDBACK_FORM.sections.length + 1] || '').trim().replace(/\n{3,}/g, '\n\n');
  const spent = (text.match(/Time Spent:\s*([^\n]+)/) || [])[1];
  return {
    source_ref: `ispring-mail:${mail.uid}`,
    submitted_at: mail.date ? new Date(mail.date).toISOString() : null,
    ...parseHeader(text),
    time_spent: squash(spent),
    ratings,
    comments,
  };
}

module.exports = { parseSurveyMail };

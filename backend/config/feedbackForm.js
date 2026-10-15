// ─────────────────────────────────────────────────────────────────────────────
//  Customer Training Feedback form — single source of truth
//
//  Mirrors IFOA's iSpring survey "Customer Training Feedback". The public
//  feedback page renders straight from this definition (GET /public-feedback
//  /:token) and submissions are validated against it, so wording or a new
//  statement only needs changing here. Bump VERSION when statements change so
//  stored responses stay interpretable (each response saves form_version).
//
//  Each statement has a stable `key`; responses store { key: 1..5 }.
// ─────────────────────────────────────────────────────────────────────────────
const VERSION = 1;

const SCALE = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Below Average' },
  { value: 3, label: 'Average' },
  { value: 4, label: 'Above Average' },
  { value: 5, label: 'Excellent' },
];

const PROMPT = 'Please indicate your level of agreement with the statements listed hereunder:';

// One page per section, in order. `image` names a picture the frontend owns
// (src/assets/feedback/<image>.jpg).
const SECTIONS = [
  {
    key: 'overall_rating',
    title: 'BEFORE STARTED...',
    prompt: '',
    image: 'quality',
    statements: [
      { key: 'overall_quality', text: 'Overall, how would you rate the quality of the training provided?' },
    ],
  },
  {
    key: 'content',
    title: '1. TRAINING CONTENT AND MATERIALS:',
    prompt: PROMPT,
    image: 'materials',
    statements: [
      { key: 'materials_comprehensive', text: 'The training materials were comprehensive and effectively covered all key topics.' },
      { key: 'materials_thorough',      text: 'The materials provided during the training were thorough and addressed all essential subject areas.' },
      { key: 'materials_clear',         text: 'The instructions and explanations in the training materials were clear, concise, and easy to understand.' },
    ],
  },
  {
    key: 'instructor',
    title: '2. INSTRUCTOR EVALUATION:',
    prompt: PROMPT,
    image: 'instructor',
    statements: [
      { key: 'instructor_knowledge',     text: 'The instructor demonstrated a strong command of the subject matter and a clear understanding of the processes relevant to the training.' },
      { key: 'instructor_communication', text: 'The instructor communicated the training content clearly and effectively throughout the session.' },
      { key: 'instructor_engagement',    text: 'The instructor was engaging and maintained a strong level of interest throughout the training.' },
    ],
  },
  {
    key: 'overall',
    title: '3. OVERALL EVALUATION:',
    prompt: PROMPT,
    image: 'overall',
    statements: [
      { key: 'confident_applying',  text: 'I feel confident in applying the knowledge acquired during this training to my day-to-day responsibilities.' },
      { key: 'time_appropriate',    text: 'The time allocated for the training was appropriate and well-balanced.' },
      { key: 'would_recommend',     text: 'I would confidently recommend IFOA training to others seeking high-quality, practical, and industry-relevant instruction.' },
      { key: 'interested_more',     text: 'I would be interested in attending additional training courses with IFOA in the future.' },
    ],
  },
];

const ESSAY = {
  key: 'comments',
  image: 'ideas',
  text: 'What did you most appreciate, enjoy, or find most beneficial about the training?\n\nDo you have any suggestions for how we could improve the training?',
  max_length: 5000,
};

const FORM = {
  version: VERSION,
  title: 'Customer Training Feedback',
  welcome: { heading: ['Welcome to IFOA', 'Customer Training Feedback'], hint: 'Click the "Start Survey" button to proceed' },
  details_heading: 'Please enter the following information',
  intro: {
    greeting: 'Dear Customer,',
    paragraphs: [
      'Your feedback is extremely valuable to us at the International Flight Operations Academy. It helps ensure that we continue to meet your educational and operational needs with the highest standards.',
      'We would greatly appreciate it if you could take just a few minutes (less than 3) to share your thoughts and suggestions with us. Your input plays a key role in helping us improve and serve you better.',
    ],
    bullets: [
      'Choose the level of agreement that corresponds to your opinion.',
      'Click on “Next” to go to the next questionnaire.',
      'Use the “Next” and “Previous” buttons to navigate between survey questionnaires.',
      'Click on “Submit All” to check your answers.',
    ],
    closing: 'Thank you in advance for your time and support.',
    signature: 'The IFOA Team',
  },
  scale: SCALE,
  sections: SECTIONS,
  essay: ESSAY,
  thank_you: 'Thank you for participating in the training and for taking the time to complete this survey.\n\nYour feedback is greatly appreciated and will help us to improve future training sessions.',
};

const STATEMENT_KEYS = SECTIONS.flatMap((s) => s.statements.map((q) => q.key));

module.exports = { FEEDBACK_FORM: FORM, FEEDBACK_VERSION: VERSION, STATEMENT_KEYS, SCALE };

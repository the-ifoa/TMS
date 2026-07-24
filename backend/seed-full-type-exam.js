#!/usr/bin/env node
/**
 * seed-full-type-exam.js
 *
 * ONE-TIME seed script. Creates a single published exam covering every
 * question type supported by models/Exam.js (2 questions per type),
 * including image-based questions (hotspot / drag_drop require an image;
 * a couple of mcq/sequence questions also carry images for coverage).
 * Visible to admins immediately (admin exam list is global, no assignment
 * needed). Safe to re-run — deletes any prior exam with the same title
 * before inserting.
 *
 * Usage (run from the backend folder):
 *   node seed-full-type-exam.js
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const Exam = require('./models/Exam');

const EXAM_TITLE = 'All Question Types — Sample Exam';

// Stable placeholder images (picsum.photos, seeded for reproducibility)
const IMG = (seed, w = 600, h = 400) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

async function main() {
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) throw new Error('MONGODB_URL environment variable is required');

  await mongoose.connect(mongoUrl, { dbName: 'certificateSystem' });
  console.log('Connected to MongoDB');

  await Exam.deleteMany({ title: EXAM_TITLE });

  let order = 0;
  const q = (data) => ({ order: order++, points: 1, ...data });

  const questions = [
    // ── mcq ──
    q({
      type: 'mcq',
      prompt: 'Which gas makes up the majority of Earth\'s atmosphere?',
      options: [
        { text: 'Nitrogen', is_correct: true },
        { text: 'Oxygen', is_correct: false },
        { text: 'Carbon dioxide', is_correct: false },
        { text: 'Argon', is_correct: false },
      ],
      explanation: 'Nitrogen makes up about 78% of the atmosphere.',
    }),
    q({
      type: 'mcq',
      prompt: 'Identify the aircraft type shown in the image.',
      image_url: IMG('mcq-plane'),
      options: [
        { text: 'Wide-body jet', is_correct: true },
        { text: 'Helicopter', is_correct: false },
        { text: 'Glider', is_correct: false },
        { text: 'Airship', is_correct: false },
      ],
    }),

    // ── multi_response ──
    q({
      type: 'multi_response',
      prompt: 'Select all items classified as Dangerous Goods (choose all that apply).',
      options: [
        { text: 'Lithium batteries', is_correct: true },
        { text: 'Compressed gas cylinders', is_correct: true },
        { text: 'Printed paper documents', is_correct: false },
        { text: 'Corrosive chemicals', is_correct: true },
      ],
    }),
    q({
      type: 'multi_response',
      prompt: 'Which of the following are PPE items (choose all that apply)?',
      options: [
        { text: 'Safety goggles', is_correct: true },
        { text: 'Gloves', is_correct: true },
        { text: 'Wristwatch', is_correct: false },
        { text: 'Ear protection', is_correct: true },
      ],
    }),

    // ── true_false ──
    q({
      type: 'true_false',
      prompt: 'The IATA Dangerous Goods Regulations are updated annually.',
      options: [
        { text: 'True', is_correct: true },
        { text: 'False', is_correct: false },
      ],
    }),
    q({
      type: 'true_false',
      prompt: 'Lithium batteries can be shipped without any restrictions.',
      options: [
        { text: 'True', is_correct: false },
        { text: 'False', is_correct: true },
      ],
    }),

    // ── short_answer ──
    q({
      type: 'short_answer',
      prompt: 'What does the acronym "DGR" stand for?',
      correct_text: ['Dangerous Goods Regulations'],
    }),
    q({
      type: 'short_answer',
      prompt: 'What does "PPE" stand for?',
      correct_text: ['Personal Protective Equipment'],
    }),

    // ── numeric ──
    q({
      type: 'numeric',
      prompt: 'How many minutes are in 2.5 hours?',
      numeric_answer: 150,
      numeric_tolerance: 0,
    }),
    q({
      type: 'numeric',
      prompt: 'What is the standard passing percentage for this training module?',
      numeric_answer: 80,
      numeric_tolerance: 5,
    }),

    // ── sequence ──
    q({
      type: 'sequence',
      prompt: 'Arrange the steps of emergency evacuation in the correct order.',
      sequence_items: [
        { text: 'Sound the alarm' },
        { text: 'Assist passengers to exits' },
        { text: 'Deploy evacuation slides' },
        { text: 'Account for all personnel' },
      ],
    }),
    q({
      type: 'sequence',
      prompt: 'Order these image-labeled steps for pre-flight inspection.',
      sequence_items: [
        { text: 'Exterior walk-around', image_url: IMG('seq1', 300, 200) },
        { text: 'Cockpit checks', image_url: IMG('seq2', 300, 200) },
        { text: 'Cabin safety check', image_url: IMG('seq3', 300, 200) },
      ],
    }),

    // ── matching ──
    q({
      type: 'matching',
      prompt: 'Match each DGR class to its description.',
      matching_pairs: [
        { left: 'Class 1', right: 'Explosives' },
        { left: 'Class 3', right: 'Flammable liquids' },
        { left: 'Class 7', right: 'Radioactive material' },
      ],
    }),
    q({
      type: 'matching',
      prompt: 'Match each abbreviation to its meaning.',
      matching_pairs: [
        { left: 'FDR', right: 'Flight Data Recorder' },
        { left: 'HF', right: 'Human Factors' },
        { left: 'CBTA', right: 'Competency-Based Training and Assessment' },
      ],
    }),

    // ── fill_blank ──
    q({
      type: 'fill_blank',
      prompt: 'Complete the sentence.',
      blanks_text: 'The aircraft cruising altitude is typically around {{1}} feet, controlled by {{2}}.',
      blanks_answers: [['35000', '35,000'], ['air traffic control', 'ATC']],
    }),
    q({
      type: 'fill_blank',
      prompt: 'Complete the safety statement.',
      blanks_text: 'In case of fire, use a {{1}} extinguisher and evacuate via the nearest {{2}}.',
      blanks_answers: [['fire'], ['exit']],
    }),

    // ── select_list ──
    q({
      type: 'select_list',
      prompt: 'Select the correct unit for measuring air pressure.',
      options: [
        { text: 'Pascal', is_correct: true },
        { text: 'Watt', is_correct: false },
        { text: 'Joule', is_correct: false },
        { text: 'Newton', is_correct: false },
      ],
    }),
    q({
      type: 'select_list',
      prompt: 'Select the correct DGR packing group for the highest danger level.',
      options: [
        { text: 'Packing Group I', is_correct: true },
        { text: 'Packing Group II', is_correct: false },
        { text: 'Packing Group III', is_correct: false },
      ],
    }),

    // ── drag_words ──
    q({
      type: 'drag_words',
      prompt: 'Drag the correct words into the blanks.',
      drag_words_text: 'A {{1}} extinguisher should never be used on an {{2}} fire.',
      drag_words_bank: ['water', 'electrical', 'foam', 'chemical'],
      drag_words_answers: ['water', 'electrical'],
    }),
    q({
      type: 'drag_words',
      prompt: 'Complete the checklist statement.',
      drag_words_text: 'Before departure, confirm the {{1}} doors are secured and the {{2}} is stowed.',
      drag_words_bank: ['cargo', 'galley', 'tray table', 'window'],
      drag_words_answers: ['cargo', 'tray table'],
    }),

    // ── hotspot (requires question image) ──
    q({
      type: 'hotspot',
      prompt: 'Click the emergency exit in the cabin diagram.',
      image_url: IMG('hotspot-cabin'),
      hotspot_regions: [
        { shape: 'rect', x: 10, y: 10, width: 20, height: 20, is_correct: true },
        { shape: 'rect', x: 60, y: 60, width: 20, height: 20, is_correct: false },
      ],
    }),
    q({
      type: 'hotspot',
      prompt: 'Click the fire extinguisher location on the diagram.',
      image_url: IMG('hotspot-panel'),
      hotspot_regions: [
        { shape: 'circle', x: 30, y: 40, width: 15, height: 15, is_correct: true },
        { shape: 'circle', x: 70, y: 20, width: 15, height: 15, is_correct: false },
      ],
    }),

    // ── drag_drop (requires question image) ──
    q({
      type: 'drag_drop',
      prompt: 'Drag each label to the correct zone on the aircraft diagram.',
      image_url: IMG('dragdrop-aircraft'),
      dragdrop_targets: [
        { label: 'Cockpit', x: 5, y: 40, width: 15, height: 15 },
        { label: 'Cargo hold', x: 70, y: 60, width: 15, height: 15 },
      ],
      dragdrop_items: [
        { label: 'Pilot seat', correct_target_index: 0 },
        { label: 'Baggage container', correct_target_index: 1 },
      ],
    }),
    q({
      type: 'drag_drop',
      prompt: 'Drag each safety label to its correct zone on the DGR label sheet.',
      image_url: IMG('dragdrop-labels'),
      dragdrop_targets: [
        { label: 'Zone A', x: 10, y: 10, width: 20, height: 20 },
        { label: 'Zone B', x: 60, y: 50, width: 20, height: 20 },
      ],
      dragdrop_items: [
        { label: 'Flammable label', correct_target_index: 0 },
        { label: 'Radioactive label', correct_target_index: 1 },
      ],
    }),

    // ── likert (unscored survey) ──
    q({
      type: 'likert',
      prompt: 'Rate your agreement with the following statements about this training.',
      likert_statements: ['The material was clear and easy to follow.', 'The pacing of the course was appropriate.'],
      likert_scale_labels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
    }),
    q({
      type: 'likert',
      prompt: 'Rate your confidence after completing this module.',
      likert_statements: ['I feel confident applying these procedures on the job.', 'I would recommend this training to a colleague.'],
      likert_scale_labels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
    }),

    // ── essay (manually graded) ──
    q({
      type: 'essay',
      prompt: 'Describe the correct procedure for handling a suspected dangerous goods leak in cargo.',
      essay_min_words: 50,
      explanation: 'Model answer should cover: isolate/evacuate the area, don appropriate PPE, notify the captain and ground ops, consult the DGR emergency response guidance for the specific class involved, and do not attempt to move or repackage the item without trained hazmat support.',
    }),
    q({
      type: 'essay',
      prompt: 'Explain why human factors training is important in aviation safety.',
      essay_min_words: 50,
      explanation: 'Model answer should cover: most aviation incidents trace back to human error (fatigue, communication breakdowns, situational awareness); HF training builds CRM skills, decision-making under pressure, and error-management habits that reduce operational risk.',
    }),
  ];

  const exam = await Exam.create({
    title: EXAM_TITLE,
    description: 'Sample exam covering all 14 supported question types, for UI/QA testing.',
    status: 'published',
    duration_minutes: 60,
    pass_percentage: 60,
    max_attempts: 3,
    shuffle_questions: false,
    shuffle_options: false,
    lockdown_enabled: false,
    max_violations: 4,
    questions,
  });

  console.log(`Created exam "${exam.title}" (${exam._id}) with ${exam.questions.length} questions, status=${exam.status}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

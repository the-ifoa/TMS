#!/usr/bin/env node
/**
 * seed-airline-mcq-exam.js
 *
 * Seeds one published, all-multiple-choice sample exam owned by an airline
 * account, so it shows up in that airline's own Exam System list. Safe to
 * re-run — replaces any earlier copy of the same exam for that airline.
 *
 * Usage (run from the backend folder):
 *   node seed-airline-mcq-exam.js <airline-email>
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const Exam = require('./models/Exam');
const Airline = require('./models/Airline');

const EXAM_TITLE = 'General Knowledge - MCQ Sample Exam';

// [prompt, correct option, ...wrong options, explanation]
const QUESTIONS = [
  ['What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth', 'Canberra was purpose-built as the capital; Sydney is the largest city.'],
  ['Which planet is known as the Red Planet?', 'Mars', 'Venus', 'Jupiter', 'Mercury', 'Iron oxide on the surface gives Mars its red colour.'],
  ['How many continents are there on Earth?', '7', '5', '6', '8', 'Africa, Antarctica, Asia, Australia, Europe, North America and South America.'],
  ['What is the chemical symbol for gold?', 'Au', 'Ag', 'Gd', 'Go', 'Au comes from the Latin word "aurum".'],
  ['Which ocean is the largest?', 'Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean', 'The Pacific covers about one third of the Earth\'s surface.'],
  ['Who wrote the play "Romeo and Juliet"?', 'William Shakespeare', 'Charles Dickens', 'Jane Austen', 'Mark Twain', 'Shakespeare wrote it in the 1590s.'],
  ['What is the boiling point of water at sea level in degrees Celsius?', '100', '90', '110', '120', 'Water boils at 100 °C at standard atmospheric pressure.'],
  ['Which is the smallest prime number?', '2', '0', '1', '3', '2 is the smallest prime and the only even one.'],
  ['What is the largest mammal on Earth?', 'Blue whale', 'African elephant', 'Giraffe', 'Hippopotamus', 'Blue whales can exceed 30 metres in length.'],
  ['In which year did the first humans land on the Moon?', '1969', '1959', '1965', '1972', 'Apollo 11 landed on 20 July 1969.'],
  ['What is the hardest natural substance?', 'Diamond', 'Quartz', 'Granite', 'Steel', 'Diamond rates 10 on the Mohs hardness scale.'],
  ['Which gas do plants absorb from the atmosphere?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen', 'Plants use carbon dioxide for photosynthesis.'],
  ['How many sides does a hexagon have?', '6', '5', '7', '8', '"Hex" means six.'],
  ['What is the longest river in Africa?', 'Nile', 'Congo', 'Niger', 'Zambezi', 'The Nile is about 6,650 km long.'],
  ['Which instrument has 88 keys?', 'Piano', 'Guitar', 'Violin', 'Flute', 'A standard piano has 52 white and 36 black keys.'],
  ['What is the square root of 144?', '12', '10', '14', '16', '12 × 12 = 144.'],
  ['Which country is home to the kangaroo?', 'Australia', 'South Africa', 'Brazil', 'India', 'Kangaroos are native to Australia.'],
  ['What is the main language spoken in Brazil?', 'Portuguese', 'Spanish', 'English', 'French', 'Brazil was a Portuguese colony.'],
  ['How many minutes are there in two hours?', '120', '100', '90', '140', '2 × 60 = 120.'],
  ['Which organ pumps blood around the human body?', 'Heart', 'Lungs', 'Liver', 'Kidneys', 'The heart circulates blood through the body.'],
];

// Shuffle so the correct option is not always listed first.
function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) throw new Error('Usage: node seed-airline-mcq-exam.js <airline-email>');

  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) throw new Error('MONGODB_URL environment variable is required');
  await mongoose.connect(mongoUrl, { dbName: 'certificateSystem' });
  console.log('Connected to MongoDB');

  // The email may be the account's own, or one of its additional logins.
  const account = await Airline.findOne({ $or: [{ email }, { 'secondary_logins.email': email }] });
  if (!account) throw new Error(`No airline account found for ${email}`);

  // A department's exams are owned by its parent airline and tagged with the department.
  const owner = account.parent_airline
    ? { owner_airline: account.parent_airline, owner_department: account._id }
    : { owner_airline: account._id, owner_department: null };

  await Exam.deleteMany({ title: EXAM_TITLE, ...owner });

  const questions = QUESTIONS.map(([prompt, correct, w1, w2, w3, explanation], order) => ({
    type: 'mcq',
    order,
    points: 1,
    prompt,
    explanation,
    options: shuffled([
      { text: correct, is_correct: true },
      { text: w1, is_correct: false },
      { text: w2, is_correct: false },
      { text: w3, is_correct: false },
    ]),
  }));

  const exam = await Exam.create({
    title: EXAM_TITLE,
    description: 'Sample exam with 20 general knowledge multiple choice questions.',
    status: 'published',
    duration_minutes: 30,
    pass_percentage: 60,
    max_attempts: 3,
    shuffle_questions: false,
    shuffle_options: false,
    lockdown_enabled: false,
    max_violations: 4,
    show_review: true,
    questions,
    ...owner,
  });

  console.log(`Created exam "${exam.title}" (${exam._id}) with ${exam.questions.length} questions for ${account.airlineName || email}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

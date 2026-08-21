import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Exam from '../models/Exam.js';
import ExamSession from '../models/ExamSession.js';
import Center from '../models/Center.js';
import Stop from '../models/Stop.js';
import { atIst, addDays, formatIst } from '../utils/time.js';

// ---------------------------------------------------------------------------
// REAL Rajasthan reference data. Coordinates are [lng, lat].
//
// Exam patterns/timings reflect the actual NTA schedule:
//   JEE Main : multi-day, 2 shifts/day  (09:00-12:00 gate 08:30, 15:00-18:00 gate 14:30)
//   NEET UG  : single day, single shift (14:00-17:00, gate 13:30)
//   CUET UG  : multi-day, subject-wise shifts
//
// All times are IST wall-clock, built with `atIst` so they are stored as
// correct UTC instants. Using `date.setHours(9)` here would encode the *seed
// machine's* timezone, which silently shifts every exam by 5.5 hours once the
// app is deployed to a UTC host.
//
// The 13 cities are NTA's real JEE Main exam cities in Rajasthan (with codes).
// ---------------------------------------------------------------------------

const cities = [
  { city: 'Ajmer', code: 'RJ01', coordinates: [74.6399, 26.4499] },
  { city: 'Alwar', code: 'RJ02', coordinates: [76.6100, 27.5530] },
  { city: 'Banswara', code: 'RJ03', coordinates: [74.4324, 23.5461] },
  { city: 'Barmer', code: 'RJ04', coordinates: [71.3962, 25.7521] },
  { city: 'Bikaner', code: 'RJ05', coordinates: [73.3119, 28.0229] },
  { city: 'Jaipur', code: 'RJ06', coordinates: [75.7873, 26.9124] },
  { city: 'Jodhpur', code: 'RJ07', coordinates: [73.0243, 26.2389] },
  { city: 'Kota', code: 'RJ08', coordinates: [75.8648, 25.2138] },
  { city: 'Sikar', code: 'RJ09', coordinates: [75.1398, 27.6094] },
  { city: 'Sriganganagar', code: 'RJ10', coordinates: [73.8772, 29.9038] },
  { city: 'Udaipur', code: 'RJ11', coordinates: [73.7125, 24.5854] },
  { city: 'Bhilwara', code: 'RJ12', coordinates: [74.6313, 25.3407] },
  { city: 'Chittorgarh', code: 'RJ13', coordinates: [74.6269, 24.8887] },
  { city: 'Churu', code: 'RJ14', coordinates: [74.9718, 28.3049] },
  { city: 'Bharatpur', code: 'RJ16', coordinates: [77.4895, 27.2173] },
  { city: 'Dausa', code: 'RJ17', coordinates: [76.3344, 26.8894] },
  { city: 'Jhunjhunu', code: 'RJ18', coordinates: [75.3995, 28.1289] },
  { city: 'Nagaur', code: 'RJ19', coordinates: [73.7339, 27.2020] },
  { city: 'Pali', code: 'RJ22', coordinates: [73.3234, 25.7711] },
  { city: 'Hanumangarh', code: 'RJ23', coordinates: [74.2939, 29.5813] },
  { city: 'Sawai Madhopur', code: 'RJ25', coordinates: [76.3550, 25.9930] },
  { city: 'Bundi', code: 'RJ28', coordinates: [75.6499, 25.4305] },
];

// One representative exam venue per city (name is illustrative).
const centers = cities.map((c) => ({
  name: `${c.city} Exam Centre (${c.code})`,
  city: c.city,
  state: 'Rajasthan',
  address: `${c.city}, Rajasthan`,
  location: { type: 'Point', coordinates: c.coordinates },
}));

// Known common pickup stops per town. Students are snapped to the nearest.
const stops = cities.flatMap((c) => [
  {
    name: `${c.city} Railway Station`,
    city: c.city,
    state: 'Rajasthan',
    location: { type: 'Point', coordinates: c.coordinates },
  },
  {
    name: `${c.city} Central Bus Stand`,
    city: c.city,
    state: 'Rajasthan',
    // nudge ~1.5 km so it is a distinct pickup point
    location: {
      type: 'Point',
      coordinates: [c.coordinates[0] + 0.015, c.coordinates[1] + 0.01],
    },
  },
]);

/** Builds one sitting: exam start, gate close 30 min before, reporting 2h before. */
function makeSession(examId, day, { startHour, startMinute = 0, shiftLabel, subject }) {
  const examStart = atIst(day, startHour, startMinute);
  return {
    exam: examId,
    date: atIst(day, 0, 0),
    shiftLabel,
    subject,
    examStart,
    gateClose: new Date(examStart.getTime() - 30 * 60_000),
    reportingTime: new Date(examStart.getTime() - 120 * 60_000),
  };
}

async function seed() {
  await connectDB();
  await Promise.all([
    Exam.deleteMany({}),
    ExamSession.deleteMany({}),
    Center.deleteMany({}),
    Stop.deleteMany({}),
  ]);

  await Center.insertMany(centers);
  await Stop.insertMany(stops);

  const today = new Date();

  /**
   * The exam calendar, described rather than hand-built.
   *
   * Each entry says how the exam is actually structured — how many days, which
   * shifts, which subjects — and the sessions are generated from that. Writing
   * eight exams out by hand would be eight chances to typo a time; this way the
   * pattern is stated once and the data follows from it.
   *
   * Dates are relative to today so the catalogue never goes stale, and every
   * booking deadline sits a realistic few days before its own first sitting
   * rather than all sharing one arbitrary date.
   *
   * `JEE` keeps its code because the demo seed looks it up by name.
   */
  const EXAM_PLAN = [
    {
      name: 'JEE Main 2026 - Session 1',
      code: 'JEE',
      description: 'Engineering entrance. Three days, two shifts per day.',
      multiShift: true,
      startsIn: 21,
      days: 3,
      shifts: [
        { startHour: 9, shiftLabel: 'Shift 1 (9 AM - 12 PM)' },
        { startHour: 15, shiftLabel: 'Shift 2 (3 PM - 6 PM)' },
      ],
    },
    {
      name: 'JEE Main 2026 - Session 2',
      code: 'JEE2',
      description: 'The April attempt. Candidates may sit both sessions; the better score counts.',
      multiShift: true,
      startsIn: 74,
      days: 3,
      shifts: [
        { startHour: 9, shiftLabel: 'Shift 1 (9 AM - 12 PM)' },
        { startHour: 15, shiftLabel: 'Shift 2 (3 PM - 6 PM)' },
      ],
    },
    {
      name: 'JEE Advanced 2026',
      code: 'JEEADV',
      description: 'For candidates who clear JEE Main. Two compulsory papers on one day.',
      multiShift: true,
      startsIn: 96,
      days: 1,
      shifts: [
        { startHour: 9, shiftLabel: 'Paper 1 (9 AM - 12 PM)' },
        { startHour: 14, startMinute: 30, shiftLabel: 'Paper 2 (2:30 PM - 5:30 PM)' },
      ],
    },
    {
      name: 'NEET UG 2026',
      code: 'NEET',
      description: 'Medical entrance. A single afternoon sitting, nationwide.',
      multiShift: false,
      startsIn: 35,
      days: 1,
      shifts: [{ startHour: 14, shiftLabel: 'Single Shift (2 PM - 5 PM)' }],
    },
    {
      name: 'CUET UG 2026',
      code: 'CUET',
      description: 'Central university admissions. Subject-wise shifts across three days.',
      multiShift: true,
      startsIn: 45,
      days: 3,
      shifts: [
        {
          startHour: 10,
          shiftLabel: 'Shift 1 (10 AM)',
          subjects: ['Physics / Chemistry', 'English / General Test', 'Economics / History'],
        },
        {
          startHour: 15,
          shiftLabel: 'Shift 2 (3 PM)',
          subjects: ['Mathematics', 'Biology', 'Political Science'],
        },
      ],
    },
    {
      name: 'REET 2026 - Level 2',
      code: 'REET',
      description:
        'Rajasthan Eligibility Examination for Teachers. Two shifts on a single day.',
      multiShift: true,
      startsIn: 28,
      days: 1,
      shifts: [
        { startHour: 10, shiftLabel: 'Level 1 (10 AM - 12:30 PM)' },
        { startHour: 15, shiftLabel: 'Level 2 (3 PM - 5:30 PM)' },
      ],
    },
    {
      name: 'RPSC RAS 2026 - Prelims',
      code: 'RAS',
      description: 'Rajasthan Administrative Services preliminary paper. One afternoon shift.',
      multiShift: false,
      startsIn: 52,
      days: 1,
      shifts: [{ startHour: 11, shiftLabel: 'Prelims (11 AM - 2 PM)' }],
    },
    {
      name: 'CLAT 2026',
      code: 'CLAT',
      description: 'Common Law Admission Test. A single afternoon paper.',
      multiShift: false,
      startsIn: 63,
      days: 1,
      shifts: [{ startHour: 14, shiftLabel: 'Single Shift (2 PM - 4 PM)' }],
    },
  ];

  const allSessions = [];
  const summary = [];

  for (const plan of EXAM_PLAN) {
    const firstDay = addDays(today, plan.startsIn);
    // Booking closes a few days before the exam, not on some shared date:
    // each exam's window is its own.
    const examDeadline = addDays(firstDay, -4);

    const exam = await Exam.create({
      name: plan.name,
      code: plan.code,
      state: 'Rajasthan',
      description: plan.description,
      multiShift: plan.multiShift,
      bookingDeadline: examDeadline,
    });

    const sessions = [];
    for (let day = 0; day < plan.days; day++) {
      const d = addDays(firstDay, day);
      for (const shift of plan.shifts) {
        sessions.push(
          makeSession(exam._id, d, {
            startHour: shift.startHour,
            startMinute: shift.startMinute,
            shiftLabel: shift.shiftLabel,
            // Subject rotates per day for exams that are sat subject by subject.
            subject: shift.subjects ? shift.subjects[day % shift.subjects.length] : undefined,
          })
        );
      }
    }

    allSessions.push(...sessions);
    summary.push({ name: plan.name, count: sessions.length, first: sessions[0].examStart });
  }

  await ExamSession.insertMany(allSessions);

  console.log('✅ Seeded real Rajasthan data:');
  for (const s of summary) {
    console.log(`   ${s.name.padEnd(30)} ${String(s.count).padStart(2)} sitting(s) · from ${formatIst(s.first)} IST`);
  }
  console.log(`   ${allSessions.length} sittings across ${EXAM_PLAN.length} exams`);
  console.log(`   Centres: ${centers.length} cities · Stops: ${stops.length}`);
  console.log(`   First JEE sitting starts: ${formatIst(summary[0].first)} IST`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

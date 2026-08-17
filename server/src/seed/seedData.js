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
  { city: 'Bikaner', code: 'RJ05', coordinates: [73.3119, 28.0229] },
  { city: 'Jaipur', code: 'RJ06', coordinates: [75.7873, 26.9124] },
  { city: 'Jodhpur', code: 'RJ07', coordinates: [73.0243, 26.2389] },
  { city: 'Kota', code: 'RJ08', coordinates: [75.8648, 25.2138] },
  { city: 'Sikar', code: 'RJ09', coordinates: [75.1398, 27.6094] },
  { city: 'Sriganganagar', code: 'RJ10', coordinates: [73.8772, 29.9038] },
  { city: 'Udaipur', code: 'RJ11', coordinates: [73.7125, 24.5854] },
  { city: 'Bhilwara', code: 'RJ12', coordinates: [74.6313, 25.3407] },
  { city: 'Bharatpur', code: 'RJ16', coordinates: [77.4895, 27.2173] },
  { city: 'Dausa', code: 'RJ17', coordinates: [76.3344, 26.8894] },
  { city: 'Hanumangarh', code: 'RJ23', coordinates: [74.2939, 29.5813] },
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
  const jeeStart = addDays(today, 21); // 3 weeks out
  const neetDay = addDays(today, 35);
  const cuetStart = addDays(today, 45);
  const deadline = addDays(today, 18);

  // ---- JEE Main: 3 days x 2 shifts ----
  const jee = await Exam.create({
    name: 'JEE Main 2026 - Session 1',
    code: 'JEE',
    state: 'Rajasthan',
    description: 'Engineering entrance. Multiple days, two shifts per day.',
    multiShift: true,
    bookingDeadline: deadline,
  });
  const jeeSessions = [];
  for (let day = 0; day < 3; day++) {
    const d = addDays(jeeStart, day);
    jeeSessions.push(
      makeSession(jee._id, d, { startHour: 9, shiftLabel: 'Shift 1 (9 AM - 12 PM)' }),
      makeSession(jee._id, d, { startHour: 15, shiftLabel: 'Shift 2 (3 PM - 6 PM)' })
    );
  }

  // ---- NEET UG: single day, single shift ----
  const neet = await Exam.create({
    name: 'NEET UG 2026',
    code: 'NEET',
    state: 'Rajasthan',
    description: 'Medical entrance. Single day, single afternoon shift.',
    multiShift: false,
    bookingDeadline: deadline,
  });
  const neetSessions = [
    makeSession(neet._id, neetDay, {
      startHour: 14,
      shiftLabel: 'Single Shift (2 PM - 5 PM)',
    }),
  ];

  // ---- CUET UG: 2 days x 2 subject shifts ----
  const cuet = await Exam.create({
    name: 'CUET UG 2026',
    code: 'CUET',
    state: 'Rajasthan',
    description: 'University entrance. Multiple days, subject-wise shifts.',
    multiShift: true,
    bookingDeadline: deadline,
  });
  const cuetSessions = [];
  for (let day = 0; day < 2; day++) {
    const d = addDays(cuetStart, day);
    cuetSessions.push(
      makeSession(cuet._id, d, {
        startHour: 10,
        shiftLabel: 'Shift 1 (10 AM)',
        subject: day === 0 ? 'Physics / Chemistry' : 'English / GK',
      }),
      makeSession(cuet._id, d, {
        startHour: 15,
        shiftLabel: 'Shift 2 (3 PM)',
        subject: day === 0 ? 'Mathematics' : 'Biology',
      })
    );
  }

  const all = [...jeeSessions, ...neetSessions, ...cuetSessions];
  await ExamSession.insertMany(all);

  console.log('✅ Seeded real Rajasthan data:');
  console.log(
    `   Exams: JEE (${jeeSessions.length} sessions), NEET (${neetSessions.length}), CUET (${cuetSessions.length})`
  );
  console.log(`   Centres: ${centers.length} cities · Stops: ${stops.length}`);
  console.log(`   Booking deadline: ${formatIst(deadline)} IST`);
  console.log(`   First JEE sitting starts: ${formatIst(jeeSessions[0].examStart)} IST`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

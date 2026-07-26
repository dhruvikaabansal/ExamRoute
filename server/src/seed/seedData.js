import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Exam from '../models/Exam.js';
import Center from '../models/Center.js';
import Stop from '../models/Stop.js';

// Rajasthan reference data. Coordinates are [lng, lat].

const centers = [
  { name: 'JECRC University', city: 'Jaipur', state: 'Rajasthan', address: 'Sitapura, Jaipur', location: { type: 'Point', coordinates: [75.8648, 26.7833] } },
  { name: 'Manipal University Jaipur', city: 'Jaipur', state: 'Rajasthan', address: 'Dehmi Kalan, Jaipur', location: { type: 'Point', coordinates: [75.5646, 26.8430] } },
  { name: 'MBM University', city: 'Jodhpur', state: 'Rajasthan', address: 'Ratanada, Jodhpur', location: { type: 'Point', coordinates: [73.0243, 26.2634] } },
  { name: 'Techno India NJR', city: 'Udaipur', state: 'Rajasthan', address: 'Kaladwas, Udaipur', location: { type: 'Point', coordinates: [73.6800, 24.5500] } },
  { name: 'Government Engineering College', city: 'Ajmer', state: 'Rajasthan', address: 'Barliya, Ajmer', location: { type: 'Point', coordinates: [74.6399, 26.4499] } },
  { name: 'University of Kota', city: 'Kota', state: 'Rajasthan', address: 'Rangbari Road, Kota', location: { type: 'Point', coordinates: [75.8333, 25.1900] } },
];

// Known town pickup stops (students are snapped to nearest of these)
const stops = [
  // Jaipur region
  { name: 'Jaipur Junction (Railway Station)', city: 'Jaipur', state: 'Rajasthan', location: { type: 'Point', coordinates: [75.7924, 26.9196] } },
  { name: 'Sindhi Camp Bus Stand', city: 'Jaipur', state: 'Rajasthan', location: { type: 'Point', coordinates: [75.7960, 26.9260] } },
  { name: 'Vidyadhar Nagar', city: 'Jaipur', state: 'Rajasthan', location: { type: 'Point', coordinates: [75.7870, 26.9640] } },
  // Kota
  { name: 'Kota Railway Station', city: 'Kota', state: 'Rajasthan', location: { type: 'Point', coordinates: [75.8560, 25.1810] } },
  { name: 'Gumanpura, Kota', city: 'Kota', state: 'Rajasthan', location: { type: 'Point', coordinates: [75.8390, 25.1770] } },
  // Jodhpur
  { name: 'Jodhpur Railway Station', city: 'Jodhpur', state: 'Rajasthan', location: { type: 'Point', coordinates: [73.0243, 26.2954] } },
  { name: 'Paota Circle, Jodhpur', city: 'Jodhpur', state: 'Rajasthan', location: { type: 'Point', coordinates: [73.0170, 26.3020] } },
  // Udaipur
  { name: 'Udaipur City Station', city: 'Udaipur', state: 'Rajasthan', location: { type: 'Point', coordinates: [73.7010, 24.5760] } },
  // Ajmer
  { name: 'Ajmer Junction', city: 'Ajmer', state: 'Rajasthan', location: { type: 'Point', coordinates: [74.6250, 26.4640] } },
  // Sikar & Bikaner (smaller towns feeding bigger centers)
  { name: 'Sikar Bus Stand', city: 'Sikar', state: 'Rajasthan', location: { type: 'Point', coordinates: [75.1400, 27.6100] } },
  { name: 'Bikaner Junction', city: 'Bikaner', state: 'Rajasthan', location: { type: 'Point', coordinates: [73.3120, 28.0130] } },
  { name: 'Bhilwara Bus Stand', city: 'Bhilwara', state: 'Rajasthan', location: { type: 'Point', coordinates: [74.6300, 25.3470] } },
];

function atHour(base, h, m = 0) {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

async function seed() {
  await connectDB();
  await Promise.all([Exam.deleteMany({}), Center.deleteMany({}), Stop.deleteMany({})]);

  const examDate = new Date();
  examDate.setDate(examDate.getDate() + 21); // 3 weeks out

  const deadline = new Date(examDate);
  deadline.setDate(deadline.getDate() - 3);

  const exams = [
    {
      name: 'JEE Main 2026 - Session 1',
      code: 'JEE',
      date: examDate,
      reportingTime: atHour(examDate, 8, 30), // must report by 8:30 AM
      state: 'Rajasthan',
      bookingDeadline: deadline,
    },
    {
      name: 'NEET UG 2026',
      code: 'NEET',
      date: examDate,
      reportingTime: atHour(examDate, 12, 30),
      state: 'Rajasthan',
      bookingDeadline: deadline,
    },
    {
      name: 'CUET UG 2026',
      code: 'CUET',
      date: examDate,
      reportingTime: atHour(examDate, 9, 0),
      state: 'Rajasthan',
      bookingDeadline: deadline,
    },
  ];

  await Center.insertMany(centers);
  await Stop.insertMany(stops);
  await Exam.insertMany(exams);

  console.log(`✅ Seeded ${exams.length} exams, ${centers.length} centers, ${stops.length} stops (Rajasthan)`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

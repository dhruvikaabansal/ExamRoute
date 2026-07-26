import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Exam from '../models/Exam.js';
import Center from '../models/Center.js';
import Booking from '../models/Booking.js';
import { haversineKm } from '../services/mapsService.js';

// Creates fake students with PAID bookings so you can immediately run the
// routing engine on the Admin page and see buses + routes. Run AFTER `npm run seed`.

// Fake students: [name, city, [lng, lat], centerCity]
const students = [
  ['Aarav (Jaipur)', 'Jaipur', [75.7924, 26.9196], 'Jaipur'],
  ['Isha (Jaipur)', 'Jaipur', [75.787, 26.964], 'Jaipur'],
  ['Rohan (Jaipur)', 'Jaipur', [75.796, 26.926], 'Jaipur'],
  ['Priya (Sikar)', 'Sikar', [75.14, 27.61], 'Jaipur'],
  ['Kabir (Sikar)', 'Sikar', [75.145, 27.605], 'Jaipur'],
  ['Ananya (Ajmer)', 'Ajmer', [74.625, 26.464], 'Jaipur'],
  ['Vivaan (Bhilwara)', 'Bhilwara', [74.63, 25.347], 'Jaipur'],
  ['Diya (Jodhpur)', 'Jodhpur', [73.0243, 26.2954], 'Jodhpur'],
  ['Arjun (Jodhpur)', 'Jodhpur', [73.017, 26.302], 'Jodhpur'],
  ['Meera (Jodhpur)', 'Jodhpur', [73.02, 26.29], 'Jodhpur'],
  ['Kartik (Bikaner)', 'Bikaner', [73.312, 28.013], 'Jodhpur'],
  ['Sara (Bikaner)', 'Bikaner', [73.315, 28.01], 'Jodhpur'],
];

function fare(homeCoords, centerCoords) {
  const base = Number(process.env.BASE_FARE || 100);
  const perKm = Number(process.env.FARE_PER_KM || 3);
  return Math.round(base + perKm * haversineKm(homeCoords, centerCoords));
}

async function demo() {
  await connectDB();

  const exam = await Exam.findOne({ code: 'JEE' });
  if (!exam) {
    console.error('No exam found. Run `npm run seed` first.');
    process.exit(1);
  }

  const centers = await Center.find({ state: 'Rajasthan' });
  const centerByCity = {};
  for (const c of centers) centerByCity[c.city] = c;

  // wipe previous demo students + their bookings
  const demoEmails = students.map((_, i) => `demo${i}@examroute.test`);
  const oldUsers = await User.find({ email: { $in: demoEmails } });
  await Booking.deleteMany({ user: { $in: oldUsers.map((u) => u._id) } });
  await User.deleteMany({ email: { $in: demoEmails } });

  let created = 0;
  for (let i = 0; i < students.length; i++) {
    const [name, city, coords, centerCity] = students[i];
    const center = centerByCity[centerCity];
    if (!center) continue;

    const user = await User.create({
      googleId: `demo-google-${i}`,
      name,
      email: demoEmails[i],
      homeLocation: { type: 'Point', coordinates: coords, address: city },
    });

    await Booking.create({
      user: user._id,
      exam: exam._id,
      center: center._id,
      homeLocation: { type: 'Point', coordinates: coords, address: city },
      fare: fare(coords, center.location.coordinates),
      status: 'paid', // pretend they already paid
    });
    created++;
  }

  console.log(`✅ Created ${created} demo students with PAID bookings for "${exam.name}".`);
  console.log('   → Log in as admin, open Admin, pick that exam, and click "Run routing engine".');
  await mongoose.disconnect();
  process.exit(0);
}

demo().catch((err) => {
  console.error('Demo seed error:', err);
  process.exit(1);
});

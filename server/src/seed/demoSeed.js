import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Exam from '../models/Exam.js';
import ExamSession from '../models/ExamSession.js';
import Center from '../models/Center.js';
import Booking from '../models/Booking.js';
import { computeFare } from '../utils/fare.js';

// Creates fake students with PAID bookings for the FIRST JEE session so you can
// immediately run the routing engine on the Admin page. Run AFTER `npm run seed`.

// [name, homeCity, [lng, lat], centerCity, companions]
const students = [
  ['Aarav Sharma', 'Jaipur', [75.7873, 26.9124], 'Jaipur', 0],
  ['Isha Verma', 'Jaipur', [75.80, 26.93], 'Jaipur', 1],
  ['Rohan Gupta', 'Jaipur', [75.77, 26.90], 'Jaipur', 0],
  ['Priya Meena', 'Sikar', [75.1398, 27.6094], 'Jaipur', 2],
  ['Kabir Jain', 'Sikar', [75.145, 27.605], 'Jaipur', 0],
  ['Ananya Rao', 'Dausa', [76.3344, 26.8894], 'Jaipur', 1],
  ['Vivaan Singh', 'Alwar', [76.6100, 27.5530], 'Jaipur', 0],
  ['Diya Agarwal', 'Jodhpur', [73.0243, 26.2389], 'Jodhpur', 0],
  ['Arjun Rathore', 'Jodhpur', [73.03, 26.24], 'Jodhpur', 1],
  ['Meera Choudhary', 'Jodhpur', [73.02, 26.23], 'Jodhpur', 0],
  ['Kartik Bishnoi', 'Bikaner', [73.3119, 28.0229], 'Jodhpur', 2],
  ['Sara Khan', 'Bikaner', [73.315, 28.02], 'Jodhpur', 0],
];

async function demo() {
  await connectDB();

  const exam = await Exam.findOne({ code: 'JEE' });
  if (!exam) {
    console.error('No JEE exam found. Run `npm run seed` first.');
    process.exit(1);
  }
  const session = await ExamSession.findOne({ exam: exam._id }).sort({
    date: 1,
    examStart: 1,
  });

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
    const [name, homeCity, coords, centerCity, companions] = students[i];
    const center = centerByCity[centerCity];
    if (!center) continue;

    const user = await User.create({
      name,
      email: demoEmails[i],
      authProvider: 'local',
      rollNumber: `2601${String(1000 + i)}`,
      homeLocation: { type: 'Point', coordinates: coords, address: homeCity },
    });

    const seats = 1 + companions;
    const { distanceKm, baseFare, subsidyPercent, fare } = computeFare(
      coords,
      center.location.coordinates,
      seats
    );

    await Booking.create({
      user: user._id,
      exam: exam._id,
      session: session._id,
      center: center._id,
      homeLocation: { type: 'Point', coordinates: coords, address: homeCity },
      companions,
      seats,
      distanceKm,
      baseFare,
      subsidyPercent,
      fare,
      status: 'paid', // pretend they already paid
    });
    created++;
  }

  console.log(`✅ Created ${created} demo students (with parents/companions) PAID for:`);
  console.log(`   ${exam.name} — ${session.shiftLabel} on ${new Date(session.date).toDateString()}`);
  console.log('   → Log in as admin, open Admin, pick that session, click "Run routing engine".');
  await mongoose.disconnect();
  process.exit(0);
}

demo().catch((err) => {
  console.error('Demo seed error:', err);
  process.exit(1);
});

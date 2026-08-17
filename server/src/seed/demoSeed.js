import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Exam from '../models/Exam.js';
import ExamSession from '../models/ExamSession.js';
import Center from '../models/Center.js';
import Booking from '../models/Booking.js';
import Bus from '../models/Bus.js';
import { computeFare } from '../utils/fare.js';
import { assignStop } from '../services/stopService.js';
import { seatsOf } from '../services/clustering.js';
import { formatIst } from '../utils/time.js';

/**
 * Creates demo students with PAID bookings for the first JEE sitting, so the
 * routing engine has something to work with. Run AFTER `npm run seed`.
 *
 * The Jaipur cohort is deliberately sized to exceed one bus. With the default
 * BUS_CAPACITY of 40 it needs around 55 seats, which forces the capacity
 * repair step in the clustering service to split it into two buses — the
 * behaviour that used to be broken, now visible on screen instead of taken on
 * trust.
 */

// Deterministic PRNG (mulberry32) so every run of the demo produces the same
// students, the same routes, and therefore the same screenshots.
function makeRandom(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'Aarav', 'Isha', 'Rohan', 'Priya', 'Kabir', 'Ananya', 'Vivaan', 'Diya',
  'Arjun', 'Meera', 'Kartik', 'Sara', 'Aditya', 'Nisha', 'Yash', 'Riya',
  'Dev', 'Tanvi', 'Harsh', 'Pooja', 'Manav', 'Sneha', 'Raghav', 'Kavya',
];
const LAST = [
  'Sharma', 'Verma', 'Gupta', 'Meena', 'Jain', 'Rao', 'Singh', 'Agarwal',
  'Rathore', 'Choudhary', 'Bishnoi', 'Khan', 'Soni', 'Yadav',
];

// Feeder towns per exam centre: [town, [lng, lat], number of students]
const COHORTS = [
  {
    centerCity: 'Jaipur',
    towns: [
      ['Jaipur', [75.7873, 26.9124], 14],
      ['Sikar', [75.1398, 27.6094], 9],
      ['Dausa', [76.3344, 26.8894], 7],
      ['Alwar', [76.6100, 27.5530], 8],
    ],
  },
  {
    centerCity: 'Jodhpur',
    towns: [
      ['Jodhpur', [73.0243, 26.2389], 6],
      ['Bikaner', [73.3119, 28.0229], 5],
    ],
  },
];

async function demo() {
  await connectDB();

  // Drop any stale unique googleId index left over from the v1 schema.
  try {
    await User.collection.dropIndex('googleId_1');
  } catch {
    /* already gone — fine */
  }
  await User.syncIndexes();

  const exam = await Exam.findOne({ code: 'JEE' });
  if (!exam) {
    console.error('No JEE exam found. Run `npm run seed` first.');
    process.exit(1);
  }
  const session = await ExamSession.findOne({ exam: exam._id }).sort({
    date: 1,
    examStart: 1,
  });
  if (!session) {
    console.error('No JEE session found. Run `npm run seed` first.');
    process.exit(1);
  }

  const centers = await Center.find({ state: 'Rajasthan' });
  const centerByCity = Object.fromEntries(centers.map((c) => [c.city, c]));

  // Wipe previous demo data (emails are namespaced to @examroute.test).
  const oldUsers = await User.find({ email: /@examroute\.test$/ });
  await Booking.deleteMany({ user: { $in: oldUsers.map((u) => u._id) } });
  await User.deleteMany({ _id: { $in: oldUsers.map((u) => u._id) } });
  await Bus.deleteMany({ session: session._id });

  const random = makeRandom(20260803);
  const created = [];
  let index = 0;

  for (const cohort of COHORTS) {
    const center = centerByCity[cohort.centerCity];
    if (!center) continue;

    for (const [town, base, count] of cohort.towns) {
      for (let n = 0; n < count; n++) {
        // Scatter homes within roughly 8 km of the town centre so the
        // geofenced stop assignment has something real to decide.
        const coords = [
          base[0] + (random() - 0.5) * 0.14,
          base[1] + (random() - 0.5) * 0.14,
        ];

        // Most students travel alone; some bring a parent or two. This is what
        // makes seats exceed headcount and capacity actually bite.
        const roll = random();
        const companions = roll > 0.82 ? 2 : roll > 0.55 ? 1 : 0;
        const seats = 1 + companions;

        const name = `${FIRST[index % FIRST.length]} ${
          LAST[(index * 7 + 3) % LAST.length]
        }`;
        const email = `demo${index}@examroute.test`;

        const user = await User.create({
          name,
          email,
          authProvider: 'local',
          emailVerified: true,
          role: 'student',
          phone: `9${String(800000000 + index * 137)}`.slice(0, 10),
          homeLocation: { type: 'Point', coordinates: coords, address: town },
        });

        const { distanceKm, baseFare, subsidyPercent, fare } = computeFare(
          coords,
          center.location.coordinates,
          seats
        );
        const assigned = await assignStop(coords);

        const booking = await Booking.create({
          user: user._id,
          exam: exam._id,
          session: session._id,
          center: center._id,
          rollNumber: `2601${String(1000 + index)}`,
          homeLocation: { type: 'Point', coordinates: coords, address: town },
          companions,
          seats,
          distanceKm,
          baseFare,
          subsidyPercent,
          fare,
          status: 'paid',
          razorpayPaymentId: `mock_seed_${index}`,
          paidAt: new Date(),
          // Real tickets, so demo passengers can be scanned and boarded on the
          // conductor screen just like a live booking.
          ticketToken: crypto.randomBytes(24).toString('hex'),
          assignedStop: assigned
            ? { name: assigned.stop.name, coordinates: assigned.stop.location.coordinates }
            : undefined,
          stopDistanceKm: assigned?.distanceKm,
          stopEtaMin: assigned?.etaMin,
        });

        created.push({ centerCity: cohort.centerCity, booking });
        index++;
      }
    }
  }

  const capacity = Number(process.env.BUS_CAPACITY || 40);
  console.log(`\n✅ Created ${created.length} demo students, all PAID.\n`);
  for (const cohort of COHORTS) {
    const mine = created.filter((c) => c.centerCity === cohort.centerCity);
    const seats = seatsOf(mine.map((c) => c.booking));
    const busesNeeded = Math.ceil(seats / capacity);
    console.log(
      `   ${cohort.centerCity}: ${mine.length} students → ${seats} seats ` +
        `→ ${busesNeeded} bus(es) at capacity ${capacity}` +
        (busesNeeded > 1 ? '  ← capacity split will trigger here' : '')
    );
  }

  console.log(`\n   Exam: ${exam.name}`);
  console.log(`   Sitting: ${session.shiftLabel}`);
  console.log(`   Gate closes: ${formatIst(session.gateClose)} IST`);
  console.log(`   Reporting by: ${formatIst(session.reportingTime)} IST`);
  console.log(
    '\n   → Log in as your ADMIN_EMAIL account, open Admin, pick that sitting,\n' +
      '     and click "Run routing engine".\n'
  );

  await mongoose.disconnect();
  process.exit(0);
}

demo().catch((err) => {
  console.error('Demo seed error:', err);
  process.exit(1);
});

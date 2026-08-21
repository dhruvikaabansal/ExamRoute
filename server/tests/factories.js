import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Exam from '../src/models/Exam.js';
import ExamSession from '../src/models/ExamSession.js';
import Center from '../src/models/Center.js';
import Stop from '../src/models/Stop.js';
import Booking from '../src/models/Booking.js';
import { computeFare } from '../src/utils/fare.js';
import { istDate, addDays } from '../src/utils/time.js';

/** Shared fixtures so each test states only what it actually cares about. */

export const JAIPUR = [75.7873, 26.9124];
export const SIKAR = [75.1398, 27.6094];
export const BIKANER = [73.3119, 28.0229];

export async function makeUser({ role = 'student', email, password = 'password123' } = {}) {
  const address = email || `u${crypto.randomBytes(4).toString('hex')}@examroute.test`;
  return User.create({
    name: 'Test User',
    email: address,
    authProvider: 'local',
    passwordHash: await bcrypt.hash(password, 4),
    emailVerified: true,
    role,
  });
}

export async function makeCenter({ city = 'Jaipur', coordinates = JAIPUR, state = 'Rajasthan' } = {}) {
  return Center.create({
    name: `${city} Exam Centre`,
    city,
    state,
    location: { type: 'Point', coordinates },
  });
}

export async function makeStops(places = [['Jaipur', JAIPUR], ['Sikar', SIKAR], ['Bikaner', BIKANER]]) {
  return Stop.insertMany(
    places.map(([city, coordinates]) => ({
      name: `${city} Railway Station`,
      city,
      state: 'Rajasthan',
      location: { type: 'Point', coordinates },
    }))
  );
}

/**
 * An exam with one sitting. `daysAway` controls whether booking is open;
 * pass a negative number to build a sitting that has already happened.
 */
export async function makeExamWithSession({
  code = 'JEE',
  state = 'Rajasthan',
  daysAway = 21,
  startHour = 9,
  deadlineDaysAway = daysAway - 3,
} = {}) {
  const exam = await Exam.create({
    name: `${code} 2026`,
    code,
    state,
    multiShift: true,
    bookingDeadline: addDays(new Date(), deadlineDaysAway),
  });

  const day = addDays(new Date(), daysAway);
  const examStart = istDate(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    startHour,
    0
  );

  const session = await ExamSession.create({
    exam: exam._id,
    date: examStart,
    shiftLabel: `Shift 1 (${startHour} AM)`,
    examStart,
    gateClose: new Date(examStart.getTime() - 30 * 60_000),
    reportingTime: new Date(examStart.getTime() - 120 * 60_000),
  });

  return { exam, session };
}

/**
 * A paid booking, i.e. one the routing engine will pick up.
 *
 * A paid booking always carries the payment id that paid for it — every real
 * path through the app sets one, from mockConfirm or from verifyPayment. The
 * factory has to do the same, or tests inherit a state the application can
 * never actually produce: a booking marked `paid` with nothing to refund.
 */
export async function makePaidBooking({
  user,
  exam,
  session,
  center,
  coordinates,
  companions = 0,
  status = 'paid',
}) {
  const seats = 1 + companions;
  const { distanceKm, baseFare, subsidyPercent, fare } = computeFare(
    coordinates,
    center.location.coordinates,
    seats
  );
  const settled = ['paid', 'assigned'].includes(status);
  return Booking.create({
    user: user._id,
    exam: exam._id,
    session: session._id,
    center: center._id,
    rollNumber: '2601000123',
    homeLocation: { type: 'Point', coordinates },
    companions,
    seats,
    distanceKm,
    baseFare,
    subsidyPercent,
    fare,
    status,
    razorpayPaymentId: settled ? `mock_${crypto.randomBytes(6).toString('hex')}` : undefined,
    paidAt: settled ? new Date() : undefined,
    ticketToken: crypto.randomBytes(24).toString('hex'),
  });
}

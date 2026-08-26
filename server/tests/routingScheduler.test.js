import './env.js';
import { describe, it, expect } from 'vitest';
import { dbReady } from './db.js';
import Booking from '../src/models/Booking.js';
import Bus from '../src/models/Bus.js';
import Exam from '../src/models/Exam.js';
import {
  sessionsDueForRouting,
  attachLateBookings,
  sweepRouting,
} from '../src/services/routingScheduler.js';
import { runRoutingForSession } from '../src/services/routingEngine.js';
import {
  makeUser,
  makeCenter,
  makeStops,
  makeExamWithSession,
  makePaidBooking,
  JAIPUR,
  SIKAR,
} from './factories.js';

/**
 * Routing without a human.
 *
 * The batch itself is not the thing being tested here — that is
 * routingEngine.test.js. This covers the question "who decides when it runs,
 * and what happens to everything that arrives afterwards", which is where the
 * awkward cases live.
 */

const silent = { log: () => {}, error: () => {} };

async function closedBookingWindow(overrides = {}) {
  const { exam, session } = await makeExamWithSession(overrides);
  // Push the booking deadline into the past so the sitting is due, while the
  // sitting itself stays in the future.
  await Exam.findByIdAndUpdate(exam._id, { bookingDeadline: new Date(Date.now() - 60_000) });
  return { exam, session };
}

describe.skipIf(!dbReady)('routing scheduler', () => {
  it('leaves a sitting alone while its booking window is still open', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession(); // deadline in the future
    await makePaidBooking({
      user: await makeUser(),
      exam,
      session,
      center,
      coordinates: SIKAR,
    });

    const due = await sessionsDueForRouting();
    expect(due.map(String)).not.toContain(String(session._id));
  });

  it('picks up a sitting once bookings have closed and someone has paid', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await closedBookingWindow();
    await makePaidBooking({
      user: await makeUser(),
      exam,
      session,
      center,
      coordinates: SIKAR,
    });

    const due = await sessionsDueForRouting();
    expect(due.map(String)).toContain(String(session._id));
  });

  it('does not keep re-routing a sitting where everyone is already on a bus', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await closedBookingWindow();
    await makePaidBooking({
      user: await makeUser(),
      exam,
      session,
      center,
      coordinates: SIKAR,
    });

    await sweepRouting(silent);
    // Everyone is 'assigned' now, so there is nothing left to do.
    const due = await sessionsDueForRouting();
    expect(due.map(String)).not.toContain(String(session._id));
  });

  it('routes a closed sitting end to end with nobody pressing anything', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await closedBookingWindow();
    for (const coords of [SIKAR, JAIPUR, [75.79, 26.92]]) {
      await makePaidBooking({
        user: await makeUser(),
        exam,
        session,
        center,
        coordinates: coords,
      });
    }

    await sweepRouting(silent);

    const buses = await Bus.find({ session: session._id });
    expect(buses.length).toBeGreaterThan(0);
    const bookings = await Booking.find({ session: session._id });
    expect(bookings.every((b) => b.status === 'assigned')).toBe(true);
  });

  /*
    The case the whole design turns on. A student who pays after routing must
    not cost the forty people already on that bus their pickup times — those
    were published, and some of them have arranged how they are getting to the
    stop. So a late booking may only join a bus that already goes where they
    are.
  */
  it('attaches a late payment without moving anyone else’s pickup time', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await closedBookingWindow();

    const early = await makePaidBooking({
      user: await makeUser(),
      exam,
      session,
      center,
      coordinates: SIKAR,
    });
    await runRoutingForSession(session._id);

    const before = await Booking.findById(early._id);
    const busBefore = await Bus.findById(before.bus);
    const routeBefore = JSON.stringify(busBefore.route);

    // Same town, paid after the buses were formed.
    const late = await makePaidBooking({
      user: await makeUser(),
      exam,
      session,
      center,
      coordinates: SIKAR,
    });

    const { attached } = await attachLateBookings(session._id);
    expect(attached).toBe(1);

    const placed = await Booking.findById(late._id);
    expect(placed.status).toBe('assigned');
    expect(String(placed.bus)).toBe(String(before.bus));
    expect(placed.pickupTime).toBeTruthy();

    // Nothing moved for the person who was already on it.
    const after = await Booking.findById(early._id);
    expect(after.pickupTime.getTime()).toBe(before.pickupTime.getTime());
    const busAfter = await Bus.findById(before.bus);
    expect(JSON.stringify(busAfter.route)).toBe(routeBefore);
    expect(busAfter.seatsUsed).toBe(busBefore.seatsUsed + placed.seats);
  });

  it('reports a late booking it cannot place rather than forcing it on', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await closedBookingWindow();

    await makePaidBooking({
      user: await makeUser(),
      exam,
      session,
      center,
      coordinates: SIKAR,
    });
    await runRoutingForSession(session._id);

    // A town nowhere near any stop on the formed route.
    const late = await makePaidBooking({
      user: await makeUser(),
      exam,
      session,
      center,
      coordinates: [73.3119, 28.0229], // Bikaner
    });

    const { attached, unplaceable } = await attachLateBookings(session._id);
    expect(attached).toBe(0);
    expect(unplaceable).toHaveLength(1);

    // Left paid, not silently assigned to a bus that does not go there.
    expect((await Booking.findById(late._id)).status).toBe('paid');
  });
});

describe.skipIf(!dbReady)('routing lock', () => {
  /*
    Routing deletes a sitting's buses and rebuilds them. Two overlapping runs
    interleave a delete with a create, and can leave bookings pointing at a bus
    that no longer exists. Exactly one of two racing callers must win.
  */
  it('lets only one of two simultaneous runs proceed', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();
    for (const coords of [SIKAR, JAIPUR]) {
      await makePaidBooking({
        user: await makeUser(),
        exam,
        session,
        center,
        coordinates: coords,
      });
    }

    const results = await Promise.allSettled([
      runRoutingForSession(session._id),
      runRoutingForSession(session._id),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].reason.status).toBe(409);

    // And the sitting is left consistent, not half-rebuilt.
    const bookings = await Booking.find({ session: session._id });
    const busIds = await Bus.find({ session: session._id }).distinct('_id');
    const ids = busIds.map(String);
    expect(bookings.every((b) => ids.includes(String(b.bus)))).toBe(true);
  });

  it('releases the lock so the next run can proceed', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();
    await makePaidBooking({
      user: await makeUser(),
      exam,
      session,
      center,
      coordinates: SIKAR,
    });

    await runRoutingForSession(session._id);
    // Would throw 409 if the lock were still held.
    await expect(runRoutingForSession(session._id)).resolves.toBeTruthy();
  });
});

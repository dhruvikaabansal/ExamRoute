import { describe, it, expect } from 'vitest';
import { dbReady } from './db.js';
import Bus from '../src/models/Bus.js';
import Booking from '../src/models/Booking.js';
import {
  runRoutingForSession,
  computeArrivalTarget,
  buildSchedule,
} from '../src/services/routingEngine.js';
import { istDate, addMinutes } from '../src/utils/time.js';
import {
  makeUser,
  makeCenter,
  makeStops,
  makeExamWithSession,
  makePaidBooking,
  JAIPUR,
  SIKAR,
} from './factories.js';

describe('arrival target', () => {
  const session = {
    gateClose: istDate(2026, 0, 24, 8, 30),
    reportingTime: istDate(2026, 0, 24, 7, 0),
  };

  it('aims for the official reporting time when it is the tighter constraint', () => {
    // reporting 07:00 vs gate-close-minus-buffer 07:30 → reporting wins.
    expect(computeArrivalTarget(session, 60).toISOString()).toBe(
      session.reportingTime.toISOString()
    );
  });

  it('never plans later than gate close minus the safety buffer', () => {
    const lateReporting = {
      gateClose: session.gateClose,
      reportingTime: istDate(2026, 0, 24, 8, 20), // 10 min before the gate shuts
    };
    const target = computeArrivalTarget(lateReporting, 60);
    expect(target.getTime()).toBe(session.gateClose.getTime() - 60 * 60_000);
  });

  it('falls back to the buffer when no reporting time exists', () => {
    const target = computeArrivalTarget({ gateClose: session.gateClose }, 45);
    expect(target.getTime()).toBe(session.gateClose.getTime() - 45 * 60_000);
  });
});

describe('schedule construction', () => {
  it('spaces pickups by cumulative leg durations', () => {
    const departure = istDate(2026, 0, 24, 4, 0);
    const stops = [
      { name: 'A', coordinates: [75, 26] },
      { name: 'B', coordinates: [75.5, 26.5] },
      { name: 'C', coordinates: [76, 27] },
    ];
    const schedule = buildSchedule(stops, [30, 45, 20], departure);

    expect(schedule[0].pickupTime.getTime()).toBe(departure.getTime());
    expect(schedule[1].pickupTime.getTime()).toBe(addMinutes(departure, 30).getTime());
    expect(schedule[2].pickupTime.getTime()).toBe(addMinutes(departure, 75).getTime());
  });
});

describe.skipIf(!dbReady)('runRoutingForSession', () => {
  async function scenario({ students, companionsFor = () => 0, capacity = '40' }) {
    process.env.BUS_CAPACITY = capacity;
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();

    for (let i = 0; i < students.length; i++) {
      const user = await makeUser();
      await makePaidBooking({
        user,
        exam,
        session,
        center,
        coordinates: students[i],
        companions: companionsFor(i),
      });
    }
    return { exam, session, center };
  }

  it('creates a bus, assigns passengers and schedules pickups', async () => {
    const { session } = await scenario({
      students: [JAIPUR, [75.79, 26.92], SIKAR],
    });

    const { buses } = await runRoutingForSession(session._id);
    expect(buses).toHaveLength(1);

    const bus = buses[0];
    expect(bus.seatsUsed).toBe(3);
    expect(bus.route.length).toBeGreaterThan(0);
    expect(bus.departureTime.getTime()).toBeLessThan(bus.arrivalTime.getTime());
    expect(bus.driverToken).toMatch(/^[a-f0-9]{48}$/);

    const bookings = await Booking.find({ session: session._id });
    expect(bookings.every((b) => b.status === 'assigned')).toBe(true);
    expect(bookings.every((b) => b.pickupTime)).toBe(true);
    expect(bookings.every((b) => b.assignedStop?.name)).toBe(true);
  });

  it('arrives by the planned target and departs early enough to make it', async () => {
    const { session } = await scenario({ students: [SIKAR, [75.15, 27.61]] });
    const { buses } = await runRoutingForSession(session._id);
    const bus = buses[0];

    const target = computeArrivalTarget(session, 60);
    expect(bus.arrivalTime.getTime()).toBe(target.getTime());
    expect(bus.arrivalTime.getTime()).toBeLessThan(new Date(session.gateClose).getTime());
    expect(bus.departureTime.getTime()).toBe(
      target.getTime() - bus.totalDurationMin * 60_000
    );
  });

  it('never overfills a bus — the bug this replaced', async () => {
    // 30 students each bringing two companions: 90 seats, capacity 40.
    const students = Array.from({ length: 30 }, (_, i) => [
      JAIPUR[0] + (i % 6) * 0.01,
      JAIPUR[1] + (i % 5) * 0.01,
    ]);
    const { session } = await scenario({ students, companionsFor: () => 2 });

    const { buses } = await runRoutingForSession(session._id);

    expect(buses.length).toBeGreaterThanOrEqual(3);
    for (const bus of buses) expect(bus.seatsUsed).toBeLessThanOrEqual(bus.capacity);
    expect(buses.reduce((n, b) => n + b.seatsUsed, 0)).toBe(90);
  });

  it('assigns every paid passenger to exactly one bus', async () => {
    const students = Array.from({ length: 25 }, (_, i) => [
      JAIPUR[0] + (i % 5) * 0.02,
      JAIPUR[1] + (i % 4) * 0.02,
    ]);
    const { session } = await scenario({
      students,
      companionsFor: (i) => (i % 3 === 0 ? 2 : 0),
    });

    const { buses } = await runRoutingForSession(session._id);
    const assigned = await Booking.find({ session: session._id, status: 'assigned' });

    expect(assigned).toHaveLength(25);
    const passengerIds = buses.flatMap((b) => b.passengers.map(String));
    expect(new Set(passengerIds).size).toBe(25);
  });

  it('is idempotent — re-running rebuilds cleanly with no orphans', async () => {
    const { session } = await scenario({ students: [JAIPUR, SIKAR, [75.79, 26.92]] });

    const first = await runRoutingForSession(session._id);
    const second = await runRoutingForSession(session._id);

    const liveBusIds = new Set((await Bus.find({ session: session._id })).map((b) => String(b._id)));
    expect(liveBusIds.size).toBe(second.buses.length);

    // No booking may still point at a bus deleted by the second run.
    const bookings = await Booking.find({ session: session._id });
    for (const b of bookings) expect(liveBusIds.has(String(b.bus))).toBe(true);
    expect(first.buses.length).toBe(second.buses.length);
  });

  it('ignores unpaid and cancelled bookings', async () => {
    await makeStops();
    const center = await makeCenter();
    const { exam, session } = await makeExamWithSession();

    await makePaidBooking({
      user: await makeUser(), exam, session, center, coordinates: JAIPUR, status: 'paid',
    });
    await makePaidBooking({
      user: await makeUser(), exam, session, center, coordinates: SIKAR, status: 'pending',
    });
    await makePaidBooking({
      user: await makeUser(), exam, session, center, coordinates: SIKAR, status: 'cancelled',
    });

    const { buses } = await runRoutingForSession(session._id);
    expect(buses).toHaveLength(1);
    expect(buses[0].seatsUsed).toBe(1);
  });

  it('reports no buses rather than failing when nobody has paid', async () => {
    await makeStops();
    await makeCenter();
    const { session } = await makeExamWithSession();

    const { buses } = await runRoutingForSession(session._id);
    expect(buses).toEqual([]);
  });

  it('flags an overnight departure instead of showing a confusing date', async () => {
    // A cohort far enough away that the drive starts the previous evening.
    process.env.BUS_CAPACITY = '40';
    await makeStops([['Bikaner', [73.3119, 28.0229]]]);
    const center = await makeCenter({ city: 'Udaipur', coordinates: [73.7125, 24.5854] });
    const { exam, session } = await makeExamWithSession({ startHour: 9 });

    await makePaidBooking({
      user: await makeUser(), exam, session, center, coordinates: [73.3119, 28.0229],
    });

    const { buses } = await runRoutingForSession(session._id);
    const bus = buses[0];
    expect(bus.totalDurationMin).toBeGreaterThan(200);
    expect(bus.isOvernight).toBe(true);
  });
});

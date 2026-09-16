import Exam from '../models/Exam.js';
import ExamSession from '../models/ExamSession.js';
import Booking from '../models/Booking.js';
import Bus from '../models/Bus.js';
import { runRoutingForSession } from './routingEngine.js';
import { assignStop } from './stopService.js';

/**
 * Routing without anyone pressing a button.
 *
 * The honest criticism of the first version was not that routing ran in a
 * batch — that part is forced by the problem. You cannot pool students who
 * have not booked yet, and assigning a bus the moment someone pays would make
 * bus 1 "the first forty people who clicked", which is a chronological group,
 * not a geographic one. The corridors that make the routes short only exist if
 * you can see the whole cohort at once.
 *
 * The criticism was that the batch was triggered by a *person*. It should be
 * triggered by a *time*: the booking deadline, which is already in the data.
 * That is what this does. The admin button stays, as an override.
 */

/**
 * Sittings that should be routed now.
 *
 * Due means three things at once: the booking window has closed, the exam has
 * not yet happened, and somebody has paid who is not on a bus. That last
 * condition is what makes this self-correcting rather than a one-shot — a
 * payment that lands after the first run leaves a booking in `paid` rather
 * than `assigned`, so the sitting simply becomes due again.
 */
export async function sessionsDueForRouting(now = new Date()) {
  const closedExams = await Exam.find({ bookingDeadline: { $lt: now } }).select('_id').lean();
  if (closedExams.length === 0) return [];

  const sessions = await ExamSession.find({
    exam: { $in: closedExams.map((e) => e._id) },
    gateClose: { $gt: now }, // still in the future; a past sitting is history
  })
    .select('_id')
    .lean();
  if (sessions.length === 0) return [];

  // One grouped query rather than one per sitting — this runs on a timer, and
  // a query per sitting per sweep is a lot of round trips for a null result.
  const waiting = await Booking.aggregate([
    { $match: { session: { $in: sessions.map((s) => s._id) }, status: 'paid' } },
    { $group: { _id: '$session' } },
  ]);

  return waiting.map((w) => w._id);
}

/**
 * Releases seats that were reserved and never paid for.
 *
 * A `pending` booking holds a seat against the centre's capacity without
 * having bought it. Before the deadline that is correct — somebody is part way
 * through checkout. After it, the seat is simply missing from the pool: the
 * cohort routing is about to plan around is smaller than it should be, and the
 * student who could have taken it was told the centre was full.
 *
 * Cancelling rather than deleting, because the row is still the record of
 * something that happened, and `refundStatus: 'none'` is the truthful state —
 * no money ever moved, so none is owed.
 *
 * This runs before routing in the sweep, so the engine never sees a seat that
 * nobody bought.
 */
export async function releaseUnpaidBookings(now = new Date()) {
  const closedExams = await Exam.find({ bookingDeadline: { $lt: now } }).select('_id').lean();
  if (closedExams.length === 0) return { released: 0 };

  const result = await Booking.updateMany(
    { exam: { $in: closedExams.map((e) => e._id) }, status: 'pending' },
    {
      $set: {
        status: 'cancelled',
        refundStatus: 'none',
        cancelReason: 'Not paid before the booking deadline',
      },
      $unset: { bus: '', pickupTime: '', boardBy: '' },
    }
  );

  return { released: result.modifiedCount ?? 0 };
}

/**
 * Adds bookings paid after routing to buses that already serve their stop.
 *
 * The alternative — re-running the whole sitting — produces better routes and
 * is the wrong thing to do. Once students have been told "be at Sikar bus
 * stand at 04:40", that is a promise. Re-clustering to accommodate one late
 * payment can move forty other people's pickup times, and some of them will
 * have already arranged how they are getting to the stop.
 *
 * So a late booking is only attached where it costs nobody anything: a bus
 * that already stops where they are, and has the seats. No stop is added, no
 * leg changes, no published time moves.
 *
 * Anyone who does not fit is left in `paid` and reported. That is a real
 * decision — put on another bus, or add a stop and delay everyone aboard —
 * and it belongs to whoever is running the operation, not to a scheduler.
 */
export async function attachLateBookings(sessionId) {
  const buses = await Bus.find({ session: sessionId });
  if (buses.length === 0) return { attached: 0, unplaceable: [] };

  const waiting = await Booking.find({ session: sessionId, status: 'paid' });
  if (waiting.length === 0) return { attached: 0, unplaceable: [] };

  let attached = 0;
  const unplaceable = [];

  for (const booking of waiting) {
    const assigned = await assignStop(booking.homeLocation.coordinates);
    if (!assigned) {
      unplaceable.push({ bookingId: String(booking._id), reason: 'No pickup stop found' });
      continue;
    }

    const seats = booking.seats || 1;
    const stopName = assigned.stop.name;

    // Only buses going to this student's centre, already visiting their stop,
    // with room. Fullest-first, so spare capacity stays consolidated rather
    // than being scattered a seat at a time across every bus.
    const candidate = buses
      .filter(
        (bus) =>
          String(bus.center) === String(booking.center) &&
          bus.seatsUsed + seats <= bus.capacity &&
          (bus.route || []).some((s) => s.name === stopName)
      )
      .sort((a, b) => b.seatsUsed - a.seatsUsed)[0];

    if (!candidate) {
      unplaceable.push({
        bookingId: String(booking._id),
        reason: `No bus with room already stopping at ${stopName}`,
      });
      continue;
    }

    const stop = candidate.route.find((s) => s.name === stopName);

    booking.bus = candidate._id;
    booking.status = 'assigned';
    booking.pickupTime = stop.pickupTime;
    booking.boardBy = stop.boardBy ?? stop.pickupTime;
    booking.assignedStop = { name: stopName, coordinates: assigned.stop.location.coordinates };
    booking.stopDistanceKm = assigned.distanceKm;
    booking.stopEtaMin = assigned.etaMin;
    booking.stopInsideZone = assigned.insideZone ?? false;
    await booking.save();

    candidate.passengers.push(booking._id);
    candidate.seatsUsed += seats;
    await candidate.save();

    attached += 1;
  }

  return { attached, unplaceable };
}

/**
 * One pass: route what has never been routed, top up what has.
 *
 * The two cases are genuinely different. A sitting with no buses has nothing
 * to disturb, so it gets the full clustering and the best routes available.
 * A sitting that already has buses has published times, so it only gets
 * additions that change nothing for anyone already on board.
 */
export async function sweepRouting({ log = console } = {}) {
  /*
    Unpaid seats go back in the pool first, so routing plans around the cohort
    that actually exists rather than one padded with abandoned checkouts.
  */
  const { released } = await releaseUnpaidBookings();
  if (released) log.log?.(`Routing: released ${released} unpaid booking(s) past their deadline`);

  const due = await sessionsDueForRouting();
  const results = [];

  for (const sessionId of due) {
    try {
      const hasBuses = await Bus.exists({ session: sessionId });

      if (!hasBuses) {
        const { buses } = await runRoutingForSession(sessionId);
        const seats = buses.reduce((n, b) => n + (b.seatsUsed || 0), 0);
        results.push({ sessionId, routed: buses.length, seats });
        log.log?.(
          `Routing: formed ${buses.length} bus(es) for ${seats} seat(s) on sitting ${sessionId}`
        );
        continue;
      }

      const { attached, unplaceable } = await attachLateBookings(sessionId);
      if (attached || unplaceable.length) {
        results.push({ sessionId, attached, unplaceable: unplaceable.length });
        log.log?.(
          `Routing: attached ${attached} late booking(s) to sitting ${sessionId}` +
            (unplaceable.length ? `, ${unplaceable.length} need a decision` : '')
        );
      }
    } catch (err) {
      /*
        One sitting failing must not stop the others. A conflict here is
        expected and boring — it means an admin is routing that sitting by
        hand right now, and the sweep will find it again next time.
      */
      if (err.status !== 409) log.error?.(`Routing sweep failed for ${sessionId}:`, err.message);
    }
  }

  return results;
}

/**
 * Starts the timer.
 *
 * A worth-knowing limitation: this runs inside the API process, so on a free
 * tier that sleeps when idle, the timer sleeps too. The sweep therefore also
 * runs at boot, and any request wakes the process — which in practice means a
 * sitting is routed the first time anyone visits after its deadline, rather
 * than at the exact minute. A production deployment would move this to a
 * worker or a scheduled job; doing that here would mean running a second
 * service for one function.
 */
export function startRoutingScheduler({ log = console } = {}) {
  const minutes = Number(process.env.ROUTING_SWEEP_MINUTES || 5);
  if (minutes <= 0) {
    log.log?.('Routing scheduler disabled (ROUTING_SWEEP_MINUTES=0)');
    return null;
  }

  const run = () => sweepRouting({ log }).catch((err) => log.error?.('Routing sweep:', err.message));

  run();
  const timer = setInterval(run, minutes * 60 * 1000);
  // Do not hold the process open on this alone.
  timer.unref?.();
  log.log?.(`Routing scheduler running every ${minutes} min`);
  return timer;
}

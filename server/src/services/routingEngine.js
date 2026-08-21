import crypto from 'crypto';
import Booking from '../models/Booking.js';
import Bus from '../models/Bus.js';
import ExamSession from '../models/ExamSession.js';
import Center from '../models/Center.js';
import { optimizeRoute } from './mapsService.js';
import { assignStop } from './stopService.js';
import { clusterByCapacity, seatsOf } from './clustering.js';
import { addMinutes, isDifferentIstDay } from '../utils/time.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Turns paid bookings into buses with ordered stops and timed pickups.
 *
 * For one session (a specific exam date + shift), per exam centre:
 *   1. CLUSTER — group paid students into buses that each fit within seat
 *      capacity (see services/clustering.js).
 *   2. SNAP    — map each student to a pickup stop using the *same*
 *      geofenced lookup used at booking time, so the stop shown on the
 *      confirmation screen never silently changes.
 *   3. ORDER   — hand the stops to Directions with optimize:true, which
 *      returns the optimal visiting order plus per-leg durations.
 *   4. TIME    — work backwards from the arrival target to a departure time
 *      and a pickup time per stop.
 *
 * We deliberately do not solve Vehicle Routing from scratch: it is NP-hard,
 * and clustering plus delegating stop order to Directions is correct,
 * explainable, and good enough at this scale.
 */

/**
 * When the bus should be at the centre.
 *
 * Two constraints, and we honour the tighter one:
 *   - `reportingTime` is the officially recommended arrival (typically ~2h
 *     before the paper). This is what we aim for.
 *   - `gateClose` is the hard deadline; missing it means missing the exam.
 *     We keep a safety buffer behind it and never plan later than that.
 *
 * The previous version only used `gateClose - buffer`, which had students
 * arriving 30 minutes before the gate shut while the seeded `reportingTime`
 * sat unused — planning to the deadline rather than to the recommendation.
 */
export function computeArrivalTarget(session, bufferMin) {
  const latestSafe = addMinutes(new Date(session.gateClose), -bufferMin);
  const recommended = session.reportingTime ? new Date(session.reportingTime) : null;
  if (!recommended) return latestSafe;
  return recommended.getTime() < latestSafe.getTime() ? recommended : latestSafe;
}

/** Builds the per-stop schedule for a route, working forward from departure. */
export function buildSchedule(orderedStops, legsMin, departureTime) {
  let cumulative = 0;
  return orderedStops.map((stop, i) => {
    const pickupTime = addMinutes(departureTime, cumulative);
    cumulative += legsMin[i] || 0;
    return { name: stop.name, coordinates: stop.coordinates, pickupTime };
  });
}

/**
 * Runs routing for ONE session. Idempotent: re-running fully rebuilds the
 * buses for that session and resets any previously assigned bookings first,
 * so a second click on the admin page cannot leave bookings pointing at a
 * bus that no longer exists.
 */
export async function runRoutingForSession(sessionId) {
  const session = await ExamSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Session not found');

  const capacity = Number(process.env.BUS_CAPACITY || 40);
  const bufferMin = Number(process.env.SAFETY_BUFFER_MIN || 60);

  // Clean slate — drop old buses and un-assign their passengers.
  await Bus.deleteMany({ session: sessionId });
  await Booking.updateMany(
    { session: sessionId, status: 'assigned' },
    { $set: { status: 'paid' }, $unset: { bus: '', pickupTime: '' } }
  );

  const arrivalTime = computeArrivalTarget(session, bufferMin);
  const centers = await Center.find({});
  const buses = [];
  const warnings = [];

  for (const center of centers) {
    const bookings = await Booking.find({
      session: sessionId,
      center: center._id,
      status: { $in: ['paid', 'assigned'] },
    });
    if (bookings.length === 0) continue;

    // Snap every student to a stop using the shared geofenced lookup.
    // One indexed $near per booking — a few dozen queries per centre, which
    // is trivially fast and worth it to keep a single stop-assignment rule.
    const stopAssignments = await Promise.all(
      bookings.map((b) => assignStop(b.homeLocation.coordinates))
    );

    const routable = [];
    bookings.forEach((booking, i) => {
      const assigned = stopAssignments[i];
      if (!assigned) {
        warnings.push(`No pickup stop found for booking ${booking._id}`);
        return;
      }
      booking._stop = assigned.stop;
      booking._stopDistanceKm = assigned.distanceKm;
      booking._stopEtaMin = assigned.etaMin;
      routable.push(booking);
    });
    if (routable.length === 0) continue;

    // The centre is passed so clustering can also try the sweep strategy and
    // pick whichever actually drives shorter — see services/clustering.js.
    const clusters = clusterByCapacity(routable, capacity, center.location.coordinates);

    let busIndex = 1;
    for (const clusterBookings of clusters) {
      // Distinct stops for this bus (several students share one stop).
      const stopMap = new Map();
      for (const b of clusterBookings) stopMap.set(String(b._stop._id), b._stop);
      const clusterStops = [...stopMap.values()].map((s) => ({
        name: s.name,
        coordinates: s.location.coordinates,
      }));

      const { order, legsMin, totalMin } = await optimizeRoute(
        clusterStops,
        center.location.coordinates
      );

      const departureTime = addMinutes(arrivalTime, -totalMin);
      const route = buildSchedule(order, legsMin, departureTime);

      const bus = await Bus.create({
        exam: session.exam,
        session: sessionId,
        center: center._id,
        label: `${center.city} - Bus ${busIndex}`,
        capacity,
        seatsUsed: seatsOf(clusterBookings),
        route,
        departureTime,
        arrivalTime,
        totalDurationMin: totalMin,
        // Long routes from far towns leave the night before. Flagging it means
        // the student sees "departs Thu 11:40 PM" as a deliberate fact rather
        // than a date that looks like a bug.
        isOvernight: isDifferentIstDay(departureTime, arrivalTime),
        driverToken: crypto.randomBytes(24).toString('hex'),
        passengers: clusterBookings.map((b) => b._id),
      });

      // One round trip instead of a save() per passenger.
      const pickupByStop = new Map(route.map((r) => [r.name, r.pickupTime]));
      await Booking.bulkWrite(
        clusterBookings.map((b) => ({
          updateOne: {
            filter: { _id: b._id },
            update: {
              $set: {
                bus: bus._id,
                status: 'assigned',
                pickupTime: pickupByStop.get(b._stop.name) ?? departureTime,
                assignedStop: {
                  name: b._stop.name,
                  coordinates: b._stop.location.coordinates,
                },
                stopDistanceKm: b._stopDistanceKm,
                stopEtaMin: b._stopEtaMin,
              },
            },
          },
        }))
      );

      buses.push(bus);
      busIndex++;
    }
  }

  return { buses, warnings };
}

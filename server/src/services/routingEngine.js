import Booking from '../models/Booking.js';
import Bus from '../models/Bus.js';
import Stop from '../models/Stop.js';
import ExamSession from '../models/ExamSession.js';
import Center from '../models/Center.js';
import { optimizeRoute, haversineKm } from './mapsService.js';

// Simple k-means on [lng, lat]. k = number of buses. A few iterations is plenty
// for a few dozen students and easy to explain in a viva.
function kMeans(points, k, iterations = 10) {
  if (points.length <= k) return points.map((_, i) => i % k);
  let centroids = points.slice(0, k).map((p) => [...p]);
  const assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = haversineKm(points[i], centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      assignments[i] = best;
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2] += 1;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][2] > 0)
        centroids[c] = [sums[c][0] / sums[c][2], sums[c][1] / sums[c][2]];
    }
  }
  return assignments;
}

function nearestStop(homeCoords, stops) {
  let best = stops[0];
  let bestDist = Infinity;
  for (const s of stops) {
    const d = haversineKm(homeCoords, s.location.coordinates);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

const seatsOf = (bookings) => bookings.reduce((sum, b) => sum + (b.seats || 1), 0);

/**
 * Runs routing for ONE session (a specific date + shift):
 *   1. cluster paid students per center into buses (respecting SEAT capacity)
 *   2. snap each student to nearest known common stop
 *   3. order stops via Directions optimize + compute leg durations
 *   4. work backward from the exam GATE-CLOSE time (minus buffer) to get the
 *      departure time and each stop's pickup time (date-aware -> may be overnight)
 */
export async function runRoutingForSession(sessionId) {
  const session = await ExamSession.findById(sessionId);
  if (!session) throw new Error('Session not found');

  const capacity = Number(process.env.BUS_CAPACITY || 40);
  const bufferMin = Number(process.env.SAFETY_BUFFER_MIN || 60);

  await Bus.deleteMany({ session: sessionId });

  const centers = await Center.find({});
  const results = [];

  for (const center of centers) {
    const bookings = await Booking.find({
      session: sessionId,
      center: center._id,
      status: { $in: ['paid', 'assigned'] },
    });
    if (bookings.length === 0) continue;

    const stops = await Stop.find({});
    if (stops.length === 0) continue;

    const points = bookings.map((b) => b.homeLocation.coordinates);
    // k must be enough to fit total SEATS (companions count), not just headcount
    const totalSeats = seatsOf(bookings);
    const k = Math.max(1, Math.ceil(totalSeats / capacity));
    const assignments = kMeans(points, k);

    const clusters = Array.from({ length: k }, () => []);
    bookings.forEach((b, i) => clusters[assignments[i]].push(b));

    let busIndex = 1;
    for (const clusterBookings of clusters) {
      if (clusterBookings.length === 0) continue;

      // unique common stops for this cluster
      const stopMap = new Map();
      for (const b of clusterBookings) {
        const s = nearestStop(b.homeLocation.coordinates, stops);
        stopMap.set(String(s._id), s);
        b._assignedStop = s;
      }
      const clusterStops = [...stopMap.values()].map((s) => ({
        name: s.name,
        coordinates: s.location.coordinates,
      }));

      const { order, legsMin, totalMin } = await optimizeRoute(
        clusterStops,
        center.location.coordinates
      );

      // arrive by gateClose - buffer; departure = arrival - totalTravel
      const gateClose = new Date(session.gateClose).getTime();
      const arrivalTime = new Date(gateClose - bufferMin * 60000);
      const departureTime = new Date(arrivalTime.getTime() - totalMin * 60000);

      // per-stop pickup times, cumulative from departure
      let cumulative = 0;
      const routeWithTimes = order.map((stop, i) => {
        const pickup = new Date(departureTime.getTime() + cumulative * 60000);
        cumulative += legsMin[i] || 0;
        return { name: stop.name, coordinates: stop.coordinates, pickupTime: pickup };
      });

      const bus = await Bus.create({
        exam: session.exam,
        session: sessionId,
        center: center._id,
        label: `${center.city} - Bus ${busIndex}`,
        capacity,
        seatsUsed: seatsOf(clusterBookings),
        route: routeWithTimes,
        departureTime,
        arrivalTime,
        totalDurationMin: totalMin,
        passengers: clusterBookings.map((b) => b._id),
      });

      for (const b of clusterBookings) {
        const stopName = b._assignedStop.name;
        const match = routeWithTimes.find((r) => r.name === stopName);
        b.bus = bus._id;
        b.status = 'assigned';
        b.assignedStop = {
          name: stopName,
          coordinates: b._assignedStop.location.coordinates,
        };
        b.pickupTime = match ? match.pickupTime : departureTime;
        await b.save();
      }

      results.push(bus);
      busIndex++;
    }
  }

  return results;
}

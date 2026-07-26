import Booking from '../models/Booking.js';
import Bus from '../models/Bus.js';
import Stop from '../models/Stop.js';
import Exam from '../models/Exam.js';
import Center from '../models/Center.js';
import { optimizeRoute, haversineKm } from './mapsService.js';

/**
 * Simple k-means clustering on [lng, lat] points.
 * k = number of buses needed. Runs a handful of iterations — plenty for a
 * few dozen students and easy to explain in a viva.
 */
function kMeans(points, k, iterations = 10) {
  if (points.length <= k) return points.map((_, i) => i % k);

  // init centroids = first k points (deterministic, good enough)
  let centroids = points.slice(0, k).map((p) => [...p]);
  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    // assign
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
    // update
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2] += 1;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][2] > 0) {
        centroids[c] = [sums[c][0] / sums[c][2], sums[c][1] / sums[c][2]];
      }
    }
  }
  return assignments;
}

// Snap a home point to the nearest known pickup stop
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

/**
 * Main entry point. Runs routing for one exam:
 *   1. cluster paid students into buses (respecting capacity)
 *   2. snap each student to nearest known stop
 *   3. order stops via Directions optimize + compute timing
 *   4. persist Bus docs and update each Booking with bus/stop/pickupTime
 */
export async function runRoutingForExam(examId) {
  const exam = await Exam.findById(examId);
  if (!exam) throw new Error('Exam not found');

  const capacity = Number(process.env.BUS_CAPACITY || 40);
  const bufferMin = Number(process.env.SAFETY_BUFFER_MIN || 60);

  // clear any previous run
  await Bus.deleteMany({ exam: examId });

  const centers = await Center.find({});
  const results = [];

  // route per center independently
  for (const center of centers) {
    const bookings = await Booking.find({
      exam: examId,
      center: center._id,
      status: { $in: ['paid', 'assigned'] },
    });
    if (bookings.length === 0) continue;

    const stops = await Stop.find({ state: exam.state });
    if (stops.length === 0) continue;

    const points = bookings.map((b) => b.homeLocation.coordinates);
    const k = Math.ceil(bookings.length / capacity);
    const assignments = kMeans(points, k);

    // group bookings by cluster
    const clusters = Array.from({ length: k }, () => []);
    bookings.forEach((b, i) => clusters[assignments[i]].push(b));

    let busIndex = 1;
    for (const clusterBookings of clusters) {
      if (clusterBookings.length === 0) continue;

      // collect unique stops for this cluster
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

      // departure = reportingTime - totalTravel - buffer
      const reporting = new Date(exam.reportingTime).getTime();
      const departureTime = new Date(reporting - (totalMin + bufferMin) * 60000);

      // per-stop pickup times (cumulative from departure)
      let cumulative = 0;
      const routeWithTimes = order.map((stop, i) => {
        const pickup = new Date(departureTime.getTime() + cumulative * 60000);
        cumulative += legsMin[i] || 0;
        return { name: stop.name, coordinates: stop.coordinates, pickupTime: pickup };
      });

      const bus = await Bus.create({
        exam: examId,
        center: center._id,
        label: `${center.city} - Bus ${busIndex}`,
        capacity,
        route: routeWithTimes,
        departureTime,
        totalDurationMin: totalMin,
        passengers: clusterBookings.map((b) => b._id),
      });

      // update each booking with its stop + pickup time
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

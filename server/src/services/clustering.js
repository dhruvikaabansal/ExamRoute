import { haversineKm } from './mapsService.js';

/**
 * Capacity-aware geographic clustering.
 *
 * Plain k-means groups students by where they live, which is what we want for
 * a sensible bus route — but it says nothing about how many people land in
 * each group. Choosing `k = ceil(totalSeats / capacity)` only fixes the bus
 * *count*; the split can still be 55 seats in one cluster and 5 in the other,
 * so a "40-seater" gets assigned 55 passengers and nothing notices.
 *
 * So clustering runs in two phases:
 *
 *   1. SHAPE  — k-means (with farthest-point seeding) groups students
 *               geographically, so each bus drives a compact route.
 *   2. REPAIR — any cluster over capacity repeatedly gives up its most
 *               peripheral member (farthest from that cluster's centroid) to
 *               the nearest cluster that still has room. If no existing
 *               cluster has room, a new bus is opened.
 *
 * Phase 2 is what makes the capacity guarantee hard rather than hopeful:
 * every move strictly decreases total overflow, so it terminates, and the
 * post-condition is checked by an assertion before we return.
 *
 * Giving up the *peripheral* member matters — moving the student nearest the
 * centroid would tear a hole in the middle of an otherwise tight route.
 */

/** Seat demand of a group of bookings (a student plus any companions). */
export const seatsOf = (bookings) =>
  bookings.reduce((total, b) => total + (b.seats || 1), 0);

/**
 * Farthest-point seeding (the k-means++ idea, deterministic).
 *
 * The original code seeded with `points.slice(0, k)`. If the first k students
 * happen to live in the same town — very likely, since bookings arrive in
 * clumps — the initial centroids are nearly identical and k-means converges
 * to a poor local optimum. Picking each new seed as the point farthest from
 * everything chosen so far spreads them across the map and is reproducible
 * (no randomness) so the same input always produces the same routes.
 */
function seedCentroids(points, k) {
  const centroids = [points[0].slice()];
  while (centroids.length < k) {
    let best = null;
    let bestDist = -Infinity;
    for (const point of points) {
      const nearest = Math.min(...centroids.map((c) => haversineKm(point, c)));
      if (nearest > bestDist) {
        bestDist = nearest;
        best = point;
      }
    }
    centroids.push((best ?? points[0]).slice());
  }
  return centroids;
}

/** Standard Lloyd's-algorithm k-means over [lng, lat] points. */
export function kMeans(points, k, iterations = 25) {
  const clampedK = Math.max(1, Math.min(k, points.length));
  if (points.length === 0) return [];

  let centroids = seedCentroids(points, clampedK);
  const assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < clampedK; c++) {
        const d = haversineKm(points[i], centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignments[i] !== best) changed = true;
      assignments[i] = best;
    }

    const sums = Array.from({ length: clampedK }, () => [0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2] += 1;
    }
    for (let c = 0; c < clampedK; c++) {
      if (sums[c][2] > 0)
        centroids[c] = [sums[c][0] / sums[c][2], sums[c][1] / sums[c][2]];
    }

    if (!changed) break; // converged
  }

  return assignments;
}

function centroidOf(bookings) {
  if (bookings.length === 0) return [0, 0];
  let lng = 0;
  let lat = 0;
  for (const b of bookings) {
    lng += b.homeLocation.coordinates[0];
    lat += b.homeLocation.coordinates[1];
  }
  return [lng / bookings.length, lat / bookings.length];
}

/**
 * Groups bookings into clusters that each fit within `capacity` seats.
 *
 * Returns an array of booking arrays. Guarantees:
 *   - every returned cluster has `seatsOf(cluster) <= capacity`
 *   - no cluster is empty
 *   - every input booking appears exactly once
 */
export function clusterByCapacity(bookings, capacity) {
  if (bookings.length === 0) return [];
  if (!Number.isFinite(capacity) || capacity <= 0)
    throw new Error(`Invalid bus capacity: ${capacity}`);

  const oversized = bookings.find((b) => (b.seats || 1) > capacity);
  if (oversized)
    throw new Error(
      `Booking ${oversized._id} needs ${oversized.seats} seats but bus capacity is ${capacity}`
    );

  // Phase 1 — shape the routes geographically.
  const points = bookings.map((b) => b.homeLocation.coordinates);
  const k = Math.max(1, Math.ceil(seatsOf(bookings) / capacity));
  const assignments = kMeans(points, k);

  let clusters = Array.from({ length: Math.max(1, Math.min(k, points.length)) }, () => []);
  bookings.forEach((b, i) => clusters[assignments[i]].push(b));
  clusters = clusters.filter((c) => c.length > 0);

  // Phase 2 — repair overflow.
  // Each pass moves one passenger out of one over-full cluster. Total overflow
  // strictly decreases, so this cannot loop forever; the bound is a safety net.
  const maxMoves = bookings.length * 4 + 16;
  for (let move = 0; move < maxMoves; move++) {
    const overIndex = clusters.findIndex((c) => seatsOf(c) > capacity);
    if (overIndex === -1) break; // every cluster fits

    const over = clusters[overIndex];
    const centroid = centroidOf(over);

    // The most peripheral member is the cheapest one to give away.
    let evictIndex = 0;
    let evictDist = -Infinity;
    for (let i = 0; i < over.length; i++) {
      const d = haversineKm(over[i].homeLocation.coordinates, centroid);
      if (d > evictDist) {
        evictDist = d;
        evictIndex = i;
      }
    }
    const [evicted] = over.splice(evictIndex, 1);
    const evictedSeats = evicted.seats || 1;

    // Re-home it in the nearest cluster with enough room.
    let targetIndex = -1;
    let targetDist = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      if (i === overIndex || clusters[i].length === 0) continue;
      if (seatsOf(clusters[i]) + evictedSeats > capacity) continue;
      const d = haversineKm(evicted.homeLocation.coordinates, centroidOf(clusters[i]));
      if (d < targetDist) {
        targetDist = d;
        targetIndex = i;
      }
    }

    if (targetIndex === -1) {
      clusters.push([evicted]); // every bus is full — put another on the road
    } else {
      clusters[targetIndex].push(evicted);
    }
  }

  clusters = clusters.filter((c) => c.length > 0);

  // Post-condition. If this ever fires the routing is wrong and we would
  // rather fail loudly on the admin screen than print "55/40 seats".
  const stillOver = clusters.find((c) => seatsOf(c) > capacity);
  if (stillOver)
    throw new Error(
      `Capacity repair failed: cluster needs ${seatsOf(stillOver)} seats, capacity is ${capacity}`
    );

  const placed = clusters.reduce((n, c) => n + c.length, 0);
  if (placed !== bookings.length)
    throw new Error(`Clustering lost bookings: ${placed} placed of ${bookings.length}`);

  return clusters;
}

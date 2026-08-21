import { haversineKm, estimateTourKm } from './mapsService.js';

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

/**
 * The point a booking is actually collected from.
 *
 * Once the routing engine has snapped students to pickup stops, the stop is
 * what the bus drives to — two students in different villages sharing one bus
 * stand cost the route nothing extra. Clustering on home coordinates would
 * count them as separate places to visit. Falls back to the home location for
 * unit tests and any caller that clusters before snapping.
 */
function pointOf(booking) {
  return booking._stop?.location?.coordinates || booking.homeLocation.coordinates;
}

/** Compass angle of a point as seen from the exam centre, in radians. */
function bearingFrom(center, point) {
  // Longitude degrees shrink towards the poles; without the cosine correction
  // the angles are skewed and the wedges come out lopsided.
  const dx = (point[0] - center[0]) * Math.cos((center[1] * Math.PI) / 180);
  const dy = point[1] - center[1];
  return Math.atan2(dy, dx);
}

/**
 * The sweep algorithm — the classic construction heuristic for one depot and
 * many customers.
 *
 * Sort every student by the angle at which they sit around the exam centre,
 * then walk that circle cutting a new bus each time the next student would
 * not fit. Each bus ends up serving a wedge radiating out from the centre,
 * which is the shape a feeder route actually has.
 *
 * This is what k-means cannot express. K-means minimises distance to a
 * centroid, so it prefers round blobs — but the best possible bus route is a
 * corridor of students strung along one highway, which is a *high variance*
 * cluster and exactly what k-means tries to avoid.
 *
 * Where the sweep starts changes the answer, so every student is tried as the
 * starting angle and the caller scores the results.
 */
export function sweepCandidates(bookings, capacity, center) {
  /**
   * Students who live at the exam centre have no meaningful angle.
   *
   * A bearing is only informative once you are some distance out. In the
   * seeded Jaipur cohort, 22 of 59 seats belong to students living in Jaipur
   * itself — their bearings are essentially random noise, they scattered
   * across every wedge, and the capacity cuts landed in the wrong places. The
   * visible result was Alwar and Sikar, which lie in opposite directions,
   * sharing a bus.
   *
   * They are also the students it matters least about: every bus finishes at
   * the exam centre, so collecting someone who already lives there costs
   * almost nothing whichever bus does it. So they sit out the sweep and are
   * placed afterwards, into whichever bus has room.
   *
   * The threshold is relative — a tenth of the way out to the furthest
   * student — rather than a fixed number of kilometres, so it means the same
   * thing for a city cohort and a cohort spread across the state.
   */
  const measured = bookings.map((b) => ({
    booking: b,
    point: pointOf(b),
    km: haversineKm(pointOf(b), center),
  }));

  const furthestKm = measured.reduce((max, m) => Math.max(max, m.km), 0);
  const fillerLimit = furthestKm * 0.1;

  const fillers = measured.filter((m) => m.km <= fillerLimit).map((m) => m.booking);
  const outer = measured.filter((m) => m.km > fillerLimit);

  // Everybody lives at the centre: there is no angle to sweep by, so just
  // fill buses to capacity.
  if (outer.length === 0) return [chunkToCapacity(fillers, capacity)];

  const byAngle = outer
    .map((m) => ({ booking: m.booking, angle: bearingFrom(center, m.point) }))
    .sort((a, b) => a.angle - b.angle);

  const n = byAngle.length;
  const starts = new Set();
  // Every rotation for small cohorts; an even spread once that gets silly.
  const step = Math.max(1, Math.ceil(n / 64));
  for (let i = 0; i < n; i += step) starts.add(i);

  // How many buses the cohort needs at all. Everyone counts, fillers included.
  const busesNeeded = Math.max(1, Math.ceil(seatsOf(bookings) / capacity));

  const candidates = [];
  for (const start of starts) {
    // Two ways to cut the same circle, because they fail differently.
    //
    // Filling each bus before starting the next is the textbook sweep, and it
    // is right when capacity is the binding constraint. But once the fillers
    // are set aside, the outer students often fit on fewer buses than the
    // cohort actually needs — and packing them onto one bus produces a single
    // enormous loop while another bus does almost nothing. On the seeded
    // Jaipur cohort that was Sikar, Alwar and Dausa on one vehicle.
    //
    // So also cut the circle into exactly as many wedges as there are buses,
    // balanced by seats, which spreads the outer towns by direction. Both are
    // scored; whichever drives shorter wins.
    candidates.push(placeFillers(cutWhenFull(byAngle, start, capacity), fillers, capacity));
    candidates.push(
      placeFillers(cutIntoWedges(byAngle, start, busesNeeded, capacity), fillers, capacity)
    );
  }

  // And one more, which needs no starting angle at all.
  candidates.push(
    placeFillers(cutAtLargestGaps(byAngle, busesNeeded), fillers, capacity)
  );

  return candidates;
}

/**
 * Cut the circle where it is already empty.
 *
 * Students are not spread evenly around a centre — they come from towns, so
 * the angles arrive in tight bunches separated by wide empty arcs. The
 * natural place to separate one bus from another is those empty arcs, not an
 * equal share of seats: cutting by share lands in the middle of a town and
 * splits it across two vehicles, which is how Alwar ended up on both buses.
 *
 * Cutting a circle into k arcs takes k cuts, so the k widest gaps are used.
 * No starting angle is involved, which is the point — the data decides where
 * the boundaries are.
 */
function cutAtLargestGaps(byAngle, k) {
  const n = byAngle.length;
  if (n === 0) return [];
  if (k <= 1 || n <= k) return byAngle.map((x) => [x.booking]).slice(0, Math.max(1, n));

  const TWO_PI = Math.PI * 2;
  const gaps = byAngle.map((entry, i) => {
    const next = byAngle[(i + 1) % n];
    let gap = next.angle - entry.angle;
    if (gap < 0) gap += TWO_PI; // the wrap-around gap
    return { after: i, gap };
  });

  const cutAfter = new Set(
    [...gaps]
      .sort((a, b) => b.gap - a.gap)
      .slice(0, k)
      .map((g) => g.after)
  );

  const clusters = [];
  let current = [];
  for (let i = 0; i < n; i++) {
    current.push(byAngle[i].booking);
    if (cutAfter.has(i)) {
      clusters.push(current);
      current = [];
    }
  }
  // Anything after the final cut belongs with the arc that wraps to the front.
  if (current.length) {
    if (clusters.length) clusters[0] = [...current, ...clusters[0]];
    else clusters.push(current);
  }

  return clusters.filter((c) => c.length > 0);
}

/** Classic sweep: fill a bus, then start the next. */
function cutWhenFull(byAngle, start, capacity) {
  const n = byAngle.length;
  const clusters = [];
  let current = [];
  let seats = 0;

  for (let i = 0; i < n; i++) {
    const { booking } = byAngle[(start + i) % n];
    const need = booking.seats || 1;
    if (seats + need > capacity && current.length) {
      clusters.push(current);
      current = [];
      seats = 0;
    }
    current.push(booking);
    seats += need;
  }
  if (current.length) clusters.push(current);
  return clusters;
}

/**
 * Cut the circle into exactly `k` wedges of roughly equal seat load.
 *
 * Used when the bus count is already decided by the whole cohort, so the aim
 * is to spread the outlying towns across the buses that will run anyway
 * rather than to minimise how many wedges the outer students alone occupy.
 */
function cutIntoWedges(byAngle, start, k, capacity) {
  const n = byAngle.length;
  const totalSeats = byAngle.reduce((sum, x) => sum + (x.booking.seats || 1), 0);
  const share = totalSeats / k;

  const clusters = [];
  let current = [];
  let seats = 0;

  for (let i = 0; i < n; i++) {
    const { booking } = byAngle[(start + i) % n];
    const need = booking.seats || 1;
    const groupsLeft = k - clusters.length;
    const studentsLeft = n - i;

    // Close this wedge once it has taken its share — but never so eagerly
    // that the remaining wedges would have nobody left to put in them.
    const takenShare = seats >= share;
    const wouldOverfill = seats + need > capacity;
    if (
      current.length &&
      groupsLeft > 1 &&
      (takenShare || wouldOverfill) &&
      studentsLeft >= groupsLeft
    ) {
      clusters.push(current);
      current = [];
      seats = 0;
    }

    current.push(booking);
    seats += need;
  }
  if (current.length) clusters.push(current);
  return clusters;
}

/** Splits a list into capacity-sized groups, order preserved. */
function chunkToCapacity(bookings, capacity) {
  const clusters = [];
  let current = [];
  let seats = 0;
  for (const b of bookings) {
    const need = b.seats || 1;
    if (seats + need > capacity && current.length) {
      clusters.push(current);
      current = [];
      seats = 0;
    }
    current.push(b);
    seats += need;
  }
  if (current.length) clusters.push(current);
  return clusters;
}

/**
 * Puts the centre-dwelling students onto buses once the shape is decided.
 *
 * Each one goes to the bus with the most room left, which keeps the buses
 * balanced and avoids opening another vehicle while seats sit empty
 * elsewhere. Any bus is as good as any other for them — they board at the
 * end, metres from where the journey finishes.
 */
function placeFillers(clusters, fillers, capacity) {
  const result = clusters.map((c) => [...c]);

  for (const filler of fillers) {
    const need = filler.seats || 1;
    let bestIndex = -1;
    let mostRoom = -1;

    for (let i = 0; i < result.length; i++) {
      const room = capacity - seatsOf(result[i]);
      if (room >= need && room > mostRoom) {
        mostRoom = room;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) result.push([filler]);
    else result[bestIndex].push(filler);
  }

  return result;
}

/**
 * What a set of clusters would actually cost to drive.
 *
 * Buses first, kilometres second. An extra bus is a driver, a vehicle and a
 * fuel tank — no amount of shaved distance pays for one — so a clustering
 * that needs more buses loses regardless of how tidy its routes are. Within
 * the same bus count, shorter total driving wins.
 *
 * Each cluster is scored on a route that has at least been through 2-opt,
 * not its raw construction order — otherwise the comparison measures how good
 * each strategy's first guess was, rather than how good its routes end up.
 *
 * Students sharing a pickup stop are counted once, because the bus stops
 * there once. Clustering on individual homes would inflate every cluster
 * with places the bus never separately visits.
 */
export function scoreClusters(clusters, center) {
  let km = 0;
  for (const cluster of clusters) {
    const seen = new Map();
    for (const b of cluster) {
      const c = pointOf(b);
      seen.set(`${c[0]},${c[1]}`, { coordinates: c });
    }
    km += estimateTourKm([...seen.values()], center);
  }
  return { buses: clusters.length, km };
}

function isBetter(a, b) {
  if (!b) return true;
  if (a.buses !== b.buses) return a.buses < b.buses;
  return a.km < b.km - 1e-9;
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
 * Pass the exam centre to enable the sweep strategy and the comparison; both
 * need to know where every route ends. Without it only k-means runs, which is
 * what callers that cluster before snapping to stops get.
 *
 * Returns an array of booking arrays. Guarantees:
 *   - every returned cluster has `seatsOf(cluster) <= capacity`
 *   - no cluster is empty
 *   - every input booking appears exactly once
 */
export function clusterByCapacity(bookings, capacity, center = null) {
  if (bookings.length === 0) return [];
  if (!Number.isFinite(capacity) || capacity <= 0)
    throw new Error(`Invalid bus capacity: ${capacity}`);

  const oversized = bookings.find((b) => (b.seats || 1) > capacity);
  if (oversized)
    throw new Error(
      `Booking ${oversized._id} needs ${oversized.seats} seats but bus capacity is ${capacity}`
    );

  // Two strategies, because neither is reliably better than the other and
  // guessing would be the wrong way to decide. Both are made capacity-safe by
  // the same repair pass, then scored on what they would cost to drive.
  const kMeansResult = repairOverflow(kMeansClusters(bookings, capacity), capacity);

  if (!center) return finalise(kMeansResult, bookings, capacity);

  let best = kMeansResult;
  let bestScore = scoreClusters(kMeansResult, center);

  for (const candidate of sweepCandidates(bookings, capacity, center)) {
    const repaired = repairOverflow(candidate, capacity);
    const score = scoreClusters(repaired, center);
    if (isBetter(score, bestScore)) {
      best = repaired;
      bestScore = score;
    }
  }

  return finalise(best, bookings, capacity);
}

/** Phase 1 for the k-means strategy: shape the routes geographically. */
function kMeansClusters(bookings, capacity) {
  const points = bookings.map(pointOf);
  const k = Math.max(1, Math.ceil(seatsOf(bookings) / capacity));
  const assignments = kMeans(points, k);

  const clusters = Array.from(
    { length: Math.max(1, Math.min(k, points.length)) },
    () => []
  );
  bookings.forEach((b, i) => clusters[assignments[i]].push(b));
  return clusters.filter((c) => c.length > 0);
}

/**
 * Phase 2 — repair overflow.
 *
 * Applies to whichever strategy produced the clusters. The sweep is
 * capacity-feasible by construction, but running it through the same repair
 * keeps one guarantee in one place rather than two constructions each
 * promising separately not to overfill a bus.
 */
function repairOverflow(input, capacity) {
  let clusters = input.map((c) => [...c]);
  const total = clusters.reduce((n, c) => n + c.length, 0);
  // Each pass moves one passenger out of one over-full cluster. Total overflow
  // strictly decreases, so this cannot loop forever; the bound is a safety net.
  const maxMoves = total * 4 + 16;
  for (let move = 0; move < maxMoves; move++) {
    const overIndex = clusters.findIndex((c) => seatsOf(c) > capacity);
    if (overIndex === -1) break; // every cluster fits

    const over = clusters[overIndex];
    const centroid = centroidOf(over);

    // The most peripheral member is the cheapest one to give away.
    let evictIndex = 0;
    let evictDist = -Infinity;
    for (let i = 0; i < over.length; i++) {
      const d = haversineKm(pointOf(over[i]), centroid);
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
      const d = haversineKm(pointOf(evicted), centroidOf(clusters[i]));
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

  return clusters.filter((c) => c.length > 0);
}

/**
 * Post-conditions, checked once on whichever clustering won.
 *
 * If either of these fires the routing is wrong, and we would rather fail
 * loudly on the admin screen than quietly print "55/40 seats".
 */
function finalise(clusters, bookings, capacity) {
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

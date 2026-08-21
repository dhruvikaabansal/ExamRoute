import './env.js';
import { describe, it, expect } from 'vitest';
import {
  clusterByCapacity,
  sweepCandidates,
  scoreClusters,
  seatsOf,
} from '../src/services/clustering.js';

/**
 * Choosing a clustering strategy by measurement rather than by faith.
 *
 * k-means minimises distance to a centroid, so it favours round blobs. The
 * best possible bus route is the opposite shape — a corridor of students
 * strung along one highway, which is a high-variance cluster and precisely
 * what k-means tries to avoid. The sweep algorithm cuts wedges by angle
 * around the exam centre and produces corridors naturally.
 *
 * Neither wins everywhere, so both are built and the cheaper-to-drive one is
 * kept. These tests pin the guarantees that makes safe.
 */

const CENTRE = [75.7873, 26.9124]; // Jaipur

/** Students strung out along a straight line from the centre. */
function corridor(tag, dx, dy, count, seats = 1) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `${tag}${i}`,
    tag,
    seats,
    homeLocation: {
      coordinates: [CENTRE[0] + dx * (i + 1) * 0.12, CENTRE[1] + dy * (i + 1) * 0.12],
    },
  }));
}

function scatter(count, spread = 3, seed = 7) {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return Array.from({ length: count }, (_, i) => ({
    _id: `s${i}`,
    seats: i % 4 === 0 ? 2 : 1,
    homeLocation: {
      coordinates: [
        CENTRE[0] + (rnd() - 0.5) * spread,
        CENTRE[1] + (rnd() - 0.5) * spread,
      ],
    },
  }));
}

describe('sweep construction', () => {
  it('produces candidates that already respect capacity', () => {
    const bookings = scatter(60);
    for (const candidate of sweepCandidates(bookings, 40, CENTRE)) {
      for (const cluster of candidate) expect(seatsOf(cluster)).toBeLessThanOrEqual(40);
    }
  });

  it('places every student exactly once in every candidate', () => {
    const bookings = scatter(45);
    for (const candidate of sweepCandidates(bookings, 40, CENTRE)) {
      const ids = candidate.flat().map((b) => b._id);
      expect(ids).toHaveLength(bookings.length);
      expect(new Set(ids).size).toBe(bookings.length);
    }
  });

  it('tries more than one starting angle, since where you start changes the answer', () => {
    expect(sweepCandidates(scatter(30), 40, CENTRE).length).toBeGreaterThan(1);
  });
});

describe('strategy selection', () => {
  it('keeps a corridor on one bus instead of splitting it across two', () => {
    // Two corridors leaving the centre in opposite directions, each exactly
    // one busload. Splitting either one would mean two buses driving the same
    // road — the failure mode that motivated the sweep.
    const bookings = [...corridor('north', -0.3, 1, 12), ...corridor('east', 1, -0.1, 12)];
    const clusters = clusterByCapacity(bookings, 12, CENTRE);

    expect(clusters).toHaveLength(2);
    for (const cluster of clusters) {
      expect(new Set(cluster.map((b) => b.tag)).size).toBe(1);
    }
  });

  it('is never worse than k-means alone', () => {
    // The whole point of measuring: the chosen clustering cannot lose to the
    // one we would have shipped without the comparison.
    for (const n of [25, 60, 120]) {
      const bookings = scatter(n);
      const kMeansOnly = scoreClusters(clusterByCapacity(bookings, 40), CENTRE);
      const chosen = scoreClusters(clusterByCapacity(bookings, 40, CENTRE), CENTRE);

      expect(chosen.buses).toBeLessThanOrEqual(kMeansOnly.buses);
      if (chosen.buses === kMeansOnly.buses) {
        expect(chosen.km).toBeLessThanOrEqual(kMeansOnly.km + 1e-6);
      }
    }
  });

  it('never trades an extra bus for shorter driving', () => {
    // A bus is a driver, a vehicle and a fuel tank. No amount of shaved
    // distance pays for one, so bus count is compared before kilometres.
    const bookings = scatter(90);
    const withCentre = clusterByCapacity(bookings, 40, CENTRE);
    const without = clusterByCapacity(bookings, 40);
    expect(withCentre.length).toBeLessThanOrEqual(without.length);
  });

  it('still honours capacity after choosing', () => {
    const bookings = scatter(120);
    for (const cluster of clusterByCapacity(bookings, 40, CENTRE)) {
      expect(seatsOf(cluster)).toBeLessThanOrEqual(40);
      expect(cluster.length).toBeGreaterThan(0);
    }
  });

  it('loses nobody', () => {
    const bookings = scatter(77);
    const ids = clusterByCapacity(bookings, 40, CENTRE)
      .flat()
      .map((b) => b._id);
    expect(new Set(ids).size).toBe(bookings.length);
  });

  it('is deterministic — the same cohort always produces the same buses', () => {
    const bookings = scatter(50);
    const shape = (cs) => cs.map((c) => c.map((b) => b._id).sort().join(',')).sort();
    expect(shape(clusterByCapacity(bookings, 40, CENTRE))).toEqual(
      shape(clusterByCapacity(bookings, 40, CENTRE))
    );
  });

  it('clusters on pickup stops, not homes, when students share a stop', () => {
    // Twelve students in different villages who all board at one bus stand
    // are one place to visit, not twelve.
    const stop = { location: { coordinates: [75.1398, 27.6094] } };
    const bookings = Array.from({ length: 12 }, (_, i) => ({
      _id: `x${i}`,
      seats: 1,
      _stop: stop,
      homeLocation: { coordinates: [75.1 + i * 0.05, 27.5 + i * 0.03] },
    }));

    const score = scoreClusters(clusterByCapacity(bookings, 40, CENTRE), CENTRE);
    // One shared stop, so the route is out to the stop and back — not a tour
    // of twelve separate villages.
    expect(score.buses).toBe(1);
    expect(score.km).toBeLessThan(200);
  });

  it('stays fast enough for an admin pressing a button', () => {
    const started = Date.now();
    clusterByCapacity(scatter(200, 5), 40, CENTRE);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

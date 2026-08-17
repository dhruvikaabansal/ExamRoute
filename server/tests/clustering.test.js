import './env.js';
import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { clusterByCapacity, seatsOf, kMeans } from '../src/services/clustering.js';

/**
 * The capacity invariant is the thing that used to be wrong: k-means chose the
 * number of buses but nothing balanced them, so a "40-seater" could be handed
 * 55 passengers. These tests assert the guarantee directly, including the
 * adversarial case that broke it — everyone living in the same place.
 */

const booking = (lng, lat, seats = 1) => ({
  _id: new mongoose.Types.ObjectId(),
  seats,
  homeLocation: { coordinates: [lng, lat] },
});

/** Students spread around a town centre. */
function cohort(count, [lng, lat], seatsFor = () => 1) {
  return Array.from({ length: count }, (_, i) =>
    booking(lng + (i % 7) * 0.01, lat + (i % 5) * 0.01, seatsFor(i))
  );
}

const everyClusterFits = (clusters, capacity) =>
  clusters.every((c) => seatsOf(c) <= capacity);

const allAccountedFor = (clusters, input) => {
  const ids = clusters.flat().map((b) => String(b._id)).sort();
  const expected = input.map((b) => String(b._id)).sort();
  return JSON.stringify(ids) === JSON.stringify(expected);
};

describe('clusterByCapacity', () => {
  it('keeps a small cohort on a single bus', () => {
    const bookings = cohort(10, [75.78, 26.91]);
    const clusters = clusterByCapacity(bookings, 40);

    expect(clusters).toHaveLength(1);
    expect(seatsOf(clusters[0])).toBe(10);
  });

  it('splits a cohort that exceeds capacity', () => {
    const bookings = cohort(55, [75.78, 26.91]);
    const clusters = clusterByCapacity(bookings, 40);

    expect(clusters.length).toBeGreaterThanOrEqual(2);
    expect(everyClusterFits(clusters, 40)).toBe(true);
    expect(allAccountedFor(clusters, bookings)).toBe(true);
  });

  it('counts companion seats, not headcount', () => {
    // 25 students but 50 seats — headcount alone would say "one bus".
    const bookings = cohort(25, [75.78, 26.91], () => 2);
    const clusters = clusterByCapacity(bookings, 40);

    expect(seatsOf(bookings)).toBe(50);
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    expect(everyClusterFits(clusters, 40)).toBe(true);
  });

  it('holds capacity even when every student lives at the same point', () => {
    // The pathological case for geographic clustering: k-means cannot separate
    // identical points, so only the repair phase can enforce capacity.
    const bookings = Array.from({ length: 90 }, () => booking(75.7873, 26.9124));
    const clusters = clusterByCapacity(bookings, 40);

    expect(everyClusterFits(clusters, 40)).toBe(true);
    expect(allAccountedFor(clusters, bookings)).toBe(true);
    expect(clusters.length).toBeGreaterThanOrEqual(3);
  });

  it('holds capacity across a lumpy multi-town spread', () => {
    const bookings = [
      ...cohort(30, [75.7873, 26.9124]), // Jaipur
      ...cohort(18, [75.1398, 27.6094], (i) => (i % 3 === 0 ? 3 : 1)), // Sikar
      ...cohort(9, [76.61, 27.553]), // Alwar
      ...cohort(4, [73.3119, 28.0229]), // Bikaner
    ];
    const clusters = clusterByCapacity(bookings, 40);

    expect(everyClusterFits(clusters, 40)).toBe(true);
    expect(allAccountedFor(clusters, bookings)).toBe(true);
    expect(clusters.every((c) => c.length > 0)).toBe(true);
  });

  it('keeps geography intact — nearby students share a bus', () => {
    const jaipur = cohort(12, [75.7873, 26.9124]);
    const bikaner = cohort(12, [73.3119, 28.0229]);
    const clusters = clusterByCapacity([...jaipur, ...bikaner], 15);

    // Every cluster should be dominated by one town rather than mixing two
    // places 250 km apart onto the same route.
    for (const cluster of clusters) {
      const lngs = cluster.map((b) => b.homeLocation.coordinates[0]);
      expect(Math.max(...lngs) - Math.min(...lngs)).toBeLessThan(1);
    }
  });

  it('is deterministic — the same input yields the same routes', () => {
    const bookings = cohort(48, [75.78, 26.91], (i) => (i % 4 === 0 ? 2 : 1));
    const shape = (cs) => cs.map((c) => c.length).sort((a, b) => a - b);

    expect(shape(clusterByCapacity(bookings, 40))).toEqual(
      shape(clusterByCapacity(bookings, 40))
    );
  });

  it('handles the trivial cases', () => {
    expect(clusterByCapacity([], 40)).toEqual([]);
    expect(clusterByCapacity([booking(75, 26)], 40)).toHaveLength(1);
  });

  it('refuses a booking that cannot fit on any bus', () => {
    expect(() => clusterByCapacity([booking(75, 26, 50)], 40)).toThrow(/capacity/i);
  });

  it('rejects a nonsensical capacity rather than looping', () => {
    expect(() => clusterByCapacity([booking(75, 26)], 0)).toThrow(/capacity/i);
  });
});

describe('kMeans seeding', () => {
  it('separates two distant groups instead of collapsing them', () => {
    // Ordered so the first two points are neighbours — the case where the old
    // `points.slice(0, k)` seeding picked two near-identical centroids.
    const points = [
      [75.78, 26.91],
      [75.79, 26.92],
      [75.8, 26.9],
      [73.31, 28.02],
      [73.32, 28.03],
      [73.3, 28.01],
    ];
    const assignments = kMeans(points, 2);

    expect(new Set(assignments).size).toBe(2);
    // The three Jaipur points agree with each other, likewise Bikaner.
    expect(assignments[0]).toBe(assignments[1]);
    expect(assignments[1]).toBe(assignments[2]);
    expect(assignments[3]).toBe(assignments[4]);
    expect(assignments[0]).not.toBe(assignments[3]);
  });
});

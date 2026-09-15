import './env.js';
import { describe, it, expect } from 'vitest';
import { computeFare } from '../src/utils/fare.js';
import { haversineKm } from '../src/services/mapsService.js';

const JAIPUR = [75.7873, 26.9124];
const SIKAR = [75.1398, 27.6094];
const BIKANER = [73.3119, 28.0229];

describe('fare model', () => {
  it('scales with distance', () => {
    const near = computeFare(SIKAR, JAIPUR, 1);
    const far = computeFare(BIKANER, JAIPUR, 1);
    expect(far.distanceKm).toBeGreaterThan(near.distanceKm);
    expect(far.baseFare).toBeGreaterThan(near.baseFare);
  });

  it('charges companions per seat', () => {
    const alone = computeFare(SIKAR, JAIPUR, 1);
    const withParents = computeFare(SIKAR, JAIPUR, 3);
    expect(withParents.baseFare).toBe(alone.baseFare * 3);
  });

  it('subsidises further journeys more heavily — the social point', () => {
    const near = computeFare(SIKAR, JAIPUR, 1);
    const far = computeFare(BIKANER, JAIPUR, 1);
    expect(far.subsidyPercent).toBeGreaterThan(near.subsidyPercent);
  });

  it('caps the subsidy', () => {
    const cap = Number(process.env.MAX_SUBSIDY_PCT || 50);
    // A deliberately extreme distance within India.
    const extreme = computeFare([68.5, 23.5], [97.0, 27.5], 1);
    expect(extreme.subsidyPercent).toBeLessThanOrEqual(cap);
  });

  /*
    The bug this guards against is a policy that is graduated on paper and
    flat in practice. With 25 km bands the 50% ceiling arrived at 250 km, and
    since essentially nobody in this system travels less than that, every
    passenger got the cap — the tapering existed only in the source.

    So the assertion is not about a formula, it is about the distribution: a
    normal intercity journey must land strictly below the ceiling, and a
    spread of real distances must produce visibly different rates.
  */
  it('does not hand the cap to a typical journey', () => {
    const cap = Number(process.env.MAX_SUBSIDY_PCT || 50);
    const typical = computeFare(BIKANER, JAIPUR, 1); // ~280 km, an ordinary leg
    expect(typical.distanceKm).toBeGreaterThan(200);
    expect(typical.subsidyPercent).toBeLessThan(cap);
    expect(typical.subsidyPercent).toBeGreaterThan(0);
  });

  /*
    The charge and the discount measure from different places, and this is the
    bug that made it matter: two students boarding the same stop for the same
    seat on the same bus used to pay different fares, because one of them
    lived further from that stop. Identical service, different price.
  */
  it('bills the bus journey, not the walk to the stop', () => {
    const stop = SIKAR;
    const nearTheStop = computeFare(stop, JAIPUR, 1, [75.14, 27.61]); // lives beside it
    const farFromStop = computeFare(stop, JAIPUR, 1, BIKANER); // lives 200 km away

    // Same stop, same seat, same bus → the same price to ride it.
    expect(farFromStop.baseFare).toBe(nearTheStop.baseFare);
    expect(farFromStop.distanceKm).toBe(nearTheStop.distanceKm);
  });

  it('subsidises on where the student lives, not where they board', () => {
    const stop = SIKAR;
    const nearby = computeFare(stop, JAIPUR, 1, [75.14, 27.61]);
    const remote = computeFare(stop, JAIPUR, 1, BIKANER);

    // The one who travelled further to reach the bus is the one the subsidy
    // exists for, so they pay less for the identical seat.
    expect(remote.subsidyPercent).toBeGreaterThan(nearby.subsidyPercent);
    expect(remote.fare).toBeLessThan(nearby.fare);
  });

  it('falls back to one location when no stop is known yet', () => {
    const quoted = computeFare(SIKAR, JAIPUR, 1);
    expect(quoted.homeDistanceKm).toBe(quoted.distanceKm);
  });

  it('spreads subsidy across the distances people actually travel', () => {
    const rates = [
      computeFare([75.82, 26.45], JAIPUR, 1), // ~55 km, next district
      computeFare(SIKAR, JAIPUR, 1), // ~110 km
      computeFare(BIKANER, JAIPUR, 1), // ~280 km, across the state
    ].map((q) => q.subsidyPercent);

    expect(new Set(rates).size).toBe(3);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
  });

  it('never returns a payable fare above the base fare', () => {
    for (const from of [SIKAR, BIKANER, [74.63, 25.34]]) {
      const { fare, baseFare } = computeFare(from, JAIPUR, 2);
      expect(fare).toBeLessThanOrEqual(baseFare);
      expect(fare).toBeGreaterThan(0);
    }
  });

  it('is symmetric and zero at the centre itself', () => {
    expect(haversineKm(JAIPUR, JAIPUR)).toBe(0);
    expect(haversineKm(JAIPUR, SIKAR)).toBeCloseTo(haversineKm(SIKAR, JAIPUR), 9);
  });

  it('produces a sane distance for a known pair', () => {
    // Jaipur to Bikaner is roughly 280 km as the crow flies.
    expect(haversineKm(JAIPUR, BIKANER)).toBeGreaterThan(230);
    expect(haversineKm(JAIPUR, BIKANER)).toBeLessThan(320);
  });
});

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

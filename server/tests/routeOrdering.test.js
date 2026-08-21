import './env.js';
import { describe, it, expect } from 'vitest';
import {
  mockOptimize,
  twoOptImprove,
  tourLengthKm,
  haversineKm,
  averageSpeedKmh,
} from '../src/services/mapsService.js';

/**
 * Offline stop ordering.
 *
 * The case that motivated 2-opt came off a real admin screen: a bus collected
 * Sikar, drove into Jaipur, continued east to Dausa, then came back to the
 * Jaipur exam centre. The Jaipur student boarded at 04:11 for an 07:00 arrival
 * twenty minutes away. Nearest-neighbour cannot see that, because it only ever
 * looks at the next hop.
 */

const JAIPUR = [75.7873, 26.9124];
const SIKAR = [75.1398, 27.6094];
const DAUSA = [76.3344, 26.8894];
const ALWAR = [76.61, 27.553];
const AJMER = [74.6399, 26.4499];

const stop = (name, coordinates) => ({ name, coordinates });

describe('offline stop ordering', () => {
  it('does not drive past the destination and double back', () => {
    const stops = [stop('Sikar', SIKAR), stop('Jaipur', JAIPUR), stop('Dausa', DAUSA)];
    const { order } = mockOptimize(stops, JAIPUR);
    const names = order.map((s) => s.name);

    // Whatever the exact order, the stop at the destination city must not be
    // collected before a stop that lies further out.
    expect(names.indexOf('Jaipur')).toBeGreaterThan(names.indexOf('Dausa'));
  });

  it('never returns a longer route than the greedy order it started from', () => {
    const stops = [
      stop('Sikar', SIKAR),
      stop('Jaipur', JAIPUR),
      stop('Dausa', DAUSA),
      stop('Alwar', ALWAR),
    ];
    const greedyish = [...stops];
    const improved = twoOptImprove(greedyish, JAIPUR);

    expect(tourLengthKm(improved, JAIPUR)).toBeLessThanOrEqual(
      tourLengthKm(greedyish, JAIPUR)
    );
  });

  it('keeps every stop exactly once', () => {
    const stops = [
      stop('Sikar', SIKAR),
      stop('Jaipur', JAIPUR),
      stop('Dausa', DAUSA),
      stop('Alwar', ALWAR),
      stop('Ajmer', AJMER),
    ];
    const { order } = mockOptimize(stops, JAIPUR);

    expect(order).toHaveLength(stops.length);
    expect(new Set(order.map((s) => s.name)).size).toBe(stops.length);
  });

  it('is deterministic — the same input always produces the same route', () => {
    const stops = [
      stop('Alwar', ALWAR),
      stop('Dausa', DAUSA),
      stop('Sikar', SIKAR),
      stop('Ajmer', AJMER),
    ];
    const a = mockOptimize(stops, JAIPUR).order.map((s) => s.name);
    const b = mockOptimize(stops, JAIPUR).order.map((s) => s.name);
    expect(a).toEqual(b);
  });

  it('produces one leg per stop, the last being the run to the centre', () => {
    const stops = [stop('Sikar', SIKAR), stop('Dausa', DAUSA)];
    const { order, legsMin, totalMin } = mockOptimize(stops, JAIPUR);

    expect(legsMin).toHaveLength(order.length);
    expect(totalMin).toBe(legsMin.reduce((a, b) => a + b, 0));
    expect(legsMin.every((m) => m >= 1)).toBe(true);
  });

  it('handles a single stop without trying to reorder anything', () => {
    const { order, legsMin } = mockOptimize([stop('Alwar', ALWAR)], AJMER);
    expect(order.map((s) => s.name)).toEqual(['Alwar']);
    expect(legsMin).toHaveLength(1);
  });

  it('handles stops that share a coordinate', () => {
    const stops = [
      stop('Jaipur Railway', JAIPUR),
      stop('Jaipur Bus Stand', JAIPUR),
      stop('Sikar', SIKAR),
    ];
    const { order } = mockOptimize(stops, JAIPUR);
    expect(order).toHaveLength(3);
  });
});

describe('travel time estimates', () => {
  it('assumes faster travel over longer distances', () => {
    expect(averageSpeedKmh(2)).toBeLessThan(averageSpeedKmh(50));
    expect(averageSpeedKmh(50)).toBeLessThan(averageSpeedKmh(250));
  });

  it('does not claim a 250 km trip takes eight hours', () => {
    // The old flat 30 km/h turned Alwar→Ajmer into an overnight expedition.
    const km = haversineKm(ALWAR, AJMER);
    const minutes = (km / averageSpeedKmh(km)) * 60;
    expect(minutes).toBeLessThan(6 * 60);
  });
});

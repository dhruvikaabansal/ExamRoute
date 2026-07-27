import { haversineKm } from '../services/mapsService.js';

/**
 * Fare model (distance-based, seat-based, subsidised):
 *
 *   perSeat  = BASE_FARE + FARE_PER_KM * distanceKm
 *   baseFare = perSeat * seats            (seats = student + companions)
 *   subsidy% = min(MAX_SUBSIDY, floor(km / 25) * SUBSIDY_PER_25KM)
 *   payable  = baseFare * (1 - subsidy%/100)
 *
 * The subsidy INCREASES with distance — that's the whole social point: students
 * from far-off small towns (who have the longest, costliest journeys) get the
 * biggest discount. Companions (parents) pay full per-seat but the same subsidy.
 */
export function computeFare(homeCoords, centerCoords, seats = 1) {
  const base = Number(process.env.BASE_FARE || 100);
  const perKm = Number(process.env.FARE_PER_KM || 3);
  const maxSubsidy = Number(process.env.MAX_SUBSIDY_PCT || 50);
  const per25 = Number(process.env.SUBSIDY_PER_25KM || 5);

  const distanceKm = Math.round(haversineKm(homeCoords, centerCoords));
  const perSeat = base + perKm * distanceKm;
  const baseFare = Math.round(perSeat * seats);

  const subsidyPercent = Math.min(maxSubsidy, Math.floor(distanceKm / 25) * per25);
  const fare = Math.round(baseFare * (1 - subsidyPercent / 100));

  return { distanceKm, baseFare, subsidyPercent, fare };
}

import { haversineKm } from '../services/mapsService.js';

/**
 * Fare model (distance-based, seat-based, subsidised):
 *
 *   perSeat  = BASE_FARE + FARE_PER_KM * distanceKm
 *   baseFare = perSeat * seats            (seats = student + companions)
 *   subsidy% = min(MAX_SUBSIDY_PCT, floor(km / SUBSIDY_BAND_KM) * SUBSIDY_PER_BAND_PCT)
 *   payable  = baseFare * (1 - subsidy%/100)
 *
 * The subsidy INCREASES with distance — that's the whole social point: students
 * from far-off small towns (who have the longest, costliest journeys) get the
 * biggest discount. Companions (parents) pay full per-seat but the same subsidy.
 *
 * Picking the band is the part that matters, and the first version got it
 * wrong. At 5% per 25 km the 50% ceiling arrives at 250 km — but almost nobody
 * in this system travels less than that. Rajasthan is roughly 800 km across
 * and exam centres are sparse, so a real home-to-centre leg is 150–550 km.
 * Every single passenger hit the cap, which made a graduated social policy
 * behave as a flat half-price discount: the tapering existed in the code and
 * was invisible in every fare the app ever quoted.
 *
 * Widening the band to 50 km puts the ceiling at 500 km, so the curve now
 * spans the distances people actually travel — roughly 15% from a nearby
 * district, 30% from across the state, 50% only for the genuinely extreme
 * journeys the cap was written for. Same policy, same code, a band chosen
 * against the real distribution instead of a round number.
 */
export function computeFare(homeCoords, centerCoords, seats = 1) {
  const base = Number(process.env.BASE_FARE || 100);
  const perKm = Number(process.env.FARE_PER_KM || 3);
  const maxSubsidy = Number(process.env.MAX_SUBSIDY_PCT || 50);
  const bandKm = Number(process.env.SUBSIDY_BAND_KM || 50);
  const perBand = Number(process.env.SUBSIDY_PER_BAND_PCT || 5);

  const distanceKm = Math.round(haversineKm(homeCoords, centerCoords));
  const perSeat = base + perKm * distanceKm;
  const baseFare = Math.round(perSeat * seats);

  const subsidyPercent = Math.min(maxSubsidy, Math.floor(distanceKm / bandKm) * perBand);
  const fare = Math.round(baseFare * (1 - subsidyPercent / 100));

  return { distanceKm, baseFare, subsidyPercent, fare };
}

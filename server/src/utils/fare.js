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
 *
 * ---
 *
 * TWO DIFFERENT DISTANCES, AND THEY ARE NOT THE SAME ONE.
 *
 * The charge and the discount answer different questions, so they measure
 * from different places.
 *
 *   - **You are billed from the pickup stop.** That is the leg the bus
 *     actually drives. Billing from the student's front door charged them for
 *     kilometres no bus covers — the walk, auto or local bus to the stop is
 *     their own journey, already paid for separately.
 *
 *     The version that did this had a worse symptom than over-charging: two
 *     students boarding the *same stop* for the *same seat* on the *same bus*
 *     paid different fares, because one of them lived further from that stop.
 *     Identical service, different price, for a reason neither of them could
 *     see.
 *
 *   - **You are subsidised from home.** Hardship is about where you live, not
 *     where you board. A student in a remote village who travels 40 km just to
 *     reach the bus stand is exactly who the subsidy exists for, and measuring
 *     it from the stop would quietly erase that.
 *
 * So: pay for what the bus drives, get discounted for how far you actually
 * live. `homeCoords` defaults to the boarding point, which keeps the honest
 * behaviour for callers that genuinely have only one location — a fare
 * estimate taken before a stop has been assigned, for instance.
 */
export function computeFare(boardAtCoords, centerCoords, seats = 1, homeCoords = boardAtCoords) {
  const base = Number(process.env.BASE_FARE || 100);
  const perKm = Number(process.env.FARE_PER_KM || 3);
  const maxSubsidy = Number(process.env.MAX_SUBSIDY_PCT || 50);
  const bandKm = Number(process.env.SUBSIDY_BAND_KM || 50);
  const perBand = Number(process.env.SUBSIDY_PER_BAND_PCT || 5);

  // Billed: the leg the bus drives.
  const distanceKm = Math.round(haversineKm(boardAtCoords, centerCoords));
  // Subsidised: how far the student actually lives from the exam.
  const homeDistanceKm = Math.round(haversineKm(homeCoords, centerCoords));

  const perSeat = base + perKm * distanceKm;
  const baseFare = Math.round(perSeat * seats);

  const subsidyPercent = Math.min(maxSubsidy, Math.floor(homeDistanceKm / bandKm) * perBand);
  const fare = Math.round(baseFare * (1 - subsidyPercent / 100));

  return { distanceKm, homeDistanceKm, baseFare, subsidyPercent, fare };
}

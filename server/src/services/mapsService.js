import axios from 'axios';

const KEY = process.env.GOOGLE_MAPS_API_KEY;
const useMock = !KEY;

// Haversine distance in km between two [lng, lat] points
export function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Average speed for a journey of a given length.
 *
 * A single flat average is wrong at both ends: 30 km/h makes an inter-city
 * highway run look absurdly slow, and 60 km/h pretends you cross a city
 * centre at highway speed. Rajasthan journeys here span 2 km to 300 km, so
 * the estimate scales with the distance being covered.
 *
 * These are estimates for the offline fallback. With a Maps key the real
 * Directions durations are used instead and this is never consulted.
 */
export function averageSpeedKmh(km) {
  if (km <= 5) return 20; // dense town traffic
  if (km <= 30) return 35; // district roads
  if (km <= 100) return 50; // state highways
  return 60; // national highways
}

/**
 * Roads are not straight lines.
 *
 * Haversine gives the crow-flies distance, which understates a real drive by
 * roughly a quarter — Bikaner to Udaipur is 384 km straight and about 500 km
 * by road. Ignoring that made long journeys look faster than they are and,
 * more visibly, made an overnight departure look like a same-day one. 1.25 is
 * the standard circuity factor for road networks of this kind.
 *
 * Applied to time estimates only. Fare stays on straight-line distance: it is
 * the simpler promise to make to a student, and it cannot drift with a
 * routing assumption.
 */
export const ROAD_CIRCUITY = 1.25;

export function roadDistanceKm(from, to) {
  return haversineKm(from, to) * ROAD_CIRCUITY;
}

// Estimated travel minutes between two [lng, lat] points.
export function travelMinutes(from, to) {
  const km = roadDistanceKm(from, to);
  return Math.max(1, Math.round((km / averageSpeedKmh(km)) * 60));
}

/** Total distance of an open route that visits `order` then ends at `destination`. */
export function tourLengthKm(order, destination) {
  let km = 0;
  for (let i = 0; i < order.length - 1; i++)
    km += haversineKm(order[i].coordinates, order[i + 1].coordinates);
  if (order.length) km += haversineKm(order[order.length - 1].coordinates, destination);
  return km;
}

/**
 * 2-opt local search over the pickup order.
 *
 * Nearest-neighbour alone produced routes that drove past the exam centre to
 * collect a further stop and doubled back — on real data, a Jaipur student
 * boarded at 04:11 for a 07:00 arrival twenty minutes away, because the
 * greedy step optimises the next hop and knows nothing about where the route
 * has to end.
 *
 * 2-opt repeatedly reverses any segment of the route that makes the whole
 * journey shorter, measuring the *complete* path including the final leg to
 * the centre. That single change is what removes the doubling back.
 *
 * Reversing a prefix is allowed because the bus has no depot — it may start
 * at whichever stop is best. Every accepted move strictly shortens the tour,
 * so the loop cannot cycle; the pass cap is belt and braces against
 * floating-point ties.
 */
/**
 * Or-opt: relocate a run of 1–3 consecutive stops to a better position.
 *
 * 2-opt can only reverse a contiguous segment, so it fixes crossings but
 * cannot lift a single badly-placed stop out of the middle of a route and
 * drop it somewhere sensible. That is a different failure and it needs a
 * different move. Running both to exhaustion is the standard pairing, and
 * still costs microseconds at five to ten stops.
 */
export function orOptImprove(order, destination) {
  let best = [...order];
  let bestKm = tourLengthKm(best, destination);

  for (let pass = 0; pass < 50; pass++) {
    let improved = false;

    for (let runLength = 1; runLength <= 3 && runLength < best.length; runLength++) {
      for (let from = 0; from + runLength <= best.length; from++) {
        const without = [...best];
        const run = without.splice(from, runLength);

        for (let to = 0; to <= without.length; to++) {
          if (to === from) continue; // same place it came from
          const candidate = [...without.slice(0, to), ...run, ...without.slice(to)];
          const km = tourLengthKm(candidate, destination);
          if (km < bestKm - 1e-9) {
            best = candidate;
            bestKm = km;
            improved = true;
          }
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

/** Greedy nearest-neighbour order, starting from the stop furthest out. */
export function nearestNeighbourOrder(stops, destination) {
  const remaining = [...stops];
  remaining.sort(
    (a, b) =>
      haversineKm(b.coordinates, destination) - haversineKm(a.coordinates, destination)
  );

  const order = remaining.length ? [remaining.shift()] : [];
  while (remaining.length) {
    const last = order[order.length - 1].coordinates;
    remaining.sort(
      (a, b) => haversineKm(a.coordinates, last) - haversineKm(b.coordinates, last)
    );
    order.push(remaining.shift());
  }
  return order;
}

/**
 * A fast, good-enough route length, for comparing candidate clusterings.
 *
 * Choosing between clusterings only needs the comparison to rank them the
 * same way the final routes would; it does not need each candidate's exact
 * optimum. Running the full local search on every candidate cost seconds at
 * a few hundred students, which is far too slow for an admin pressing a
 * button. Nearest-neighbour plus 2-opt ranks them identically in practice
 * and is a fraction of the cost. The winner still gets the full treatment.
 */
export function estimateTourKm(stops, destination) {
  if (stops.length === 0) return 0;
  const order = twoOptImprove(nearestNeighbourOrder(stops, destination), destination);
  return tourLengthKm(order, destination);
}

/** 2-opt then Or-opt, repeated until neither can improve the route. */
export function improveRoute(order, destination) {
  let best = order;
  let bestKm = tourLengthKm(best, destination);

  for (let pass = 0; pass < 10; pass++) {
    const candidate = orOptImprove(twoOptImprove(best, destination), destination);
    const km = tourLengthKm(candidate, destination);
    if (km >= bestKm - 1e-9) return candidate;
    best = candidate;
    bestKm = km;
  }

  return best;
}

export function twoOptImprove(order, destination) {
  let best = [...order];
  let bestKm = tourLengthKm(best, destination);

  for (let pass = 0; pass < 50; pass++) {
    let improved = false;

    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const km = tourLengthKm(candidate, destination);
        // A real improvement, not a rounding artefact.
        if (km < bestKm - 1e-9) {
          best = candidate;
          bestKm = km;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

/**
 * Given ordered-ish waypoints (pickup stops) and a destination (center),
 * returns the optimal stop order and per-leg durations.
 *
 * Real mode: Google Directions API with optimize:true.
 * Mock mode (no API key): nearest-neighbour ordering + straight-line time
 * estimate (assumes ~40 km/h), so the whole flow works without keys.
 */
export async function optimizeRoute(stops, destination) {
  if (stops.length === 0) {
    return { order: [], legsMin: [], totalMin: 0 };
  }

  if (useMock) return mockOptimize(stops, destination);

  try {
    /**
     * Choose the origin deliberately.
     *
     * `optimize:true` reorders the intermediate waypoints only — origin and
     * destination are both fixed. Passing `stops[0]` meant the route was
     * optimal *given an arbitrary starting stop*, whichever one happened to
     * come first out of a Map. The bus physically starts at the far end of
     * the corridor and works inward, so the stop furthest from the centre is
     * the correct origin, and pinning it lets Directions optimise the part
     * that is genuinely free.
     */
    const ordered = [...stops].sort(
      (a, b) =>
        haversineKm(b.coordinates, destination) - haversineKm(a.coordinates, destination)
    );
    const origin = ordered[0].coordinates;
    const waypoints = ordered.slice(1).map((s) => s.coordinates);
    const wpParam =
      waypoints.length > 0
        ? 'optimize:true|' + waypoints.map(([lng, lat]) => `${lat},${lng}`).join('|')
        : '';

    const { data } = await axios.get(
      'https://maps.googleapis.com/maps/api/directions/json',
      {
        params: {
          origin: `${origin[1]},${origin[0]}`,
          destination: `${destination[1]},${destination[0]}`,
          waypoints: wpParam || undefined,
          key: KEY,
        },
      }
    );

    if (data.status !== 'OK') {
      console.warn('Directions API status:', data.status, '- falling back to mock');
      return mockOptimize(stops, destination);
    }

    const route = data.routes[0];
    // waypoint_order maps to stops.slice(1)
    const wpOrder = route.waypoint_order || [];
    const order = [ordered[0], ...wpOrder.map((i) => ordered[i + 1])];
    const legsMin = route.legs.map((l) => Math.round(l.duration.value / 60));
    const totalMin = legsMin.reduce((a, b) => a + b, 0);
    return { order, legsMin, totalMin };
  } catch (err) {
    console.warn('Directions API error:', err.message, '- falling back to mock');
    return mockOptimize(stops, destination);
  }
}

/**
 * Offline stop ordering: nearest-neighbour for a sane starting shape, then
 * 2-opt to remove the crossings and doubling-back that greedy construction
 * always leaves behind.
 *
 * This is the same two-stage idea as the clustering service — build something
 * reasonable, then repair what the construction step cannot see. It is not
 * optimal, and it does not need to be: with a Maps key, Directions solves this
 * on real roads. This exists so the app is honest and usable without one.
 */
export function mockOptimize(stops, destination) {
  // Start from the stop furthest from the centre: the bus works its way in.
  const order = improveRoute(nearestNeighbourOrder(stops, destination), destination);

  const legsMin = [];
  for (let i = 0; i < order.length; i++) {
    const from = order[i].coordinates;
    const to = i + 1 < order.length ? order[i + 1].coordinates : destination;
    legsMin.push(travelMinutes(from, to));
  }
  const totalMin = legsMin.reduce((a, b) => a + b, 0);
  return { order, legsMin, totalMin };
}

export const mapsMockMode = useMock;

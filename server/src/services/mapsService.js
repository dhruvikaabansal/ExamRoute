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

// Estimated travel minutes between two [lng, lat] points.
// Mock mode assumes ~30 km/h in-town average; real mode would use Distance Matrix.
export function travelMinutes(from, to) {
  const km = haversineKm(from, to);
  return Math.max(1, Math.round((km / 30) * 60));
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
    const origin = stops[0].coordinates;
    const waypoints = stops.slice(1).map((s) => s.coordinates);
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
    const order = [stops[0], ...wpOrder.map((i) => stops[i + 1])];
    const legsMin = route.legs.map((l) => Math.round(l.duration.value / 60));
    const totalMin = legsMin.reduce((a, b) => a + b, 0);
    return { order, legsMin, totalMin };
  } catch (err) {
    console.warn('Directions API error:', err.message, '- falling back to mock');
    return mockOptimize(stops, destination);
  }
}

function mockOptimize(stops, destination) {
  // nearest-neighbour ordering starting from the stop furthest from center
  const remaining = [...stops];
  remaining.sort(
    (a, b) =>
      haversineKm(b.coordinates, destination) -
      haversineKm(a.coordinates, destination)
  );

  const order = [remaining.shift()];
  while (remaining.length) {
    const last = order[order.length - 1].coordinates;
    remaining.sort(
      (a, b) => haversineKm(a.coordinates, last) - haversineKm(b.coordinates, last)
    );
    order.push(remaining.shift());
  }

  const AVG_KMH = 40;
  const legsMin = [];
  for (let i = 0; i < order.length; i++) {
    const from = order[i].coordinates;
    const to = i + 1 < order.length ? order[i + 1].coordinates : destination;
    const km = haversineKm(from, to);
    legsMin.push(Math.round((km / AVG_KMH) * 60));
  }
  const totalMin = legsMin.reduce((a, b) => a + b, 0);
  return { order, legsMin, totalMin };
}

export const mapsMockMode = useMock;

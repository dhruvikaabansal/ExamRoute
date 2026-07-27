import Stop from '../models/Stop.js';
import { haversineKm, travelMinutes } from './mapsService.js';

/**
 * Geofenced pickup-stop assignment.
 *
 * Each known stop has an implicit catchment zone of GEOFENCE_RADIUS_KM. We ask
 * MongoDB (via the 2dsphere index) for the nearest stop *within* that zone using
 * $near + $maxDistance — that's the geofence. If the student's home falls outside
 * every zone (a remote village), we fall back to the nearest stop overall so they
 * still get pooled.
 *
 * Returns { stop, distanceKm, etaMin, insideZone }.
 */
export async function assignStop(homeCoords) {
  const radiusKm = Number(process.env.GEOFENCE_RADIUS_KM || 5);
  const geometry = { type: 'Point', coordinates: homeCoords };

  // nearest stop within the geofence zone
  let stop = await Stop.findOne({
    location: { $near: { $geometry: geometry, $maxDistance: radiusKm * 1000 } },
  });
  let insideZone = true;

  // fallback: outside all zones -> nearest stop overall
  if (!stop) {
    stop = await Stop.findOne({ location: { $near: { $geometry: geometry } } });
    insideZone = false;
  }
  if (!stop) return null;

  const distanceKm = Math.round(haversineKm(homeCoords, stop.location.coordinates) * 10) / 10;
  const etaMin = travelMinutes(homeCoords, stop.location.coordinates);
  return { stop, distanceKm, etaMin, insideZone };
}

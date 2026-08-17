import { ApiError } from '../utils/apiError.js';

/**
 * The driver-facing API, authenticated by a per-bus capability link rather
 * than an account (see middleware/auth.js → driverTokenAuth).
 *
 * A bus driver is not a system user: they should not need an account, and
 * they certainly should not need the admin credentials the old flow required
 * in order to post GPS. The link they receive authorises one bus and two
 * actions — read this bus's route, report this bus's position.
 */

// GET /api/driver/:driverToken — what the driver's screen needs
export async function getDriverBus(req, res) {
  const bus = await req.bus.populate('center');
  res.json({
    id: bus._id,
    label: bus.label,
    route: bus.route,
    departureTime: bus.departureTime,
    arrivalTime: bus.arrivalTime,
    isOvernight: bus.isOvernight,
    seatsUsed: bus.seatsUsed,
    capacity: bus.capacity,
    center: bus.center
      ? {
          name: bus.center.name,
          city: bus.center.city,
          coordinates: bus.center.location.coordinates,
        }
      : null,
    currentLocation: bus.currentLocation || null,
    lastLocationAt: bus.lastLocationAt || null,
  });
}

// POST /api/driver/:driverToken/location  { lng, lat }
export async function postDriverLocation(req, res) {
  const lng = Number(req.body.lng);
  const lat = Number(req.body.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat))
    throw ApiError.badRequest('lng and lat must be numbers');
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90)
    throw ApiError.badRequest('Coordinates out of range');

  req.bus.currentLocation = { lng, lat };
  req.bus.lastLocationAt = new Date();
  await req.bus.save();

  res.json({ ok: true, lastLocationAt: req.bus.lastLocationAt });
}

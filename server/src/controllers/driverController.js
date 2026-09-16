import Bus from '../models/Bus.js';
import { ApiError } from '../utils/apiError.js';

/**
 * A live position, or null — never a half-empty object.
 *
 * `currentLocation` is a nested path on the schema, so Mongoose hands back an
 * empty object for a bus that has never reported, and `value || null` keeps
 * it, because `{}` is truthy. Clients then treated "no position" as "a
 * position", and mapped it to coordinates that do not exist.
 */
export function liveLocation(bus) {
  const { lng, lat } = bus.currentLocation || {};
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

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
    currentLocation: liveLocation(bus),
    lastLocationAt: bus.lastLocationAt || null,
  });
}

/**
 * POST /api/driver/:driverToken/location  { lng, lat, deviceId }
 *
 * The first device to report a position claims this bus; later ones are
 * refused.
 *
 * Without that, a forwarded link means two phones writing to the same field.
 * The last write wins, the marker jumps between two places every few seconds,
 * and every passenger watching it is being shown a position that may not be
 * their bus. Silent wrongness is the bad outcome here — a refusal is not.
 */
export async function postDriverLocation(req, res) {
  const lng = Number(req.body.lng);
  const lat = Number(req.body.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat))
    throw ApiError.badRequest('lng and lat must be numbers');
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90)
    throw ApiError.badRequest('Coordinates out of range');

  const deviceId = String(req.body.deviceId || '').slice(0, 64);
  if (!deviceId) throw ApiError.badRequest('Missing device id');

  if (!req.bus.driverDeviceId) {
    // First claim wins, and it is atomic: two devices starting together cannot
    // both pass, because only one update matches "nobody has claimed it yet".
    const claimed = await Bus.findOneAndUpdate(
      { _id: req.bus._id, driverDeviceId: { $in: [null, ''] } },
      { $set: { driverDeviceId: deviceId } },
      { new: true }
    );
    if (!claimed) {
      const current = await Bus.findById(req.bus._id).select('driverDeviceId');
      if (current?.driverDeviceId !== deviceId) throw sharedLinkError();
    }
    req.bus.driverDeviceId = deviceId;
  } else if (req.bus.driverDeviceId !== deviceId) {
    throw sharedLinkError();
  }

  req.bus.currentLocation = { lng, lat };
  req.bus.lastLocationAt = new Date();
  await req.bus.save();

  res.json({ ok: true, lastLocationAt: req.bus.lastLocationAt });
}

function sharedLinkError() {
  return ApiError.conflict(
    'Another device is already sharing this bus. Two devices cannot report the same ' +
      'bus at once — ask the operations team to rotate the link if this phone should ' +
      'be the one tracking.'
  );
}

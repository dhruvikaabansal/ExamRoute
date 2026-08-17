import crypto from 'crypto';
import Bus from '../models/Bus.js';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import { ROLES } from '../models/User.js';
import { runRoutingForSession } from '../services/routingEngine.js';
import { seatsOf } from '../services/clustering.js';
import { ApiError } from '../utils/apiError.js';
import { assertObjectId, assertEmail } from '../utils/validate.js';

// POST /api/admin/route/:sessionId — run the routing engine for one date+shift
export async function runRouting(req, res) {
  const sessionId = assertObjectId(req.params.sessionId, 'sessionId');
  const { buses, warnings } = await runRoutingForSession(sessionId);

  const overCapacity = buses.filter((b) => b.seatsUsed > b.capacity);
  res.json({
    message: buses.length
      ? `Routing complete — ${buses.length} bus(es), ${buses.reduce(
          (n, b) => n + b.seatsUsed,
          0
        )} seat(s) assigned`
      : 'No paid bookings to route for this session yet',
    buses,
    warnings,
    // Should always be empty: clustering asserts the capacity invariant before
    // returning. Surfaced anyway so a regression is visible, not silent.
    overCapacity: overCapacity.map((b) => b.label),
  });
}

// GET /api/admin/buses/:sessionId
export async function busesForSession(req, res) {
  const buses = await Bus.find({ session: assertObjectId(req.params.sessionId, 'sessionId') })
    .populate('center')
    .populate({ path: 'passengers', populate: { path: 'user', select: 'name email' } });
  res.json(buses);
}

// GET /api/admin/bookings/:sessionId
export async function bookingsForSession(req, res) {
  const bookings = await Booking.find({
    session: assertObjectId(req.params.sessionId, 'sessionId'),
  })
    .populate('user center')
    .sort({ createdAt: -1 });

  const paid = bookings.filter((b) => ['paid', 'assigned'].includes(b.status));
  res.json({
    bookings,
    summary: {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === 'pending').length,
      paid: paid.length,
      assigned: bookings.filter((b) => b.status === 'assigned').length,
      cancelled: bookings.filter((b) => b.status === 'cancelled').length,
      seatsToRoute: seatsOf(paid),
      boarded: bookings.filter((b) => b.boarded).length,
    },
  });
}

// GET /api/admin/bus/:busId
export async function getBus(req, res) {
  const bus = await Bus.findById(assertObjectId(req.params.busId, 'busId')).populate('center');
  if (!bus) throw ApiError.notFound('Bus not found');
  res.json(bus);
}

/**
 * POST /api/admin/bus/:busId/rotate-driver-token
 *
 * Capability links are shared over WhatsApp and printed on paper, so they
 * leak. Rotation makes that recoverable: the old link stops working the
 * moment a new one is issued, without touching anything else.
 */
export async function rotateDriverToken(req, res) {
  const bus = await Bus.findById(assertObjectId(req.params.busId, 'busId'));
  if (!bus) throw ApiError.notFound('Bus not found');

  bus.driverToken = crypto.randomBytes(24).toString('hex');
  await bus.save();
  res.json({ driverToken: bus.driverToken });
}

/**
 * PATCH /api/admin/users/role  { email, role }
 *
 * Lets the admin appoint conductors without anyone sharing the admin login.
 */
export async function setUserRole(req, res) {
  const email = assertEmail(req.body.email);
  const role = String(req.body.role || '');
  if (!ROLES.includes(role))
    throw ApiError.badRequest(`Role must be one of: ${ROLES.join(', ')}`);

  const user = await User.findOne({ email });
  if (!user) throw ApiError.notFound('No account with that email');

  // Refuse to strip the configured admin of their own access — an easy way to
  // lock everyone out of the system permanently.
  if (
    process.env.ADMIN_EMAIL &&
    email === process.env.ADMIN_EMAIL.toLowerCase() &&
    role !== 'admin'
  )
    throw ApiError.badRequest('Cannot demote the configured ADMIN_EMAIL account');

  user.role = role;
  await user.save();
  res.json({ user });
}

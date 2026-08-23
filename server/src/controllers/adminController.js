import crypto from 'crypto';
import Bus from '../models/Bus.js';
import Booking from '../models/Booking.js';
import { runRoutingForSession } from '../services/routingEngine.js';
import { seatsOf } from '../services/clustering.js';
import { ApiError } from '../utils/apiError.js';
import { assertObjectId } from '../utils/validate.js';

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
      // A refund that failed at the gateway is money we still owe a student.
      // It has to be visible to somebody or it is just a lost rupee, so it is
      // surfaced here rather than sitting in a field nobody reads.
      refundsFailed: bookings.filter((b) => b.refundStatus === 'failed').length,
      refundsOwed: bookings
        .filter((b) => b.refundStatus === 'failed')
        .reduce((sum, b) => sum + (b.refundAmount || 0), 0),
      refundedTotal: bookings
        .filter((b) => b.refundStatus === 'processed')
        .reduce((sum, b) => sum + (b.refundAmount || 0), 0),
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
 * GET /api/admin/bus/:busId/manifest — the boarding list for one bus.
 *
 * Scanning tickets one at a time answers "is this person allowed on?" but
 * never "who is still missing?". Real operators board from a manifest: the
 * whole list, ticked off as people arrive, so at departure you know that
 * three of forty have not shown up and can decide whether to wait.
 *
 * Grouped by pickup stop and ordered the way the bus drives, because that is
 * the order boarding actually happens in — a flat alphabetical list would be
 * useless standing at the second stop of six.
 */
export async function busManifest(req, res) {
  const bus = await Bus.findById(assertObjectId(req.params.busId, 'busId'))
    .populate('center')
    .populate({ path: 'passengers', populate: { path: 'user', select: 'name phone' } });
  if (!bus) throw ApiError.notFound('Bus not found');

  const passengers = (bus.passengers || []).filter((b) => b.status !== 'cancelled');

  const toRow = (b) => ({
    bookingId: b._id,
    ticketToken: b.ticketToken,
    name: b.user?.name || 'Unknown',
    // Staff need to reach a passenger who has not turned up; this endpoint is
    // admin-only, so the number goes no further than the people running the trip.
    phone: b.user?.phone || null,
    rollNumber: b.rollNumber,
    seats: b.seats,
    stopName: b.assignedStop?.name || 'Unassigned',
    pickupTime: b.pickupTime || null,
    boarded: Boolean(b.boarded),
    boardedAt: b.boardedAt || null,
  });

  // One group per stop, in the order the bus visits them.
  const order = new Map((bus.route || []).map((stop, i) => [stop.name, i]));
  const groups = new Map();
  for (const booking of passengers) {
    const row = toRow(booking);
    if (!groups.has(row.stopName)) groups.set(row.stopName, []);
    groups.get(row.stopName).push(row);
  }

  const stops = [...groups.entries()]
    .map(([name, rows]) => ({
      name,
      pickupTime: bus.route?.find((s) => s.name === name)?.pickupTime || null,
      seats: rows.reduce((n, r) => n + (r.seats || 1), 0),
      boarded: rows.filter((r) => r.boarded).length,
      passengers: rows.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999));

  res.json({
    bus: {
      id: bus._id,
      label: bus.label,
      capacity: bus.capacity,
      seatsUsed: bus.seatsUsed,
      departureTime: bus.departureTime,
      arrivalTime: bus.arrivalTime,
      isOvernight: bus.isOvernight,
      center: bus.center ? `${bus.center.name}, ${bus.center.city}` : null,
    },
    totals: {
      passengers: passengers.length,
      seats: passengers.reduce((n, b) => n + (b.seats || 1), 0),
      boarded: passengers.filter((b) => b.boarded).length,
      remaining: passengers.filter((b) => !b.boarded).length,
    },
    stops,
  });
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

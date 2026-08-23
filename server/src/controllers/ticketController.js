import Booking from '../models/Booking.js';
import { ApiError } from '../utils/apiError.js';
import { formatIst } from '../utils/time.js';

/**
 * GET /api/tickets/:token — scanning the QR opens this.
 *
 * Access is the ticket's owner, or staff. Previously any authenticated user
 * could read any ticket, which exposed another student's name, roll number
 * and exam centre. The token is unguessable, but "hard to guess" is not
 * authorisation — students share ticket screenshots, and the URL is printed
 * under the QR code.
 */
export async function getTicket(req, res) {
  const booking = await Booking.findOne({ ticketToken: String(req.params.token) })
    .populate('user', 'name email phone')
    .populate('exam center session bus');
  if (!booking) throw ApiError.notFound('Invalid ticket');

  const isOwner = String(booking.user?._id) === String(req.user._id);
  const isStaff = req.user.role === 'admin';
  if (!isOwner && !isStaff)
    throw ApiError.forbidden('This ticket belongs to another passenger');

  res.json({
    passenger: booking.user?.name,
    rollNumber: booking.rollNumber || null,
    exam: booking.exam?.name,
    shift: booking.session?.shiftLabel,
    center: booking.center ? `${booking.center.name}, ${booking.center.city}` : null,
    seats: booking.seats,
    stop: booking.assignedStop?.name || null,
    bus: booking.bus?.label || null,
    pickupTime: booking.pickupTime || null,
    pickupTimeLabel: booking.pickupTime ? formatIst(booking.pickupTime) : null,
    // What the passenger was actually told — a few minutes before the bus.
    boardBy: booking.boardBy || null,
    boardByLabel: booking.boardBy ? formatIst(booking.boardBy) : null,
    status: booking.status,
    paid: ['paid', 'assigned'].includes(booking.status) || booking.boarded,
    boarded: booking.boarded,
    boardedAt: booking.boardedAt,
    // Only staff need a contact number; students do not get each other's,
    // and the owner already knows their own.
    phone: isStaff ? booking.user?.phone || null : undefined,
    bookingId: booking._id,
  });
}

/**
 * POST /api/tickets/:token/board — mark the passenger boarded AFTER visually
 * confirming their admit card matches.
 *
 * This is the human verification step, and the only identity check the system
 * genuinely has: the app confirms the ticket is valid and paid; a person at
 * the door confirms the admit card belongs to the passenger holding it.
 */
export async function boardTicket(req, res) {
  const booking = await Booking.findOne({ ticketToken: String(req.params.token) });
  if (!booking) throw ApiError.notFound('Invalid ticket');

  if (booking.status === 'cancelled')
    throw ApiError.badRequest('This booking was cancelled');
  if (booking.boarded)
    throw ApiError.conflict(`Already boarded at ${formatIst(booking.boardedAt)}`);
  if (!['paid', 'assigned'].includes(booking.status))
    throw ApiError.badRequest('Ticket not paid — cannot board');

  booking.boarded = true;
  booking.boardedAt = new Date();
  booking.boardedBy = req.user._id;
  await booking.save();

  res.json({
    message: 'Passenger boarded ✓',
    boardedAt: booking.boardedAt,
    boardedAtLabel: formatIst(booking.boardedAt),
  });
}

import Booking from '../models/Booking.js';

// GET /api/tickets/:token  — conductor scans the QR, which opens this. Returns
// the passenger + trip summary so the conductor can visually check the admit card.
export async function getTicket(req, res) {
  const booking = await Booking.findOne({ ticketToken: req.params.token })
    .populate('user', 'name email phone')
    .populate('exam center session bus');
  if (!booking) return res.status(404).json({ message: 'Invalid ticket' });

  res.json({
    passenger: booking.user?.name,
    rollNumber: booking.rollNumber || null,
    exam: booking.exam?.name,
    shift: booking.session?.shiftLabel,
    center: booking.center ? `${booking.center.name}, ${booking.center.city}` : null,
    seats: booking.seats,
    stop: booking.assignedStop?.name || null,
    bus: booking.bus?.label || null,
    status: booking.status,
    paid: booking.status === 'paid' || booking.status === 'assigned' || booking.boarded,
    boarded: booking.boarded,
    boardedAt: booking.boardedAt,
    bookingId: booking._id,
  });
}

// POST /api/tickets/:token/board  (conductor/admin) — mark the passenger boarded
// AFTER visually confirming their admit card matches. This is the human
// verification step: the app confirms the ticket is valid & paid; the conductor
// confirms the person is a real candidate.
export async function boardTicket(req, res) {
  const booking = await Booking.findOne({ ticketToken: req.params.token });
  if (!booking) return res.status(404).json({ message: 'Invalid ticket' });
  if (!['paid', 'assigned'].includes(booking.status) && !booking.boarded)
    return res.status(400).json({ message: 'Ticket not paid — cannot board' });
  if (booking.boarded)
    return res.status(400).json({ message: 'Already boarded', boardedAt: booking.boardedAt });

  booking.boarded = true;
  booking.boardedAt = new Date();
  await booking.save();
  res.json({ message: 'Passenger boarded ✓', boardedAt: booking.boardedAt });
}

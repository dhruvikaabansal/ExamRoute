import Bus from '../models/Bus.js';
import Booking from '../models/Booking.js';
import { runRoutingForSession } from '../services/routingEngine.js';

// POST /api/admin/route/:sessionId — run the routing engine for one date+shift
export async function runRouting(req, res) {
  try {
    const buses = await runRoutingForSession(req.params.sessionId);
    res.json({ message: `Routing complete: ${buses.length} bus(es) created`, buses });
  } catch (err) {
    console.error('runRouting error:', err.message);
    res.status(500).json({ message: err.message });
  }
}

// GET /api/admin/buses/:sessionId
export async function busesForSession(req, res) {
  const buses = await Bus.find({ session: req.params.sessionId })
    .populate('center')
    .populate({ path: 'passengers', populate: { path: 'user', select: 'name email' } });
  res.json(buses);
}

// GET /api/admin/bookings/:sessionId
export async function bookingsForSession(req, res) {
  const bookings = await Booking.find({ session: req.params.sessionId })
    .populate('user center')
    .sort({ createdAt: -1 });
  res.json(bookings);
}

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

// GET /api/admin/bus/:busId — single bus (for the driver page)
export async function getBus(req, res) {
  const bus = await Bus.findById(req.params.busId).populate('center');
  if (!bus) return res.status(404).json({ message: 'Bus not found' });
  res.json(bus);
}

// POST /api/admin/bus/:busId/location  { lng, lat }
// The driver's device posts its live position here every few seconds.
export async function updateBusLocation(req, res) {
  const { lng, lat } = req.body;
  if (typeof lng !== 'number' || typeof lat !== 'number')
    return res.status(400).json({ message: 'lng and lat (numbers) required' });
  const bus = await Bus.findByIdAndUpdate(
    req.params.busId,
    { currentLocation: { lng, lat }, lastLocationAt: new Date() },
    { new: true }
  );
  if (!bus) return res.status(404).json({ message: 'Bus not found' });
  res.json({ ok: true, lastLocationAt: bus.lastLocationAt });
}

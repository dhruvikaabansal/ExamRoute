import Bus from '../models/Bus.js';
import Booking from '../models/Booking.js';
import { runRoutingForExam } from '../services/routingEngine.js';

// POST /api/admin/route/:examId  — run the routing engine for an exam
export async function runRouting(req, res) {
  try {
    const buses = await runRoutingForExam(req.params.examId);
    res.json({ message: `Routing complete: ${buses.length} bus(es) created`, buses });
  } catch (err) {
    console.error('runRouting error:', err.message);
    res.status(500).json({ message: err.message });
  }
}

// GET /api/admin/buses/:examId
export async function busesForExam(req, res) {
  const buses = await Bus.find({ exam: req.params.examId })
    .populate('center')
    .populate({ path: 'passengers', populate: { path: 'user', select: 'name email' } });
  res.json(buses);
}

// GET /api/admin/bookings/:examId
export async function bookingsForExam(req, res) {
  const bookings = await Booking.find({ exam: req.params.examId })
    .populate('user center')
    .sort({ createdAt: -1 });
  res.json(bookings);
}

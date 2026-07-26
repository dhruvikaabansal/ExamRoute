import Booking from '../models/Booking.js';
import Exam from '../models/Exam.js';
import Center from '../models/Center.js';
import { haversineKm } from '../services/mapsService.js';

// Fare = base + perKm * distance(home -> center)
function computeFare(homeCoords, centerCoords) {
  const base = Number(process.env.BASE_FARE || 100);
  const perKm = Number(process.env.FARE_PER_KM || 3);
  const km = haversineKm(homeCoords, centerCoords);
  return Math.round(base + perKm * km);
}

// POST /api/bookings/quote  { examId, centerId, coordinates:[lng,lat] }
export async function quote(req, res) {
  const { centerId, coordinates } = req.body;
  const center = await Center.findById(centerId);
  if (!center) return res.status(404).json({ message: 'Center not found' });
  const fare = computeFare(coordinates, center.location.coordinates);
  const distanceKm = Math.round(haversineKm(coordinates, center.location.coordinates));
  res.json({ fare, distanceKm });
}

// POST /api/bookings  { examId, centerId, coordinates, address }
// Creates a pending booking (payment happens next).
export async function createBooking(req, res) {
  const { examId, centerId, coordinates, address } = req.body;
  const exam = await Exam.findById(examId);
  const center = await Center.findById(centerId);
  if (!exam || !center) return res.status(404).json({ message: 'Exam/center not found' });

  const existing = await Booking.findOne({ user: req.user._id, exam: examId });
  if (existing) return res.status(409).json({ message: 'You already booked this exam' });

  const fare = computeFare(coordinates, center.location.coordinates);

  const booking = await Booking.create({
    user: req.user._id,
    exam: examId,
    center: centerId,
    homeLocation: { type: 'Point', coordinates, address },
    fare,
    status: 'pending',
  });

  res.status(201).json(booking);
}

// GET /api/bookings/mine
export async function myBookings(req, res) {
  const bookings = await Booking.find({ user: req.user._id })
    .populate('exam center bus')
    .sort({ createdAt: -1 });
  res.json(bookings);
}

import Booking from '../models/Booking.js';
import Exam from '../models/Exam.js';
import ExamSession from '../models/ExamSession.js';
import Center from '../models/Center.js';
import { computeFare } from '../utils/fare.js';

// POST /api/bookings/quote  { centerId, coordinates:[lng,lat], companions }
export async function quote(req, res) {
  const { centerId, coordinates, companions = 0 } = req.body;
  const center = await Center.findById(centerId);
  if (!center) return res.status(404).json({ message: 'Center not found' });
  const seats = 1 + Number(companions);
  const result = computeFare(coordinates, center.location.coordinates, seats);
  res.json({ ...result, seats });
}

// POST /api/bookings  { examId, sessionId, centerId, coordinates, address, companions }
export async function createBooking(req, res) {
  const { examId, sessionId, centerId, coordinates, address, companions = 0 } = req.body;

  const exam = await Exam.findById(examId);
  const session = await ExamSession.findById(sessionId);
  const center = await Center.findById(centerId);
  if (!exam || !session || !center)
    return res.status(404).json({ message: 'Exam/session/center not found' });

  const existing = await Booking.findOne({ user: req.user._id, session: sessionId });
  if (existing)
    return res.status(409).json({ message: 'You already booked this session' });

  const seats = 1 + Math.max(0, Math.min(3, Number(companions)));
  const { distanceKm, baseFare, subsidyPercent, fare } = computeFare(
    coordinates,
    center.location.coordinates,
    seats
  );

  const booking = await Booking.create({
    user: req.user._id,
    exam: examId,
    session: sessionId,
    center: centerId,
    homeLocation: { type: 'Point', coordinates, address },
    companions: seats - 1,
    seats,
    distanceKm,
    baseFare,
    subsidyPercent,
    fare,
    status: 'pending',
  });

  res.status(201).json(booking);
}

// GET /api/bookings/mine
export async function myBookings(req, res) {
  const bookings = await Booking.find({ user: req.user._id })
    .populate('exam center bus session')
    .sort({ createdAt: -1 });
  res.json(bookings);
}

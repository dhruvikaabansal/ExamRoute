import crypto from 'crypto';
import Booking from '../models/Booking.js';
import Exam from '../models/Exam.js';
import ExamSession from '../models/ExamSession.js';
import Center from '../models/Center.js';
import { computeFare } from '../utils/fare.js';
import { assignStop } from '../services/stopService.js';

// POST /api/bookings/quote  { centerId, coordinates:[lng,lat], companions }
export async function quote(req, res) {
  const { centerId, coordinates, companions = 0 } = req.body;
  const center = await Center.findById(centerId);
  if (!center) return res.status(404).json({ message: 'Center not found' });
  const seats = 1 + Number(companions);
  const result = computeFare(coordinates, center.location.coordinates, seats);
  res.json({ ...result, seats });
}

// POST /api/bookings  { examId, sessionId, centerId, coordinates, address, companions, rollNumber }
export async function createBooking(req, res) {
  const { examId, sessionId, centerId, coordinates, address, companions = 0, rollNumber } =
    req.body;

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

  // geofenced nearest pickup stop, assigned immediately (refined later by routing)
  const assigned = await assignStop(coordinates);

  const booking = await Booking.create({
    user: req.user._id,
    exam: examId,
    session: sessionId,
    center: centerId,
    rollNumber,
    homeLocation: { type: 'Point', coordinates, address },
    companions: seats - 1,
    seats,
    distanceKm,
    baseFare,
    subsidyPercent,
    fare,
    status: 'pending',
    ticketToken: crypto.randomBytes(16).toString('hex'),
    assignedStop: assigned
      ? { name: assigned.stop.name, coordinates: assigned.stop.location.coordinates }
      : undefined,
    stopDistanceKm: assigned?.distanceKm,
    stopEtaMin: assigned?.etaMin,
  });

  res.status(201).json(booking);
}

// GET /api/bookings/mine
export async function myBookings(req, res) {
  const bookings = await Booking.find({ user: req.user._id })
    .populate('exam center bus session')
    .sort({ createdAt: -1 });
  // hide "ghost" bookings whose exam/center was removed by a re-seed
  res.json(bookings.filter((b) => b.exam && b.center && b.session));
}

// GET /api/bookings/:id  (own booking, for the confirmation page)
export async function getBooking(req, res) {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id }).populate(
    'exam center bus session'
  );
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  res.json(booking);
}

// GET /api/bookings/:id/bus-location  (live position of the assigned bus)
export async function busLocation(req, res) {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id }).populate(
    'bus'
  );
  if (!booking || !booking.bus)
    return res.status(404).json({ message: 'No bus assigned yet' });
  res.json({
    currentLocation: booking.bus.currentLocation || null,
    lastLocationAt: booking.bus.lastLocationAt || null,
    departureTime: booking.bus.departureTime,
    route: booking.bus.route,
  });
}

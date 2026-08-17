import crypto from 'crypto';
import Booking from '../models/Booking.js';
import Exam from '../models/Exam.js';
import ExamSession from '../models/ExamSession.js';
import Center from '../models/Center.js';
import { computeFare } from '../utils/fare.js';
import { refundPolicy } from '../utils/refundPolicy.js';
import { refundPayment } from '../services/paymentGateway.js';
import { assignStop } from '../services/stopService.js';
import { ApiError } from '../utils/apiError.js';
import {
  assertCoordinates,
  assertObjectId,
  assertCompanions,
} from '../utils/validate.js';

/**
 * Loads and cross-checks the exam / session / centre trio.
 *
 * Each id was previously looked up independently, so nothing stopped a client
 * from pairing a NEET session id with a JEE exam id, or booking a centre in
 * another state. Referential integrity between ids supplied by the caller has
 * to be checked explicitly — the database will not do it for us.
 */
async function loadBookingContext({ examId, sessionId, centerId }) {
  const [exam, session, center] = await Promise.all([
    Exam.findById(assertObjectId(examId, 'examId')),
    ExamSession.findById(assertObjectId(sessionId, 'sessionId')),
    Center.findById(assertObjectId(centerId, 'centerId')),
  ]);

  if (!exam) throw ApiError.notFound('Exam not found');
  if (!session) throw ApiError.notFound('Exam session not found');
  if (!center) throw ApiError.notFound('Exam centre not found');

  if (String(session.exam) !== String(exam._id))
    throw ApiError.badRequest('That date and shift does not belong to the selected exam');
  if (center.state !== exam.state)
    throw ApiError.badRequest(`${center.name} does not host ${exam.name}`);

  return { exam, session, center };
}

/**
 * Bookings close before the exam.
 *
 * `Exam.bookingDeadline` existed on the model and was seeded but never read,
 * so a student could book a seat on a bus for an exam that had already
 * happened. We also refuse anything whose gate has already closed, which
 * covers exams seeded without a sensible deadline.
 */
function assertBookingOpen(exam, session) {
  const now = Date.now();
  if (exam.bookingDeadline && new Date(exam.bookingDeadline).getTime() < now)
    throw ApiError.badRequest(
      `Bookings for ${exam.name} closed on ${new Date(
        exam.bookingDeadline
      ).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    );
  if (new Date(session.gateClose).getTime() < now)
    throw ApiError.badRequest('That exam session has already taken place');
}

// POST /api/bookings/quote  { centerId, coordinates:[lng,lat], companions }
export async function quote(req, res) {
  const center = await Center.findById(assertObjectId(req.body.centerId, 'centerId'));
  if (!center) throw ApiError.notFound('Exam centre not found');

  const coordinates = assertCoordinates(req.body.coordinates);
  const seats = 1 + assertCompanions(req.body.companions);

  const result = computeFare(coordinates, center.location.coordinates, seats);
  res.json({ ...result, seats });
}

// POST /api/bookings  { examId, sessionId, centerId, coordinates, address, companions, rollNumber }
export async function createBooking(req, res) {
  const { exam, session, center } = await loadBookingContext(req.body);
  assertBookingOpen(exam, session);

  const coordinates = assertCoordinates(req.body.coordinates);
  const seats = 1 + assertCompanions(req.body.companions);
  const address = req.body.address ? String(req.body.address).slice(0, 200) : undefined;
  const rollNumber = req.body.rollNumber
    ? String(req.body.rollNumber).trim().slice(0, 40)
    : undefined;

  const existing = await Booking.findOne({ user: req.user._id, session: session._id });
  if (existing) throw ApiError.conflict('You already booked this session');

  // Fare is always derived server-side from validated coordinates — the client
  // never supplies a price, only a location we have checked.
  const { distanceKm, baseFare, subsidyPercent, fare } = computeFare(
    coordinates,
    center.location.coordinates,
    seats
  );

  // Geofenced nearest pickup stop, assigned immediately and refined by the
  // routing engine, which uses this same function so the answer cannot drift.
  const assigned = await assignStop(coordinates);

  const booking = await Booking.create({
    user: req.user._id,
    exam: exam._id,
    session: session._id,
    center: center._id,
    rollNumber,
    homeLocation: { type: 'Point', coordinates, address },
    companions: seats - 1,
    seats,
    distanceKm,
    baseFare,
    subsidyPercent,
    fare,
    status: 'pending',
    ticketToken: crypto.randomBytes(24).toString('hex'),
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
  // hide "ghost" bookings whose exam/centre was removed by a re-seed
  res.json(bookings.filter((b) => b.exam && b.center && b.session));
}

// GET /api/bookings/:id  (own booking, for the confirmation page)
export async function getBooking(req, res) {
  const booking = await Booking.findOne({
    _id: assertObjectId(req.params.id, 'booking id'),
    user: req.user._id,
  }).populate('exam center bus session');
  if (!booking) throw ApiError.notFound('Booking not found');
  res.json(booking);
}

// GET /api/bookings/:id/bus-location  (live position of the assigned bus)
export async function busLocation(req, res) {
  const booking = await Booking.findOne({
    _id: assertObjectId(req.params.id, 'booking id'),
    user: req.user._id,
  }).populate('bus');
  if (!booking) throw ApiError.notFound('Booking not found');
  if (!booking.bus) throw ApiError.notFound('No bus assigned yet');

  res.json({
    currentLocation: booking.bus.currentLocation || null,
    lastLocationAt: booking.bus.lastLocationAt || null,
    departureTime: booking.bus.departureTime,
    route: booking.bus.route,
  });
}

// GET /api/bookings/:id/refund-quote — what would I get back if I cancelled now?
//
// A student should be able to see the consequence before committing to it.
// Showing the refund only *after* an irreversible cancel is a dark pattern,
// and it is the same pure function the cancel endpoint uses, so the number
// they are shown is the number they get.
export async function refundQuote(req, res) {
  const booking = await Booking.findOne({
    _id: assertObjectId(req.params.id, 'booking id'),
    user: req.user._id,
  }).populate('session');
  if (!booking) throw ApiError.notFound('Booking not found');

  const paid = ['paid', 'assigned'].includes(booking.status);
  if (!paid) return res.json({ percent: 0, amount: 0, amountPaid: 0, unpaid: true });

  const { percent, amount, amountPaid, reason } = refundPolicy(
    booking.fare,
    booking.session.gateClose
  );
  res.json({ percent, amount, amountPaid, reason });
}

// POST /api/bookings/:id/cancel — a student cancels their own seat
export async function cancelBooking(req, res) {
  const booking = await Booking.findOne({
    _id: assertObjectId(req.params.id, 'booking id'),
    user: req.user._id,
  }).populate('session');
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.status === 'cancelled')
    throw ApiError.badRequest('This booking is already cancelled');
  if (booking.boarded) throw ApiError.badRequest('You have already boarded this bus');
  if (booking.session && new Date(booking.session.gateClose).getTime() < Date.now())
    throw ApiError.badRequest('That exam session has already taken place');

  const wasPaid = ['paid', 'assigned'].includes(booking.status);
  const quote = wasPaid
    ? refundPolicy(booking.fare, booking.session.gateClose)
    : { percent: 0, amount: 0, reason: 'Nothing was paid, so nothing is refundable' };

  /**
   * Release the seat FIRST, then attempt the money.
   *
   * These are two systems and the second one can fail. If we called Razorpay
   * before saving and the request timed out, we would either hold a seat the
   * student thinks they cancelled, or refund someone who still has a booking.
   * Releasing first means the worst case is a refund marked `failed` for an
   * admin to settle — recorded, visible, and recoverable — rather than an
   * inconsistency nobody can see.
   */
  booking.status = 'cancelled';
  booking.bus = undefined;
  booking.pickupTime = undefined;
  booking.refundStatus = wasPaid && quote.amount > 0 ? 'pending' : 'none';
  booking.refundAmount = quote.amount;
  await booking.save();

  let refundNote = quote.reason;

  if (booking.refundStatus === 'pending') {
    const result = await refundPayment({
      paymentId: booking.razorpayPaymentId,
      amountInRupees: quote.amount,
      notes: { bookingId: String(booking._id), reason: 'Student cancellation' },
    });

    if (result.ok) {
      booking.refundStatus = 'processed';
      booking.refundId = result.refundId;
      booking.refundedAt = new Date();
      refundNote = result.mock
        ? `${quote.reason}. ₹${quote.amount} refunded (mock payment — nothing was actually charged).`
        : `${quote.reason}. ₹${quote.amount} is on its way back to your original payment method, usually within 5-7 working days.`;
    } else {
      booking.refundStatus = 'failed';
      booking.refundError = result.error;
      refundNote = `Your seat is cancelled and ₹${quote.amount} is owed to you, but the refund could not be placed automatically (${result.error}). Our team will settle it manually.`;
    }
    await booking.save();
  }

  // Cancelled seats are excluded from routing, so re-running the engine
  // reclaims the capacity automatically.
  res.json({
    message: 'Booking cancelled',
    refund: {
      status: booking.refundStatus,
      percent: quote.percent,
      amount: booking.refundAmount,
      refundId: booking.refundId,
    },
    refundNote,
    booking,
  });
}

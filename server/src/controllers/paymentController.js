import crypto from 'crypto';
import Booking from '../models/Booking.js';
import { ApiError } from '../utils/apiError.js';
import { assertObjectId } from '../utils/validate.js';
import { formatIst } from '../utils/time.js';
import {
  mockPayments,
  mockPaymentsAllowed,
  getInstance,
} from '../services/paymentGateway.js';

/**
 * If Razorpay keys are not configured we run in DEV MOCK MODE: payment is
 * simulated so the whole flow (booking → paid → routing → QR → tracking) can
 * be demonstrated without a Razorpay account. That decision lives in
 * `services/paymentGateway.js` so the refund path reaches the same answer.
 */

/*
 * There is no confirmation email, and that is deliberate.
 *
 * Sending one reliably needs a domain we own and have verified: hosting tiers
 * block outbound SMTP, and transactional providers will only deliver to the
 * sender's own address until a domain is proved. What that produced was an
 * email that reached exactly one person and silently 403'd for everyone else —
 * and a confirmation that quietly does not arrive is worse than none, because
 * the student stops looking for the information and starts waiting for it.
 *
 * So the ticket lives where it cannot go missing. Payment lands on the
 * confirmation screen, the booking is in My Bookings with its stop, fare and
 * QR code, and the departure time appears there once routing runs. Nothing
 * about the journey depends on a message we cannot guarantee.
 */

/**
 * Loads a booking the caller owns and is allowed to pay for.
 *
 * The deadline check is the important one, and it was missing. Bookings closed
 * on the deadline, but *paying* did not — so a seat reserved and left unpaid
 * could be settled days later, after the buses for that sitting had already
 * been formed, seated and published. The money arrived for a journey that was
 * already planned without them.
 *
 * Once the window shuts, the cohort is final. That is the whole reason routing
 * can produce short routes: it sees everybody at once. Letting payments trickle
 * in afterwards quietly reopens a decision that has already been made, and
 * lands the problem on whoever is holding the boarding list.
 */
async function loadPayableBooking(req) {
  const booking = await Booking.findOne({
    _id: assertObjectId(req.body.bookingId, 'bookingId'),
    user: req.user._id,
  }).populate('exam session');

  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.status === 'cancelled')
    throw ApiError.badRequest('This booking was cancelled');
  if (['paid', 'assigned'].includes(booking.status))
    throw ApiError.badRequest('Already paid');

  const deadline = booking.exam?.bookingDeadline;
  if (deadline && new Date(deadline).getTime() < Date.now())
    throw ApiError.badRequest(
      'Bookings for this exam have closed, so this seat can no longer be paid for. ' +
        'It has been released for someone else.'
    );

  if (booking.session && new Date(booking.session.gateClose).getTime() < Date.now())
    throw ApiError.badRequest('That exam session has already taken place');

  return booking;
}

// POST /api/payments/order  { bookingId }
export async function createOrder(req, res) {
  const booking = await loadPayableBooking(req);

  // DEV MOCK: no Razorpay keys → tell the client to use the mock-confirm flow
  if (mockPayments)
    return res.json({ mock: true, bookingId: booking._id, amount: booking.fare * 100 });

  const order = await getInstance().orders.create({
    amount: booking.fare * 100, // paise
    currency: 'INR',
    receipt: `booking_${booking._id}`,
  });

  booking.razorpayOrderId = order.id;
  await booking.save();

  res.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
  });
}

/**
 * POST /api/payments/mock-confirm  { bookingId }   (DEV / EXPLICIT DEMO ONLY)
 *
 * Refused outside development, with no override. This exists so the project
 * can be cloned and run with nothing but a database URL; it is not a way to
 * deploy without a gateway. "Mark my booking paid for free" should not be one
 * environment variable away from being live, so there is no such variable.
 */
export async function mockConfirm(req, res) {
  if (!mockPaymentsAllowed())
    throw ApiError.forbidden('Mock payments are disabled in production');
  if (!mockPayments)
    throw ApiError.badRequest('Mock payments disabled (Razorpay is configured)');

  const booking = await loadPayableBooking(req);
  booking.status = 'paid';
  booking.razorpayPaymentId = 'mock_' + Date.now();
  booking.paidAt = new Date();
  await booking.save();

  res.json({ success: true, booking, mock: true });
}

// POST /api/payments/verify  (real Razorpay flow)
export async function verifyPayment(req, res) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    throw ApiError.badRequest('Missing payment verification fields');

  const booking = await loadPayableBooking(req);

  // The signature proves Razorpay produced this result, not the browser.
  // Trusting the client's "payment succeeded" callback would make the whole
  // payment step decorative.
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const provided = Buffer.from(String(razorpay_signature));
  const computed = Buffer.from(expected);
  const valid =
    provided.length === computed.length && crypto.timingSafeEqual(provided, computed);
  if (!valid) throw ApiError.badRequest('Payment signature verification failed');

  // The order id must be the one we created for THIS booking, otherwise a
  // valid signature from any other order would pay for any other seat.
  if (booking.razorpayOrderId && booking.razorpayOrderId !== razorpay_order_id)
    throw ApiError.badRequest('Payment does not match this booking');

  booking.status = 'paid';
  booking.razorpayPaymentId = razorpay_payment_id;
  booking.paidAt = new Date();
  await booking.save();

  res.json({ success: true, booking, paidAtLabel: formatIst(booking.paidAt) });
}

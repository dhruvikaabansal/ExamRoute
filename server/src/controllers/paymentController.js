import crypto from 'crypto';
import Booking from '../models/Booking.js';
import { sendMail } from '../services/mailer.js';
import { ApiError } from '../utils/apiError.js';
import { assertObjectId } from '../utils/validate.js';
import { formatIst } from '../utils/time.js';
import { mockPayments, getInstance } from '../services/paymentGateway.js';

/**
 * If Razorpay keys are not configured we run in DEV MOCK MODE: payment is
 * simulated so the whole flow (booking → paid → routing → QR → tracking) can
 * be demonstrated without a Razorpay account. That decision lives in
 * `services/paymentGateway.js` so the refund path reaches the same answer.
 */

function sendConfirmation(user, booking) {
  const stop = booking.assignedStop?.name;
  sendMail({
    to: user.email,
    subject: '🎫 ExamRoute booking confirmed — all the best!',
    text: `Hi ${user.name}, your bus seat is booked.

Nearest pickup stop: ${stop || 'to be assigned'}${
      booking.stopEtaMin ? ` (~${booking.stopEtaMin} min from home)` : ''
    }
Seats: ${booking.seats}
Paid: ₹${booking.fare}${
      booking.subsidyPercent ? ` (after ${booking.subsidyPercent}% distance subsidy)` : ''
    }

We'll confirm your exact bus and departure time once routing runs. All the best for your exam!`,
  }).catch((err) => console.warn('Confirmation email failed:', err.message));
}

/** Loads a booking the caller owns and is allowed to pay for. */
async function loadPayableBooking(req) {
  const booking = await Booking.findOne({
    _id: assertObjectId(req.body.bookingId, 'bookingId'),
    user: req.user._id,
  });
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.status === 'cancelled')
    throw ApiError.badRequest('This booking was cancelled');
  if (['paid', 'assigned'].includes(booking.status))
    throw ApiError.badRequest('Already paid');
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
 * POST /api/payments/mock-confirm  { bookingId }   (DEV ONLY)
 *
 * Hard-blocked in production regardless of key configuration. A mis-set
 * environment variable should never be enough to turn "mark my booking paid
 * for free" into a live endpoint.
 */
export async function mockConfirm(req, res) {
  if (process.env.NODE_ENV === 'production')
    throw ApiError.forbidden('Mock payments are disabled in production');
  if (!mockPayments)
    throw ApiError.badRequest('Mock payments disabled (Razorpay is configured)');

  const booking = await loadPayableBooking(req);
  booking.status = 'paid';
  booking.razorpayPaymentId = 'mock_' + Date.now();
  booking.paidAt = new Date();
  await booking.save();

  sendConfirmation(req.user, booking);
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

  sendConfirmation(req.user, booking);
  res.json({ success: true, booking, paidAtLabel: formatIst(booking.paidAt) });
}

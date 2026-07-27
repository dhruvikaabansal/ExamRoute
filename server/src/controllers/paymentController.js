import crypto from 'crypto';
import Razorpay from 'razorpay';
import Booking from '../models/Booking.js';
import { sendMail } from '../services/mailer.js';

// If Razorpay keys aren't configured we run in DEV MOCK MODE: payment is
// simulated so the whole flow (booking -> paid -> routing -> QR -> tracking)
// can be tested without a Razorpay account. Add real keys to enable real checkout.
// NOTE: placeholder values from .env.example (e.g. rzp_test_xxxx / your_razorpay_secret)
// count as "not configured" so the demo doesn't try to hit Razorpay with fake keys.
function razorpayConfigured() {
  const id = process.env.RAZORPAY_KEY_ID || '';
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  return (
    id.startsWith('rzp_') &&
    !id.toLowerCase().includes('xxx') &&
    secret.length > 0 &&
    secret !== 'your_razorpay_secret'
  );
}
const mockPayments = !razorpayConfigured();

if (mockPayments) console.log('💳 Payments in DEV MOCK MODE (no real Razorpay keys)');

function getInstance() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function sendConfirmation(user, booking) {
  const stop = booking.assignedStop?.name;
  sendMail({
    to: user.email,
    subject: '🎫 ExamRoute booking confirmed — all the best!',
    text: `Hi ${user.name}, your bus seat is booked. Nearest pickup stop: ${
      stop || 'to be assigned'
    } (~${booking.stopEtaMin || '?'} min from home). We'll confirm your exact bus and departure time soon. All the best for your exam!`,
  }).catch(() => {});
}

// POST /api/payments/order  { bookingId }
export async function createOrder(req, res) {
  try {
    const { bookingId } = req.body;
    const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.status === 'paid' || booking.status === 'assigned')
      return res.status(400).json({ message: 'Already paid' });

    // DEV MOCK: no Razorpay keys -> tell the client to use the mock-confirm flow
    if (mockPayments) {
      return res.json({ mock: true, bookingId: booking._id, amount: booking.fare * 100 });
    }

    const instance = getInstance();
    const order = await instance.orders.create({
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
  } catch (err) {
    console.error('createOrder error:', err.message);
    res.status(500).json({ message: 'Could not create payment order' });
  }
}

// POST /api/payments/mock-confirm  { bookingId }   (DEV ONLY — no real payment)
export async function mockConfirm(req, res) {
  if (!mockPayments)
    return res.status(400).json({ message: 'Mock payments disabled (Razorpay is configured)' });
  const booking = await Booking.findOne({ _id: req.body.bookingId, user: req.user._id });
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  booking.status = 'paid';
  booking.razorpayPaymentId = 'mock_' + Date.now();
  await booking.save();
  sendConfirmation(req.user, booking);
  res.json({ success: true, booking, mock: true });
}

// POST /api/payments/verify  (real Razorpay flow)
export async function verifyPayment(req, res) {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature)
      return res.status(400).json({ message: 'Payment signature verification failed' });

    const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.status = 'paid';
    booking.razorpayPaymentId = razorpay_payment_id;
    await booking.save();
    sendConfirmation(req.user, booking);

    res.json({ success: true, booking });
  } catch (err) {
    console.error('verifyPayment error:', err.message);
    res.status(500).json({ message: 'Verification error' });
  }
}

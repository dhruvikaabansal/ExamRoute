import crypto from 'crypto';
import Razorpay from 'razorpay';
import Booking from '../models/Booking.js';

function getInstance() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// POST /api/payments/order  { bookingId }
// Creates a Razorpay order for the booking's fare.
export async function createOrder(req, res) {
  try {
    const { bookingId } = req.body;
    const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.status === 'paid' || booking.status === 'assigned')
      return res.status(400).json({ message: 'Already paid' });

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

// POST /api/payments/verify
// { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Server-side signature verification — never trust the client callback alone.
export async function verifyPayment(req, res) {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment signature verification failed' });
    }

    const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.status = 'paid';
    booking.razorpayPaymentId = razorpay_payment_id;
    await booking.save();

    res.json({ success: true, booking });
  } catch (err) {
    console.error('verifyPayment error:', err.message);
    res.status(500).json({ message: 'Verification error' });
  }
}

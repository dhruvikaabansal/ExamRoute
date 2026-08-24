import './env.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { dbReady } from './db.js';
import { createApp } from '../src/app.js';
import Booking from '../src/models/Booking.js';
import { makeUser, makeCenter, makeExamWithSession, makePaidBooking, JAIPUR } from './factories.js';

/**
 * The real Razorpay verification path.
 *
 * This is the security-critical endpoint in the whole application: it is the
 * one that turns an unpaid booking into a paid one, and until now it had no
 * test at all. The rest of the suite runs with the Razorpay keys deleted, so
 * every payment took the mock branch and the signature check — the code that
 * actually stops someone paying for a seat by POSTing some JSON — was never
 * once executed.
 *
 * It does not need Razorpay to test. The signature is an HMAC of
 * `order_id|payment_id` keyed on the API secret, so the same crypto that
 * Razorpay uses to sign can be used here to forge a legitimate one. That makes
 * the honest cases reachable offline: a correct signature is accepted, and
 * every way of getting it wrong is refused.
 */

const SECRET = 'test_razorpay_secret_key';

function sign(orderId, paymentId, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

let app;
let saved;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  // Configure a gateway for the duration of these tests only. The module
  // reads process.env at call time rather than capturing it at import, which
  // is precisely why this can be done without resetting the module registry.
  saved = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = SECRET;
});

afterAll(() => {
  if (saved === undefined) delete process.env.RAZORPAY_KEY_SECRET;
  else process.env.RAZORPAY_KEY_SECRET = saved;
});

const tokenFor = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
const asUser = (req, user) => req.set('Authorization', `Bearer ${tokenFor(user)}`);

async function pendingBooking(orderId) {
  const user = await makeUser();
  const center = await makeCenter();
  const { exam, session } = await makeExamWithSession();
  const booking = await makePaidBooking({
    user,
    exam,
    session,
    center,
    coordinates: JAIPUR,
    status: 'pending',
  });
  if (orderId) {
    booking.razorpayOrderId = orderId;
    await booking.save();
  }
  return { user, booking };
}

const verify = (user, body) =>
  asUser(request(app).post('/api/payments/verify'), user).send(body);

describe.skipIf(!dbReady)('Razorpay signature verification', () => {
  it('marks the booking paid when the signature is genuine', async () => {
    const { user, booking } = await pendingBooking('order_genuine_1');

    const res = await verify(user, {
      bookingId: String(booking._id),
      razorpay_order_id: 'order_genuine_1',
      razorpay_payment_id: 'pay_abc123',
      razorpay_signature: sign('order_genuine_1', 'pay_abc123'),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const stored = await Booking.findById(booking._id);
    expect(stored.status).toBe('paid');
    expect(stored.razorpayPaymentId).toBe('pay_abc123');
    expect(stored.paidAt).toBeTruthy();
  });

  /*
    The attack the endpoint exists to stop. Without the HMAC check, this
    request — which any logged-in student could craft by hand — is a free
    seat.
  */
  it('refuses a fabricated signature, and leaves the booking unpaid', async () => {
    const { user, booking } = await pendingBooking('order_forged_1');

    const res = await verify(user, {
      bookingId: String(booking._id),
      razorpay_order_id: 'order_forged_1',
      razorpay_payment_id: 'pay_abc123',
      razorpay_signature: 'f'.repeat(64),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/signature/i);

    const stored = await Booking.findById(booking._id);
    expect(stored.status).toBe('pending');
    expect(stored.paidAt).toBeFalsy();
  });

  it('refuses a signature computed with the wrong secret', async () => {
    const { user, booking } = await pendingBooking('order_wrongkey_1');

    const res = await verify(user, {
      bookingId: String(booking._id),
      razorpay_order_id: 'order_wrongkey_1',
      razorpay_payment_id: 'pay_abc123',
      razorpay_signature: sign('order_wrongkey_1', 'pay_abc123', 'not_the_real_secret'),
    });

    expect(res.status).toBe(400);
    expect((await Booking.findById(booking._id)).status).toBe('pending');
  });

  /*
    A signature is only valid for the pair it was computed over, so swapping
    either half after signing has to fail. Worth pinning separately: an
    implementation that hashed only the payment id would pass the test above
    and fail this one.
  */
  it('refuses a signature whose payment id has been swapped', async () => {
    const { user, booking } = await pendingBooking('order_swap_1');

    const res = await verify(user, {
      bookingId: String(booking._id),
      razorpay_order_id: 'order_swap_1',
      razorpay_payment_id: 'pay_somebody_elses',
      razorpay_signature: sign('order_swap_1', 'pay_mine'),
    });

    expect(res.status).toBe(400);
  });

  /*
    The second, quieter check. A signature can be perfectly genuine and still
    belong to a different booking — Razorpay signed it, after all. Without
    tying the order id back to this booking, one real ₹100 payment could be
    replayed to settle every seat the attacker owns.
  */
  it('refuses a genuine signature that belongs to another booking', async () => {
    const { user, booking } = await pendingBooking('order_mine_1');

    const res = await verify(user, {
      bookingId: String(booking._id),
      razorpay_order_id: 'order_someone_elses_1',
      razorpay_payment_id: 'pay_xyz789',
      // Genuinely signed — just not for this order.
      razorpay_signature: sign('order_someone_elses_1', 'pay_xyz789'),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not match/i);
    expect((await Booking.findById(booking._id)).status).toBe('pending');
  });

  it('rejects a request with the verification fields missing', async () => {
    const { user, booking } = await pendingBooking('order_missing_1');

    const res = await verify(user, { bookingId: String(booking._id) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/missing/i);
  });

  /*
    timingSafeEqual throws on length-mismatched buffers, so the length is
    compared first. If that guard were ever removed this becomes a 500 — an
    unhandled crash on an endpoint an attacker controls the input to.
  */
  it('answers 400, not 500, when the signature is the wrong length', async () => {
    const { user, booking } = await pendingBooking('order_short_1');

    const res = await verify(user, {
      bookingId: String(booking._id),
      razorpay_order_id: 'order_short_1',
      razorpay_payment_id: 'pay_abc123',
      razorpay_signature: 'abc',
    });

    expect(res.status).toBe(400);
  });
});

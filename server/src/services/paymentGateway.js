import Razorpay from 'razorpay';

/**
 * One place that decides whether payments are real.
 *
 * This check used to live inside the payment controller, which was fine until
 * refunds needed the same answer. Two copies of "are we in mock mode?" is one
 * copy too many — they drift, and the failure mode is a refund silently
 * pretending to succeed against real money, or the reverse.
 *
 * Placeholder values from .env.example (rzp_test_xxxx, your_razorpay_secret)
 * count as "not configured", so a half-filled .env never tries to hit
 * Razorpay with obviously fake keys.
 */
export function razorpayConfigured(env = process.env) {
  const id = env.RAZORPAY_KEY_ID || '';
  const secret = env.RAZORPAY_KEY_SECRET || '';
  return (
    id.startsWith('rzp_') &&
    !id.toLowerCase().includes('xxx') &&
    secret.length > 0 &&
    secret !== 'your_razorpay_secret'
  );
}

export const mockPayments = !razorpayConfigured();

/**
 * Whether simulated payments may actually be confirmed.
 *
 * Mock payments are blocked in production, because "mark my booking paid for
 * free" is not an endpoint a mis-set environment variable should be able to
 * expose. But a *public demo* is a production deployment by every other
 * measure — real host, real database, NODE_ENV=production — and a demo where
 * nobody can complete a booking demonstrates nothing.
 *
 * So the exception is explicit rather than implicit. Weakening the NODE_ENV
 * check would have conflated two different questions: "is this production?"
 * and "is this deployment allowed to fake payments?". They deserve separate
 * answers, and the second one requires somebody to have deliberately typed
 * ALLOW_MOCK_PAYMENTS=true.
 */
export function mockPaymentsAllowed(env = process.env) {
  return env.NODE_ENV !== 'production' || env.ALLOW_MOCK_PAYMENTS === 'true';
}

/**
 * True when this deployment is publicly showing simulated payments — i.e. it
 * is production, has no real gateway, and has been told that is acceptable.
 *
 * Deliberately a function of the environment rather than a constant captured
 * at import: a constant can only be tested by resetting the module registry,
 * which in a shared module graph re-registers every Mongoose model and breaks
 * unrelated files. A pure function is both easier to test and easier to
 * reason about.
 */
export function demoMode(env = process.env) {
  return !razorpayConfigured(env) && mockPaymentsAllowed(env) && env.NODE_ENV === 'production';
}

if (mockPayments) console.log('💳 Payments in DEV MOCK MODE (no real Razorpay keys)');

// Loud on purpose. If this ever appears in the logs of something handling real
// money, it should be impossible to scroll past.
if (demoMode())
  console.warn(
    '\n⚠️  ALLOW_MOCK_PAYMENTS=true in production — payments are SIMULATED.\n' +
      '   Correct for a public demo, catastrophic for anything taking real money.\n'
  );

export function getInstance() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

/**
 * Issues a refund against a captured payment.
 *
 * Returns a result object rather than throwing, because a failed refund must
 * NOT fail the cancellation. The student's seat has already been released and
 * their exam is approaching; making them retry a cancel because our gateway
 * call timed out would be the wrong trade. We record `failed` plus the reason
 * and surface it to the admin, so a human can settle it.
 *
 * Amounts are in rupees here and converted to paise at the boundary — Razorpay
 * works in the smallest currency unit, and mixing the two is a classic way to
 * refund 100x what you meant to.
 */
export async function refundPayment({ paymentId, amountInRupees, notes = {} }) {
  if (!paymentId) return { ok: false, mock: false, error: 'No payment to refund' };

  // Mock payments were never charged, so there is nothing to send back. We
  // still report success: from the student's point of view the outcome is
  // identical, and the demo flow stays honest about the amount.
  if (mockPayments || String(paymentId).startsWith('mock_')) {
    return {
      ok: true,
      mock: true,
      refundId: 'mock_refund_' + Date.now(),
      amount: amountInRupees,
    };
  }

  try {
    const refund = await getInstance().payments.refund(paymentId, {
      amount: Math.round(amountInRupees * 100), // paise
      speed: 'normal',
      notes,
    });
    return { ok: true, mock: false, refundId: refund.id, amount: amountInRupees };
  } catch (err) {
    // Razorpay nests the useful message; fall back to the raw one.
    const message =
      err?.error?.description || err?.message || 'Refund failed at the gateway';
    console.error('Refund failed:', message);
    return { ok: false, mock: false, error: message };
  }
}

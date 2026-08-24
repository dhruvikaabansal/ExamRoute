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
 * Never in production. There is no opt-out.
 *
 * There used to be one: `ALLOW_MOCK_PAYMENTS=true` let a public demo confirm
 * bookings without a gateway, on the reasoning that a demo nobody can complete
 * a booking on demonstrates nothing. That reasoning was sound and the result
 * was still wrong — a deployed site that says "payments are simulated" is
 * asking every visitor to imagine the feature working. Wiring real Razorpay
 * test keys costs nothing, exercises the genuine checkout, the genuine order
 * ids and the genuine signature verification, and only the money is fake.
 *
 * So the escape hatch is gone rather than merely discouraged. An endpoint that
 * marks a booking paid for free should not be one environment variable away
 * from being live, and the flag being *typed deliberately* is not much comfort
 * when the person typing it is copying a variable list into a dashboard.
 *
 * Locally, with no keys, the mock path still runs — that is what keeps the
 * project cloneable and runnable with nothing but a database URL.
 */
export function mockPaymentsAllowed(env = process.env) {
  return env.NODE_ENV !== 'production';
}

/**
 * True when this deployment is publicly showing simulated payments.
 *
 * Now impossible by construction, and kept as a function rather than deleted
 * because the frontend banner and the tests both ask the question, and the
 * honest answer needs to stay reachable if the policy ever changes again.
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

if (mockPayments) console.log('Payments in DEV MOCK MODE (no Razorpay keys configured)');

/*
  A production deployment with no gateway can no longer fake a payment, so it
  cannot take one either. Failing at boot with an explanation beats failing at
  checkout in front of whoever you are demonstrating to.
*/
if (process.env.NODE_ENV === 'production' && !razorpayConfigured()) {
  console.error(
    '\nRAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set in production.\n' +
      '   Payments will fail: simulated confirmation is disabled outside development.\n' +
      '   Test-mode keys from the Razorpay dashboard are free and work end to end.\n'
  );
}

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

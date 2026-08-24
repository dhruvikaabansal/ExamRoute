import './env.js';
import { describe, it, expect } from 'vitest';
import {
  razorpayConfigured,
  mockPaymentsAllowed,
  demoMode,
} from '../src/services/paymentGateway.js';

/**
 * The gate on simulated payments.
 *
 * Each of these takes an explicit environment object rather than reading
 * process.env, so every combination can be checked in one process without
 * mutating global state or resetting the module registry — the latter would
 * re-register the Mongoose models that other test files share.
 */

const REAL_KEYS = {
  RAZORPAY_KEY_ID: 'rzp_test_realkey123',
  RAZORPAY_KEY_SECRET: 'a-real-looking-secret',
};

describe('mock payment gating', () => {
  it('allows simulated payments in development', () => {
    expect(mockPaymentsAllowed({ NODE_ENV: 'development' })).toBe(true);
  });

  it('blocks simulated payments in production by default', () => {
    expect(mockPaymentsAllowed({ NODE_ENV: 'production' })).toBe(false);
  });

  it('forgetting to configure Razorpay is not enough to enable them', () => {
    // No keys at all — exactly the state a careless production deploy is in.
    const env = { NODE_ENV: 'production' };
    expect(razorpayConfigured(env)).toBe(false); // no real gateway...
    expect(mockPaymentsAllowed(env)).toBe(false); // ...and still refused
  });

  /*
    There used to be an opt-out — ALLOW_MOCK_PAYMENTS=true, so a public demo
    with no gateway could still complete a booking. It is gone, and this is
    the test that stops it coming back: no value of any environment variable
    may re-enable simulated payments in production.

    The old flag is included in the sweep deliberately. If someone restores
    that branch, this fails rather than quietly working again.
  */
  it('cannot be re-enabled in production by any environment variable', () => {
    for (const extra of [
      { ALLOW_MOCK_PAYMENTS: 'true' },
      { ALLOW_MOCK_PAYMENTS: '1' },
      { DEMO: 'true' },
      {},
    ]) {
      expect(mockPaymentsAllowed({ NODE_ENV: 'production', ...extra })).toBe(false);
    }
  });

  it('does not claim demo mode when real Razorpay keys are configured', () => {
    const env = { NODE_ENV: 'production', ...REAL_KEYS };
    expect(razorpayConfigured(env)).toBe(true);
    expect(demoMode(env)).toBe(false);
  });

  /*
    demoMode is now unreachable: it requires production, and production
    refuses simulated payments. Pinned so the banner logic and this gate can
    never drift into disagreeing about whether money is real.
  */
  it('is unreachable, because production no longer permits simulation', () => {
    expect(demoMode({ NODE_ENV: 'production' })).toBe(false);
  });

  it('is never demo mode outside production', () => {
    expect(demoMode({ NODE_ENV: 'development' })).toBe(false);
    expect(demoMode({ NODE_ENV: 'test' })).toBe(false);
  });

  it('treats .env.example placeholders as unconfigured', () => {
    expect(
      razorpayConfigured({
        RAZORPAY_KEY_ID: 'rzp_test_xxxxxxxx',
        RAZORPAY_KEY_SECRET: 'your_razorpay_secret',
      })
    ).toBe(false);
  });

  it('rejects a key id that is not a Razorpay key at all', () => {
    expect(
      razorpayConfigured({ RAZORPAY_KEY_ID: 'sk_live_something', RAZORPAY_KEY_SECRET: 'x' })
    ).toBe(false);
  });
});

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

  it('allows them in production only when explicitly opted in', () => {
    const env = { NODE_ENV: 'production', ALLOW_MOCK_PAYMENTS: 'true' };
    expect(mockPaymentsAllowed(env)).toBe(true);
    expect(demoMode(env)).toBe(true);
  });

  it('requires the exact string "true", not any truthy-looking value', () => {
    for (const value of ['1', 'yes', 'TRUE', 'on', '', 'false']) {
      expect(
        mockPaymentsAllowed({ NODE_ENV: 'production', ALLOW_MOCK_PAYMENTS: value })
      ).toBe(false);
    }
  });

  it('does not claim demo mode when real Razorpay keys are configured', () => {
    const env = { NODE_ENV: 'production', ALLOW_MOCK_PAYMENTS: 'true', ...REAL_KEYS };
    expect(razorpayConfigured(env)).toBe(true);
    expect(demoMode(env)).toBe(false);
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

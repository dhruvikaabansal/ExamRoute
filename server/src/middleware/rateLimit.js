import rateLimit from 'express-rate-limit';

/**
 * Rate limiting.
 *
 * The endpoints that needed this most were the OTP ones. A 6-digit code has
 * a million possibilities and a ten-minute lifetime; with no throttle, that is
 * a scriptable brute force rather than a security control. `resendOtp` was
 * also an unauthenticated way to make our server email an arbitrary address
 * repeatedly.
 *
 * Per-account limits live alongside these (see `otpAttempts` on the User
 * model): these caps are per IP, the counter is per account, and an attacker
 * has to get past both.
 */

const message = (msg) => ({ message: msg });

// Broad backstop for the whole API.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many requests — please slow down'),
});

// Login and registration: slow down credential stuffing.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: message('Too many attempts — try again in a few minutes'),
});

// OTP verification: the brute-force surface.
export const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: message('Too many incorrect codes — request a new one shortly'),
});

// Sending OTP email: stops us being used as an email cannon.
export const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many codes requested — please wait before trying again'),
});

// Driver devices post GPS every few seconds, so this ceiling is deliberately
// high; it exists to bound abuse of a leaked link, not to throttle normal use.
export const driverLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Location updates are being sent too frequently'),
});

import rateLimit from 'express-rate-limit';

/**
 * Rate limiting.
 *
 * The endpoints that needed this most were the OTP ones, and they are gone
 * with the email auth path — a six-digit code with a million possibilities
 * and a ten-minute life is a brute force waiting to happen without a throttle.
 * Removing the credential removed the attack, which is a better outcome than
 * rate limiting it.
 *
 * What remains is bounding abuse rather than guessing: sign-in still calls out
 * to Google on every request, and the driver endpoint is reachable by anyone
 * holding a link.
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

/*
  The OTP limiters lived here — one bounding code guesses, one stopping the
  endpoint being used as an email cannon. Both went with the email auth path
  they protected. A rate limiter guarding a route that no longer exists is
  dead weight that still looks like a security control, which is worse than
  no limiter at all: it invites the assumption that something is covered.
*/

// Driver devices post GPS every few seconds, so this ceiling is deliberately
// high; it exists to bound abuse of a leaked link, not to throttle normal use.
export const driverLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Location updates are being sent too frequently'),
});

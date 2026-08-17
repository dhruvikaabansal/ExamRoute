/**
 * Express 4 does not catch rejected promises from async route handlers.
 *
 * Without this, `throw` (or any awaited failure — a bad ObjectId producing a
 * Mongoose CastError, for example) inside an `async` controller becomes an
 * unhandled rejection: the error handler never runs, the client's request
 * hangs until it times out, and on Node 15+ the process can be torn down.
 *
 * `asyncHandler` adapts a promise-returning handler to the callback contract
 * Express actually expects, so every failure reaches the error middleware.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Wraps every function exported by a controller module in one call, so we
 * cannot forget one. Used as:
 *
 *   import * as bookings from '../controllers/bookingController.js';
 *   const bookingC = wrapAll(bookings);
 */
export const wrapAll = (mod) =>
  Object.fromEntries(
    Object.entries(mod).map(([key, value]) => [
      key,
      typeof value === 'function' ? asyncHandler(value) : value,
    ])
  );

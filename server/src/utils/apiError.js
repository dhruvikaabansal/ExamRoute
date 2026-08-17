/**
 * A typed HTTP error.
 *
 * Controllers `throw ApiError.badRequest('...')` instead of hand-rolling
 * `res.status(400).json(...)` everywhere. The central error handler in
 * `app.js` turns these into responses, so error shape is consistent across
 * the whole API and there is exactly one place that formats failures.
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.expected = true; // distinguishes "we meant this" from a real crash
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = 'Not authenticated') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'Not allowed') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }
  static conflict(message, details) {
    return new ApiError(409, message, details);
  }
  static tooMany(message = 'Too many requests') {
    return new ApiError(429, message);
  }
}

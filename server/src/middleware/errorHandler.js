import { ApiError } from '../utils/apiError.js';

/** 404 for anything that fell through the router. */
export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

/**
 * The single place failures become responses.
 *
 * Translates the error types we actually see into honest status codes rather
 * than blanket 500s — a malformed ObjectId is the caller's mistake (400), a
 * duplicate key is a conflict (409). Unexpected errors are logged in full but
 * returned as a generic message, so stack traces and driver internals never
 * reach the client in production.
 */
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Bad ObjectId in a path param — used to become an unhandled rejection.
  if (err.name === 'CastError')
    return res.status(400).json({ message: `Invalid ${err.path}` });

  if (err.name === 'ValidationError')
    return res.status(400).json({
      message: 'Validation failed',
      details: Object.fromEntries(
        Object.entries(err.errors || {}).map(([k, v]) => [k, v.message])
      ),
    });

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(', ');
    return res.status(409).json({ message: `Duplicate value for ${field || 'record'}` });
  }

  if (err.type === 'entity.parse.failed')
    return res.status(400).json({ message: 'Malformed JSON body' });

  if (err.type === 'entity.too.large')
    return res.status(413).json({ message: 'Request body is too large' });

  console.error('Unhandled error:', err);
  res.status(500).json({
    message: 'Server error',
    ...(process.env.NODE_ENV === 'production' ? {} : { debug: err.message }),
  });
}

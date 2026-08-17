import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Bus from '../models/Bus.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Verifies our JWT and attaches the current user to the request. */
export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(decoded.id).select('-__v');
  if (!user) throw ApiError.unauthorized('User not found');

  req.user = user;
  next();
});

/**
 * Role gate. `admin` is treated as a superset of every other role so a single
 * admin account can still demo the whole system end to end.
 *
 *   router.post('/tickets/:token/board', protect, allowRoles('conductor'), board)
 */
export function allowRoles(...roles) {
  const allowed = new Set([...roles, 'admin']);
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.has(req.user.role))
      return next(
        ApiError.forbidden(`This action requires one of: ${[...allowed].join(', ')}`)
      );
    next();
  };
}

/** Kept for readability at call sites that are genuinely admin-only. */
export const adminOnly = allowRoles('admin');

/**
 * Capability authentication for the driver link.
 *
 * A driver has no account. They open a URL containing a random per-bus secret,
 * which authorises exactly one thing: posting GPS for that one bus. This
 * replaces the old design where the "driver link" was useless without admin
 * credentials — so in practice every driver would have been handed the admin
 * password.
 */
export const driverTokenAuth = asyncHandler(async (req, res, next) => {
  const token = String(req.params.driverToken || '');
  // 24 random bytes rendered as hex
  if (!/^[a-f0-9]{48}$/.test(token)) throw ApiError.unauthorized('Invalid driver link');

  const bus = await Bus.findOne({ driverToken: token });
  if (!bus) throw ApiError.unauthorized('Invalid or expired driver link');

  req.bus = bus;
  next();
});

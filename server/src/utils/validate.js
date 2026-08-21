import mongoose from 'mongoose';
import { ApiError } from './apiError.js';

/**
 * Input validation.
 *
 * Two things this protects against:
 *  1. Garbage reaching Mongoose — `coordinates: ["a","b"]` used to persist
 *     `NaN` distances and fares, which then poisoned every downstream
 *     calculation silently.
 *  2. Fare manipulation — fare is derived from distance, so an unchecked
 *     coordinate pair is really an unchecked price. We validate the shape and
 *     require the point to be plausibly inside India.
 */

// Generous bounding box for India (incl. island territories).
const INDIA_BOUNDS = { minLng: 68, maxLng: 98, minLat: 6, maxLat: 38 };

/** Validates a GeoJSON-style [lng, lat] pair and returns it as numbers. */
export function assertCoordinates(value, field = 'coordinates') {
  if (!Array.isArray(value) || value.length !== 2)
    throw ApiError.badRequest(`${field} must be an array of [longitude, latitude]`);

  const [lng, lat] = value.map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat))
    throw ApiError.badRequest(`${field} must contain two numbers`);
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90)
    throw ApiError.badRequest(`${field} is outside valid longitude/latitude range`);
  if (
    lng < INDIA_BOUNDS.minLng ||
    lng > INDIA_BOUNDS.maxLng ||
    lat < INDIA_BOUNDS.minLat ||
    lat > INDIA_BOUNDS.maxLat
  )
    throw ApiError.badRequest(
      'That location is outside India — ExamRoute currently operates in Rajasthan only'
    );

  return [lng, lat];
}

/** Validates a Mongo ObjectId before it reaches the DB (avoids CastErrors). */
export function assertObjectId(value, field = 'id') {
  if (!mongoose.Types.ObjectId.isValid(String(value)))
    throw ApiError.badRequest(`Invalid ${field}`);
  return String(value);
}

/** Clamps companion count to the range the schema allows. */
export function assertCompanions(value) {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 3)
    throw ApiError.badRequest('Companions must be a whole number between 0 and 3');
  return n;
}

export function assertNonEmptyString(value, field, { maxLength = 120 } = {}) {
  const s = String(value ?? '').trim();
  if (!s) throw ApiError.badRequest(`${field} is required`);
  if (s.length > maxLength)
    throw ApiError.badRequest(`${field} must be under ${maxLength} characters`);
  return s;
}

/**
 * The exam application / roll number, required on every booking.
 *
 * This is not paperwork. Boarding works by a conductor holding the passenger's
 * admit card next to the name and roll number on their screen — that human
 * check is the entire identity story, since no third party can digitally
 * confirm someone is a real candidate. A paid booking with no roll number
 * cannot be verified at the door, so it must not be possible to create one.
 *
 * It stays per-booking rather than per-profile because the number is issued
 * per exam: a student's JEE application number is not their NEET one.
 *
 * Format is deliberately loose. NTA numbering has changed shape over the
 * years and differs between exams, so this checks it is plausible — digits
 * and letters, sensible length — rather than pretending to know the scheme.
 */
export function assertRollNumber(value) {
  const roll = String(value ?? '').trim().toUpperCase();
  if (!roll)
    throw ApiError.badRequest(
      'Your exam application / roll number is required — the conductor checks it against your admit card at boarding'
    );
  if (roll.length < 6 || roll.length > 24)
    throw ApiError.badRequest('Application / roll number must be between 6 and 24 characters');
  if (!/^[A-Z0-9-]+$/.test(roll))
    throw ApiError.badRequest(
      'Application / roll number can only contain letters, numbers and hyphens'
    );
  return roll;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw ApiError.badRequest('Enter a valid email address');
  return email;
}

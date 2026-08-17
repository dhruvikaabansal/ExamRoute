import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendMail } from '../services/mailer.js';
import { ApiError } from '../utils/apiError.js';
import { assertEmail, assertNonEmptyString, assertCoordinates } from '../utils/validate.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

// A JWT is just a signed statement that "this is user X". We sign it with
// JWT_SECRET; the client returns it on every request and our middleware
// verifies the signature to know who is calling. See docs/JWT.md.
function signToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function isAdminEmail(email) {
  return (
    process.env.ADMIN_EMAIL &&
    email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()
  );
}

/**
 * `crypto.randomInt` rather than `Math.random`.
 *
 * `Math.random` is a fast PRNG, not a cryptographic one: its output is
 * predictable from prior values. For anything that acts as a credential —
 * and a login code is a credential — the generator has to be unpredictable.
 */
function makeOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Issues a fresh code. The code is hashed before storage and held in
 * plaintext only long enough to email it — it is never persisted recoverably.
 */
async function issueOtp(user) {
  const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
  if (user.otpLastSentAt && Date.now() - user.otpLastSentAt.getTime() < cooldownMs) {
    const wait = Math.ceil(
      (cooldownMs - (Date.now() - user.otpLastSentAt.getTime())) / 1000
    );
    throw ApiError.tooMany(`Please wait ${wait}s before requesting another code`);
  }

  const code = makeOtp();
  user.otpHash = await bcrypt.hash(code, 10);
  user.otpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  user.otpAttempts = 0;
  user.otpLastSentAt = new Date();
  await user.save();

  await sendMail({
    to: user.email,
    subject: 'Your ExamRoute verification code',
    text: `Hi ${user.name}, your ExamRoute verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  });
}

// POST /api/auth/register  { name, email, password }
export async function register(req, res) {
  const name = assertNonEmptyString(req.body.name, 'Name');
  const email = assertEmail(req.body.email);
  const password = String(req.body.password ?? '');

  if (password.length < 8)
    throw ApiError.badRequest('Password must be at least 8 characters');
  if (password.length > 200) throw ApiError.badRequest('Password is too long');

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('Email already registered');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    authProvider: 'local',
    passwordHash,
    emailVerified: false,
    role: isAdminEmail(email) ? 'admin' : 'student',
  });

  await issueOtp(user);
  // No token yet — the emailed code must be verified first.
  res.status(201).json({ needsVerification: true, email: user.email });
}

// POST /api/auth/verify-otp  { email, code }
export async function verifyOtp(req, res) {
  const email = assertEmail(req.body.email);
  const code = String(req.body.code ?? '').trim();

  const user = await User.findOne({ email });
  if (!user) throw ApiError.notFound('Account not found');
  if (user.emailVerified) return res.json({ token: signToken(user), user });

  if (!user.otpHash || !user.otpExpires || user.otpExpires < new Date())
    throw ApiError.badRequest('Code expired — request a new one');

  // Per-account attempt cap. The IP rate limiter slows an attacker down; this
  // stops them regardless of how many addresses they attack from.
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    user.otpHash = undefined;
    user.otpExpires = undefined;
    await user.save();
    throw ApiError.tooMany('Too many incorrect attempts — request a new code');
  }

  const ok = await bcrypt.compare(code, user.otpHash);
  if (!ok) {
    user.otpAttempts += 1;
    await user.save();
    const left = Math.max(0, OTP_MAX_ATTEMPTS - user.otpAttempts);
    throw ApiError.badRequest(
      left > 0 ? `Incorrect code — ${left} attempt(s) left` : 'Incorrect code'
    );
  }

  user.emailVerified = true;
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  await user.save();

  res.json({ token: signToken(user), user });
}

// POST /api/auth/resend-otp  { email }
export async function resendOtp(req, res) {
  const email = assertEmail(req.body.email);
  const user = await User.findOne({ email });

  // Deliberately uniform response whether or not the account exists: a
  // differing reply here turns this endpoint into a way to enumerate which
  // email addresses are registered.
  const generic = {
    message: 'If that account needs verification, a new code has been sent',
  };
  if (!user || user.emailVerified) return res.json(generic);

  await issueOtp(user);
  res.json(generic);
}

// POST /api/auth/login  { email, password }
export async function login(req, res) {
  const email = assertEmail(req.body.email);
  const password = String(req.body.password ?? '');

  const user = await User.findOne({ email });
  if (!user || !user.passwordHash)
    throw ApiError.unauthorized('Invalid email or password');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');

  if (!user.emailVerified) {
    // Best effort: inside the resend cooldown we still tell them to verify
    // rather than failing the login outright.
    await issueOtp(user).catch(() => {});
    return res.status(403).json({
      needsVerification: true,
      email: user.email,
      message: 'Please verify your email',
    });
  }

  res.json({ token: signToken(user), user });
}

// POST /api/auth/google  { credential }  (Google ID token from the frontend)
export async function googleLogin(req, res) {
  const { credential } = req.body;
  if (!credential) throw ApiError.badRequest('Missing credential');
  if (!process.env.GOOGLE_CLIENT_ID)
    throw ApiError.badRequest('Google sign-in is not configured on this server');

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized('Google authentication failed');
  }

  const email = payload.email.toLowerCase();
  const admin = isAdminEmail(email);

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      googleId: payload.sub,
      name: payload.name,
      email,
      picture: payload.picture,
      authProvider: 'google',
      emailVerified: true, // Google has already verified the address
      role: admin ? 'admin' : 'student',
    });
  } else {
    if (!user.googleId) user.googleId = payload.sub;
    if (!user.emailVerified) user.emailVerified = true;
    if (admin && user.role !== 'admin') user.role = 'admin';
    await user.save();
  }

  res.json({ token: signToken(user), user });
}

// GET /api/auth/me
export async function getMe(req, res) {
  res.json({ user: req.user });
}

// PATCH /api/auth/profile  { coordinates:[lng,lat], address, phone }
export async function updateProfile(req, res) {
  const { coordinates, address, phone } = req.body;

  if (coordinates !== undefined) {
    const validated = assertCoordinates(coordinates);
    req.user.homeLocation = {
      type: 'Point',
      coordinates: validated,
      address: address ? String(address).slice(0, 200) : undefined,
    };
  }

  if (phone !== undefined) {
    const digits = String(phone).replace(/\D/g, '');
    if (digits && !/^[6-9]\d{9}$/.test(digits))
      throw ApiError.badRequest('Enter a valid 10-digit Indian mobile number');
    req.user.phone = digits || undefined;
  }

  await req.user.save();
  res.json({ user: req.user });
}

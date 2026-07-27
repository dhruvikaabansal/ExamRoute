import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendMail } from '../services/mailer.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// A JWT is just a signed string that says "this is user X".
// We sign it with JWT_SECRET; the client sends it back on every request and
// our middleware verifies the signature to know who's calling. See docs/JWT.md.
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

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

async function sendOtp(user) {
  user.otpCode = makeOtp();
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  await user.save();
  await sendMail({
    to: user.email,
    subject: 'Your ExamRoute verification code',
    text: `Hi ${user.name}, your ExamRoute verification code is ${user.otpCode}. It expires in 10 minutes.`,
  });
}

// POST /api/auth/register  { name, email, password }
export async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      authProvider: 'local',
      passwordHash,
      emailVerified: false,
      role: isAdminEmail(email) ? 'admin' : 'student',
    });

    await sendOtp(user);
    // no token yet — the user must verify the emailed OTP first
    res.status(201).json({ needsVerification: true, email: user.email });
  } catch (err) {
    console.error('register error:', err.message);
    res.status(500).json({ message: 'Registration failed' });
  }
}

// POST /api/auth/verify-otp  { email, code }
export async function verifyOtp(req, res) {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.emailVerified) return res.json({ token: signToken(user), user });

    if (!user.otpCode || !user.otpExpires || user.otpExpires < new Date())
      return res.status(400).json({ message: 'Code expired — request a new one' });
    if (user.otpCode !== String(code).trim())
      return res.status(400).json({ message: 'Incorrect code' });

    user.emailVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error('verifyOtp error:', err.message);
    res.status(500).json({ message: 'Verification failed' });
  }
}

// POST /api/auth/resend-otp  { email }
export async function resendOtp(req, res) {
  try {
    const user = await User.findOne({ email: (req.body.email || '').toLowerCase() });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.emailVerified) return res.status(400).json({ message: 'Already verified' });
    await sendOtp(user);
    res.json({ message: 'A new code has been sent' });
  } catch (err) {
    console.error('resendOtp error:', err.message);
    res.status(500).json({ message: 'Could not resend code' });
  }
}

// POST /api/auth/login  { email, password }
export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user || !user.passwordHash)
      return res.status(401).json({ message: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

    // unverified accounts must confirm their email first
    if (!user.emailVerified) {
      await sendOtp(user);
      return res
        .status(403)
        .json({ needsVerification: true, email: user.email, message: 'Please verify your email' });
    }

    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ message: 'Login failed' });
  }
}

// POST /api/auth/google  { credential }  (Google ID token from the frontend)
export async function googleLogin(req, res) {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Missing credential' });

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const admin = isAdminEmail(payload.email);

    let user = await User.findOne({ email: payload.email.toLowerCase() });
    if (!user) {
      user = await User.create({
        googleId: payload.sub,
        name: payload.name,
        email: payload.email.toLowerCase(),
        picture: payload.picture,
        authProvider: 'google',
        emailVerified: true, // Google already verified the email
        role: admin ? 'admin' : 'student',
      });
    } else {
      if (!user.googleId) user.googleId = payload.sub;
      if (!user.emailVerified) user.emailVerified = true;
      if (admin && user.role !== 'admin') user.role = 'admin';
      await user.save();
    }

    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error('googleLogin error:', err.message);
    res.status(401).json({ message: 'Google authentication failed' });
  }
}

// GET /api/auth/me
export async function getMe(req, res) {
  res.json({ user: req.user });
}

// PATCH /api/auth/profile  { coordinates:[lng,lat], address, phone }
export async function updateProfile(req, res) {
  const { coordinates, address, phone } = req.body;
  if (coordinates) req.user.homeLocation = { type: 'Point', coordinates, address };
  if (phone !== undefined) req.user.phone = phone;
  await req.user.save();
  res.json({ user: req.user });
}

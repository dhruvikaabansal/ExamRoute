import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

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
      role: isAdminEmail(email) ? 'admin' : 'student',
    });

    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    console.error('register error:', err.message);
    res.status(500).json({ message: 'Registration failed' });
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
        role: admin ? 'admin' : 'student',
      });
    } else {
      // link google + keep admin promotion
      if (!user.googleId) user.googleId = payload.sub;
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

// PATCH /api/auth/profile  { coordinates:[lng,lat], address, phone, rollNumber }
export async function updateProfile(req, res) {
  const { coordinates, address, phone, rollNumber } = req.body;
  if (coordinates) req.user.homeLocation = { type: 'Point', coordinates, address };
  if (phone !== undefined) req.user.phone = phone;
  if (rollNumber !== undefined) req.user.rollNumber = rollNumber;
  await req.user.save();
  res.json({ user: req.user });
}

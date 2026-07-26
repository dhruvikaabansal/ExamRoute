import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
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

    // auto-promote the configured admin email (handy for demos)
    const isAdmin =
      process.env.ADMIN_EMAIL &&
      payload.email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();

    let user = await User.findOne({ googleId: payload.sub });
    if (!user) {
      user = await User.create({
        googleId: payload.sub,
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
        role: isAdmin ? 'admin' : 'student',
      });
    } else if (isAdmin && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error('googleLogin error:', err.message);
    res.status(401).json({ message: 'Google authentication failed' });
  }
}

// GET /api/auth/me
export async function getMe(req, res) {
  res.json({ user: req.user });
}

// PATCH /api/auth/location  { coordinates:[lng,lat], address, phone }
export async function updateProfile(req, res) {
  const { coordinates, address, phone } = req.body;
  if (coordinates) {
    req.user.homeLocation = { type: 'Point', coordinates, address };
  }
  if (phone) req.user.phone = phone;
  await req.user.save();
  res.json({ user: req.user });
}

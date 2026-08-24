import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { assertCoordinates } from '../utils/validate.js';

/**
 * One way in: Google.
 *
 * There used to be a second path — email and password, with a 6-digit OTP to
 * prove the address was real, and a reset flow built on the same machinery.
 * It was careful work: codes from `crypto.randomInt`, stored as bcrypt hashes,
 * capped at five attempts, rate limited per address and per IP.
 *
 * It was also undeliverable. Free hosting tiers block outbound SMTP, and the
 * transactional email services that work over HTTPS will only send to an
 * unverified sender's own address until you own and verify a domain. So on the
 * deployed site the code was generated correctly, hashed correctly, stored
 * correctly, and then went nowhere. An auth path that cannot deliver its
 * credential is not an auth path; it is a form that traps people.
 *
 * Google verifies the address, holds the password, and handles recovery — all
 * three of the things the removed code was doing, done by someone with an
 * email infrastructure. What is left here is the part that is genuinely ours:
 * verifying Google's ID token against our client id, and exchanging it for our
 * own JWT so that every downstream route has one notion of identity.
 */

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
 * POST /api/auth/google  { credential }
 *
 * `credential` is a Google ID token: a JWT that Google signed. Verifying it
 * is the entire security of this endpoint, and it checks two things that both
 * matter — that Google's signature is valid, and that the token was issued for
 * *our* client id. Without the audience check, a token minted for any other
 * application would be accepted here, which is a real attack rather than a
 * theoretical one: those tokens are handed to every site a user signs into.
 */
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
      role: admin ? 'admin' : 'student',
    });
  } else {
    if (!user.googleId) user.googleId = payload.sub;
    /*
      ADMIN_EMAIL is an invariant, not a one-time assignment.

      It used to be applied only at signup, so anything that later changed
      that account's role locked the system out permanently — no remaining
      account could reach the admin page to undo it, including the one named
      in the configuration. Re-asserting it on every sign-in makes the
      situation recoverable by signing out and back in, which is a recovery
      path a person can find without being told.
    */
    if (admin && user.role !== 'admin') user.role = 'admin';
    await user.save();
  }

  res.json({ token: signToken(user), user });
}

/**
 * POST /api/auth/demo — a throwaway identity, no sign-in required.
 *
 * The reason is the audience. Most people who open this are evaluating it,
 * and asking a stranger to hand their Google account to a student project
 * before they can see anything is a real cost — some will decline, and the
 * ones who do never see the routing engine, which is the part worth showing.
 *
 * Three deliberate constraints:
 *
 *   - **A fresh account every time.** One shared demo login would mean
 *     visitors seeing each other's bookings, and one person cancelling a seat
 *     another was mid-way through paying for. A unique throwaway costs a row
 *     and removes the whole class of problem.
 *   - **Never admin.** The role is hard-coded, not derived from an email, so
 *     nothing about ADMIN_EMAIL can promote one of these by accident.
 *   - **Switchable off.** A public endpoint that mints sessions is a thing you
 *     want a lever on. It stays available by default because this deployment
 *     exists to be tried, and off is one variable away.
 *
 * This is not a security hole so much as a deliberately low-value account: it
 * can do exactly what any student can do, to data it created itself.
 */
export async function demoLogin(req, res) {
  if (process.env.ENABLE_DEMO_LOGIN === 'false')
    throw ApiError.forbidden('Demo accounts are disabled on this deployment');

  const suffix = crypto.randomBytes(4).toString('hex');
  const user = await User.create({
    name: `Guest ${suffix.slice(0, 4).toUpperCase()}`,
    // .invalid is reserved by RFC 2606 precisely so it can never be a real
    // address — these accounts are unreachable by email by construction, not
    // by convention.
    email: `demo-${suffix}@examroute.invalid`,
    role: 'student',
    isDemo: true,
  });

  res.status(201).json({ token: signToken(user), user });
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

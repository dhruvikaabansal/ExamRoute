import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
    address: { type: String },
  },
  { _id: false }
);

/**
 * Two account roles, and one job that needs no account at all.
 *
 *   student — books seats, sees their own bookings and ticket
 *   driver  — reserved; live location uses a per-bus capability link, so a
 *             driver never actually signs in
 *   admin   — runs routing, manages buses, boards passengers
 *
 * Boarding is an admin action. A separate `conductor` role existed and was
 * removed: it was only reachable by an admin granting it, so in practice the
 * operations team ran boarding anyway, and an account type nobody is ever
 * given is a surface to maintain rather than a protection.
 *
 * The driver link is the part that genuinely matters here, and it is
 * untouched — a driver is authorised by a random per-bus token that permits
 * exactly two things, reading that bus's route and reporting its position.
 * That is what stops every driver being handed the admin password.
 */
export const ROLES = ['student', 'driver', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },

    // auth: a user signs up with Google OR email+password
    authProvider: { type: String, enum: ['google', 'local'], default: 'local' },
    googleId: { type: String, index: true, sparse: true },
    passwordHash: { type: String }, // only for local (email+password) accounts

    // Email verification (OTP). Google users are auto-verified by Google.
    //
    // The code is stored as a bcrypt hash, never in plaintext: a 6-digit code
    // is a short-lived password, and a database dump should not hand over live
    // codes for every pending signup. `otpAttempts` caps guessing — a 6-digit
    // code has only a million possibilities, which is minutes of scripted
    // requests without a limit.
    emailVerified: { type: Boolean, default: false },
    otpHash: { type: String },
    otpExpires: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    otpLastSentAt: { type: Date },

    picture: { type: String },
    phone: { type: String }, // reusable across exams
    role: { type: String, enum: ROLES, default: 'student' },

    homeLocation: { type: pointSchema, default: undefined },
  },
  { timestamps: true }
);

userSchema.index({ homeLocation: '2dsphere' });

// never leak secrets in API responses
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.otpHash;
    delete ret.otpExpires;
    delete ret.otpAttempts;
    delete ret.otpLastSentAt;
    return ret;
  },
});

export default mongoose.model('User', userSchema);

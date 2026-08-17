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
 * Roles are separated by job, not lumped into one "admin" account.
 *
 * Previously conductors (boarding passengers) and drivers (posting the bus's
 * GPS) both needed the single admin login — which meant handing every driver
 * a credential that could also re-run routing and read every student's
 * personal details. Each role now carries only what that job needs:
 *
 *   student   — books seats, sees their own bookings and ticket
 *   conductor — scans QR tickets and marks passengers boarded
 *   driver    — reserved; live location uses a per-bus capability link
 *   admin     — runs routing, manages buses (superset of the above)
 */
export const ROLES = ['student', 'conductor', 'driver', 'admin'];

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

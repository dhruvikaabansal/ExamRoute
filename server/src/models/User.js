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

    /*
      Identity is Google's, entirely.

      A password hash and an OTP hash used to live here, with an expiry, an
      attempt counter and a resend timestamp. They are gone along with the
      email auth path, and the best thing about their absence is that this
      application now stores no credential of any kind. There is no password
      to leak, no code to brute force, and no reset flow to abuse — the whole
      class of problem belongs to Google, who are considerably better placed
      to handle it.
    */
    googleId: { type: String, index: true, sparse: true },

    /*
      A throwaway account minted by the demo endpoint.

      Flagged rather than inferred from the email domain, because the UI needs
      to say so — someone exploring on a guest account should be told that is
      what they are on, not left to wonder why their bookings vanished when
      they came back on a different browser. It also makes them one query to
      clean up.
    */
    isDemo: { type: Boolean, default: false },

    picture: { type: String },
    phone: { type: String }, // reusable across exams
    role: { type: String, enum: ROLES, default: 'student' },

    homeLocation: { type: pointSchema, default: undefined },
  },
  { timestamps: true }
);

userSchema.index({ homeLocation: '2dsphere' });

/*
  This transform used to strip a password hash and an OTP hash from every
  response. There is nothing secret left on a user to strip, but it is kept —
  as a deny-list applied at the serialisation boundary — because the next
  sensitive field somebody adds will be returned by every endpoint that
  returns a user unless something is already in the habit of removing it.
*/
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.googleId; // an account identifier, of no use to a client
    return ret;
  },
});

export default mongoose.model('User', userSchema);

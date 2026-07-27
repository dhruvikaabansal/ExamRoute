import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
    address: { type: String },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },

    // auth: a user signs up with Google OR email+password
    authProvider: { type: String, enum: ['google', 'local'], default: 'local' },
    googleId: { type: String, index: true, sparse: true },
    passwordHash: { type: String }, // only for local (email+password) accounts

    // email verification (OTP). Google users are auto-verified by Google.
    emailVerified: { type: Boolean, default: false },
    otpCode: { type: String },
    otpExpires: { type: Date },

    picture: { type: String },
    phone: { type: String }, // reusable across exams
    role: { type: String, enum: ['student', 'admin'], default: 'student' },

    homeLocation: { type: pointSchema, default: undefined },
  },
  { timestamps: true }
);

userSchema.index({ homeLocation: '2dsphere' });

// never leak secrets in API responses
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.otpCode;
    delete ret.otpExpires;
    return ret;
  },
});

export default mongoose.model('User', userSchema);

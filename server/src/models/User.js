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
    googleId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    picture: { type: String },
    phone: { type: String },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    homeLocation: { type: pointSchema, default: undefined },
  },
  { timestamps: true }
);

// Geo index for "students near X" queries
userSchema.index({ homeLocation: '2dsphere' });

export default mongoose.model('User', userSchema);

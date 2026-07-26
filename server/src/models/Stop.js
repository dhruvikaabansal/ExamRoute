import mongoose from 'mongoose';

// Known pickup stops per town (seeded reference data). Students are snapped
// to the nearest stop rather than being picked up at their doorstep.
const stopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "Kota Railway Station"
    city: { type: String, required: true },
    state: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
  },
  { timestamps: true }
);

stopSchema.index({ location: '2dsphere' });

export default mongoose.model('Stop', stopSchema);

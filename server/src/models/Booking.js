import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },

    // where the student is travelling from
    homeLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
      address: { type: String },
    },

    fare: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'paid', 'assigned', 'cancelled'],
      default: 'pending',
    },

    // payment
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },

    // filled in after the routing engine runs
    bus: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' },
    assignedStop: {
      name: String,
      coordinates: [Number], // [lng, lat]
    },
    pickupTime: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ homeLocation: '2dsphere' });
// A student can only book once per exam
bookingSchema.index({ user: 1, exam: 1 }, { unique: true });

export default mongoose.model('Booking', bookingSchema);

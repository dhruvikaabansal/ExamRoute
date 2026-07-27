import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', required: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },

    // where the student is travelling from
    homeLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
      address: { type: String },
    },

    // seats: 1 (student) + companions (parents/guardians)
    companions: { type: Number, default: 0, min: 0, max: 3 },
    seats: { type: Number, default: 1 }, // = 1 + companions

    // fare breakdown
    distanceKm: { type: Number },
    baseFare: { type: Number }, // before subsidy, for all seats
    subsidyPercent: { type: Number, default: 0 },
    fare: { type: Number, required: true }, // final payable

    status: {
      type: String,
      enum: ['pending', 'paid', 'assigned', 'cancelled'],
      default: 'pending',
    },

    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },

    // filled by the routing engine
    bus: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' },
    assignedStop: { name: String, coordinates: [Number] },
    pickupTime: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ homeLocation: '2dsphere' });
// one booking per student per session
bookingSchema.index({ user: 1, session: 1 }, { unique: true });

export default mongoose.model('Booking', bookingSchema);

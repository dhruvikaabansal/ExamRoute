import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', required: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },

    // roll / application number is per-exam, so it lives on the booking
    rollNumber: { type: String },

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
    paidAt: { type: Date },

    /**
     * Refund state.
     *
     * `status: 'cancelled'` says the seat was released; it says nothing about
     * the money. Those are genuinely two different facts — a refund can fail
     * at the gateway long after the seat is gone — so they get separate
     * fields rather than being conflated into one status enum.
     *
     *   none      — nothing was ever paid, so nothing is owed
     *   pending   — cancelled while paid, refund not yet placed
     *   processed — Razorpay accepted the refund request
     *   failed    — the gateway rejected it; needs manual follow-up
     */
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'processed', 'failed'],
      default: 'none',
    },
    refundId: { type: String },
    refundAmount: { type: Number },
    refundedAt: { type: Date },
    refundError: { type: String },

    // pickup stop assigned immediately at booking (geofenced nearest stop),
    // then refined by the routing engine when the bus is formed
    assignedStop: { name: String, coordinates: [Number] },
    stopDistanceKm: { type: Number }, // home -> stop
    stopEtaMin: { type: Number }, // home -> stop travel minutes
    /**
     * True when the home is inside a stop's catchment zone.
     *
     * False means no zone covered them and we fell back to the nearest stop
     * anywhere, which can be a long way off. That distinction has to reach
     * the student: getting themselves to a pickup point 60 km away is a very
     * different proposition from one down the road, and the app should say so
     * rather than presenting both with equal confidence.
     */
    stopInsideZone: { type: Boolean, default: true },

    // filled by the routing engine
    bus: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' },
    pickupTime: { type: Date },

    // QR e-ticket + boarding
    ticketToken: { type: String, index: true },
    boarded: { type: Boolean, default: false },
    boardedAt: { type: Date },
    // audit trail: which conductor performed the admit-card check
    boardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

bookingSchema.index({ homeLocation: '2dsphere' });
// one booking per student per session
bookingSchema.index({ user: 1, session: 1 }, { unique: true });

export default mongoose.model('Booking', bookingSchema);

import mongoose from 'mongoose';

// A Bus is created by the routing engine: one bus = one cluster of students
// heading to the same center for the same session.
const busSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', required: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },
    label: { type: String }, // e.g. "Kota - Bus 1"
    capacity: { type: Number, default: 40 },
    seatsUsed: { type: Number, default: 0 }, // counts companions too

    // ordered pickup stops (result of Directions optimize:true)
    route: [
      {
        name: String,
        coordinates: [Number], // [lng, lat]
        pickupTime: Date,
      },
    ],

    departureTime: { type: Date },
    arrivalTime: { type: Date }, // planned arrival at center
    totalDurationMin: { type: Number },

    // true when departure falls on an earlier IST calendar day than arrival —
    // long routes from far towns genuinely leave the night before, and the UI
    // labels it so the date does not look like a bug
    isOvernight: { type: Boolean, default: false },

    passengers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],

    // Capability link for the driver: a random per-bus secret that authorises
    // posting GPS for THIS bus and nothing else. Drivers therefore need no
    // account at all, instead of the admin credentials the old flow required.
    // Rotatable from the admin page if a link leaks.
    driverToken: { type: String, index: true },

    // live tracking: the driver's device posts its position here periodically
    currentLocation: { lng: Number, lat: Number },
    lastLocationAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('Bus', busSchema);

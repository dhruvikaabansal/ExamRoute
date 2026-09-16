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
        // When the bus is at this stop. This is the operational truth the
        // driver and the boarding list work from.
        pickupTime: Date,
        // When passengers are told to be there — a few minutes earlier.
        // Telling a student to arrive at the exact minute the bus rolls is a
        // schedule that only works if nobody is ever slightly late, and a bus
        // that waits at six stops arrives late for all forty people on it.
        boardBy: Date,
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

    /**
     * The device that claimed the driver link.
     *
     * A capability link is a bearer token: whoever holds it can use it. That is
     * the right trade for someone who works one trip and should not need an
     * account, but it leaves one failure that is not theoretical — the link
     * gets forwarded. Two phones then post positions for the same bus, the
     * field is overwritten by whichever wrote last, and every passenger
     * watching the map sees the bus jump between two places. Nothing in the
     * system notices, and the wrong one might be the one being believed.
     *
     * So the first device to report a position claims the link, and the rest
     * are refused. It does not make the token harder to guess; it makes a
     * leaked or forwarded token far less useful, and — more importantly — it
     * makes the conflict visible instead of silent.
     *
     * Recovery is rotation: a new link clears the pairing, so a driver whose
     * phone died is one admin click away from working again.
     */
    driverDeviceId: { type: String },

    // live tracking: the driver's device posts its position here periodically
    currentLocation: { lng: Number, lat: Number },
    lastLocationAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('Bus', busSchema);

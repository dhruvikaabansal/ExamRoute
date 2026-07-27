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
    passengers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],

    // live tracking: the driver's device posts its position here periodically
    currentLocation: { lng: Number, lat: Number },
    lastLocationAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('Bus', busSchema);

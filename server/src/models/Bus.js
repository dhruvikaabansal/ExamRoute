import mongoose from 'mongoose';

// A Bus is created by the routing engine: one bus = one cluster of students.
const busSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },
    label: { type: String }, // e.g. "Kota - Bus 1"
    capacity: { type: Number, default: 40 },

    // ordered pickup stops (result of Directions optimize:true)
    route: [
      {
        name: String,
        coordinates: [Number], // [lng, lat]
        pickupTime: Date,
      },
    ],

    departureTime: { type: Date },
    totalDurationMin: { type: Number }, // total travel time to center
    passengers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
  },
  { timestamps: true }
);

export default mongoose.model('Bus', busSchema);

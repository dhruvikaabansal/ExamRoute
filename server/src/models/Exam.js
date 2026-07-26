import mongoose from 'mongoose';

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "JEE Main 2026 - Session 1"
    code: { type: String, required: true }, // e.g. "JEE", "NEET", "CUET"
    date: { type: Date, required: true },
    reportingTime: { type: Date, required: true }, // absolute datetime students must arrive by
    state: { type: String, required: true },
    bookingDeadline: { type: Date, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Exam', examSchema);

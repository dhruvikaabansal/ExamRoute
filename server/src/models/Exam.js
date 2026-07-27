import mongoose from 'mongoose';

// An Exam is the umbrella (e.g. "JEE Main 2026 - Session 1").
// Actual sittings live in ExamSession (a specific date + shift), because most
// exams (JEE, CUET) run across many days with 1-2 shifts per day. NEET is the
// exception: a single date, single shift.
const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true }, // "JEE", "NEET", "CUET"
    state: { type: String, required: true },
    description: { type: String },
    multiShift: { type: Boolean, default: true }, // false for NEET
    bookingDeadline: { type: Date, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Exam', examSchema);

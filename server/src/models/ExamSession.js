import mongoose from 'mongoose';

// A specific sitting of an exam: one date + one shift.
// e.g. JEE Main Session 1 -> { date: 24 Jan, shift: "Shift 1", examStart: 09:00,
//      gateClose: 08:30, reportingTime: 07:00 }
const examSessionSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    date: { type: Date, required: true },
    shiftLabel: { type: String, required: true }, // "Shift 1 (9 AM - 12 PM)"
    subject: { type: String }, // for CUET (subject-wise shifts); optional

    examStart: { type: Date, required: true }, // when the paper begins
    gateClose: { type: Date, required: true }, // hard deadline to be inside (30 min before)
    reportingTime: { type: Date, required: true }, // recommended arrival (well before gateClose)
  },
  { timestamps: true }
);

examSessionSchema.index({ exam: 1, date: 1 });

export default mongoose.model('ExamSession', examSessionSchema);

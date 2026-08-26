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

    /**
     * The routing lock, held on the sitting being routed.
     *
     * Routing deletes a sitting's buses and rebuilds them. Two runs overlapping
     * — two admins clicking at once, or the scheduler firing while somebody is
     * clicking — interleave a delete with a create and can leave bookings
     * pointing at buses that no longer exist.
     *
     * A single-document update in MongoDB is atomic, so acquiring is one
     * conditional `findOneAndUpdate`: claim the sitting only if nobody else
     * holds it. No transactions and no external lock service, which matters
     * because both would be infrastructure this project does not otherwise need.
     */
    routingStatus: { type: String, enum: ['idle', 'running'], default: 'idle' },
    // When the current holder started. A process can die mid-run — without a
    // timestamp the sitting would stay locked forever and no amount of
    // retrying would fix it.
    routingStartedAt: { type: Date },
    lastRoutedAt: { type: Date },
  },
  { timestamps: true }
);

examSessionSchema.index({ exam: 1, date: 1 });

export default mongoose.model('ExamSession', examSessionSchema);

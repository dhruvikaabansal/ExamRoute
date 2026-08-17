/**
 * Cancellation refund policy.
 *
 * A seat is not a free option. Once bookings close, the routing engine has
 * already sized and priced the buses; a student who cancels an hour before
 * departure has cost the operator a seat that can no longer be resold. So the
 * refundable share falls as the exam approaches:
 *
 *   more than FULL_REFUND_HOURS before gate close   → 100%
 *   between that and PARTIAL_REFUND_HOURS           → PARTIAL_REFUND_PCT
 *   inside PARTIAL_REFUND_HOURS                     → 0%
 *
 * This is deliberately a pure function of (fare, gateClose, now) with no
 * database or gateway involvement, so the policy can be unit-tested exactly
 * and changed without touching payment code. The tiers are env-configurable
 * because a policy is a business decision, not a constant.
 */
export function refundPolicy(fare, gateClose, now = new Date()) {
  const fullHours = Number(process.env.FULL_REFUND_HOURS || 72);
  const partialHours = Number(process.env.PARTIAL_REFUND_HOURS || 24);
  const partialPct = Number(process.env.PARTIAL_REFUND_PCT || 50);

  const amountPaid = Math.max(0, Math.round(Number(fare) || 0));
  const hoursToGate = (new Date(gateClose).getTime() - now.getTime()) / 3_600_000;

  let percent;
  let reason;

  if (hoursToGate >= fullHours) {
    percent = 100;
    reason = `Cancelled more than ${fullHours} hours before the exam — full refund`;
  } else if (hoursToGate >= partialHours) {
    percent = partialPct;
    reason = `Cancelled within ${fullHours} hours of the exam — ${partialPct}% refund`;
  } else {
    percent = 0;
    reason = `Cancelled within ${partialHours} hours of the exam — the seat can no longer be resold, so no refund is due`;
  }

  // Round DOWN. Rounding a refund up would let a student cancel and re-book
  // repeatedly for a rupee of profit each time — small, but it is free money
  // out of a subsidy budget, and the fix costs nothing.
  const amount = Math.floor((amountPaid * percent) / 100);

  return { percent, amount, amountPaid, reason, hoursToGate };
}

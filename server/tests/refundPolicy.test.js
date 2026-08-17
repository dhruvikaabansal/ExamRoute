import './env.js';
import { describe, it, expect } from 'vitest';
import { refundPolicy } from '../src/utils/refundPolicy.js';

const HOUR = 3_600_000;
const now = new Date('2026-05-01T00:00:00Z');
const gateIn = (hours) => new Date(now.getTime() + hours * HOUR);

describe('refund policy', () => {
  it('refunds in full when cancelled well before the exam', () => {
    const r = refundPolicy(800, gateIn(200), now);
    expect(r.percent).toBe(100);
    expect(r.amount).toBe(800);
  });

  it('refunds partially inside the full-refund window', () => {
    const r = refundPolicy(800, gateIn(48), now);
    expect(r.percent).toBe(50);
    expect(r.amount).toBe(400);
  });

  it('refunds nothing just before the exam — the seat cannot be resold', () => {
    const r = refundPolicy(800, gateIn(2), now);
    expect(r.percent).toBe(0);
    expect(r.amount).toBe(0);
  });

  it('treats an exam that has already started as non-refundable', () => {
    const r = refundPolicy(800, gateIn(-5), now);
    expect(r.percent).toBe(0);
    expect(r.amount).toBe(0);
  });

  it('is monotonic — cancelling later never refunds more', () => {
    let previous = Infinity;
    for (const hours of [500, 200, 73, 72, 50, 25, 24, 12, 1, 0]) {
      const { amount } = refundPolicy(1000, gateIn(hours), now);
      expect(amount).toBeLessThanOrEqual(previous);
      previous = amount;
    }
  });

  it('never refunds more than was paid', () => {
    for (const hours of [1000, 100, 72, 30, 24, 5]) {
      const r = refundPolicy(737, gateIn(hours), now);
      expect(r.amount).toBeLessThanOrEqual(737);
      expect(r.amount).toBeGreaterThanOrEqual(0);
    }
  });

  it('rounds the refund down, so cancel-and-rebook cannot mint rupees', () => {
    // 50% of 777 is 388.5 — paying out 389 would be free money per cycle.
    const r = refundPolicy(777, gateIn(48), now);
    expect(r.amount).toBe(388);
  });

  it('handles a zero fare without producing NaN', () => {
    const r = refundPolicy(0, gateIn(200), now);
    expect(r.amount).toBe(0);
    expect(Number.isNaN(r.amount)).toBe(false);
  });

  it('always explains itself, so the UI never has to invent wording', () => {
    for (const hours of [200, 48, 2]) {
      expect(refundPolicy(500, gateIn(hours), now).reason).toBeTruthy();
    }
  });
});

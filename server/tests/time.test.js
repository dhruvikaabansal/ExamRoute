import { describe, it, expect } from 'vitest';
import {
  istDate,
  atIst,
  istParts,
  addDays,
  addMinutes,
  isDifferentIstDay,
  formatIst,
} from '../src/utils/time.js';

/**
 * The timezone bug these guard against: exam times were built with
 * `date.setHours(9)`, which encodes the *server's* local timezone. Correct on
 * an IST laptop, silently wrong on a UTC host — a 9:00 AM shift stored as
 * 09:00Z shows up as 2:30 PM to a student in India.
 *
 * The suite forces TZ to something other than IST so a regression to
 * local-time arithmetic fails here rather than in production.
 */
process.env.TZ = 'UTC';

describe('IST time construction', () => {
  it('stores 9 AM IST as 03:30 UTC regardless of host timezone', () => {
    const nineAm = istDate(2026, 0, 24, 9, 0);
    expect(nineAm.toISOString()).toBe('2026-01-24T03:30:00.000Z');
  });

  it('round-trips through istParts', () => {
    const instant = istDate(2026, 4, 3, 14, 30);
    expect(istParts(instant)).toMatchObject({
      year: 2026,
      monthIndex: 4,
      day: 3,
      hours: 14,
      minutes: 30,
    });
  });

  it('atIst pins a wall-clock time onto an existing date', () => {
    // An instant that is already the previous day in UTC terms.
    const base = new Date('2026-01-23T20:00:00.000Z'); // 24 Jan 01:30 IST
    const gate = atIst(base, 8, 30);
    expect(gate.toISOString()).toBe('2026-01-24T03:00:00.000Z');
    expect(istParts(gate)).toMatchObject({ day: 24, hours: 8, minutes: 30 });
  });

  it('formats back to IST for display', () => {
    const nineAm = istDate(2026, 0, 24, 9, 0);
    expect(formatIst(nineAm)).toMatch(/09:00\s*am/i);
  });

  it('survives a UTC-midnight boundary', () => {
    // 05:00 IST is 23:30 UTC the *previous* day — the classic off-by-one.
    const early = istDate(2026, 0, 24, 5, 0);
    expect(early.toISOString()).toBe('2026-01-23T23:30:00.000Z');
    expect(istParts(early).day).toBe(24);
  });
});

describe('date arithmetic', () => {
  it('adds days and minutes', () => {
    const start = istDate(2026, 0, 24, 9, 0);
    expect(istParts(addDays(start, 3)).day).toBe(27);
    expect(istParts(addMinutes(start, -90)).hours).toBe(7);
  });

  it('detects an overnight departure by IST calendar day', () => {
    const arrive = istDate(2026, 0, 24, 7, 0);
    const sameNight = addMinutes(arrive, -180); // 04:00 same day
    const previousNight = addMinutes(arrive, -600); // 21:00 the day before

    expect(isDifferentIstDay(sameNight, arrive)).toBe(false);
    expect(isDifferentIstDay(previousNight, arrive)).toBe(true);
  });
});

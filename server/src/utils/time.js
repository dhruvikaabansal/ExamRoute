/**
 * Timezone handling.
 *
 * Exam timings are wall-clock facts in India ("Shift 1 starts at 9:00 AM IST").
 * The bug this module exists to prevent: building those times with
 * `date.setHours(9)` uses the *server's* local timezone. That looks correct on
 * a developer laptop set to IST, but a deployed host runs in UTC, so 9:00 AM
 * silently becomes 09:00Z — which an Indian student sees as 2:30 PM.
 *
 * So: every exam time is constructed from explicit IST components and stored
 * as a correct UTC instant. Display then formats back to Asia/Kolkata. The
 * value in the database is unambiguous regardless of where the code runs.
 *
 * India has had no DST since 1945, so a fixed +05:30 offset is exact.
 */
export const IST_OFFSET_MINUTES = 330; // UTC+05:30
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * Builds the UTC instant for a given IST wall-clock time.
 * istDate(2026, 0, 24, 9, 0) -> 24 Jan 2026 09:00 IST -> 03:30Z
 */
export function istDate(year, monthIndex, day, hours = 0, minutes = 0) {
  return new Date(
    Date.UTC(year, monthIndex, day, hours, minutes, 0, 0) -
      IST_OFFSET_MINUTES * MS_PER_MINUTE
  );
}

/** Splits an instant into the IST calendar fields a person in India would read. */
export function istParts(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

/**
 * Takes the IST calendar date of `base` and returns that day at h:mm IST.
 * Replaces the timezone-dependent `d.setHours(h, m)` pattern.
 */
export function atIst(base, hours, minutes = 0) {
  const { year, monthIndex, day } = istParts(base);
  return istDate(year, monthIndex, day, hours, minutes);
}

/** Calendar-day arithmetic that is safe across DST-free IST. */
export function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * MS_PER_MINUTE);
}

/** True when two instants fall on different IST calendar days (overnight trip). */
export function isDifferentIstDay(a, b) {
  const pa = istParts(a);
  const pb = istParts(b);
  return pa.year !== pb.year || pa.monthIndex !== pb.monthIndex || pa.day !== pb.day;
}

/** Human-readable IST, for emails and logs. */
export function formatIst(date, { withDate = true } = {}) {
  if (!date) return '';
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    ...(withDate ? { weekday: 'short', day: 'numeric', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

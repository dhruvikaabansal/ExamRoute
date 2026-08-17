/**
 * All date and time rendering goes through here, pinned to Asia/Kolkata.
 *
 * Exam timings are IST facts. The API stores them as correct UTC instants, so
 * formatting with the browser's default timezone would show the wrong time to
 * anyone whose device clock is not on IST — including an examiner opening the
 * demo from another country. Pinning the timezone makes what the student sees
 * match what is printed on their admit card.
 */
const IST = 'Asia/Kolkata';

const dateOpts = { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' };
const timeOpts = { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true };

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', dateOpts) : '';

export const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString('en-IN', timeOpts) : '';

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { ...dateOpts, ...timeOpts }) : '';

/** Short label for schedule rows, e.g. "Fri 24 Jan, 04:30 am". */
export const fmtShort = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        timeZone: IST,
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '';

/** "in 3 days" / "in 4 hours" — context for a departure that is far off. */
export function fmtRelative(d) {
  if (!d) return '';
  const diffMs = new Date(d).getTime() - Date.now();
  const minutes = Math.round(diffMs / 60000);
  const abs = Math.abs(minutes);
  const rtf = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });

  if (abs < 60) return rtf.format(minutes, 'minute');
  if (abs < 60 * 24) return rtf.format(Math.round(minutes / 60), 'hour');
  return rtf.format(Math.round(minutes / (60 * 24)), 'day');
}

/** Calendar-date helpers. A date is `YYYY-MM-DD` in an IANA time zone. */

/** The calendar date of an ISO timestamp in the given time zone. */
export function localDate(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid timestamp: ${iso}`);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Today's calendar date in the given time zone. `now` is injectable for tests. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localDate(now.toISOString(), timeZone);
}

/** Add whole days to a calendar date, using UTC arithmetic (no DST effects). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

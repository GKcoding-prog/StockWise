/**
 * Business-timezone helpers. Dates are stored in UTC; "today" and date filters are
 * business-local (default Africa/Bujumbura, docs/01 §12).
 */

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight at the start of `localDate` (YYYY-MM-DD) in `timeZone`. */
export function startOfLocalDay(localDate: string, timeZone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMs(new Date(guess), timeZone);
  // Re-check in case the offset differs at the actual instant (DST transitions).
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

/** [start, end) UTC range covering local dates from..to inclusive. */
export function localDateRange(
  from: string | undefined,
  to: string | undefined,
  timeZone: string,
): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = startOfLocalDay(from, timeZone);
  if (to) range.lt = startOfLocalDay(addDays(to, 1), timeZone);
  return range;
}

/** Business-local calendar date (YYYY-MM-DD) of `instant`. */
export function localDateOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

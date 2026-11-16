// Calendar helpers for the Parents Portal: Africa/Cairo time, weeks start on
// Saturday, the weekend is Friday and Saturday.
export const PARENTS_TZ = 'Africa/Cairo';
const DAY = 86_400_000;

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: PARENTS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: PARENTS_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Cairo calendar day of an instant, as YYYY-MM-DD. */
export function cairoDay(d: Date): string {
  return dayFmt.format(d);
}

/** Cairo's UTC offset (ms) at an instant (handles daylight saving). */
function cairoOffsetMs(d: Date): number {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** The instant a Cairo calendar day (YYYY-MM-DD) begins. */
export function cairoDayStart(day: string): Date {
  const [y, m, dd] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, dd);
  // Two passes settle the offset across a DST change.
  let t = guess - cairoOffsetMs(new Date(guess));
  t = guess - cairoOffsetMs(new Date(t));
  return new Date(t);
}

/** Day of week of a Cairo day: 0 Sunday .. 6 Saturday. */
export function weekdayOf(day: string): number {
  const [y, m, dd] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
}

export function addDays(day: string, n: number): string {
  const [y, m, dd] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd) + n * DAY).toISOString().slice(0, 10);
}

/** Saturday that starts the Cairo week containing `now`. */
export function weekStartDay(now: Date): string {
  const today = cairoDay(now);
  const sinceSaturday = (weekdayOf(today) + 1) % 7;
  return addDays(today, -sinceSaturday);
}

/** The 7 Cairo days of the current week, Saturday first. */
export function weekDays(now: Date): string[] {
  const start = weekStartDay(now);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export function isWeekend(day: string): boolean {
  const w = weekdayOf(day);
  return w === 5 || w === 6;
}

/** Local Cairo clock time HH:MM of an instant. */
export function cairoTime(d: Date): string {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${String(+p.hour % 24).padStart(2, '0')}:${p.minute}`;
}

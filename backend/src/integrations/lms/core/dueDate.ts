// LMS Phase 2b (owner decision D13): an optional due date per picked item.
//
// The teacher enters a local date and time in the activity picker, in the
// school's time zone (services/institutionTimeZone.ts). The server turns it
// into UTC, checks it (in the future, at most two years ahead), and:
//   - sends it with the LMS activity as the custom parameter enara_due=<ISO UTC>;
//     the first launch that binds the activity uses it as the ENARA assignment's
//     due date instead of the one-year default (binding.ts, applied once);
//   - adds one line to the activity's description in the LMS, in the picker's
//     language and the school's time zone, e.g.
//       "Due: 25 Nov 2026, 11:59 PM (Cairo time)"
//       "موعد التسليم: 25 نوفمبر 2026، 11:59 م (توقيت القاهرة)"
//     The LMS keeps that text as it was: a later change in ENARA does not update it.

export const DUE_PARAM = 'enara_due';
/** "Within 2 years": two calendar years plus a day of slack for leap years. */
export const MAX_DUE_AHEAD_MS = (2 * 365 + 1) * 86_400_000;

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function wallClock(tz: string, instant: number) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second };
}

/** The zone's UTC offset (ms) at an instant (daylight saving included). */
function offsetMs(tz: string, instant: number): number {
  const w = wallClock(tz, instant);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(instant / 1000) * 1000;
}

/** A wall-clock date-time ("YYYY-MM-DDTHH:mm") in a time zone, as a UTC instant. Null when malformed. */
export function zonedLocalToUtc(local: string, tz: string): Date | null {
  const m = LOCAL.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0];
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (new Date(guess).getUTCDate() !== d) return null; // e.g. 31 February
  // Two passes settle the offset across a daylight-saving change.
  let t = guess - offsetMs(tz, guess);
  t = guess - offsetMs(tz, t);
  return new Date(t);
}

export type DueCheck = { ok: true; due: Date } | { ok: false; error: 'due_invalid' | 'due_in_past' | 'due_too_far' };

/** Checks a due date from the picker (local wall-clock time in the school's zone). */
export function checkPickerDue(local: unknown, tz: string, now = new Date()): DueCheck {
  if (typeof local !== 'string' || local.length > 25) return { ok: false, error: 'due_invalid' };
  const due = zonedLocalToUtc(local.trim(), tz);
  if (!due) return { ok: false, error: 'due_invalid' };
  if (due.getTime() <= now.getTime()) return { ok: false, error: 'due_in_past' };
  if (due.getTime() - now.getTime() > MAX_DUE_AHEAD_MS) return { ok: false, error: 'due_too_far' };
  return { ok: true, due };
}

/** enara_due as the launch reads it: an ISO UTC timestamp. Null when absent or malformed. */
export function parseDueParam(raw: string | undefined): Date | null {
  const v = raw?.trim();
  if (!v || v.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const CITY: Record<string, { en: string; ar: string }> = {
  'Africa/Cairo': { en: 'Cairo', ar: 'القاهرة' },
  'Asia/Riyadh': { en: 'Riyadh', ar: 'الرياض' },
  'Asia/Dubai': { en: 'Dubai', ar: 'دبي' },
  'Asia/Kuwait': { en: 'Kuwait', ar: 'الكويت' },
  'Asia/Qatar': { en: 'Doha', ar: 'الدوحة' },
  'Asia/Bahrain': { en: 'Bahrain', ar: 'البحرين' },
  'Asia/Muscat': { en: 'Muscat', ar: 'مسقط' },
  'Asia/Amman': { en: 'Amman', ar: 'عمّان' },
  'Asia/Beirut': { en: 'Beirut', ar: 'بيروت' },
  'Asia/Baghdad': { en: 'Baghdad', ar: 'بغداد' },
  'Africa/Casablanca': { en: 'Casablanca', ar: 'الدار البيضاء' },
  'Africa/Tunis': { en: 'Tunis', ar: 'تونس' },
  'Africa/Algiers': { en: 'Algiers', ar: 'الجزائر' },
  'Europe/London': { en: 'London', ar: 'لندن' },
};

function zoneLabel(tz: string, locale: 'en' | 'ar'): string {
  if (tz === 'UTC' || tz === 'Etc/UTC') return locale === 'ar' ? 'بالتوقيت العالمي UTC' : 'UTC';
  const city = CITY[tz]?.[locale] ?? tz.split('/').pop()!.replace(/_/g, ' ');
  return locale === 'ar' ? `توقيت ${city}` : `${city} time`;
}

/**
 * The description line for the LMS activity, in the picker's language and the
 * school's time zone. Western digits in both languages, 12-hour clock.
 */
export function formatDueLine(due: Date, tz: string, locale: 'en' | 'ar'): string {
  return locale === 'ar' ? `موعد التسليم: ${formatSchoolDateTime(due, tz, 'ar')}` : `Due: ${formatSchoolDateTime(due, tz, 'en')}`;
}

/**
 * A date and time in the school's time zone, e.g. "25 Nov 2026, 11:59 PM
 * (Cairo time)" / "25 نوفمبر 2026، 11:59 م (توقيت القاهرة)". Western digits,
 * 12-hour clock (also used for the onboarding invite's link expiry).
 */
export function formatSchoolDateTime(at: Date, tz: string, locale: 'en' | 'ar'): string {
  const w = wallClock(tz, at.getTime());
  const month =
    locale === 'ar'
      ? new Intl.DateTimeFormat('ar-EG-u-ca-gregory-nu-latn', { timeZone: tz, month: 'long' }).format(at)
      : new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(at);
  const h12 = w.hour % 12 === 0 ? 12 : w.hour % 12;
  const time = `${h12}:${String(w.minute).padStart(2, '0')}`;
  if (locale === 'ar') return `${w.day} ${month} ${w.year}، ${time} ${w.hour < 12 ? 'ص' : 'م'} (${zoneLabel(tz, 'ar')})`;
  return `${w.day} ${month} ${w.year}, ${time} ${w.hour < 12 ? 'AM' : 'PM'} (${zoneLabel(tz, 'en')})`;
}

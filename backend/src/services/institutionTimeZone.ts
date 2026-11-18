import { Institution } from '../models/Institution';

// The school's time zone (LMS Phase 2b: due dates picked in the activity
// picker are entered and shown in it). Institutions have an optional
// `timeZone` setting (IANA name); unset or invalid means the default below.
// All current pilot schools are in Egypt, so the default is Africa/Cairo
// until a school sets its own.
export const DEFAULT_SCHOOL_TIME_ZONE = 'Africa/Cairo';

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 60) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The institution's time zone, or the default when it has none (or an invalid one). */
export async function institutionTimeZone(institutionId: string): Promise<string> {
  const row = await Institution.findOne({ id: institutionId }).select('timeZone').lean();
  return isValidTimeZone(row?.timeZone) ? row!.timeZone! : DEFAULT_SCHOOL_TIME_ZONE;
}

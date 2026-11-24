// Parents school app (docs/lms/PARENTS_SCHOOL_APP_PLAN.md). One SITE switch per section, read at call time, default OFF; a section is
// shown only when its site switch is on AND the school turned it on (sections.ts). With every switch off the site behaves as before.
//   SCHOOL_APP_TIMETABLE_ENABLED      (a) weekly timetable per class (group)
//   SCHOOL_APP_ANNOUNCEMENTS_ENABLED  (a) school / grade / class / student announcements
//   SCHOOL_APP_ATTENDANCE_ENABLED     (a) daily attendance from the school
//   SCHOOL_APP_NOTIFICATIONS_ENABLED  (a) in-app notifications (+ email when the parent and school allow it)
//   later steps: SCHOOL_APP_FEES_ENABLED (b), SCHOOL_APP_BUSES_ENABLED (c), SCHOOL_APP_REQUESTS_ENABLED (d), SCHOOL_APP_CHAT_ENABLED (e)
const on = (name: string) => /^(true|1|yes)$/i.test((process.env[name] ?? '').trim());

export const SECTIONS = ['timetable', 'announcements', 'attendance', 'notifications'] as const;
export type Section = (typeof SECTIONS)[number];
const ENV: Record<Section, string> = {
  timetable: 'SCHOOL_APP_TIMETABLE_ENABLED',
  announcements: 'SCHOOL_APP_ANNOUNCEMENTS_ENABLED',
  attendance: 'SCHOOL_APP_ATTENDANCE_ENABLED',
  notifications: 'SCHOOL_APP_NOTIFICATIONS_ENABLED',
};
export const siteSectionOn = (s: Section) => on(ENV[s]);
export const anySiteSectionOn = () => SECTIONS.some(siteSectionOn);
export const isSection = (x: unknown): x is Section => typeof x === 'string' && (SECTIONS as readonly string[]).includes(x);

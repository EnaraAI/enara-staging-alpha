// Parents school app (docs/lms/PARENTS_SCHOOL_APP_PLAN.md). One SITE switch per section, read at call time, default OFF; a section is
// shown only when its site switch is on AND the school turned it on (sections.ts). With every switch off the site behaves as before.
//   SCHOOL_APP_TIMETABLE_ENABLED      (a) weekly timetable per class (group)
//   SCHOOL_APP_ANNOUNCEMENTS_ENABLED  (a) school / grade / class / student announcements
//   SCHOOL_APP_ATTENDANCE_ENABLED     (a) daily attendance from the school
//   SCHOOL_APP_NOTIFICATIONS_ENABLED  (a) in-app notifications (+ email when the parent and school allow it)
//   SCHOOL_APP_FEES_ENABLED           (b) fees and instalments (display only; the school marks paid; no payment in ENARA)
//   SCHOOL_APP_BUSES_ENABLED          (c) bus routes, stops and times, the child's stop, delay / cancel notices (no live GPS)
//   SCHOOL_APP_REQUESTS_ENABLED       (d) parent requests to the office, and consent forms (tap-to-sign record); two school sections share it
//   SCHOOL_APP_CHAT_ENABLED           (e) the parents' assistant over the sections above (answers only from the parent's own screens)
//   later steps: SCHOOL_APP_BUSES_ENABLED (c), SCHOOL_APP_REQUESTS_ENABLED (d), SCHOOL_APP_CHAT_ENABLED (e)
const on = (name: string) => /^(true|1|yes)$/i.test((process.env[name] ?? '').trim());

export const SECTIONS = ['timetable', 'announcements', 'attendance', 'notifications', 'fees', 'buses', 'requests', 'consents', 'chat'] as const;
export type Section = (typeof SECTIONS)[number];
const ENV: Record<Section, string> = {
  timetable: 'SCHOOL_APP_TIMETABLE_ENABLED',
  announcements: 'SCHOOL_APP_ANNOUNCEMENTS_ENABLED',
  attendance: 'SCHOOL_APP_ATTENDANCE_ENABLED',
  notifications: 'SCHOOL_APP_NOTIFICATIONS_ENABLED',
  fees: 'SCHOOL_APP_FEES_ENABLED',
  buses: 'SCHOOL_APP_BUSES_ENABLED',
  requests: 'SCHOOL_APP_REQUESTS_ENABLED',
  consents: 'SCHOOL_APP_REQUESTS_ENABLED',
  chat: 'SCHOOL_APP_CHAT_ENABLED',
};
export const siteSectionOn = (s: Section) => on(ENV[s]);
export const anySiteSectionOn = () => SECTIONS.some(siteSectionOn);
export const isSection = (x: unknown): x is Section => typeof x === 'string' && (SECTIONS as readonly string[]).includes(x);

// Parents P1-P5 switches (docs/parents/P1_NOTES.md). Read at call time, default
// OFF: with a switch off the site behaves exactly as before.
//   PARENT_SETTINGS_ENABLED     P1: per-school parent access (Off / Free), usage
//                               events and the Parents cards, "Provided by <school>"
//   PARENT_CODE_SIGNUP_ENABLED  P1: code-first entry (no account, no password),
//                               the remembered device session, "Add another child"
//   PARENT_CODE_TOOLS_ENABLED   P2: class code sheets (print / CSV / revoke by class),
//                               teachers issuing codes (per-school setting), per-school
//                               code expiry
//   PARENT_EMAIL_SIGNIN_ENABLED P2: "Add your email" with a 6-digit code, passwordless
//                               email sign-in, merge of two accounts on a verified email
//   PARENT_GRADES_AFTER_REVIEW_ENABLED P3: the school's "Show results to parents:
//                               immediately / after the teacher releases them" (default
//                               after release, D7), applied to every score a parent sees
//   PARENT_ALL_SUBJECTS_ENABLED every subject a child studies (subject chips, per-subject progress, results,
//                               points to practise, sessions, next, smart recommendations) and no placeholder
//                               cards (docs/parents/ALL_SUBJECTS_PLAN.md)
//   PARENT_CSV_INVITES_ENABLED  P5: CSV invitations (plus the school's own "CSV invites"
//                               setting, default off), one email per parent address
const on = (name: string) => /^(true|1|yes)$/i.test((process.env[name] ?? '').trim());

export const parentSettingsEnabled = () => on('PARENT_SETTINGS_ENABLED');
export const parentCodeSignupEnabled = () => on('PARENT_CODE_SIGNUP_ENABLED');
export const parentCodeToolsEnabled = () => on('PARENT_CODE_TOOLS_ENABLED');
export const parentEmailSigninEnabled = () => on('PARENT_EMAIL_SIGNIN_ENABLED');
export const parentGradesAfterReviewEnabled = () => on('PARENT_GRADES_AFTER_REVIEW_ENABLED');
export const parentCsvInvitesEnabled = () => on('PARENT_CSV_INVITES_ENABLED');
export const parentAllSubjectsEnabled = () => on('PARENT_ALL_SUBJECTS_ENABLED');

// Parents P1-P5 switches (docs/parents/P1_NOTES.md). Read at call time, default
// OFF: with a switch off the site behaves exactly as before.
//   PARENT_SETTINGS_ENABLED     P1: per-school parent access (Off / Free), usage
//                               events and the Parents cards, "Provided by <school>"
//   PARENT_CODE_SIGNUP_ENABLED  P1: code-first entry (no account, no password),
//                               the remembered device session, "Add another child"
const on = (name: string) => /^(true|1|yes)$/i.test((process.env[name] ?? '').trim());

export const parentSettingsEnabled = () => on('PARENT_SETTINGS_ENABLED');
export const parentCodeSignupEnabled = () => on('PARENT_CODE_SIGNUP_ENABLED');

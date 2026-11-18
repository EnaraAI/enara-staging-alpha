# Parents: the new sign-up flow (owner decisions, 18 Nov 2026)

Where each piece is built. lms-test only; test.enara.app stays frozen.

| Piece | Part | Switch |
|---|---|---|
| a) Code only: the parent types the school's code and gets straight in (no sign-up, password or Google step) | **P1** | `PARENT_CODE_SIGNUP_ENABLED` |
| a) This device remembers the session | **P1** | `PARENT_CODE_SIGNUP_ENABLED` |
| d) Secret-code warning (EN + AR) on the code pages | **P1** | `PARENT_CODE_SIGNUP_ENABLED` (code-first page); the portal's "Add another child" page always shows it |
| Multi-child 1) "Add another child": one code per child, same account, children in different schools, each under its own school's setting | **P1** | none (already possible); per-school setting: `PARENT_SETTINGS_ENABLED` |
| Multi-child 2) "Already have an account? Sign in with your email first" on the code page | **P1** (link to the existing sign-in); passwordless email sign-in behind it in **P2** | |
| b) "Add your email to get notifications and sign in on any device" (prompt, dismissible, comes back); 6-digit code (10 min, rate-limited, 5 tries) | **P2** | `PARENT_EMAIL_SIGNIN_ENABLED` |
| b) Passwordless sign-in with the verified email (new 6-digit code) | **P2** | `PARENT_EMAIL_SIGNIN_ENABLED` |
| c) Lost session without an email: "ask the school for a new code", said before the email step can be skipped | **P1** (account note, sign-out warning, code page); **P2** (the email prompt) | |
| Multi-child 2) Verified-email merge ("This email already has an account with another child. Merge them?"), audited, keeps every link, consent and history | **P2** | `PARENT_EMAIL_SIGNIN_ENABLED` |
| d) Secret-code warning on the printed class code sheet | **P2** (the sheet) | `PARENT_CODE_TOOLS_ENABLED` |
| d) Secret-code warning in the invite email; e) CSV invites group rows by parent email, no email binding, address offered as a suggestion | **P4 / P5** | `PARENT_EMAILS_ENABLED`, `PARENT_CSV_INVITES_ENABLED` |
| Weekly summary: one email per parent, a section per child | **P4** | `PARENT_EMAILS_ENABLED` |
| g) Existing parent accounts (password or Google) keep working as they are | all | |

## Emails

The four emails the flow needs were approved by the owner on 18 Nov 2026 ("Approve all") and are in the live
parent set (`backend/src/email/parents/`): `parent-email-verify`, `parent-sign-in-code`, and the replaced
`parent-weekly-summary` (one per parent) and `parent-invite` (code-first, secret-code warning, one row per
child). Codes are in the email body only; `sendParentTemplate` refuses a link that carries a code. Every parent
email is sent through the lms-test safety path (test-inbox redirect, `[lms-test]` prefix, daily ceiling,
never twice; capture mode in the E2E stack). P1 sends no email.

## E2E

`e2e/tests/10-parents-p1.spec.ts`: one parent, two children in two schools (code-first, then "Add another
child"), the remembered device (reload, expired session, no session), a second device without the device
token, the ENARA admin switching one school Off and back, the school admin's Parents card. The email merge and
signing in on a second device with an email are added to the scenario in P2.

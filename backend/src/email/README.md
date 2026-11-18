# Transactional email (Resend templates)

The HTML source of every email is `templates/<alias>.html` (+ subject/variables in `<alias>.json`).
`sendTemplate` renders that HTML in code and sends it as `html` (it does **not** send by Resend template id).
The same files are pushed to Resend so its dashboard, preview and "send test" show them.
The single source of truth for aliases, ids and variables is [`templateRegistry.ts`](./templateRegistry.ts).

Sender: `The Enara Team <noreply@test.enara.app>` (`EMAIL_SENDER`).

| Alias | Resend id | Variables |
|---|---|---|
| enara-welcome | 4f7c1ade-5991-4ebe-a300-aa5a5b4db313 | NAME, ACTION_URL |
| enara-verify-email | ef72353a-9930-4670-b68a-42c30986e8ad | NAME, ACTION_URL, EXPIRES_IN |
| enara-password-reset | 15397fc6-acaa-453d-a103-b80d9e0f6394 | NAME, ACTION_URL, EXPIRES_IN |
| enara-parent-consent | 57ebb3c9-2cb5-4ab5-aea6-1c4baba3952b | NAME, CHILD_NAME, LINK_CODE, ACTION_URL, EXPIRES_IN |
| enara-lesson-reminder | f6972409-d9e9-4bec-9c99-c6c41b573221 | NAME, LESSON_TITLE, ACTION_URL |
| enara-weekly-progress | 879509b9-d69b-4c01-8b7f-26d01be2e15e | NAME, CHILD_NAME, LESSONS_DONE, OUTCOMES_MASTERED, TIME_SPENT, PRACTICE_TIP, ACTION_URL |
| enara-assessment-results | 732d6b7a-77cb-4c51-be8f-22278fb4e70f | NAME, CHILD_NAME, TEST_NAME, SCORE, LEVEL, SUMMARY, ACTION_URL |
| enara-class-invitation | 4fc89699-5d97-40e1-8c9f-906c2846f97d | NAME, TEACHER_NAME, CLASS_NAME, ACTION_URL, EXPIRES_IN |

> **Status:** all 8 templates were pulled from the test.enara.app Resend account on 2026-11-16
> and are in `templates/`. Edit them here and push with `push-templates.ts --confirm`.

## Pull / edit / push

Run from the repo root with `RESEND_API_KEY` exported (never commit it; `.env` is gitignored):

```bash
npx tsx scripts/email/pull-templates.ts            # writes templates/<alias>.html + <alias>.json
# edit templates/<alias>.html (and subject/from/variables in <alias>.json)
npx tsx scripts/email/push-templates.ts            # dry run: lists what would change, exits 1
npx tsx scripts/email/push-templates.ts --confirm  # PATCH /templates/{id} then POST /templates/{id}/publish
npx tsx scripts/email/push-templates.ts --confirm enara-welcome   # only some aliases
npx tsx scripts/email/bundle-templates.ts          # REQUIRED after any edit: regenerates templatesBundle.ts
```

**Always re-run `bundle-templates.ts` after editing a template.** The runtime (Vercel functions) cannot read
`templates/`, so `sendTemplate` uses the generated [`templatesBundle.ts`](./templatesBundle.ts)
(alias → `{ subject, fallbacks, html }`). A test checks the bundle matches the files byte-for-byte, so a stale
bundle fails CI. `push-templates.ts` still updates Resend, but only for previews/dashboard — sending ignores it.

`<alias>.json` holds `id`, `name`, `subject`, `from` and `variables` (`key`, `type`, `fallback_value`).
When adding or renaming variables, update `templateRegistry.ts` too — `sendTemplate` types follow it.

## Logo

Templates reference the **hosted** logos, so Resend's preview and test button show them:
`https://assets.enara.app/email/enara-logo.png` (black, transparent) and
`https://assets.enara.app/email/enara-logo-white.png` (white, swapped in under `prefers-color-scheme: dark`;
Apple Mail, iOS/macOS Outlook, Outlook.com; Gmail keeps the black one). Both live in the Cloudflare R2 bucket
`enara-email-assets`.

On send, `sendTemplate` replaces those two URLs with `cid:enara-logo` / `cid:enara-logo-white` and attaches both
PNGs inline (from `logoInline.ts`, base64 of `assets/*.png`), so real emails show the logo even in clients that
block remote images (Roundcube, Outlook desktop, many school mail systems).

To change the logo: replace `assets/enara-logo*.png`, regenerate `logoInline.ts` (a test checks they match),
and re-upload the hosted copies.

## Links (ACTION_URL is built in code)

Callers never pass `ACTION_URL` for aliases that have a page in the app: they pass link params and
[`links.ts`](./links.ts) builds the URL from `getConfig().appUrl` (`APP_URL`, trailing slashes trimmed,
params URL-encoded). Without an app URL `sendTemplate` returns `{ ok: false, code: 'missing_app_url' }` and sends nothing.

| Alias | Caller passes | ACTION_URL |
|---|---|---|
| enara-welcome | – | `${APP_URL}/` |
| enara-weekly-progress | – | `${APP_URL}/` |
| enara-password-reset | `token` | `${APP_URL}/reset-password?token=…` |
| enara-class-invitation | `token` | `${APP_URL}/accept-invitation?token=…` |
| enara-assessment-results | `assessmentId` | `${APP_URL}/?assessment=…` |
| enara-lesson-reminder | `courseId` | `${APP_URL}/?course=…` |
| enara-verify-email | `ACTION_URL` (caller-supplied) | no page in the app yet |
| enara-parent-consent | `LINK_CODE` (shown in the body only) | `${APP_URL}/parents/link` (never carries the code) |

When a page for email verification exists, add it to `TEMPLATE_LINKS` in `links.ts`.

**Parent link codes are never in a URL** (P0 item 4, owner decision D15): `enara-parent-consent` shows the
code in the body (`LINK_CODE`, no fallback, so an empty code fails as `unfilled_placeholder`), and its
button opens `/parents/link` with no parameters. As a second check, `sendTemplate` refuses
(`code_in_url`) any email whose links carry an `ENR-XXXX-XXXX` code or the given `LINK_CODE`.
The `LINK_CODE` change is in the repo copy of the template only; the copy hosted in Resend is not
updated until the owner approves a push (sending renders the repo copy, so this does not affect sends).

**Reserved recipients** (P0 item 4): `sendTemplate` refuses any recipient on `.test`, `.example`,
`.invalid`, `.localhost`, `example.com`/`.net`/`.org` or `lms.enara.test` (and their subdomains), and an
address without a domain: `{ ok: false, code: 'reserved_recipient' }`, nothing sent, and only the code is
logged (`email.send_template_refused`, never the address). See [`reservedRecipients.ts`](./reservedRecipients.ts).

## Sending

```ts
import { sendTemplate } from './email/sendTemplate';

const result = await sendTemplate('enara-password-reset', user.email, {
  NAME: user.name, EXPIRES_IN: '30 minutes', token,
}); // { ok: true, id } | { ok: false, code, message }
```

Rendering follows Resend: `{{{VAR}}}` is inserted raw, `{{VAR}}` HTML-escaped (the current templates only use
triple braces). A missing/empty value uses the variable's `fallback_value` from `<alias>.json`; the subject is
filled the same way. If any placeholder remains after filling, the call returns `{ ok: false, code: 'unfilled_placeholder' }`.

Variables are type-checked per alias (template variables minus `ACTION_URL` plus the link params above;
all required, no extras) and re-checked at runtime. Failures are logged
with alias + error code/message only (email addresses are scrubbed). The Resend client is created lazily from
`RESEND_API_KEY`; without it the call returns `{ ok: false, code: 'missing_api_key' }`.

Test email (from `backend/`, key exported, to an inbox you own):

```bash
npx tsx -e "import('./src/email/sendTemplate').then(m => m.sendTemplate('enara-welcome', 'you@example.com', { NAME: 'Test' })).then(console.log)"
```

## Account emails

`services/accountTokens.ts` sends the password reset (`enara-password-reset`, expiry from `PASSWORD_RESET_TTL_MS`)
and staff invitation (`enara-class-invitation`, expiry from `INVITATION_TTL_MS`) through `sendTemplate` when
`RESEND_API_KEY` is set (still skipping `.test` addresses and honouring `REMINDER_TEST_RECIPIENT`). Without the key
the previous inline-HTML `sendEmail` path runs unchanged.

## LMS emails (`lms/`, not Resend-hosted)

LMS emails (owner decisions D1, D5, D11) live in [`lms/`](./lms) as one file per language
(`lms-<name>-en.html/.json`, `lms-<name>-ar.html/.json`; Arabic is `dir="rtl"`, Tahoma, Latin tokens in
`<span dir="ltr">`). They are **not** in `TEMPLATE_REGISTRY`, not pushed or published to Resend, and are sent only by
`sendLmsTemplate` (`sendLmsTemplate.ts`), which LMS code calls only when `LMS_EMAILS_ENABLED`, `REMINDERS_ENABLED`
and `RESEND_API_KEY` are all set (lms-test keeps `LMS_EMAILS_ENABLED` off). Re-bundle after an edit
(a test checks the bundle matches the files):

```bash
npx tsx scripts/email/bundle-lms-templates.ts   # writes lms/lmsTemplatesBundle.ts
```

| Alias | Variables | Used by |
|---|---|---|
| lms-invite-connect-en / -ar | NAME, SCHOOL_NAME, EXPIRES_ON, ACTION_URL, REFERENCE_CODE | "Send email" on the LMS onboarding invite (step 2). `ACTION_URL` is `${APP_URL}/?page=lms-status` (sign-in; never the Moodle link or its code, D5) |

The From address of every email is `EMAIL_SENDER` (env) when set, else the default above (D11).

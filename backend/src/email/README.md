# Transactional email (Resend templates)

All HTML lives in Resend-hosted templates. Code only picks a template and passes variables.
The single source of truth for aliases, ids and variables is [`templateRegistry.ts`](./templateRegistry.ts).

Sender: `The Enara Team <noreply@test.enara.app>` (`EMAIL_SENDER`).

| Alias | Resend id | Variables |
|---|---|---|
| enara-welcome | 4f7c1ade-5991-4ebe-a300-aa5a5b4db313 | NAME, ACTION_URL |
| enara-verify-email | ef72353a-9930-4670-b68a-42c30986e8ad | NAME, ACTION_URL, EXPIRES_IN |
| enara-password-reset | 15397fc6-acaa-453d-a103-b80d9e0f6394 | NAME, ACTION_URL, EXPIRES_IN |
| enara-parent-consent | 57ebb3c9-2cb5-4ab5-aea6-1c4baba3952b | NAME, CHILD_NAME, ACTION_URL, EXPIRES_IN |
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
```

`<alias>.json` holds `id`, `name`, `subject`, `from` and `variables` (`key`, `type`, `fallback_value`).
When adding or renaming variables, update `templateRegistry.ts` too — `sendTemplate` types follow it.

## Logo

The logo is **embedded in every email** as an inline (CID) attachment, so it shows even in mail
clients that block remote images (Roundcube, Outlook desktop, many school mail systems).

- Every template uses `<img src="cid:enara-logo" …>` (black, 120×55, left-aligned) and a white
  version `cid:enara-logo-white` that replaces it in dark mode (`prefers-color-scheme: dark`;
  Apple Mail, iOS/macOS Outlook and Outlook.com). Gmail ignores this and keeps the black logo.
- `sendTemplate` always attaches both logos (content IDs `enara-logo` and `enara-logo-white`), from `logoInline.ts`
  (base64 of [`assets/enara-logo.png`](./assets/enara-logo.png)). **Send these templates only through
  `sendTemplate`**; an email sent to a template without the attachment shows no logo.
- To change the logo: replace `assets/enara-logo.png`, regenerate `logoInline.ts` from it (the test
  `attaches the inline logo…` checks that they match), and re-upload the hosted copy.
- A hosted copy also exists at `https://assets.enara.app/email/enara-logo.png` (Cloudflare R2 bucket
  `enara-email-assets`), for previews and other uses. The templates no longer reference it.

## Sending

```ts
import { sendTemplate } from './email/sendTemplate';

const result = await sendTemplate('enara-password-reset', user.email, {
  NAME: user.firstName, ACTION_URL: resetUrl, EXPIRES_IN: '1 hour',
}); // { ok: true, id } | { ok: false, code, message }
```

Variables are type-checked per alias (all required, no extras) and re-checked at runtime. Failures are logged
with alias + error code/message only (email addresses are scrubbed). The Resend client is created lazily from
`RESEND_API_KEY`; without it the call returns `{ ok: false, code: 'missing_api_key' }`.

Test email (from `backend/`, key exported, to an inbox you own):

```bash
npx tsx -e "import('./src/email/sendTemplate').then(m => m.sendTemplate('enara-welcome', 'you@example.com', { NAME: 'Test', ACTION_URL: 'https://enara.app' })).then(console.log)"
```

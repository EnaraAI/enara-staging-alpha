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

> **Status:** the templates are **not yet pulled into the repo** — the `RESEND_API_KEY` for the
> test.enara.app Resend account is not configured in this environment. Run `pull-templates.ts`
> once with the key to populate `templates/`.

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

## Logo hosting

The logo source is [`assets/enara-logo.png`](./assets/enara-logo.png). Templates reference the hosted copy at
`https://assets.enara.app/email/enara-logo.png` (Cloudflare R2 bucket `enara-email-assets`). To change it,
upload the new file to the same key in that bucket; templates need no edit.

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

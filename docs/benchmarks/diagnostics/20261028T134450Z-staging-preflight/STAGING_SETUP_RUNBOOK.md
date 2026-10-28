# ENARA — Same-Server Staging Setup Runbook (Preflight)

Placeholders look like `<…>`. They are never real values. Nothing in this runbook has been executed. Read with `../20261028T133812Z-staging-readiness/STAGING_READINESS_REPORT.md`.

## 0. Verified vs unknown

**Verified from the repository**
- The backend starts with `npm run build && npm start` (`node dist/index.js`); the frontend with `node dist/server.cjs` (proxies to `BACKEND_URL`).
- `src/config/env.ts` reads the configuration, and **calls `dotenv.config()`, which loads `.env` from the working directory**.
- The database comes only from the path of `MONGODB_URI`.
- Uploads go to R2 (all four `R2_*` set) or to `UPLOAD_DIR`. The key prefix `uploads/` is fixed.
- Signed upload URLs are HMAC'd with `JWT_SECRET`.
- Cron is `GET /api/cron/daily` with `Authorization: Bearer <CRON_SECRET>`.
- Migrations run on startup unless `RUN_MIGRATIONS_ON_START=false` or `NODE_ENV=test`; `npm run migrate` runs them on purpose.

**New in this preflight:** `ENARA_STAGING=true` turns on the startup isolation guard (`src/config/stagingGuard.ts`; §2).

**Unknown (not in the repository; must come from the server owner):** the host's process manager, reverse proxy, ports, TLS, other running services and resource limits.

## 1. Environment variables (names from code; placeholders only)

| Variable | Staging value |
|---|---|
| `ENARA_STAGING` | `true` |
| `NODE_ENV` | `development` (**approved: Option A**, §4) |
| `PORT` | `<staging-backend-port>` |
| `MONGODB_URI` | `mongodb://<staging-user>:<password>@<host>/enara_staging_alpha?authSource=enara_staging_alpha` |
| `DATABASE_URL` | unset (not required with Option A) |
| `JWT_SECRET`, `INGEST_HMAC_SECRET`, `CRON_SECRET` | three new, different, random values, 32+ characters each |
| `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `APP_URL` | `https://<staging-subdomain>` |
| `TRUST_PROXY` | `true` behind the reverse proxy |
| `RUN_MIGRATIONS_ON_START` | `false` (required by the guard) |
| `AI_PAUSED` | leave unset (staging defaults to paused); set `false` only at §8 |
| `REGISTRATION_INVITE_ONLY` | leave unset (staging defaults to `true`), or `true` |
| `REMINDERS_ENABLED` | unset/`false`; if `true`, `REMINDER_TEST_RECIPIENT=<qa-inbox>` is required |
| `DEMO_MODE_ENABLED` | `false` |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | staging bucket (name contains `staging`) and credentials limited to it, **or** all four unset |
| `UPLOAD_DIR` | if R2 is unset: an absolute staging-only path, e.g. `/srv/enara-staging/uploads` |
| `AWS_S3_BUCKET` (+ `AWS_*`) | unset, or a staging bucket |
| `ANTHROPIC_API_KEY` | `<staging-anthropic-key>` (approval) |
| `ELEVENLABS_API_KEY` | unset until Voice Only is approved |
| `ANAM_API_KEY` | **unset** (avatar exams are not implemented) |
| `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `AI_ENGINE_URL` | unset (Option A), or staging endpoints only; never production's |

The template is `backend/.env.staging.example`.

## 2. What the staging guard enforces (`ENARA_STAGING=true`)

Startup stops **before connecting or listening** unless every check passes. Errors name variables only, never values.

1. The database in `MONGODB_URI` is exactly `enara_staging_alpha`. It is checked again after connecting (`src/config/db.ts`).
2. No `.env` file was loaded, so no value is inherited from another environment. **Run staging from a directory that has no `.env`** (for example a separate checkout, or a separate build output), with variables supplied by the process manager.
3. Storage is a staging R2 bucket, or an absolute staging-only `UPLOAD_DIR`. A partial R2 configuration is refused. `AWS_S3_BUCKET` must be unset or a staging bucket.
4. `JWT_SECRET`, `INGEST_HMAC_SECRET` and `CRON_SECRET` are present, 32+ characters, and all different.
5. `RUN_MIGRATIONS_ON_START=false`.
6. `REGISTRATION_INVITE_ONLY` is not false. Email needs `REMINDER_TEST_RECIPIENT` if enabled. Demo mode is off.

Defaults in staging: AI is paused and registration is invite-only unless explicitly set. Nothing is inferred from `NODE_ENV`.

Limits:
- "Staging" bucket and path names are checked by the word `staging`. The guard can't know production's actual bucket, so the bucket owner must make sure the staging credentials can only reach the staging bucket.

## 3. MongoDB: database and least-privilege login (DB owner, approval)

On the existing MongoDB server, as an administrator:

```
use enara_staging_alpha
db.createUser({ user: "<staging-user>", pwd: "<generated>", roles: [ { role: "readWrite", db: "enara_staging_alpha" } ] })
```

The staging URI uses `authSource=enara_staging_alpha`. That user can't read or write any other database. Never reuse the existing URI or user.

## 4. Postgres and `NODE_ENV`

`NODE_ENV=production` requires `DATABASE_URL` (Postgres), `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `AI_ENGINE_URL` and `AWS_S3_BUCKET` (`src/config/env.ts`).

- **Option A (fewer external services):** `NODE_ENV=development` with `ENARA_STAGING=true`. Postgres is then optional; startup logs `postgres_disabled_no_database_url`. The staging guard still enforces secret length and isolation.
- **Option B:** `NODE_ENV=production` with a **separate staging Postgres database** and staging endpoints for each external service.

**Approved: Option A** (`NODE_ENV=development`, `ENARA_STAGING=true`). No staging Postgres is needed; `DATABASE_URL`, the orchestrator variables and `AI_ENGINE_URL` stay unset. `AWS_S3_BUCKET` stays unset or points at a staging bucket.

## 5. Upload storage

Either a new R2 bucket, e.g. `enara-staging-alpha-uploads`, with an API token scoped to that bucket only; or a local directory `/srv/enara-staging/uploads` owned by the staging OS user, with all `R2_*` unset.

The `uploads/` prefix is fixed in the code, so sharing the production bucket "by prefix" is not possible.

## 6. Secrets and cron

Generate three new secrets, for example with `openssl rand -hex 32`, run once for each. Store them only in the staging process environment.

Cron options:
- Run no cron at all in staging.
- Or add a staging-only scheduler entry:
  `curl -fsS -H "Authorization: Bearer <staging CRON_SECRET>" https://<staging-subdomain>/api/cron/daily`

Never add staging to the production scheduler, and never reuse its secret. The cron acts only on the connected (staging) database.

Ingestion callbacks: don't register the staging URL with the production engine. Without a staging engine, leave `AI_ENGINE_URL` unset (Option A).

## 7. Migrations, on purpose (DB owner present)

With the staging environment loaded, from a directory without `.env`:

```
npm run migrate -- --status     # list pending migrations
npm run migrate                 # apply them
```

`npm run migrate` connects through `connectDB()`, so the staging guard runs first: a wrong database name or a `.env` file stops it before it connects.

Check the `migrations` collection afterwards. There are 18 migrations; they are additive and idempotent (tested in `test/p6Validation.test.ts`).

## 8. Synthetic school, flags and budget (only after §2–§7 are verified)

1. **Seed one synthetic school:** `npx tsx src/scripts/seed4Level1.ts --institution <synthetic-id>`.
   - The script refuses `NODE_ENV=production`, so run it with `NODE_ENV=development` and the staging environment.
   - The guard still pins the database.
   - All seeded rows are labelled `demo_seed`, and only that institution is touched.
   - Staff logins are set up via `--emit-setup-links` (single-use, 30-minute tokens).
2. **ENARA admin:** `PUT /api/learning/flags` with `{ institutionId: <synthetic-id>, flags: { … } }`. Minimum flags:
   - Test A: `educator_chat_enabled` and `documents_workspace_enabled`, or `teaching_workflow_enabled` and `ai_lesson_planning_enabled`.
   - Test B: `teaching_workflow_enabled`, `ai_assessment_authoring_enabled`, `connected_workflow_enabled`.
3. **ENARA admin — P0d budget:** `PUT /api/ai-controls/budgets/<synthetic-id>` with:
   - `enforcementEnabled: true`;
   - **approved amounts** for the one synthetic test school: `monthlyCapUsd: 15`, `dailyCapUsd: 6`, `perUserDailyCapUsd: 6`, `gradingAllowanceUsd: 3`;
   - `intendedTools: ["anthropic:educator_chat", "anthropic:ai_lesson_plan", "anthropic:ai_assessment_draft"]`.

   Anthropic models are priced in the catalogue, so each call reserves an upper bound from its token limits; no reservation ceiling is needed for them. Unpriced tools (ElevenLabs) would need `maxReservationUsdPerCall` — not needed for tests A and B.
4. **Verify before unpausing:**
   - `GET /api/ai-controls/budgets/<synthetic-id>` shows the approved values.
   - `GET /api/usage/budget` (as the school's Workspace Admin) shows `policy: enforced`.
5. Set `AI_PAUSED=false` in the staging environment only, and restart the staging process (owner action). Optionally keep the per-school pause (`PUT /api/ai-controls/budgets/<id>/pause`) until the moment of the test.

Approved budget body for `PUT /api/ai-controls/budgets/<synthetic-id>` (configuration only; not authorization to call):

```json
{
  "enforcementEnabled": true,
  "monthlyCapUsd": 15,
  "dailyCapUsd": 6,
  "perUserDailyCapUsd": 6,
  "gradingAllowanceUsd": 3,
  "intendedTools": ["anthropic:educator_chat", "anthropic:ai_lesson_plan", "anthropic:ai_assessment_draft"]
}
```

How these limits behave, from the existing P0d code:
- Each call reserves an upper bound before it runs and is refused once a cap would be passed.
- The monthly USD 15 is the binding ceiling. The daily USD 6 and the per-user daily USD 6 (the same value, so with one test user they bind together) limit any single day.
- Grading is never blocked by these caps. Once the ordinary caps are reached, it uses the USD 3 grading allowance, then the existing emergency accounting and alert path. There is no approval gate.
- Unpriced tools (ElevenLabs) are not in `intendedTools`; with enforcement on, they are refused. Adding them later needs approved `maxReservationUsdPerCall` values.
- These amounts apply only to the synthetic test school. No other institution is changed.

**Spend-cap gap (no paid call depends on it):** there is no single global live-test ceiling across schools. Caps are per school and enforced atomically by `BudgetCounter`. With one synthetic school, its `monthlyCapUsd` is the effective ceiling. `ALPHA_LIVE_TEST_MAX_SPEND_USD` is not implemented and was not added.

Proposed later implementation, if a cross-school ceiling is wanted: an optional `globalCapUsd` on the existing `ai_controls` document, reserved with the same atomic counter pattern (a `global:month:<YYYY-MM>` counter), with tests. Not built here.

## 9. The two live tests and reconciliation

One call each, synthetic content only:
- **Test A (text):** upload a short synthetic `.txt` (rights confirmed; it will show "not malware-scanned"), then ask one AI Chat question. Alternatively, generate one lesson plan.
- **Test B (assessment):** generate one small draft from that document. Check it stays a draft and its sources are real.

After each test:
1. The `usage_ledger` rows for the request (`requestId` from the `X-Request-Id` response header) have the synthetic `institutionId` and the right user, `status`, `costStatus` (`measured` expected for Anthropic) and units. There is exactly one row per billed provider attempt.
2. `GET /api/usage/report` (Workspace Admin) shows the operation. `GET /api/usage/me/requests/<requestId>` (the caller) shows the chip data.
3. `GET /api/ai-controls/budgets/<id>/status` (ENARA admin) shows the counter moved and the reservation settled.
4. If any of these is missing or ambiguous, **stop further live calls**.

## 10. Rollback

1. Stop the staging processes (owner action).
2. Keep the logs and the `enara_staging_alpha` database for review; don't delete them.
3. Revert the flags for the synthetic school to `false`, and set its budget pause to `true`.
4. Revoke or rotate the staging provider keys if needed. Production is untouched throughout.

## 11. Human approvals required
1. Server owner: host layout, a separate OS user and directory without `.env`, ports or subdomain with TLS, resource limits, and the restarts.
2. Database owner: create `enara_staging_alpha` and its user. (Postgres decision made: Option A, none needed.)
3. Storage owner: a staging bucket scoped by its token, or a local directory.
4. ~~P0d amounts~~ **Approved:** monthly USD 15, daily USD 6, per-user daily USD 6, grading allowance USD 3 (synthetic test school only). Making calls still needs a separate go-ahead (item 6).
5. A staging Anthropic key, plus ElevenLabs only when Voice Only is approved.
6. Go-ahead to unpause AI for the two calls.

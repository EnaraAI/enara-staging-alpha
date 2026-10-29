# P13.3 operator attestation checklist (private)

**For:** an authorized operator (the account owner) working on their own machine and dashboards.

**Never send** values, URIs, keys, passwords, hashes or fingerprints to Claude or into any report. Report only the **Result** column (VERIFIED / FAILED / UNKNOWN), the **evidence type** (for example "Vercel env editor", "Atlas UI", "local script") and the **date**.

**Where values live:** Vercel → project `enara-staging-alpha` → Settings → Environment Variables (all 20 are Production-scoped). Deployment under review: `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4`.

> **If you use a local file:** `vercel env pull` writes secret values to disk. If you do this, write to a private temporary file outside any repository, never commit it, and delete it afterwards. Do not paste its contents anywhere.

## Checklist

| # | Item | How to check privately | Pass criterion | Result | Evidence type | Date |
|---|---|---|---|---|---|---|
| 1 | `ENARA_STAGING` enabled | Vercel env editor | Value is exactly `true` (or `1` / `yes`) | | | |
| 1a | Guard demonstrably invoked | Run the local guard script below against the same values | Prints `staging mode: on` and `guard problems: 0` | | | |
| 2 | `NODE_ENV` as intended | Vercel env editor | Value is `development` (runbook "Option A"). **Implication:** not production mode, so local uploads default ON and Postgres readiness reports `ok` without a database, unless overridden (items 8, 14). | | | |
| 3 | Database name | Look only at the path after the host in `MONGODB_URI` | Exactly `enara_staging_alpha` | | | |
| 4a | Atlas project and cluster distinct from production | Atlas UI: the cluster the URI's host belongs to | A dedicated staging project and cluster; no production database on it | | | |
| 4b | Least-privilege database user | Atlas UI → Database Access | User limited to `enara_staging_alpha` (readWrite on that database only); no admin roles | | | |
| 4c | Network allowlist | Atlas UI → Network Access | `0.0.0.0/0` present only if approved for the current session; otherwise removed | | | |
| 5a | Dedicated staging R2 bucket | Cloudflare R2 UI / Vercel env editor | `R2_BUCKET` = `enara-staging-alpha-uploads` (or another bucket containing "staging"), used by nothing else | | | |
| 5b | Bucket-limited R2 credentials | Cloudflare → R2 → API tokens | The token behind `R2_ACCESS_KEY_ID` is scoped to that one bucket | | | |
| 6a | `JWT_SECRET` differs from production | Private equality test (below); report only yes/no | Differs | | | |
| 6b | `INGEST_HMAC_SECRET` differs from production | same | Differs | | | |
| 6c | `CRON_SECRET` differs from production | same | Differs | | | |
| 6d | Previously exposed credentials rotated | The R2 token and Atlas password pasted in chat (runbook line 49) | Both rotated after the paste date; old ones revoked | | | |
| 7 | `RUN_MIGRATIONS_ON_START` | Vercel env editor | Exactly `false` (anything else runs migrations on every cold start) | | | |
| 8 | `SERVE_LOCAL_UPLOADS` | Vercel env editor | `false` | | | |
| 9 | `DEMO_MODE_ENABLED` | Vercel env editor | `false` | | | |
| 10 | `REGISTRATION_INVITE_ONLY` | Vercel env editor | `true` | | | |
| 11a | `REMINDERS_ENABLED` | Vercel env editor | `false` (email cannot send anyway: `RESEND_API_KEY` and `REMINDER_FROM` are not set) | | | |
| 11b | External scheduler or cron risk | Vercel → Settings → Cron Jobs; any outside scheduler (GitHub Actions, cron-job.org, uptime monitors) | Nothing calls `/api/cron/daily` with `CRON_SECRET`. That sweep re-grades, processes documents, **deletes expired documents** and sends reminders. | | | |
| 12a | `AI_PAUSED` | Vercel env editor | `true`. **Known:** it was set to `false` on 2026-10-29 at the owner's request. Expect FAILED until it is deliberately reset. | | | |
| 12b | Global and school pause | Separately authorized procedure only (needs an authenticated admin read; not part of this phase) | Global pause on, or AI pause on for the staging school | | | |
| 12c | Provider path disabled | Vercel env names | No `ANTHROPIC_API_KEY`, `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY` or `AI_ENGINE_URL` (**already VERIFIED by P13.2/P13.3 from names**) | VERIFIED | Vercel env names | 2026-10-29 |
| 13 | `TRUST_PROXY` | Vercel env editor | A hop count, `1` behind Vercel (not `true`) | | | |
| 14 | Postgres readiness not treated as proof | Policy check | Everyone reading `/ready` knows `postgres: ok` is reported without a database here (`DATABASE_URL` not set) | | | |
| 15 | All four `R2_*` set and non-empty | Vercel env editor (presence only) | All four non-empty (otherwise uploads fall back to local disk, or startup fails if 1–3 are set) | | | |

## Local guard script (operator runs; prints no values)

Run it from a checkout of `cc8530f`, with the staging values loaded **only into your own shell**, never into a file inside the repository. It reuses ENARA's own guard and prints only booleans and problem *descriptions*, which name variables, never values:

```bash
cd backend
npx tsx -e '
import { isStagingMode, stagingProblems } from "./src/config/stagingGuard";
const on = isStagingMode(process.env);
const problems = on ? stagingProblems(process.env) : ["(guard not active: ENARA_STAGING is not true)"];
console.log("staging mode:", on ? "on" : "off");
console.log("guard problems:", on ? problems.length : "n/a");
for (const p of problems) console.log(" -", p);
'
```

## Private equality test (operator only; prints yes/no)

With the staging and production values in two shell variables you set yourself (never echoed, never written to disk):

```bash
[ "$STAGING_VALUE" = "$PRODUCTION_VALUE" ] && echo "SAME (FAILED)" || echo "different (VERIFIED)"
unset STAGING_VALUE PRODUCTION_VALUE
```

## What to send back

One line per item, in the form `#<n>: VERIFIED | FAILED | UNKNOWN — <evidence type>, <date>`. No values and no hashes.

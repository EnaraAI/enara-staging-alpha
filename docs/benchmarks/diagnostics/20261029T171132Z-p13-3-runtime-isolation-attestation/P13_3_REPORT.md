# P13.3: runtime isolation attestation (read-only)

**Date:** 2026-10-29 (checks 17:11–17:25 UTC) · **Repo:** `EnaraAI/enara-staging-alpha` · **Branch:** `staging-alpha` · **HEAD:** `cc8530f171303a035a9a380b076d349f786d2297` (as expected; equals `origin/staging-alpha`)

**Mode:** read-only.
- Source, Vercel metadata, and variable **names and scopes** only.
- No values, no dashboards, no login, no application requests, no provider calls, no changes.
- Only this new folder was written.

## Executive summary

**Runtime isolation remains UNATTESTED.** Stage A (source and metadata) confirmed P13.2's picture and added three source-proven facts:
- **R2 is all-or-nothing.** With none of the four values set, uploads fall back to the local disk silently unless staging mode is on.
- **Email cannot be sent from this deployment at all.** `RESEND_API_KEY` and `REMINDER_FROM` are not configured.
- **The secret-gated daily cron sweep includes destructive work** (document retention deletes), not just reminders.

Every critical runtime fact needs **values** that only an authorized operator may look at:
- staging mode on;
- database name and cluster;
- bucket and token scope;
- secrets differ from production;
- credential rotation;
- the safety switches.

Stage B is therefore a private operator checklist (`operator_attestation_checklist.md`). Its results are not in yet, so every critical item is UNKNOWN.

| Decision | Verdict |
|---|---|
| Authenticated (non-AI) staging smoke tests | **BLOCKED**: critical isolation attestations UNKNOWN |
| AI-dependent staging tests | **NO-GO**: isolation UNKNOWN; AI pause reported off; no provider key or path; no provider-side spend cap |

## Stage A: what source and metadata establish

| # | Check | Finding | Kind | Status |
|---|---|---|---|---|
| A1 | Repository | Branch `staging-alpha`; HEAD = origin = `cc8530f`; 0 tracked changes; 7 untracked entries preserved (P12 harness ×3, P12/P13/P13.1/P13.2 folders) | runtime (repo) | VERIFIED |
| A2 | Vercel mapping | Alias → `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4`, target production, Ready; project `enara-staging-alpha`; 20 names, all Production-scoped | runtime metadata | VERIFIED |
| A3 | Guard activation | Only when `ENARA_STAGING` ∈ {1, true, yes}. Silent otherwise. | design weakness | VERIFIED (source) |
| A4 | Startup order | `createApp()` at module load → `getConfig()` → guard (if on) → first request: Mongo connect → post-connect database-name recheck (if on) → migrations unless exactly `"false"` | design | VERIFIED (source) |
| A5 | Guard coverage | Names and settings only. No Mongo host or cluster check, no comparison with production secrets, no `AI_PAUSED` check. | design weakness | VERIFIED (source) |
| A6 | Migrations | Default **ON** (`db.ts:29`) | design weakness | VERIFIED (source) |
| A7 | R2 | All four set → R2, and the local `/uploads` static branch is unreachable. 1–3 set → startup throws. 0 set → local disk (`uploadStorage.ts:46`), and local serving only if `serveLocalUploads` (default ON when not production) | design | VERIFIED (source) |
| A8 | R2 at runtime | All four names exist; whether all four values are non-empty is unknown | runtime | UNKNOWN |
| A9 | Email | Sending requires `REMINDERS_ENABLED="true"` **and** `RESEND_API_KEY` **and** `REMINDER_FROM` (`emailService.ts:9`, `env.ts:286-291`). The last two names are absent, so **no email can be sent** (reminders, weekly summaries, notifications). | runtime (from absence) | VERIFIED |
| A10 | Cron | `/api/cron/daily` needs `Bearer CRON_SECRET`. It runs evidence processing, time-to-understand, curriculum files, grading sweep, learning intelligence, avatar usage, stale reservations, document scans, **document retention (deletes)**, speaking transcripts, reminders, and Monday summaries. `vercel.json` has no cron schedule; external schedulers unknown. | design + runtime | VERIFIED (source, file) / UNKNOWN (external) |
| A11 | AI pause | Three layers: env `AI_PAUSED` (default = staging mode, `env.ts:397`), global DB switch (`AiControl 'global'`), school `OrgBudget.aiPaused`. Prior action record: env set `false` and global set off on 2026-10-29 at the owner's request. Current values not re-read. | design + reported runtime | REPORTED (current UNKNOWN) |
| A12 | Provider path | No `ANTHROPIC_API_KEY`, model override, `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY` or `AI_ENGINE_URL` names | runtime (from absence) | VERIFIED (disabled) |
| A13 | `NODE_ENV` | Production mode would throw without `DATABASE_URL`, `ENARA_API_KEY`, `ENARA_ORCHESTRATOR_URL` and `AI_ENGINE_URL` (`env.ts:226-240`). The names are absent and the app served (P13.1), so not production. | runtime | INFERRED (strong) |
| A14 | Readiness | `postgres: ok` without a connection when `DATABASE_URL` is unset outside production (`app.ts:176-188`); `DATABASE_URL` is absent | design weakness | VERIFIED (source) |
| A15 | Reminders under staging mode | `REMINDER_TEST_RECIPIENT` is absent. **If** staging mode is on, the running app proves `REMINDERS_ENABLED` ≠ `"true"` (the guard would refuse to start). | conditional | INFERRED (conditional) |

**Design weaknesses vs runtime misconfigurations.**
- **Proven design weaknesses:** A3, A5, A6, A7 (silent local fallback), A10 (destructive sweep behind one secret), A11 (pause defaults off outside staging mode), A14.
- **Proven runtime misconfiguration:** none from metadata alone. The `AI_PAUSED=false` change is a **deliberate, recorded** owner-requested state, not yet re-observed.
- **Runtime facts proven safe:** A9 (no email), A12 (no provider path).

## Stage B: operator attestation

`operator_attestation_checklist.md` lists 25 attestable items with a private method and pass criterion for each. It includes:
- a local script that reuses ENARA's own guard and prints only "staging mode on/off" and the problem count and names, never values;
- a yes/no equality test for production secrets.

| Item | Current status |
|---|---|
| 12c provider path disabled | VERIFIED (names) |
| 12a `AI_PAUSED=true` | **Expected FAILED** (reported set to false) |
| 12b global and school pause | UNKNOWN: needs a separately authorized authenticated read |
| All other items (1–11, 13–15) | UNKNOWN: awaiting the operator |

## Stage C: decisions and recommendations

**Decisions** (rule: any critical attestation UNKNOWN or FAILED → blocked):
- **Authenticated smoke tests: BLOCKED.**
- **AI tests: NO-GO.**

**Recommended code and config hardening** (recommendations only; nothing implemented):
1. **Fail-closed staging guard.** On a deployment that identifies as staging (for example a non-secret pin such as `APP_URL` or `FRONTEND_URL` containing "staging", or the project name), refuse to start unless `ENARA_STAGING=true`. Better still, require an explicit `ENARA_ENVIRONMENT` value for every deployment and refuse to start without it.
2. **Host or cluster pinning.** Add a non-secret `STAGING_MONGO_CLUSTER` pin, and have the guard check the URI host against it. Likewise pin the R2 account id.
3. **Safe migration default.** Run migrations on start only when explicitly opted in (`RUN_MIGRATIONS_ON_START=true`), not unless `false`.
4. **Reliable AI pause.** Default `AI_PAUSED` to `true` everywhere unless explicitly `false`. Log the effective pause state (all three layers) at cold start, as booleans only.
5. **Truthful readiness.** Report `postgres: "not_configured"` instead of `ok` when `DATABASE_URL` is unset.
6. **No silent local storage on serverless.** Refuse to start on Vercel without R2; local disk there is ephemeral.
7. **Cron safety.** In staging mode, skip destructive sweeps (document retention) unless explicitly enabled. Log which jobs ran.

**If and only if** every critical attestation passes (items 1, 1a, 2, 3, 4a–c, 5a–b, 6a–d, 7–10, 11a–b, 13, 15), with item 12a/12b either reset to paused or explicitly accepted, the next step would be a separately approved, **narrow, non-AI, authenticated smoke test**. Scope: one synthetic teacher; login, list classes, view one published assessment; no uploads; no AI; cron untouched. AI tests would additionally need a staging-only key with a provider-side spend limit, a model decision, a retry schedule and a paid budget, each separately approved.

## Smallest next action (approval-gated)

The operator completes `operator_attestation_checklist.md` privately and returns only `#n: VERIFIED | FAILED | UNKNOWN — evidence type, date` lines. The highest-value items are 1/1a (staging mode on, guard clean), 4a (separate cluster), 6a–6d (secrets and rotation), 7 (migrations) and 12a (pause).

## Files in this folder

- `P13_3_REPORT.md`: this file.
- `operator_attestation_checklist.md`: private checklist, local guard script, equality test.
- `checks.json`: machine-readable statuses.

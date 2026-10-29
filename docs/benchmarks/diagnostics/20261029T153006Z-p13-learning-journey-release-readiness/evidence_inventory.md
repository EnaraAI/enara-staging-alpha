# P13 evidence inventory

**Audit:** 2026-10-29, 15:00–15:35 UTC. Read-only: no provider calls, no configuration changes, no file changes outside this folder.

**Labels used in all P13 files:**
- **Verified:** checked directly by me in this audit.
- **Reported:** stated in an artifact, but not independently checkable.
- **Inferred:** follows from verified facts, without direct proof.
- **Unknown:** no evidence either way.

## Repository state (verified)

| Item | Value |
|---|---|
| Repository | `github.com/EnaraAI/enara-staging-alpha` |
| Branch | `staging-alpha` |
| HEAD | `cc8530f` ("F-10: extend the F-3b small-scope fallback to question drafts"); `origin/staging-alpha` is the same commit |
| Aggregate report's commit `c9747e1` | The parent of HEAD. `cc8530f` adds F-10 on top. |
| Tracked changes | None (`git diff` is empty) |
| Untracked entries | 4, left untouched: `backend/src/scripts/p12HardCap.ts`, `backend/src/scripts/p12LiveJourney.ts`, `backend/test/p12HardCap.test.ts`, and the P12 evidence folder |

**The P12 evidence folder and the P12 harness are not committed.** They exist only in this working copy. Anyone auditing GitHub cannot see them.

## P12 evidence folder: `docs/benchmarks/diagnostics/20261029T141743Z-p12-live-e2e/`

File modification times (14:17:43–14:19:35Z) are when the files were copied or written into the folder. **The run times come from timestamps inside the files.** The live run ran 14:08:45.378Z → 14:11:21.347Z (cap ledger `start` and `finish` events).

| File | Purpose | Source and environment | Agrees with the reports? | Notes |
|---|---|---|---|---|
| `P12_LIVE_E2E_REPORT.md` | Narrative report | Written after the run | Mostly; see the contradictions file | Calls step 10 "PARTIAL" and the journey "GO"; the raw result says step 10 FAIL |
| `P12_ACCEPTANCE_MATRIX.csv` | 28 criteria (23 PASS, 1 PARTIAL, plus variants) | Written by hand after the run | Yes, as written | Several PASS rows rest on harness-reported values (P0d counts) or on design (isolation) |
| `P12_CALL_LEDGER.csv` | 9 rows, one per provider attempt | Derived from the cap ledger plus harness-reported usage-ledger rows | Yes: sums are $0.112112 / $0.112112, delta 0 | Usage-ledger values come from the harness's export; the in-memory database was destroyed at the end of the run |
| `P12_HARD_CAP_SPEND_LEDGER.json` | Reservations, actuals, events | Written live by the guard during the run | Yes | 9 attempts, all `ok`, HTTP 200, `end_turn`, provider request ids present; events only `start` and `finish` (no STOP or blocks) |
| `P12_CALL_PLAN.json` | Pre-run worst-case plan | Harness, at run start | Yes: core $0.937, optional $0.435 | Byte-identical to the copy in `dry-run/` (same plan) |
| `P12_RUN_RESULT.json` | Per-step statuses and reconciliation | Harness output, `mode: live` | Partly | Step 10 = FAIL; step 8 mastery entries hold objective ids only (no state or score) |
| `P12_SYNTHETIC_FIXTURE_MANIFEST.json` | Ids and hashes of the synthetic fixtures | Harness | Yes | The notes hash `83681d5a…` equals the hash I recomputed from the current harness source; live and dry manifests are byte-identical |
| `P12_GENERATED_DRAFT.json` | The 5 questions Sonnet produced | Live provider output, as stored by ENARA | Yes | I re-reviewed the content against the notes: all keys correct, injection not obeyed |
| `P12_TUTOR_REPLY.txt` | The Opus tutor reply | Live provider output | Yes | Addresses the student by first name ("Lina"), which shows the name reached the model |
| `P12_ANALYTICS_RESPONSES.json` | 4 deterministic analytics responses | ENARA analytics service, in-process | Yes: mean 66.7 = recomputed 66.7 | |
| `P12_RUN_LOG.txt` | Harness step lines | Harness stdout | Yes | Does not record the shell command used, so the key's source is stated only in report prose |
| `P12_APP_EVENT_LOG.jsonl` | Filtered ENARA application logs (9 `ai_call`, 4 `grading_released`, 1 `grading_failed`, 4 `educator_analytics`) | ENARA logger during the run | Yes | Token fields are logged as `[REDACTED]` (logger redaction); costs and timestamps are present |
| `P12_TEST_SUMMARY.json` | Test and check claims | Written by hand | Yes: I re-ran 953/953 | The frontend build claim was not re-run in P13 (the build writes files) |
| `SOURCE_PROVENANCE_P12_LIVE_E2E.json` | Source hash snapshot | `sourceProvenance.ts --phase P12`, created 14:17:53Z | Hashes still match today's files | `commit_sha` is null. It doesn't cover `directTutorModel.ts`, `educatorAnalytics.ts`, `educatorAnalyticsRouter.ts` or the P12 harness files |
| `dry-run/*` | Free stub-provider run | Harness, stub at 127.0.0.1 | Yes | **Finished 14:17:14Z, after the live run**, so it comes from the post-fix harness. The pre-live dry runs that gated the paid run were not kept |
| `screenshots/*.png` (5) | Renders of the real `AnalyticsReport` component | A scratch script outside the repo rendered `P12_ANALYTICS_RESPONSES.json` | Labelled "local isolated test render" | Renderer not in the repo, so the renders are not reproducible from the repo alone |

## Supporting evidence reviewed

| Path | Purpose | Status |
|---|---|---|
| `docs/benchmarks/diagnostics/20261029T131224Z-p10-live-intent-benchmark/run2-max1024/intent-bench-live-summary.json` | P10 router benchmark | Verified: paraphrase 81.3% (n=48), EN/MSA/EGY 94.4/92.3/86.4, refusals 100%, 0/0/0 safety, $0.014743, model `claude-haiku-5-5` |
| `docs/benchmarks/diagnostics/20261029T132059Z-english-assessment-3model/RESULTS_ADJUDICATED.json` | English draft benchmark | Verified: Sonnet 48/48, 0 critical, $0.012245 per draft; recommendation `claude-sonnet-5-5` |
| `…/20261029T132059Z-english-assessment-3model/F10_FIX_ADDENDUM.md` | F-10 change record | Verified: 947/947 at that point. **It does not record a deployment.** |
| `docs/benchmarks/diagnostics/20261029T124500Z-f5-vercel-cleanup/` | Deploy record for `5725490` | Covers only the earlier deploy. **No in-repo record of the `cc8530f` deploys.** |
| Aggregate report `ENARA_REPORT_2026-10-29.md` (scratchpad, **not in the repo**) | Day summary | See the contradictions file |
| Scratch deploy logs `deploy7.log`, `deploy8.log` (scratchpad, not in the repo) | CLI output of the `cc8530f` deploys | Name deployments `6chkySZuM9sWuRq7QPD5anqoK1cF` and `GUdoFwWLBJFK2g4XhYv9ns97WxH4` |
| `vercel.json`, `backend/src/routes/cron.routes.ts`, `backend/src/services/autoGrading.ts` | How failed grading is retried | Read for finding R-1 |

## Live staging, read-only (verified)

| Check | Result |
|---|---|
| `GET /health`, `/ready`, `/` on `enara-staging-alpha.vercel.app` | 200 / 200 (`mongo ok`, `postgres ok`) / 200 |
| Current production alias | Deployment `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4` (`…-5slxrtmq9`), created 13:48:23Z, Ready |
| Production environment, names only (16) | `AI_PAUSED`, `ENARA_STAGING`, `MONGODB_URI` and `CRON_SECRET` present. **No `ANTHROPIC_API_KEY`**, no `ANTHROPIC_TUTOR_MODEL` or other model override. No values were read. |
| Source deployed | The CLI upload folder `deploy-cc8530f/` is byte-identical to `git archive cc8530f` (0 differences excluding `.vercel/`). That the alias was built from it is **inferred** from the deploy log; Vercel stores no commit metadata for CLI deploys. |
| `vercel.json` cron schedules | **None defined** |
| Authenticated checks (flag states, router on or off, school pause) | **Not performed.** They need a logged-in request, which the P13 rules exclude. |

# P13: learning journey evidence and release readiness

**Audit date:** 2026-10-29 (UTC 15:00–15:35).

**Mode:** read-only evidence review.
- No provider calls were made.
- No configuration, database, code or historical artifact was changed.
- No commit, push or deploy.
- The only new files are the five audit files in this folder.

**Repository:** `EnaraAI/enara-staging-alpha`, branch `staging-alpha`, HEAD `cc8530f` (= `origin/staging-alpha`). The tree is clean except 4 untracked P12 entries, which were left untouched.

## Executive summary

| Decision | Verdict | Reason |
|---|---|---|
| **A. P12 experiment validity** | **GO WITH EXPLICIT LIMITATIONS** | The run is internally consistent, used the real provider, and stayed within its cap. 9 real Anthropic calls reconcile to $0.112112 across four independent records (recomputed from tokens, cap ledger, per-call CSV, app log), with timestamps aligned within 14 ms. Limitations: the evidence and harness are uncommitted; the harness version that made the paid calls was changed afterwards and never hashed; the usage-ledger and P0d counts are harness exports from a database that no longer exists; the raw result records step 10 as FAIL. |
| **B. Deployed staging release readiness** | **NO-GO** | The deployed app has **no Anthropic key** (verified), so no AI step of the journey can run there. P12 **never exercised the deployed app**. Staging is not configured for the recommended draft model (it would use Opus). Nothing is scheduled to retry failed gradings (no cron in `vercel.json`). No provider-side spend cap is evidenced. |

**Runner vs deployed app (resolved).** P12 ran ENARA's code (`cc8530f`, plus the uncommitted harness) **in an isolated local runner**: in-process app, throwaway in-memory database, live Anthropic API. It shows nothing about the deployed Vercel site. Where the aggregate report says "LIVE-PROVIDER-VERIFIED", read "in the isolated harness". See `provenance_and_contradictions.md` (Q1).

**Spend.** The reported "$0.112" is supported: exactly **$0.112112**, with $0.000000 unexplained. The cap was never approached: the highest committed-plus-reserved value was $0.159888 of $1.00. Invoice reconciliation was not possible. See `spend_reconciliation.md`.

## Partial finding (R-1), exact

| Aspect | Detail |
|---|---|
| **What happened** | In step 10 (unassisted reassessment), attempt 1 (`att-1793282959202-pb3c`) contained one AI-graded short answer. Opus judged it correct (1/1): cap-ledger attempt #5, $0.003540, 14:09:19Z. ENARA's leak check then found the correct answer quoted in the generated feedback and refused to release the result. It logged `grading_failed`, reason `feedback_leak`, runs 1, at 14:09:22.209Z. The attempt keeps a provisional, **unreleased** 85.7% (6/7). Attempts 2 and 3 were graded and released at 100%. |
| **How it was detected** | The harness check "every reassessment attempt released" → `P12_RUN_RESULT.json` step 10 = **FAIL**. The cause was found in the app log (`P12_APP_EVENT_LOG.jsonl`). |
| **Labelling** | The P12 report and matrix present it as **PARTIAL**; the raw result says **FAIL** (contradiction C-1). This audit reports both. The underlying facts are consistent: the safeguard worked and no leaked feedback reached the student, but the result was not delivered. |
| **Severity** | **Medium.** No safety or privacy breach. It is a delivery failure: a correct student result is held. |
| **User impact** | The student sees no result for that attempt until the attempt is re-graded. Every retry is another paid call. |
| **Retry path** | Retries are picked up by `sweepGrading`. That runs from the submit "kick" (once, at submission) and from `GET /api/cron/daily`, which needs `CRON_SECRET`. P12 did not exercise a retry. **On Vercel, `vercel.json` defines no cron schedule** (verified), and no external scheduler is evidenced. A held attempt could therefore stay unreleased indefinitely on staging. That is inferred and unresolved. |
| **Blocks release?** | **Blocks the staging pilot** until (a) a retry scheduler is shown to run on the deployed environment, or a teacher-review path is confirmed, and (b) the frequency of the leak is measured. It does not invalidate the P12 experiment. |
| **Smallest safe next step** | Read-only: confirm whether anything external calls `/api/cron/daily` (for example the Vercel dashboard cron settings or an outside scheduler) and how often. Decide whether held attempts surface to teachers. Measuring the leak rate needs a new, separately authorized paid run. |

## Release gates, kept separate

| Gate | Evidence | Status |
|---|---|---|
| P12 learning journey | Isolated runner, real provider | Valid with limitations (decision A) |
| Deployed staging provider key | Production env names: no `ANTHROPIC_API_KEY` | **Missing**: AI cannot run |
| Deployed staging pause state | `AI_PAUSED` name present (value not read); global and school pause off are reported only | Reported, not verified |
| P10 intent router | 81.3% paraphrase vs 85% target (verified) | Below target; must stay off. On staging, off is **reported, not verified** (needs an authenticated read). Not required for the P12 journey, which used fixed-pattern analytics. |
| English draft model | Benchmark: Sonnet 48/48, $0.012245 per draft (verified) | **Recommendation only.** Staging has no model override, so it would use `claude-opus-5-5` for drafts, grading and tutor. P12 used Sonnet only through a harness-local override. |
| F-10 deployment | Commit `cc8530f` (verified); upload folder = `git archive cc8530f` (verified); alias deployment named in the scratch deploy log | Deployed: **inferred**, with no in-repo deploy record. **Never exercised:** the fallback did not fire in P12 (0 events), and the deployed copy has made no AI calls. |
| Tests | Re-ran 953/953; backend and frontend typechecks pass | Verified. Frontend build not re-run (it writes files). |

## Discrepancies and evidence gaps (most important first)

1. **Deployed staging cannot run AI.** There is no key. Every AI step of the journey is unverified on staging.
2. **P12 is runner-only.** The aggregate report's one-line "LIVE-PROVIDER-VERIFIED / GO" summary omits that qualifier.
3. **Step 10 is FAIL in the raw result but PARTIAL in the reports (C-1).** The retry path is unexercised and has no scheduler on Vercel.
4. **The evidence and harness are not committed (C-3)**, and the aggregate report is not in the repo (C-12).
5. **The harness was modified after the paid run, and the run-time version was never hashed (C-2).** The `dry-run/` evidence comes from the post-fix version; the pre-live gating dry runs were not kept.
6. **The provenance snapshot is incomplete (C-4).** `commit_sha` is null, and the tutor, analytics and harness files are not covered.
7. **The usage-ledger and P0d counts are harness exports (spend reconciliation).** The usage-ledger costs are corroborated by the app log; the P0d count is not.
8. **Mastery state is not captured in the step-8 evidence (C-5).** Live class-label evidence is missing (C-6).
9. **Provider payloads were not retained (C-7).** "No personal data in payloads" holds only for the synthetic fixtures. The tutor sends the student's first name (R-3).
10. **Model configuration (R-5).** One setting drives drafts, grading and tutor, so the Sonnet recommendation cannot be applied to drafts alone.

## Limitations of this audit

- No authenticated or AI-triggering request was made to staging: flags, pauses and router state were not read.
- No provider console or invoice access.
- No production or staging database reads.
- The frontend build was not re-run.
- Live model outputs cannot be reproduced bit-for-bit.

## Recommended next steps

**Read-only follow-up (no authorization needed beyond read access):**
1. In the Vercel dashboard, check whether any cron or external scheduler calls `/api/cron/daily`, and how often.
2. With an authorized staging admin, read (do not change) the staging school's feature flags, the router flag and the pause states.
3. Record the `cc8530f` deploys (both deployment ids) in an in-repo deploy record. This needs a commit, so authorize it explicitly.

**Future actions that need your explicit authorization:**
1. Commit the P12 harness, its tests and the P12 and P13 evidence folders, so the evidence lives in the repo.
2. Add a provider key to staging, protected by a provider-side spend limit (the P12 in-process guard cannot run on Vercel). Then repeat the journey over HTTPS against the deployed app, with synthetic data.
3. Add a per-feature model setting, so drafts can use Sonnet without changing grading and tutor.
4. Fix R-1: tighten short-answer grader feedback or regenerate feedback when a leak is found, and add a retry scheduler (for example a Vercel cron for `/api/cron/daily`).
5. Optionally re-run P12 with the run-time harness hash recorded, the pre-live dry run kept, and mastery fields captured.

**Router:** keep it off. P10 is below target, and nothing in P13 changes that.

## Files in this folder

- `p13_release_readiness_report.md`: this file.
- `evidence_inventory.md`: every artifact reviewed, its provenance and integrity notes.
- `acceptance_matrix.md`: criterion-by-criterion results, P12 and deployed staging kept separate.
- `spend_reconciliation.md`: per-call arithmetic and totals.
- `provenance_and_contradictions.md`: the runner-vs-staging resolution and contradictions C-1 to C-12.

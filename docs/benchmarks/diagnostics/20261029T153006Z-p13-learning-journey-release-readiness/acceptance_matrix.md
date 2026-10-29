# P13 acceptance matrix (audit of P12)

**Scope:**
- **In scope:** the P12 spec's journey and acceptance criteria, as run in the **isolated local runner**.
- **Separate:** a "Deployed staging" section at the end covers claims about the deployed staging app.
- **Out of scope** (not in P12 scope and not claimed by it): learner-facing UI clicks in a browser, Arabic assessment generation, voice and avatar, the intent router.

**Confidence:**
- **H:** directly verified from artifacts and source.
- **M:** verified in part, or relies on harness-reported values.
- **L:** inferred, or rests on prose only.

| # | Criterion | Expected | Evidence | Result | Conf. | Caveat or gap |
|---|---|---|---|---|---|---|
| 1 | Journey setup and fixture isolation | Throwaway database, synthetic school, class, students, notes and objectives | `P12_RUN_RESULT.json` step 0–1 and `isolation`; `P12_SYNTHETIC_FIXTURE_MANIFEST.json` (notes hash re-verified); harness source (in-memory DB and URI guard) | PASS | H | The harness is uncommitted; the run-time version is unhashed (C-2) |
| 2 | Learning flow end to end (draft → publish → submit → grade → feedback → gap → tutor → reassess → measure → analytics) | All 12 steps complete | `P12_RUN_RESULT.json` steps 1–12; app event log | PARTIAL | H | Exercised through the HTTP API in-process, **not the learner UI**. Step 10 recorded FAIL (one reassessment attempt not released). Step 11 labelled illustrative. |
| 3 | Assessment generation and grounding | English, 3 multiple choice + 1 true/false + 1 open response, cited to the chosen notes, keys correct, injection ignored | `P12_GENERATED_DRAFT.json` (re-reviewed in P13: 5/5 keys correct, 5/5 `supported`, no volcano content, correct options at positions 1/2/3); step 3 | PASS | H | One small topic; n = 1 draft |
| 4 | Submission, grading and result flow | Weak answer scores low and strong answer high, with feedback; released | Steps 5–7 and 6.5; cap-ledger attempts 2–3 and 8–9; app log `grading_released` | PASS | H | Strong answer = the draft's own model answer, an easy case. 2 agreeing evaluations each; tie-break and retry paths not exercised. |
| 5 | Reassessment unassisted and graded | Tutor blocked; every attempt released | Step 10 (FAIL in raw); app log `grading_failed reason=feedback_leak` at 14:09:22.209Z; attempts 2–3 released at 100% | PARTIAL | H | See the partial-finding analysis in the main report. Retry path not exercised. |
| 6 | Gap detection from stored records | Gaps on the objectives the weak attempt missed | Step 8: time-to-understand `in_progress` on both objectives; outcomes `studentsWithGap 1` | PASS | M | Mastery state and score not captured in the artifact (C-5) |
| 7 | Tutor addresses the gap with a check question | Gap terms plus an unassisted check question | `P12_TUTOR_REPLY.txt` (re-read in P13) | PASS | H | One reply; it sends the student's first name to the model (R-3) |
| 8 | Measured change from stored scores only | Computed from stored attempts; labelled if inconclusive | Step 11: pre 0% → first released post 100%; labelled illustrative | PASS (illustrative) | H | Different instruments; gaps still "not yet verified" by the mastery rule (R-2) |
| 9 | Analytics match stored records | Report values = recomputation; no provider call | Step 12; `P12_ANALYTICS_RESPONSES.json`; screenshots | PASS | H | Renderer for the screenshots is outside the repo |
| 10 | Tenant, class and school scope isolation | Another school is refused; analytics scoped to own class | Step 4: other-school assign → 404; step 12 scope = 1 class | PASS | H | One negative probe only; broader scope coverage rests on existing tests (953/953) |
| 11 | No unintended student-record changes | No real or remote database touched | Isolation evidence (#1); `liveEnvTouched: false`; no `MONGODB_URI` set from `.env` in the harness source | PASS | M | "Only the key was read from `.env`" is reported in prose; the command line was not logged |
| 12 | No real or personal student data in evidence or provider payloads | Synthetic only | Fixtures are hard-coded synthetic (harness, manifest); P12 folder pattern scan clean | PASS (fixtures) / NOT VERIFIED (payloads) | M | Payloads not retained; the tutor payload contained the synthetic first name |
| 13 | Provider-call accounting | Every attempt matched across the cap ledger, usage ledger and app log | `spend_reconciliation.md`: 9/9/9, delta $0.000000, timestamps within 2–14 ms | PASS | H (cap ledger, app log) / M (usage ledger and P0d counts are harness exports) | Invoice not reconciled |
| 14 | Hard spend cap | Worst case reserved before every attempt; ≤ $1.00; STOP if reached | Cap ledger: reservation recorded before each request; committed + reserved ≤ $0.16; spend $0.112112 | PASS | H for this run | STOP and refusal paths verified only by offline tests (6/6); never triggered live |
| 15 | Error and exception handling | Failures handled without wrong releases | `feedback_leak` correctly blocked a release; offline guard tests cover HTTP error, usage-unknown and over-cap | PARTIAL | M | Grading retry (`grading_failed` → re-grade) not exercised; on Vercel no cron is defined to drive it (R-1) |
| 16 | Evidence completeness and reproducibility | Artifacts sufficient to audit and re-run | This audit could reconcile everything except the items listed | PARTIAL | H | Uncommitted evidence and harness (C-3); run-time harness unhashed (C-2); pre-live dry runs not kept; provenance snapshot incomplete (C-4); live model output is not bit-reproducible by nature |

## Deployed staging (separate from P12)

| # | Criterion | Evidence | Result | Conf. |
|---|---|---|---|---|
| S-1 | Deployed app reachable and healthy | `/health` 200, `/ready` 200 (mongo, postgres ok) | PASS | H |
| S-2 | Deployed app can make provider calls | No `ANTHROPIC_API_KEY` in production env names | **FAIL** | H |
| S-3 | Deployed app ran the learning journey | No artifact targets the Vercel URL | **NOT VERIFIED** (not attempted) | H |
| S-4 | Deployed code = `cc8530f` (with F-10) | Upload folder byte-identical to `git archive cc8530f`; deploy log names the alias deployment | PASS (inferred) | M |
| S-5 | Staging draft model = Sonnet 5.5 | No model override → code default Opus | **FAIL** (not configured) | H |
| S-6 | Router off on staging | Requires an authenticated read | NOT VERIFIED | L |
| S-7 | Failed gradings retried on staging | `vercel.json` has no cron; the retry endpoint needs an external caller with `CRON_SECRET` | NOT VERIFIED (likely not running) | M |
| S-8 | Provider-side spend cap for staging | None evidenced | NOT VERIFIED | — |

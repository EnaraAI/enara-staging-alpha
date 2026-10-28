# ENARA 4Level1 — P6 Integrated Alpha Validation Report

Working tree: branch `feature/conversation-exam`, uncommitted (`commit_sha: null`). Snapshot: `SOURCE_PROVENANCE_POST_P6.json` in this folder.

**Decision: local/mock Alpha ready. No live provider call was made, and live verification (text, assessment generation, Voice Only) is outstanding.**

## Live Provider Smoke-Test Results

No live call was made. The addendum's stop conditions were met before the first call:

| Prerequisite | Status |
|---|---|
| Positively identified isolated staging/test environment and database | **Missing.** The only configured database (`backend/.env` `MONGODB_URI`) is a remote, non-local host that could not be positively identified as isolated staging. It was not connected to. |
| Explicit, bounded live-test spend ceiling (`ALPHA_LIVE_TEST_MAX_SPEND_USD`, or an approved P0d budget for a named test institution) | **Missing.** No ceiling was invented. |
| Anthropic credentials (text generation) | Present in `backend/.env`; not displayed. |
| ElevenLabs credentials, STT/TTS entitlement (Voice Only) | **Missing.** `ELEVENLABS_API_KEY` is not configured. |
| Reservation ceilings for unpriced tools (`elevenlabs:speaking_exam_stt`, `elevenlabs:speaking_exam_tts`) | **Missing.** Needed under budget enforcement. |
| Customer commercial plan and credit rates | Not configured. Savings and the simulator correctly show "Not enough data". |

- Providers called: none. Calls and attempts: 0. Observed spend: none.
- UsageLedger reconciliation: not applicable to live calls. Ledger semantics were verified with mocks (P5 tests).
- Feature flags changed in any institution: none.
- Avatar: Voice + Avatar is not implemented and was not tested.

## Readiness matrix

| Capability | implemented | automated_mock_tested | locally_operational | requires_approved_live_test | blocked |
|---|---|---|---|---|---|
| Login / roles / permissions | yes | yes | yes | — | — |
| Document upload / local extraction (not-malware-scanned policy) | yes | yes | yes | — | No malware scanner (accepted residual risk) |
| Grounded educator chat | yes | yes | yes (mock provider) | yes | — |
| Lesson generation (source-linked) | yes | yes | yes (mock) | yes | — |
| Quiz/assessment generation (source-linked) | yes | yes | yes (mock) | yes | — |
| Publish / assign (authorized classes) | yes | yes | yes | — | — |
| Autonomous grading | yes | yes | yes (mock) | yes (no paid benchmark) | — |
| Gap → intervention → tutor → unassisted reassessment | yes | yes | yes (mock) | yes | — |
| Outcomes and timeline | yes | yes | yes | — | — |
| Voice Only speaking exams | yes | yes (mock STT/TTS) | no | yes | ElevenLabs credentials, ceilings, browser/codec check |
| Voice + Avatar speaking exams | gating/fallback only | fallback only | no | — | **Not implemented** |
| Usage chips | yes | yes | yes | — | Credits need a commercial plan |
| Usage report | yes | yes | yes | — | — |
| Budgets / pause (P0d) | yes | yes | yes | — | — |
| AI Savings Center / simulator | yes | yes | yes ("Not enough data") | — | No approved price or current spend |
| Tenant / class isolation | yes | yes | yes | — | — |
| Migrations | yes | yes (in-memory, idempotent) | yes | — | — |
| Deploy readiness | — | — | — | staging deploy needs approval | Not deployed by design |

## Migrations

There are 18 migrations, run in array order with non-decreasing dates. On a fresh disposable in-memory database, all ran once; on a second run nothing was pending. Re-running each `up()` directly is safe. An unrelated index and pre-existing rows survived.

Application startup runs pending migrations automatically, unless `NODE_ENV=test` or `RUN_MIGRATIONS_ON_START=false`. A lock document stops concurrent runs. A failing migration is logged (`migrations_on_start_failed`) and the server keeps starting.

Pre-deploy checklist (human-approved staging only):
1. Back up the staging database.
2. Deploy with `RUN_MIGRATIONS_ON_START=false` and run the migrations once on purpose.
3. Check the `migrations` collection and the logs.
4. Then enable startup migrations.

## Next approvals and actions for a real staging Alpha
1. Provide an isolated staging environment and database, positively identified as non-production, with a synthetic test institution.
2. Approve an explicit live-test spend ceiling (`ALPHA_LIVE_TEST_MAX_SPEND_USD`, or a P0d budget for that institution with `intendedTools` and reservation ceilings for the unpriced tools).
3. For Voice Only: provide ElevenLabs credentials and entitlement (batch STT `scribe_v2`, TTS), approve the consent wording, and run browser/codec checks (Chrome, Safari, Firefox).
4. Approve the ENARA commercial price and credit rates (`PUT /api/ai-controls/commercial/:institutionId`), and have the school enter its current-tool spend.
5. Accept the residual risk of having no malware scanner, or approve a scanner provider.

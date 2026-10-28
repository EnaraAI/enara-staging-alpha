# Implementation Status

Updated after each sprint with what was actually built and tested.

| Sprint | Status | Tests |
|---|---|---|
| 1. Foundations | Done on `phase2-elie` (not deployed) | 115 backend tests pass (12 new in `elie.sprint1.test.ts`) |
| 2. Mastery | Done on `phase2-elie` (not deployed) | 129 backend tests pass (14 new in `elie.sprint2.test.ts`); browser smoke test |
| 3. Diagnostics | Done on `phase2-elie` (not deployed) | 142 backend tests pass (13 new in `elie.sprint3.test.ts`); browser smoke test |
| 4. Pedagogy & interventions | Done on `phase2-elie` (not deployed) | 150 backend tests pass (8 new in `elie.sprint4.test.ts`); browser smoke test |
| 5. Pathways & retention | Done on `phase2-elie` (not deployed) | 158 backend tests pass (8 new in `elie.sprint5.test.ts`); browser smoke test |
| 6. Curriculum & analytics | Done on `phase2-elie` (not deployed) | 169 backend tests pass (11 new in `elie.sprint6.test.ts`); browser smoke test |
| 7. Hardening & rollout | Done on `phase2-elie` (not deployed) | 178 backend tests pass (1 in `elie.e2e.test.ts`, 8 in `elie.sprint7.test.ts`); perf baseline; AI evaluation run; browser checks |

## Sprint 1 detail
- Feature flags per school (`Institution.features`), master + 7 sub-flags, default off; Enara-admin API.
- Learning objectives: model, CRUD, versioned history, approval in prerequisite order, archive (never delete), English/Arabic fields, cycle rejection, prerequisite traversal, ready-to-learn and weak-prerequisite functions.
- AI extraction of objective drafts with validation, untrusted-content handling, no overwrite of existing codes, cyclic links dropped.
- Questions can be tagged with objectives and difficulty (validated per school).
- Events: schema v2 validation, idempotency keys, objective links, processing status; spoofed "verified" browser/AI events rejected.
- Evidence model and indexes (processing in Sprint 2).
- Migration keying existing events; duplicates marked, not deleted.

## Not done in Sprint 1
- No objective editor UI yet (planned with the knowledge map in Sprint 2).
- S1 registration takeover remains open (see audit).

## Sprint 2 detail
- Evidence policy `evidence-v1` and processor: inline after submits and review answers, daily cron for the rest, idempotent, failures recorded and retried.
- Mastery model `mastery-v1`: heuristic estimate, separate evidence strength, status with a verification requirement, deterministic recompute, history per change.
- APIs: mastery, per-objective detail with evidence and history, knowledge map, recompute, evidence invalidation; question linking with past-answer application.
- Frontend: admin **Learning Objectives** page (create/edit with Arabic fields, approve, archive/restore, AI proposals, question linking); student **My progress** tab (shown only when the school has it on) with gaps, ready-to-learn, weak prerequisites and evidence.

## Known limitations after Sprint 2
- No teacher screens yet (backend scoping exists).
- Mastery uses answer-key grading only; short answers are exact-match, so text answers can be marked wrong when they're right.
- "Take a quick check" isn't offered yet: it needs diagnostics (Sprint 3).

## Sprint 3 detail
- Adaptive diagnostic `diag-v1`: sessions with resume, atomic answers, duplicate protection, school and time limits, explainable selection log, report with recommendations; answers become diagnostic evidence.
- Misconception rules `misc-rules-v1` (tagged distractors, prerequisite gap), automatic resolution by later evidence, teacher review with history.
- Frontend: "Take a quick check" (course-wide or for one objective plus its weak prerequisites) and the one-question-at-a-time diagnostic with results.

## Known limitations after Sprint 3
- No UI yet for tagging distractors (API only) or for teachers to review misconceptions (Sprint 5 teacher insights).
- AI classification of ambiguous answers is not implemented.

## Sprint 4 detail
- Strategy registry (11 strategies) and explainable selection `ped-v1`; decisions recorded with reasons and evidence.
- Tutor chat receives a minimal objective context and integrity rule when the session targets an objective; degrades to normal tutoring when off.
- Interventions with baseline, focused tutoring, completion that doesn't touch mastery, reassessment via a short diagnostic, and recorded outcome.
- Time to Understand `ttu-v1` episodes with active-time rules, verification by independent evidence, abandonment, and distributions API.
- Frontend: practice goes through interventions; "My plan" with practice, finish and check actions.

## Known limitations after Sprint 4
- Voice calls don't use the objective context yet.
- No teacher UI for assigning interventions or reviewing TTU (API only) until Sprint 5.

## Sprint 5 detail
- Objective-level retention `ret-v1` replayed from evidence; per-question reviews unchanged.
- Pathways and recommendations `path-v1` with three school modes and evidence-quoting explanations.
- Class insights API and page: heatmap, common gaps with bulk practice assignment (optional strategy and note), misconception confirm/dismiss, interventions, diagnostic completion, TTU summary, baseline-to-latest with a non-causal note.
- Student "Recommended for you" with real actions.

## Known limitations after Sprint 5
- Teachers use the admin layout (DECISIONS D10).
- Insights show the first 500 students of a class.

## Sprint 6 detail
- Text extraction `extract-v1` from uploaded PDFs and text files into page-tagged passages, with per-file jobs, honest statuses (including scanned PDFs without text), retries, and recovery from interrupted runs.
- Keyword retrieval `retrieval-v1` (English and Arabic), school- and curriculum-scoped, with lesson and objective boosts.
- Tutor chat cites passages it used (`meta.citations`); passages are wrapped as untrusted data.
- School analytics API with metric definitions; School Insights page (admins, Enara admins per school) with empty states and course-material processing status.
- See `CURRICULUM_INTELLIGENCE.md`.

## Known limitations after Sprint 6
- No OCR: scanned PDFs can't be used by the tutor.
- Arabic PDF text can have minor glyph-order errors.
- No semantic search (D11). Voice calls don't use retrieved passages yet.
- Citations shown in the text chat only; tutor history reloads don't show them yet.

## Sprint 7 detail
- End-to-end loop test (`elie.e2e.test.ts`) covering all 13 steps of spec §21 through real HTTP routes, with the AI provider mocked.
- Shadow mode (D13) and the shadow comparison report; shown on School Insights.
- Per-user rate limit for learning routes (D14).
- Bulk evidence processing runs students in parallel (49.1 s → 22.9 s for 10,000 events in the perf baseline).
- Migration validation and recovery tests; performance script (`backend/perf/elie.perf.ts`); AI evaluation set and runner (`backend/eval/`).
- `SECURITY_REVIEW.md`, `EVALUATION_RESULTS.md`, `ROLLOUT_PLAN.md`, `SYSTEM_ARCHITECTURE.md`.

## Acceptance criteria (spec §26)
Met unless marked. Evidence is in the sprint sections, `TEST_PLAN.md` and `SECURITY_REVIEW.md`.
- Architecture and security: all met **except** "no unresolved critical security issue": S1 predates Phase 2 but is unresolved and blocks a pilot.
- Objectives and events: met.
- Evidence and mastery: met (rebuild determinism tested in Sprint 7).
- Diagnostics and misconceptions: met.
- Pedagogy and interventions: met.
- Pathways, retention, curriculum: met (keyword retrieval, D11).
- Frontend and analytics: met for real data, permissions, empty/loading/error states and responsive layout. **Partial:** Arabic/RTL checked for content (extraction, retrieval, tutor replies) but not a full RTL layout pass of the new pages.
- Quality and rollout: tests run, performance recorded, migrations and recovery tested, flags and shadow mode work, deployment awaits approval. **Partial:** AI evaluation is documented honestly but the set is not yet reviewed by a teacher or an Arabic speaker.

## Remediation before a pilot
1. Fix S1 (owner approval).
2. Teacher and Egyptian Arabic review of the evaluation set; rerun three times.
3. RTL layout pass of Knowledge Map, Diagnostic, Class Insights, School Insights in Arabic.
4. Latency metrics and alerts for the cron and evidence processing.

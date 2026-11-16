# Architecture

**Simulation only.** This platform evaluates ENARA's tutoring with AI-simulated students. Its results are not evidence that real students learn.

```
benchmark/outcomes/*.json  (48 outcomes, frozen, hashed)
        │
 src/design/assignment.ts   seeded Latin-square crossed design (6 blocks / student, one outcome per area, one condition per block)
        │
 src/students/*             100-200 synthetic students: numeric state + seeded per-item behaviour flags + persona prompt
        │
 src/orchestrator/run.ts    per block:  pre-test → teaching (condition adapter) → post / transfer / delayed tests
        │                                   │
        │                      src/conditions/*   A,E real ENARA route (enaraRuntime)   B notes   C generic tutor   D scripted   F none
        │
 src/evaluation/*           deterministic key/rubric scoring (authoritative) + blind second judge on a seeded sample + leakage scan
 src/providers/guard.ts     every provider attempt → ledger; budget safe-stop; outgoing-request leakage scanner
 src/ledger/ledger.ts       append-only provider_attempts.jsonl (unknown cost stays null)
 src/analytics/*            7 reports + challenge tests A-G;  src/stats/stats.ts  hand-tested statistics
 runs/<experiment>/         manifest.json · raw/blocks.jsonl (immutable raw) · raw/audit.jsonl · raw/judge.jsonl · provider_attempts.jsonl · finished.json · reports/*.md
```

## Isolation from production

- The real ENARA tutor is reached only through `src/conditions/enaraRuntime.ts`. It boots the production Express app **in-process** against a throwaway `mongodb-memory-server` database, seeds one synthetic school/student/lesson per block (`*.invalid` emails), and posts to `POST /api/me/tutor/sessions/:id/messages`. The research DB is separate from any production data; no real school or student record is read.
- No production migration, schema, env var, billing, budget or school configuration is changed. The spend cap env used inside the throwaway app (`AI_TEST_SPEND_CAP_USD`) lives only in that in-memory DB.
- The only production source change is a **default-off, non-production** ablation switch (`researchAblated` in `backend/src/services/languageTeachingContext.ts`, read from `ENARA_RESEARCH_ABLATE`, ignored when `NODE_ENV=production`), used by condition E. Tests: `backend/test/researchAblation.test.ts`.
- The API key is read from a file path in `ENARA_KEY_FILE` and is never written to logs, raw data or reports.

## Provider guard

`Provider.chat` (student, generic tutor, judge) and `installFetchGuard` (the in-process ENARA app's own provider calls) both write one ledger row per attempt including failures and retries. Requests for tutor-side roles are scanned for assessment text before they leave the process; a hit aborts the call and counts as a leakage event.

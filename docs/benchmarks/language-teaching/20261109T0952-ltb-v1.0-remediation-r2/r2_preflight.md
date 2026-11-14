# r2 preflight (Phase 0)

Recorded 2026-11-09 09:52 UTC, before any r2 edit.

## Initial repository state (read-only inspection; no Git operation performed)

- Branch: `claude/codebase-review-kbxqan`. HEAD `fc6a487d287762a5f17ceadaf451f6c990347215`.
- Modified tracked files (from Phase 1/r1, uncommitted):
  - `avatar.controller.ts`, `curriculum.controller.ts`, `tutor.controller.ts`
  - `Curriculum.ts`, `TutorMessage.ts`
  - `demoTemplate.ts`, `directTutorModel.ts`, `learnerSnapshot.ts`, `learningContext.ts`
- Untracked: `backend/benchmarks/`, `backend/localdemo.tmp.ts`, `languageTeachingContext.ts`, two engine test files, the Phase 1 docs and `docs/benchmarks/language-teaching/`.

## Frozen artifacts: located and hash-verified

These were verified against `../20261109T0831-ltb-v1.0-remediation-r1/manifest.json`: **79/79 files match. None are missing or mismatched.**

| Group | Location | Files verified |
|---|---|---|
| Baseline (cases, rubric, scoring spec, raw outputs, judge outputs, reports, cost) | `../20261109T-ltb-v1.0/` | 29/29 |
| Runner, judge, scorer, case generator | `backend/benchmarks/ltc-v1/{run.ts, judge.ts, score.mjs, cases.mjs}` | 4/4 |
| r1 code under test (the starting point for r2) | `languageTeachingContext.ts`, `TutorMessage.ts`, two test files | 4/4 |
| r1 run (raw outputs, judge, reports, `implementation_report.md`, `remediation_plan.md`, `failure_analysis.md`, `comparison.json`, cost) | `../20261109T0831-ltb-v1.0-remediation-r1/` | 42/42 |

Full SHA-256 values for the frozen inputs:

| File | SHA-256 |
|---|---|
| `benchmark_cases.jsonl` (baseline = r1 copy, byte-identical) | `725edb2bcabeb316a388b702b2baba6dc35ed178c80f8de7727c9768c356a2bb` |
| `rubric_v1.json` (`ltb-rubric-v1`) | `963962bba8b427ea7e15afd5d2b7bc2ad90945fc16fcff6633813941546f0e5b` |
| `scoring_spec_v1.json` (`ltb-scoring-v1`) | `8fbf752bffd4fe9c1f51831b313e06f020e3d47dc57b62e446fd65dc38f82c05` |

The runner, judge and scorer hashes are listed in `manifest.json`.

**Dataset:** 120 cases, 219 learner turns, order `LTB-CA1-T01` … `LTB-AB1-T13`, identical to the baseline and r1.

## Route and isolation

- `run.ts` (unchanged) creates per-case synthetic schools, learners and courses in `mongodb-memory-server`.
- It calls the real Express app in-process through supertest: `POST /api/me/tutor/sessions/:id/messages`.
- It blocks every outbound host except `api.anthropic.com`, and scans every provider request for the synthetic identifiers.
- No staging, production or school database is involved.

Status: `CODE-VERIFIED`.

## Model configuration

| | Source | Value |
|---|---|---|
| Tutor model | `config/env.ts` default `anthropicTutorModel`; the runner deletes `ANTHROPIC_TUTOR_MODEL` and `ANTHROPIC_TUTOR_EFFORT` so defaults apply | `claude-opus-5-5` |
| Tutor effort / max tokens / retries | `env.ts` default `low`; `directTutorModel.ts` `max_tokens: 4000`, `maxAttempts: 2`, SDK `maxRetries: 0`, timeout 25 s | same as r1 |
| Judge | `judge.ts` (unchanged) | `claude-sonnet-5-5`, effort `medium`, max 6000, 1 retry, 1 re-ask |
| r1 telemetry | `provider_attempts.jsonl` / `judge_attempts.jsonl` | served 219/219 `claude-opus-5-5`; 133/133 `claude-sonnet-5-5` |

## Age and proficiency context (finding)

| Field | Exists? | Trusted? | Used by engine |
|---|---|---|---|
| `Institution.learningSettings.adultLearners` (school-level boolean, set by staff) | yes | yes, server-owned | yes → age band `adult` (known) |
| Student or user age, date of birth, or age band | **no** (`Student`, `User`, `Batch`, `CourseInstance` and `Curriculum` have none) | — | — |
| `Student.grade` (free-text school grade) | yes | server-owned, but it is not an age field. Mapping grade to age is an inference the r1 brief forbade, and grade systems vary | no; the controller has never passed it |
| `Curriculum.level` | yes | yes | proficiency (CEFR), labelled `inferred` |
| Client `context` in the request body | `courseId`, `lessonId`, `lessonTitle`, `curriculumSummary`, `subject` | client-supplied | no age field is read from it |

**Result:** the engine can tell only *adult* (from the school setting) from *unknown*. **The trusted child/teen distinction is unavailable**: see `r2_diagnosis.md` and the blocker in `implementation_report.md`.

## Credentials

- The repo's mechanism is the `ANTHROPIC_API_KEY` process environment variable, which the runner sets from `--key-file`. No key is configured in this container's environment.
- As in r1, the key you supplied in this session will be passed to the unchanged runner through an in-memory pipe (`/dev/fd`). No file is written and the key is never printed.

## Spend controls

- The runner sets `AI_TEST_SPEND_CAP_USD` and `AI_TEST_SPEND_ID=ltb-v1-local` **inside the throwaway process only**.
- Staging and production caps, `AI_TEST_SPEND_ID` and the school budgets are not touched.

## Phase 8: pre-benchmark gate (recorded 10:06 UTC, before any paid call)

| # | Gate | Result |
|---|---|---|
| 1 | Frozen inputs, rubric, scoring spec, runner, judge and scorer match the r1 manifest | PASS: baseline 29/29, tooling 4/4, r1 run 42/42 re-verified. The copies in this dir are byte-identical (`cmp`) |
| 2 | 120 cases, 219 turns, same order | PASS |
| 3 | No change to fixtures, expected outcomes, judge prompt or deterministic checks | PASS: `run.ts`, `judge.ts` and `score.mjs` are hash-identical; nothing in the dataset changed |
| 4 | A–C tests pass | PASS: `languageTeachingR2.test.ts` 33/33 |
| 5 | r1 preservation tests pass | PASS: `languageTeachingContext.test.ts` and `languageTeachingRemediation.test.ts` 81/81 (4 assertions updated to the r2 policy; see `implementation_report.md`) |
| 6 | No identifiers in provider payloads | PASS: route tests, plus the dry run's leak scan (0 in 219 requests) |
| 7 | Same tutor and judge configuration | PASS: dry run requested `claude-opus-5-5` × 219, `max_tokens` 4000, effort `low`. `judge.ts` is unchanged |
| 8 | Local, in-process, throwaway in-memory DB | PASS: 0 blocked outbound calls in the dry run |
| 9 | Metering active for every attempt | PASS: the unchanged runner fetch wrapper and judge meter |
| 10 | No global budget or control modified | PASS: only the throwaway process env; no staging or production config touched |

Dry run: the policy revision `ltc-v1-r2` was on 219/219 turns. **Age band reaching the engine: child cases → `unknown` (40/40), teen → `unknown` (40/40), adult → `adult` (40/40).**

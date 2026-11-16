# Implementation report: `ltc-v1-r1`

**Status:** `CODE-VERIFIED` and `TEST-VERIFIED` (local, SDK mocked); live provider run in `benchmark_comparison.md`. Not committed, not deployed, not staging-verified.

## Repository state (inspected before editing; Git untouched)

- Branch `claude/codebase-review-kbxqan`, HEAD `fc6a487`.
- The Phase 1 work was already uncommitted in the working tree: 9 modified tracked files and untracked engine, tests and docs. This task added to that working tree only.
- No commit, push, fetch, pull, branch switch, reset, stash, clean or rebase was made.

## Files changed by this task

| File | Change | Diff |
|---|---|---|
| `backend/src/services/languageTeachingContext.ts` | All four remediations (signals, move rules, length/register policy, prompt text, turn evidence) | `engine_r1.diff` |
| `backend/src/models/TutorMessage.ts` | 6 optional fields under `meta.languageTurn` (`policyRevision`, `pendingTask`, `learnerResponse`, `attemptsOnTask`, `offTopic`, `lengthTarget`). Optional, so no migration | `tutormessage_r1.diff` |
| `backend/test/languageTeachingContext.test.ts` | One test updated: it encoded the old answer policy (answer on request); it now asserts hint-first before an attempt and the answer after one | `old_test_r1.diff` |
| `backend/test/languageTeachingRemediation.test.ts` | New: 50 tests (R1–R4, baseline-trace replays, 2 route tests) | new file |

The pre-edit copies are in `baseline_code_snapshot/`.

**Not changed:**
- `tutor.controller.ts`, `directTutorModel.ts`, `learningContext.ts` (ped-v2), the gateway, metering, budgets, flags, routes, roles and auth;
- grading, assessment, analytics, voice and avatar;
- the benchmark runner, judge and scorer (`backend/benchmarks/ltc-v1/*`, hash-verified unchanged).

## Architecture

The remediation extends the existing engine in place. There is no second tutor and no new model call.

```
POST /api/me/tutor/sessions/:id/messages  (unchanged controller)
  buildLanguageTeachingContext(history = this session's last 12 stored messages)
    detectTurnSignals(message, history, lesson)
      taskInvitation(previous tutor reply)      question | instruction | sentence_frame | none
      offTopicKind(message, lesson)             unrelated | adjacent | social | none
      classifyLearnerResponse(...)              answer | answer_request | hint_request | dont_know | ...
      attemptsOnCurrentTask(history)            learner answers on the current task chain
    selectLanguageMoves(...)                    + restate_task, distinct_example, redirect_to_lesson
    lengthTarget(ageBand, CEFR step)            target / max words, basis
    renderLanguageContextPrompt(...)            same <language_teaching_context version="ltc-v1"> block
  reply.meta.languageTurn                       + policyRevision, pendingTask, learnerResponse, attemptsOnTask, offTopic, lengthTarget
```

### Pending-task state: why derived, not stored

The session's stored messages already hold everything needed (the tutor's last reply and the learner's messages). Deriving the state each turn:
- needs no migration or new collection;
- can't go stale across sessions, because a new session has an empty history;
- can't cross learners, because sessions are owner-checked;
- is deterministic under retries: the same history always gives the same state, so no feedback is duplicated.

The cost is pattern-based detection; see the risks below.

### Length and register policy (configurable table in code)

| Age band | Pre-A1 | A1 | A2 | B1 | B2 | C1/C2 | no level |
|---|---|---|---|---|---|---|---|
| Age unknown (all non-adult schools) | 50/75 | 55/80 | 70/100 | 90/130 | 110/160 | 130/190 | 70/100 |
| Adult (school's `adultLearners` setting) | 60/100 | 70/110 | 90/140 | 120/180 | 140/210 | 160/240 | 90/140 |

Values are target / maximum words. Also stated in the prompt:
- one step per reply;
- no tables or headings, at most one short list;
- if more is needed, give the first part and offer to continue (no mid-sentence truncation; nothing truncates server-side).

The register line differs by CEFR step (A1/A2/B1) and by age band ("adults: never childish"; "age not known: plain, friendly, respectful; no baby talk, no slang").

**Blocker (child/teen): `UNKNOWN`.** ENARA stores no date of birth and no approved age band. The only age signal is the school-level `adultLearners` flag. A student's grade exists, but the brief forbids inferring age from it, and the controller has never passed it to the engine. So children and teens can't be told apart. Both get the conservative age-unknown policy, which is the most that authorised data supports.

Smallest next step, if wanted:
1. Add an optional, coarse, school- or batch-level `learnerAgeBand` setting (child / teen / adult).
2. Get product and legal sign-off on its use.
3. The engine already takes an `ageBand` fact, so wiring it in is small.

## Security, privacy and compatibility

| Check | Result | Status |
|---|---|---|
| No identifiers, grade or DOB in the provider payload | Route test asserts the absence of name, student ID, email, school ID, "Grade 3" and "birth"; the live run's leak scan covers every request | `TEST-VERIFIED`, plus the live scan |
| Pending state can't cross sessions or learners | Route test: the same answer in a new session or from another student is not treated as an answer | `TEST-VERIFIED` |
| Non-language courses unchanged | The existing test (`non-language course: no language block`) passes | `TEST-VERIFIED` |
| Streaming route intact | `p20TutorStream` and the existing stream test pass | `TEST-VERIFIED` |
| Tenant isolation | `p14_9TenantIsolation`, `p19_1LeakGuard` and the existing cross-school test pass | `TEST-VERIFIED` |
| No new route, permission, persistence or migration | Diff review | `CODE-VERIFIED` |
| No logging of learner text | The engine logs only `language_context_failed` with a serialised error, as before | `CODE-VERIFIED` |

## Commands and exit codes

| Command (from `backend/`) | Pre-edit | Post-edit |
|---|---|---|
| `npx tsc --noEmit` | exit 0 (`pre_typecheck.log`) | exit 0 (`post_typecheck.log`) |
| `npx tsc --outDir <scratch>` (build) | — | exit 0 (`post_build.log`) |
| `npx vitest run` on 10 tutor-related files (pre), plus the new file (post) | 80/81 pass, exit 1 (`pre_tests.log`) | 130/131 pass, exit 1 (`post_tests.log`) |

The single failure on both sides is the same test, `elie.sprint4 › learning loop` (expects 'direct instruction' in a ped-v2 prompt). It **predates this change** and is unrelated to it.

The full repository suite was **`NOT RUN`**. Disk headroom is limited, and each test file starts its own in-memory MongoDB. The 11 files run cover the tutor route, streaming, fallback, leak guard, tenant isolation, adult learners, teaching features and the learning journey.

## Risks

- **Pattern-based detection.** It can misfire on phrasings it hasn't seen, in both English and Arabic. The tests include phrasings not in the benchmark.
- **Hint-first** may frustrate a learner who already understands. It releases the answer after one attempt.
- **Length targets** are prompt instructions. Compliance is measured, not enforced.
- **Disclosed tuning.** Two detection tweaks were informed by benchmark traces (see `remediation_plan.md`).

# Implementation report: `ltc-v1-r2`

**Status:**
- `CODE-VERIFIED` and `TEST-VERIFIED` (local, SDK mocked).
- Benchmark `LIVE-PROVIDER-VERIFIED` on the local in-process harness (see `benchmark_comparison.md`).
- Not committed, not deployed; staging `NOT RUN`.

## Files changed by r2

| File | Change | Evidence |
|---|---|---|
| `backend/src/services/languageTeachingContext.ts` | A, B, P1 and P2, plus age observability, and the version `ltc-v1-r2` | `engine_r2.diff` (373 lines) |
| `backend/src/models/TutorMessage.ts` | 4 optional fields under `meta.languageTurn`: `errorRecurrence`, `missingContext`, `ageBand`, `ageBandSource`. No migration: the fields are optional and absent on existing documents | `tutormessage_r2.diff` |
| `backend/test/languageTeachingContext.test.ts` | 2 assertions updated (r2 policy, B): a vague greeting with a known lesson starts the lesson; an unstructured lesson with "hi" no longer forces a goal question | `test_ltc_r2.diff` |
| `backend/test/languageTeachingRemediation.test.ts` | 2 tests updated:<ul><li>the r1 attempt-2 reveal test now asserts the r2 conditional policy, with no automatic reveal;</li><li>the 23-trace replay accepts `reteach_simpler` for repeated errors</li></ul> | `test_r1_r2.diff` |
| `backend/test/languageTeachingR2.test.ts` | New: 33 tests (A 10, B 9, C 4, P1/P2 2, preservation 4, route 4) | new file |

The pre-edit copies are in `pre_edit_code_snapshot/`.

**Unchanged** (hash-verified where frozen):
- `tutor.controller.ts`, `directTutorModel.ts`, `learningContext.ts`, the gateway, metering, budgets, flags, routes and permissions;
- `backend/benchmarks/ltc-v1/{run.ts, judge.ts, score.mjs, cases.mjs}`;
- all baseline and r1 artifacts.

## Age adaptation: blocker (Phase 4)

**Trusted path, proven:**

| Step | What happens |
|---|---|
| Source | `Institution.learningSettings.adultLearners`, set by school staff through the existing settings route |
| Controller | `tutor.controller` passes `institutionId` from the owner-checked session |
| Engine | `buildLanguageTeachingContext` reads `Institution` server-side, giving age band `adult` (known) or `unknown` |
| Effects | `lengthTarget` (adult / age-unknown) and the register line |
| Record | `meta.languageTurn.ageBand` and `ageBandSource` |

Proof:
- **Dry run:** the adult cohort reached the engine as `adult` 40/40; the child and teen cohorts reached it as `unknown` 40/40 each. The live run is reported in `benchmark_comparison.md`.
- **Route tests:** a client-supplied `context.ageBand`, `age` or `grade` is ignored.

**The blocker:**
- No student-, user-, class- or course-level age or age-band field exists.
- `Student.grade` is free text and not an age field.
- A child/teen distinction would need a new trusted field (schema), a decision on who sets it (permission), and product and legal sign-off.
- The brief requires stopping in that case, so **child and teen adaptation is NOT implemented**. Both get the conservative age-unknown policy unchanged from r1. Word targets are not raised.

**Smallest next step (needs your authorisation):**
1. Add an optional, coarse, staff-set `learnerAgeBand` (child / teen / adult) at school or class level.
2. Have the engine read it the same way it reads `adultLearners`.
3. Add band-specific register and length rows.

## Commands and results

| Command (from `backend/`) | Pre-edit | Post-edit |
|---|---|---|
| `npx tsc --noEmit` | exit 0 (`pre_typecheck.log`) | exit 0 (`post_typecheck.log`) |
| Build: `npx tsc --outDir <scratch>` | — | exit 0 (`post_build.log`) |
| `npx vitest run` on 11 files (pre) / 12 files (post, + `languageTeachingR2.test.ts`) | 123 passed, 8 skipped. Suite `elie.sprint4` failed: `beforeAll` MongoDB start-up **hook timeout** (environmental; `pre_tests.log`) | **163 passed, 1 failed** (`post_tests.log`) |
| Lint / format | `NOT RUN`: the backend has no lint or format script or config | `NOT RUN` |
| Full repository test suite | `NOT RUN` (disk and time; per-file in-memory MongoDB) | `NOT RUN` |

The one post-edit failure is `elie.sprint4 › learning loop` (`expected '…' to contain 'direct instruction'`). It is the same assertion that failed **before r1 and before r2**: the r1 `pre_tests.log` and this run's suite-level failure both show it. It belongs to the ped-v2 prompt, which r2 doesn't touch.

## Known limitations

- Recurrence detection is text-heuristic. When the feedback doesn't emphasise the error, it returns `unknown`, and the prompt then states the conditional policy. An unusual feedback style could mark a correct answer as `repeated`. The strategy-shift text tells the tutor to confirm a correct answer, which softens this.
- Goal extraction uses a small stop-word list (English only), so Arabic goal statements fall back to `goalAsked` / ambiguous handling.
- The clarification state is derived from history (the last 12 messages, as in r1).

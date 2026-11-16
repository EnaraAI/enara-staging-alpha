# r3 implementation report: `ltc-v1-r3`

**Status:**
- `CODE-VERIFIED` and `TEST-VERIFIED` (local, SDK mocked).
- Official benchmark and stability study: `LIVE-PROVIDER-VERIFIED` on the local in-process harness.
- Child/teen age adaptation: **`BLOCKED`**.
- Staging `NOT RUN`. Not committed or deployed.

## Starting state (Phase 0)

- Branch `claude/codebase-review-kbxqan`, HEAD `fc6a487d287762a5f17ceadaf451f6c990347215`, 20 uncommitted paths (Phase 1, r1, r2). No Git operation was performed.
- Baseline, r1 and r2 artifacts were verified against the r2 manifest: **124/124 files match** (baseline 29, r1 42, tooling 4, r2 code 5, r2 run 44).
- `benchmark_cases.jsonl` SHA-256 `725edb2bcabeb316a388b702b2baba6dc35ed178c80f8de7727c9768c356a2bb`.
- The reported r2 facts match the artifacts:
  - 76/44/0 outcomes;
  - dimension means 2.88 / 3.07 / 2.92 / 2.73 / 2.88 / 2.88 / 3.03;
  - costs $2.7754 + $1.7158.

## Files changed by r3

| File | Change | Diff |
|---|---|---|
| `backend/src/services/languageTeachingContext.ts` | Age contract (`resolveTrustedAgeBand`, `AgeBand`, a band × CEFR policy table, `AGE_REGISTER`), T04/T08/T12 signals and moves, revised r2 wording, version `ltc-v1-r3` | `code_diffs/engine_r3.diff` |
| `backend/test/languageTeachingContext.test.ts` | 1 assertion: learner-line wording ("Learner age band: adult [known; source …]") | `code_diffs/languageTeachingContext_test_r3.diff` |
| `backend/test/languageTeachingRemediation.test.ts` | 1 assertion: "keep what is correct" is now lowercase (after the triage sentence) | `code_diffs/languageTeachingRemediation_test_r3.diff` |
| `backend/test/languageTeachingR2.test.ts` | 3 assertions: source `not_collected` became `no_trusted_learner_age_source`; the revised P2 wording | `code_diffs/languageTeachingR2_test_r3.diff` |
| `backend/test/languageTeachingR3.test.ts` | New: 38 tests | new file |

`TutorMessage.ts` is unchanged in r3.

The code exactly as it was run is hashed in `code_under_test.sha256`. The runner, judge and scorer are unchanged (hashes match the r1 and r2 manifests). Historical versions: `ltc-v1-r1` and `ltc-v1-r2` code is preserved in the r2 and r3 `pre_edit_code_snapshot/` folders; the live engine file carries `ltc-v1-r3`.

## Age provenance (P0)

See `r3_age_provenance_report.md`.

- **Implemented:**
  - one resolver, `resolveTrustedAgeBand(institution.learningSettings)`, which is the only way a band reaches the engine. It reads the session owner's institution server-side, tenant-scoped.
  - `adultLearners === true` gives `adult`, under the documented policy in `models/Institution.ts`: "every student is taught as an adult … whatever the grade".
  - A missing or false setting gives `unknown`, with source `no_trusted_learner_age_source`. A non-boolean setting gives `unknown`, with source `invalid_school_setting`.
  - `Student.grade` is no longer read for age (the r1/r2 path `grade → 'school'` was removed; it was never wired at runtime).
- **Blocked:**
  - child and teen. No trusted learner-level age source exists: no DOB, age or age band on `Student`, `User`, `Batch`, `CourseInstance` or `Curriculum`.
  - Two candidates were rejected:
    - `Student.grade` with ENARA's existing grade policy (ped-v2 `gradeLevel`, where ≤ 8 means younger-learner methods, and `teachingImpact` bands K-5 / 6-8 / 9-12): the r3 brief forbids inferring an age band from grade.
    - A new staff-set band: that needs a product, consent and permission decision, which this brief doesn't authorise.
- **Ready but inactive:**
  - band-specific policy for child and teen (`LENGTH`, `AGE_REGISTER`). It is reachable only through the resolver, which can't yet produce those bands.
  - The age × CEFR matrix is test-verified at engine level with injected resolver outputs (**`MOCK-ONLY`** for child and teen).

## Regression policy (P0)

| Area | Change | Basis |
|---|---|---|
| T04 minor error | Triage at the start of `corrective_feedback_retry`: "First decide whether it is essentially correct: if the only issues are small surface slips … or they already corrected themselves, confirm, mention the slip in a few words at most, move on, no reteaching and no retry". Plus a `selfCorrected` signal ("sorry", "I mean" or `*word` in the message) | The r2 T04 traces: the tutor critiqued the absence of a frequency word and re-explained after a self-correction (judge: major `ignored_learner_reply`) |
| r2 "one error" wording | "deal only with the most important one now" became "focus on the one that matters most for meaning and for this lesson's target, and mention small slips briefly or not at all" | The r2 wording could rank a non-target omission (the missing frequency word) as "most important" |
| T08 move-on | `confirmsCorrect()` checks the opening sentence for praise, with no error or "but" talk in the first 250 characters. A streak of confirmed answers adds `after_confirmed_success`: "if this one is also correct, say so briefly (no mastery or percentage claims) … move on to a harder or freer transfer task … if it has an error, one targeted check" | The r1 and r2 T08 traces: the tutor repeated same-type items after correct answers |
| T12 contradictory evidence | An `unpromptedSentence` signal: a first message in a lesson that isn't a request, greeting or question and has ≥ 3 words is evaluated as an attempt (`corrective_feedback_retry` with `unprompted_learner_sentence`). With a proficient or mastered record, `record_vs_current_check` adds: "don't assume either the record or the slip is the truth; point to the part to check, ask them to fix it themselves; no corrected sentence, no mastery claims". Lecture and fading moves are suppressed for that turn | The r2 T12 traces: the engine stacked `activate_prior_knowledge`, `short_explanation`, `fade_support` and `independent_practice`, and the tutor gave the corrected sentence (judge: major over_helping) |

**Replay of the stored r1 and r2 traces through r3** (deterministic, no provider):
- `unpromptedSentence` fires only on T12, 9/9;
- `selfCorrected` fires only on the three self-correcting T04 cases;
- `after_confirmed_success` fires on T08 (6/9 r2, 7/9 r1) and on T07 after genuine confirmations, with 0 false confirmations after an initial false-positive pattern ("Good start … is correct. But …") was fixed;
- the baseline replay still gives `expected_move_any` 111/111.

## Tests and builds

| Command (from `backend/`) | Result | Log |
|---|---|---|
| `npx tsc --noEmit` (pre / post) | exit 0 / exit 0 | `logs/pre_typecheck.log`, `logs/post_typecheck.log` |
| `npx tsc --outDir <scratch>` (build) | exit 0 | `logs/post_build.log` |
| Focused `vitest`, 12 files pre-edit | 156 passed, 8 skipped. Suite `elie.sprint4` failed at the `beforeAll` MongoDB hook timeout (environmental) | `logs/pre_tests.log` |
| Focused `vitest`, 13 files post-edit (+ `languageTeachingR3.test.ts`) | **201 passed, 1 failed** | `logs/post_tests_focused.log` |
| Full backend suite, `npx vitest run --maxWorkers=2` (100 files) | see `logs/post_full_backend_suite.log` and the README | |
| Lint / format | `NOT RUN`: no lint or format configuration in the backend | |
| Frontend suites | `NOT RUN`: no frontend file changed | |

The 1 focused failure is `elie.sprint4 › learning loop` (expects 'direct instruction' in the ped-v2 prompt). It has been failing since before r1 and is unrelated.

## Known limitations

- Signals are text heuristics.
  - `confirmsCorrect` misses unusual confirmation styles, in which case the turn falls back to normal feedback.
  - `unpromptedSentence` uses a meta-word list (English only).
- `ageBandStatus` is returned in the reply's evidence but **not persisted**: the `TutorMessage` schema has no such field. The persisted `ageBand` and `ageBandSource` carry the same information.
- `confirmedSuccessStreak` is declared on the evidence interface but not written. It was found after the paid runs started, and the code was not changed mid-run.

# r2 diagnosis (Phase 1): trace-based, written before any code change

Sources:
- r1 traces: `../20261109T0831-ltb-v1.0-remediation-r1/raw_results.jsonl`, where each turn includes `meta.languageTurn`;
- judge outputs: `judge_results.jsonl`;
- engine: `backend/src/services/languageTeachingContext.ts` at the r1 hash.

## A. T06 repeated misconception (r1: 0/9 meets; pedagogy 2.00; scaffolding 1.89)

**Engine state in all 9 cases** (turns 2 and 3):
- turn 2: `learnerResponse=answer`, `attemptsOnTask=0`, moves `[corrective_feedback_retry, comprehensible_model]`;
- turn 3: `answer`, `attemptsOnTask=1`, the same moves, plus the r1 reason `attempt_2_plus_show_model_if_still_wrong`.

**Code path:** `selectLanguageMoves` adds `attempt_2_plus_show_model_if_still_wrong` when the answer number is ≥ 2. `moveText` then appends "if it is still wrong, show the correct form…".

**Defects:**
1. The engine has **no concept of the same error recurring**. Attempt count alone can't tell a repeated misconception from a new error, a partial fix or a correct answer.
2. The r1 rule reveals the target form on the 2nd attempt. In 9/9 traces the tutor gave the corrected sentence (judge: over_helping in 9/9, 2 major). It also mostly repeated the same rule (under_scaffolding, 1 major).
3. `comprehensible_model` ("show a model sentence") runs alongside feedback. In feedback turns the most natural model sentence is the learner's own sentence, corrected. See R-P1 below.

**Example: LTB-TA2-T06, turn 3.**
- Learner: "My mother get up before me."
- The previous tutor reply flagged **"get"** ("One part needs a fix: **"get"**").
- The same token recurs, so the error is recognisable as repeated from the stored text alone.

## B. T10 missing context (r1: 0/9 meets; the clarifying-question check passed 9/9)

**Engine state:** CA1, CA2, TA1, TA2, AA1 and AA2 (A1/A2) got `[clarify_goal, short_explanation, comprehensible_model, comprehension_check]`. The B1 cases got `[clarify_goal]`.

**Code path:**
- `clarify_goal` fires because there is no lesson. The novice rules still add `short_explanation`, `comprehensible_model` and `comprehension_check`.
- The block says only "No current lesson is known: ask what they want to practise."
- The course outline, which the base tutor prompt builds from the curriculum, lists the fixture chapter "General practice".

**What the judge penalised:**
- a default task or model sentence added after the question (lesson_drift: CA1, TA1, AA1);
- long option menus with grammar examples (verbosity: CA2, TA2, AA2, AB1);
- the placeholder chapter presented as the learner's lesson (context_invention: CB1 major, AB1 major, TB1 minor);
- age-unsuitable example personas (CA1, TA1).

**Defects:**
- clarification is not targeted: the engine doesn't name which field is missing;
- teaching moves are stacked on a clarification turn;
- nothing tells the tutor that no lesson is selected even though the outline lists chapters;
- there is no state for "goal already asked" or "goal answered", so a multi-turn session could re-ask or ignore the answer.

**Fixture artefact:** the "General practice" chapter comes from the frozen runner and stays unchanged.

## C. Age adaptation

**Path:**
1. `tutor.controller.prepareTutorTurn` calls `buildLanguageTeachingContext({institutionId, curriculumId, lessonId, message, history, hintsOnly, masteryStatus})`. **No grade or age is passed.**
2. The engine reads `Institution.learningSettings.adultLearners`, giving age band `adult` (known) or unknown.
3. The age band sets `lengthTarget` (`adult` or `age_unknown`) and the register line.

**Trusted sources:** none at learner level. There is no DOB, age or age-band field on `Student`, `User`, `Batch`, `CourseInstance` or `Curriculum`. `Student.grade` is free text and not an age field.

**The benchmark fixtures:**
- child and teen learners get grade "Grade 3" or "Grade 9" and a school with `adultLearners=false`, so both reach the engine as **unknown**;
- adults get `adultLearners=true`, which reaches the engine as **adult** (known).

**Conclusion: BLOCKER.** A distinct child or teen adaptation can't be driven from trusted data without a new field. That would mean a schema change plus permission and product decisions, which this task doesn't authorise. Phase 4 is reduced to:
- verifying the adult/unknown path;
- proving that the band value reaching the engine is observable;
- proving that client-supplied age is ignored;
- keeping the cross-axis behaviour (age × CEFR) for the bands that exist.

**Current unknown-band policy:** conservative length targets with a neutral register ("plain, friendly, respectful … suits a school-age learner or an adult; no baby talk"). It doesn't claim the learner is a child. The word targets stay as they were in r1.

## D. The 55 r1 partial cases

| Tag (in partial cases) | Count | Where | Assessment |
|---|---|---|---|
| over_helping | 22 | T06 9, T03 3, T07 3, T04 2, T08 2, T13 2, T12 1 | **Engine/prompt defect.** Two parts. (i) The r1 attempt-2 reveal rule, fixed under A. (ii) In first-attempt feedback (T03, T07, T12), `comprehensible_model` asks for "a model sentence" in the same turn as `corrective_feedback_retry`, and the tutor uses the learner's corrected sentence as the model. **Fix R-P1:** while giving feedback, any model sentence must use a different example, never the corrected version of the learner's answer |
| under_scaffolding | 18 | T06, T08, T07 | T06 is covered by A. T08 (no escalation after success) needs answer-correctness evidence that the engine doesn't have, so **no change** |
| lesson_drift | 17 | T04 4, T10 4, T08 3, T13 2, T07 2 | T10 is covered by B. The rest are mostly the tutor's own exercise differing from the case's hidden exercise. The lesson spec has no exercise items, so this is a benchmark or curriculum-content limitation, not an engine defect. **No change** |
| verbosity | 15 | T10 5, T03 3, others 1 each | T10 is covered by B. T03 ("lists several errors at once for a young learner": CA1, CA2, CB1) is a prompt-policy gap: the feedback instruction says "say specifically what is right and what is wrong", with no priority. **Fix R-P2:** with several errors, address the most important one this turn |
| ignored_learner_reply | 11 | T04, T08 | Mostly the swapped-exercise effect (lesson_drift above). **No change** |
| level_mismatch / age_tone_mismatch | 10 / 7 | child cells | These need the child band, which is the blocker in C. **No change** |

Two optional fixes are selected (R-P1, R-P2), both in the feedback policy. Neither is case-specific.

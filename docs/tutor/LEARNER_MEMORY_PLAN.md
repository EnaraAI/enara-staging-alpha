# Learner memory and assessment errors: plan only (20 Nov 2026)

Status: **plan, waiting for Mohamed's "go"**. Checked against `lms-test-live` at `924b5ff0`, which includes PR #33.

## 1. What already exists

| Layer | What exists | What's missing |
|---|---|---|
| a) Profile | `Student`: `learnerAgeBand`, `birthDate` (one rule since PR #33), `learningGoal*`, `uiMode` (Kids), `grade`. Speaking exams have a per-attempt "typed instead of voice" accommodation. The engine assumes Arabic as the first language. | First language, interests and school-entered accommodations. The `adaptiveProfile` / `learningEngineProfile` fields on `Student` are old free-text blocks and shouldn't be used. |
| b) Learning state | `StudentObjectiveMastery` (mastery per objective, from evidence) and `LearningEvidence` (with `itemKey` and `priorExposures`). `LearnerLanguageProfile`: error codes incl. `l1_transfer`, mistaken ideas, `rulesIntroduced` (taught), `knownPoints`. `ObjectiveRetentionState` and `ReviewItem` (spaced review of wrong quiz questions). `StudentMisconception` (suspected, teacher confirms). | One "errors to work on" list. Cross-session "never repeat an answered item" for tutor items; today it holds only within a session (planner2d). |
| c) Session memory | `TutorSession` (title, lesson, `handoff`) and `TutorMessage` (plan, shape, stage per reply). | No session summary. The next session does not open from where the last one stopped. |
| d) What works | `LearnerLanguageProfile.worked` (explanation styles before an independent success). `PedagogicalDecision` and `TeachingEpisode` (observational: method, evidence before and after). | One per-learner view of "helped / didn't help" per method. The planner doesn't read it (intended "later"). |
| e) Study habits | Raw timestamps only: `LearningEvent`, `TutorSession.lastMessageAt`, `SignInEvent`. `Student.streak` and `studyTime` are display fields. | No habits record: when, how long, drop-offs, returns. |
| Assessment errors | `AssessmentAttempt` stores each question with `isCorrect`, feedback and `needsReview`. Questions link to `objectiveIds`; objectives have `prerequisiteObjectiveIds`. Wrong quiz questions go to `ReviewItem`. `assignmentTutorPolicy` blocks the tutor, or allows hints only, while an assignment is open. `tutorHandoff` passes released work only. | Wrong items don't become "errors to work on" with an error type. There's no release gate (closed / no attempts left / teacher released) for using them. The tutor doesn't open from them. Teachers have no list. **Moodle sends no per-item results:** today Moodle only receives ENARA scores, and Moodle's own quizzes never come back. |

## 2. Recommended design

**One learner memory = one service over typed stores**, not one big document. A new `learnerMemory` service reads the layers and builds a **short brief for the model each turn**: 8 lines at most, codes turned into plain words, no learner text. It reuses what exists and adds four small collections. Everything is written by code from graded evidence. Nothing is free text written by the model.

| Layer | Store | Written by |
|---|---|---|
| a) Profile | `Student` (existing) + new `LearnerProfile`: `firstLanguage` (school-entered code), `interests` (up to 5 from a fixed list, chosen by learner or parent), `accommodations` (fixed codes, school-entered only: extra time, typed instead of voice, read aloud, fewer items) | School / parent screens |
| b) Learning state | Existing mastery, evidence, language profile and retention stores + new **`ErrorToWorkOn`** + a cross-session answered-items index (from `LearningEvidence.itemKey` and the tutor's lesson-item ids) | Grading and tutor turns (code) |
| c) Session memory | New **`SessionSummary`**, built by code when a session goes idle: objectives, stage reached, items right/wrong, stuck on (objective + error code), where it stopped, next step. One templated line is made from these fields; the model doesn't write it. | Code, from stored turns |
| d) What works | Derived view (no new writes): per method, sessions where independent success followed vs not, with evidence ids. From `TeachingEpisode` + `LearnerLanguageProfile.worked`. The planner does not use it yet. | Nightly recompute |
| e) Study habits | New **`StudyHabitDaily`** rollup: sessions, minutes, time-of-day bucket, days since the last session, return after a gap. Like the parents usage rollup. | Nightly job |

**`ErrorToWorkOn`** fields: learner, school, subject/course, objective, error code, sources (ENARA assessment / tutor, with attempt and question ids), first and last seen, number of times seen, status (open / resolved / reopened, with history), right-in-a-row count, `eligibleFrom`.

## 3. Assessment errors to tutor

1. **Record.** When an attempt is finally graded, each wrong item writes or updates an `ErrorToWorkOn`: its objective and an error code. The code comes from the item's misconception rule, the code diagnosis or the grader's "improve" code; otherwise `unknown`. No question text or answer is copied.
2. **Gate (`eligibleFrom`).** An error is used only when all of these hold:
   - the assessment is closed: no attempts left, or past its close date;
   - results are released: auto release, or the teacher released them (`releasePolicy: manual`);
   - no item is still waiting for teacher review (`needsReview`).
   Until then the tutor never sees it. `assignmentTutorPolicy` still blocks or limits the tutor while an assessment is open.
3. **Open the next session.** The brief lists 2–3 errors; the planner's review opener (S1) uses them:
   - the rule comes from the rule bank (for English);
   - practice uses **new items on the same objective**;
   - the exam's own items and their sentences are excluded by the existing assessment-item guard pool.
4. **Leave and return.**
   - An error is resolved after **two independent rights in a row, in later sessions**. Independent means first try, a new item, answer not shown (amendment H).
   - Any wrong answer on it reopens it.
5. **Priority:** recurring (seen 2+ times) first, then prerequisites (`prerequisiteObjectiveIds`), then the most recent. At most 3 per session (2 for children).
6. **Teachers** see each learner's list on the teacher dashboard: objective, error in plain words, source, since when, status. Teachers can dismiss an item. **Parents** see the same list in plain words.
7. **Moodle.** Errors from ENARA activities launched from Moodle work at once, because they are ENARA attempts. Errors from **Moodle's own quizzes** need a new import of per-question results from Moodle. That's an LMS-track project, proposed for later.

## 4. Rules for all memory

- **Evidence only.** Written by code from graded evidence or school/parent input. The model reads the brief; it never writes memory. The existing validated assessment marker is the only model-derived input, as today.
- **Privacy (PDPL, minors):**
  - only what serves learning;
  - no free-text fields at all;
  - no health, family or personal disclosures;
  - interests come from a fixed list;
  - accommodations are codes, and the model gets only their effect (for example "allow typed answers"), never the reason.
- **Visible** to the school (teachers, admins) and the learner's parents.
- **Deleted with the learner:** the new collections are added to `studentErasure` `DELETE_BY_STUDENT_ID`, and archive behaves like the other learner data.
- **Retention:** session summaries and habit rollups are kept 13 months, as parent usage is.

## 5. Phases (each behind its own switch, off by default, with tests and the E2E suite on its PR)

1. **Errors to work on:** ENARA assessments, gate, opener with new items, resolve and reopen, teacher list. Tutor + LMS files (grading hook, teacher dashboard), coordinated with the LMS track.
2. **Session summaries + cross-session no-repeat items + the per-turn brief.**
3. **Profile extras** (first language, interests, accommodations) **+ study habits rollup.** Needs school and parent screens.
4. **"What works" view** (data only), for the planner later.

Later and separate: import of per-question results from Moodle's own quizzes (LMS track).

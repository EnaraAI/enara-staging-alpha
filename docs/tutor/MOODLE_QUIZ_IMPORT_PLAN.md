# Errors to work on from Moodle's own quizzes: plan v2 (waiting for Mohamed)

Status: **plan only**. v1 had a wrong assumption, corrected here.

## Correction to v1
- **No token today.** v1 said "use the connection's existing web-service token". There is none.
  - Schools connect to ENARA through LTI 1.3. Its service tokens can only send grades and read rosters; they cannot read quiz attempts.
  - The only Moodle web-service token in the code is a test-only one for lms-test checks.
- **No question tags either.** Moodle's standard web services return a quiz question's right/wrong state, but not its tags. So the v1 option "tag questions with ENARA objective codes" cannot be read.

## What it needs instead
1. **A read-only Moodle token per school.**
   - The school's Moodle admin creates a web service in Moodle with only 3 read functions:
     - `mod_quiz_get_quizzes_by_courses`
     - `mod_quiz_get_user_attempts`
     - `mod_quiz_get_attempt_review`
   - The school admin pastes the token into ENARA's LMS settings screen. It is never sent in chat or email.
   - ENARA stores it encrypted with the existing LMS key (`LMS_KEK`, AES-256-GCM, bound to the connection), and never shows or logs it again.
   - A "test connection" button calls one read function.
2. **Mapping in ENARA.** In an ENARA screen, the teacher picks the objective for each Moodle quiz once. Optionally, they can set it per question slot.
3. **Gate**, as for ENARA assignments:
   - the quiz is closed, or the learner has no attempts left;
   - review after close is allowed;
   - the attempt is finished.
4. **Write** `ErrorToWorkOn` rows with source `moodle_quiz_attempt`.
   - Moodle gives right/wrong per question, not the error type, so the error code is `moodle_wrong`. The tutor knows the objective, not the exact mistake, so its practice is less targeted than for ENARA items.
   - Ids only: no question or answer text is stored.
   - Learners are matched through the existing LTI user links.
5. **Run** in the nightly LMS job, with a budget like the roster sync. It runs only for schools that saved a token and switched it on.
6. **E2E:** the Docker Moodle creates the read-only service and token in setup, plus a quiz with one wrong answer; the scenario checks the error row and the tutor brief.

## Size and owner
- About 3–4 days.
- The code sits in `integrations/lms`, which the LMS track owns. Two ways to do it:
  - **(a)** The LMS track builds it.
  - **(b)** I build it on a `claude/tutor-lms-*` branch, keeping my code in new files plus one settings route, and the LMS track reviews it.

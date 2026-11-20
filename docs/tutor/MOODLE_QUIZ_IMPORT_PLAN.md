# Errors to work on from Moodle's own quizzes: plan (LMS track)

Status: **plan only**. It needs the LMS track: it is Moodle integration code, and the tutor track does not change `integrations/lms`.

## Today
- "Errors to work on" reads ENARA attempts only: assignments and practice. That includes ENARA activities launched from Moodle.
- Moodle's own quizzes are invisible: ENARA only *sends* grades to Moodle (LTI AGS), it never reads Moodle quiz results.

## What is needed
1. **Read per-question results** from Moodle with the connection's existing web-service token, after the quiz is closed for the learner:
   - `mod_quiz_get_user_attempts`: the learner's finished attempts;
   - `mod_quiz_get_attempt_review`: per question, right/wrong and the chosen answer, only when review options allow it after close.
2. **Map to ENARA objectives.** A Moodle question has no ENARA objective. Two options:
   - (a) the teacher tags the Moodle question category with an objective code once, in an ENARA mapping screen;
   - (b) Moodle question tags carry the ENARA objective code (`enara:EN-F-A2-GR-some-any`).
   
   We recommend (b) with (a) as fallback.
3. **Gate** as for ENARA assignments:
   - the quiz is closed, or the learner has no attempts left;
   - review is allowed;
   - the attempt is finished.
4. **Write** `ErrorToWorkOn` rows with a new source kind `moodle_quiz_attempt`. Same priority, resolve and reopen rules. Ids only, no question text.
5. **Run** in the existing nightly LMS job (budgeted like the roster sync), only for connections where the school switched it on.

## Privacy
- Fetched results are not stored beyond the error rows (ids, codes, dates).
- Deleted with the learner, like the other memory data.

## Size and owner
About 2–3 days for the LMS track, plus an E2E scenario with Moodle's own quiz in the Docker stack. Waiting for Mohamed's go and the LMS track's slot.

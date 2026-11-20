# Errors to work on from Moodle quizzes: setup for a school

Switch: `ENARA_ENGINE_V2` must contain `moodleQuiz` and `workOn`. It is on for lms-test only. Each school still has to do the steps below.

## In Moodle (the school's Moodle admin)
1. **Site administration → Advanced features:** turn on *Enable web services*.
2. **Server → Web services → Manage protocols:** turn on *REST*.
3. **Server → Web services → External services:** add a service, for example "ENARA quiz results (read-only)". Tick *Enabled*.
   - Add exactly these 3 functions:
     - `mod_quiz_get_quizzes_by_courses`
     - `mod_quiz_get_user_attempts`
     - `mod_quiz_get_attempt_review`
4. **Manage tokens:** create a token for this service for a user who can see every learner's quiz results in the linked courses, for example a manager.
5. **Each quiz:** under *Review options*, allow *Whether correct* "After the quiz is closed". If the quiz has an attempt limit, also allow it "Later, while the quiz is still open". Without this, nothing is imported.

## In ENARA (the school admin)
1. **LMS connections:** open the Moodle connection and go to *Errors to work on from Moodle quizzes*.
2. Paste the token and press *Save token*. ENARA checks it once.
   - The token is stored encrypted and never shown again.
   - Never send it by chat or email.
3. Press *Quizzes and objectives* and choose an ENARA objective for each quiz to use. Leave the others on "Not used".
4. Tick *Import every night*. *Import now* runs it at once.

## What happens
- Each night, for every mapped quiz and every learner linked through the LMS, ENARA reads finished attempts. It does this only when:
  - the quiz is over for that learner (closed, or no attempts left);
  - the learner may see right/wrong;
  - no attempt is in progress.
- Each wrong, partly right or skipped question becomes an error to work on for its objective, with the code `moodle_wrong`. Right answers count toward resolving an error.
- Each attempt is read once. Only ids are kept: no question text, answers or names.
- Removing the token stops the import and switches it off.

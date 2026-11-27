# ENARA live tutor: every capability

*27 Nov 2026. Read from the code and the lms-test switches (`lms-test-live` branch). The same code runs on design.enara.app.
test.enara.app is frozen and was not checked. Nothing here was confirmed with a real call (calls are paid).*

## 1. Who and where
- Teens and adults: the "Live tutor" screen and the "Talk" button on a course.
- Kids: inside the kids app, with the microphone and the avatar (switch `kidsSpeaking` on).
- From Moodle as an LMS activity (no grade). If Moodle blocks the microphone, "Open in a new tab".
- Staff can preview it.

## 2. The brain
- Tutor model on lms-test: **DeepSeek V4.1 Flash** (stand-in until the new Anthropic key), with a backup model if the main one fails.
- The call uses the **same teaching engine as the text chat**, so sections 3–5 apply to calls too.
- Knows the learner's course outline and lesson. Answers from course material only; if the material doesn't cover it, it says so instead of guessing.
- Checks for attempts to trick it into breaking its rules.
- Knows each learner's level, first language, interests, accommodations, age band and past mistakes.

## 3. How it teaches (language lessons)
- One task per reply.
- Lessons follow a set plan of stages; the method is chosen from the learner's level and evidence.
- The rule in one plain line the first time a point comes up (for beginners, before their first try).
- After a wrong answer it restates the rule. The answer is given only after real failed tries, with a reason and a right/wrong example. Never up front.
- The same mistake twice changes the method: contrast → smaller steps → worked example.
- Spelling mistakes: the right spelling, split to show the pattern on another word.
- Common Arabic-to-English word swaps ("my woman" for "my wife") are named and corrected.
- Repeated hints change form; a stuck learner gets a plain explanation.
- After 3 replies, two replies become a short real conversation (children: fixed safe topics; others: their interests). Errors are corrected inside the talk, then back to the lesson.
- Near the end: the learner writes one sentence of their own; then a recap and the rule in their own words.

## 4. Memory between sessions
- Opens with a summary of the last session.
- Mistakes from released tests and from Moodle quizzes become "errors to work on".
- They come back after 1, 3, 7 and 21 days, mixed with other points so the learner must choose the right rule. An easy right answer skips a step.
- An error closes only after a right answer, without help, at least 2 days after the last wrong one.
- A learner back after 7+ days gets a short review first.
- Teachers see which methods worked for each learner.

## 5. Children
- Under 9: at most 3 short sentences (12 words or fewer each) and one task; the rule in 10 words or fewer.
- Ages 9–12: shorter replies. Praise is for effort, never for ability.
- Under 9: the tutor can offer 2–4 tap-able pictures, read aloud, from ENARA's own 495 drawings.

## 6. Speaking and listening
- English and Arabic, chosen at the start or taken from the last call. It switches mid-call when the learner switches language.
- Set up for Egyptian learners: waits longer for the end of a sentence (learners pause), never hangs up on a quiet learner, uses the Egyptian Arabic voice (a woman's voice for female faces when one is set up).
- If the speech comes through as another language, it asks again instead of answering (at most every 8 seconds).
- It doesn't "correct" mistakes that came from mishearing.
- It speaks each sentence as soon as it's ready, without waiting for the whole answer, and never reads out symbols or maths code.
- The learner can interrupt; the new question wins.
- The tutor opens the call, and nudges a quiet learner at most twice after a question.
- Adults only: each English sentence the learner says is scored for pronunciation, with one tip. The audio is never stored.

## 7. Seeing
- A talking (lip-synced) video face. The learner picks the face; the voice matches it. The picker opens by itself the first time.
- Drawings appear in a side "Visual Aid" panel when the learner asks, or about every 3 turns by the tutor's own choice. Maths pictures are drawn by code; Arabic labels read right to left. A failed drawing never stops the lesson.
- The same drawings work in the text chat ("Draw it").

## 8. Reliability
- Video connects through ENARA's relay (rt.enara.app), or directly if the relay is down (fixed today, [PR #148](https://github.com/EnaraAI/enara-staging-alpha/pull/148)).
- If video drops, it reconnects several times and keeps the conversation. If video fails, the call carries on voice only.
- "Try again" closes any half-started call first.
- The model is warmed up as the call opens, so the first answer is faster.
- A microphone check runs before anything paid starts.

## 9. Safety and limits
- The tutor is off while a graded assignment is open.
- 30 calls a day for students, 5 for staff. Failed starts don't count against the day, but starts are capped too (3× the day's calls).
- Maximum call length is enforced on the server; speech has a cap per call (about 20 minutes).
- Calls draw on school budgets and credits, plus the test-spend cap.
- Demo accounts get short calls.
- Closing the call, closing the tab or leaving the page ends the paid session.

## 10. Records
- Each call is saved as a transcript with the learner's tutor chats ("past calls").
- Usage is metered (call, listening, speaking, drawings), with a once-a-minute "still connected" signal. Only usage is sent, not what was said.
- Teachers see errors to work on and progress.
- Admins can browse and choose the tutor voices.

## 11. What it does not have
- A mute button.
- Captions.
- A "time used today" or daily-limit display.

## Sources
- Call screen: `frontend/components/enara/LiveAvatarModal.tsx`
- Server: `backend/src/controllers/avatar.controller.ts`, `backend/src/routes/avatar.routes.ts`
- Teaching engine switches: `backend/src/services/engineV2.ts`; switches on for lms-test: `deploy/lms-test.flags.json` (`ENARA_ENGINE_V2`)

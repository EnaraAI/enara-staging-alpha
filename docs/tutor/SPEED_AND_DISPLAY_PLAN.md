# Plan: faster DeepSeek tutor + clean reply display (lms-test only)

Owner go (21 Nov 2026): speed steps 1–6, with step 6 waiting for Anam minutes. Step 7 changed. Reply display is new work.

## PR A: speed (DeepSeek path only)
1. **Measure.** The test and the server record the grade call, first word, whole reply, checks and regeneration time per turn.
2. **Shared prompt.** Both calls send the same system prompt and conversation. Extra instructions go after the learner's message, clearly marked as not from the learner. The model server can then reuse what it already read.
3. **No grading call when there is nothing to grade.** For questions, greetings, a first message, or a new topic, code sets "not an answer", so the turn needs one call.
4. **Streamed replies.** The first sentence is checked before it is shown: language, and "not in your materials". Then each sentence is checked as it arrives, so an answer given away is held back and the reply ends with "try again".
5. **A smaller grading call:** a shorter instruction, and at most 160 tokens.

Then the 100-turn test: quality must not drop.
- **Targets:** chat first words ≤ 1.0 s, whole reply ≤ 2.0 s (median).

## PR B: warm-up (step 7, changed)
- **No settings change:** nothing always warm, and no Modal or Vercel setting is touched.
- **Idle timeout:** measured from outside. Calls with growing gaps (1–30 min); the gap where the first call becomes slow is the timeout.
- **Warm-up ping:** opening the tutor page or the avatar sends one tiny request (1 token) in the background. It runs at most once every few minutes for all of lms-test (shared in the database). Learners never wait for it.
- **Measure:** first reply after a long gap, with and without the ping, and the extra cost per day.
- **Compare:** what a fixed hourly ping would do against the idle timeout.

## PR C: how replies look
- **One display for tutor text** in the chat, the kids chat and the avatar captions:
  - **Markdown:** bold, italics, lists, line breaks and inline code.
  - **Safe:** no raw HTML or scripts from the model.
  - **While streaming:** an unfinished `**` or `` ` `` is hidden until it closes, so stars never flash.
  - **Arabic:** each paragraph right-to-left; numbers and English words inside keep their order.
  - **Maths:** `x^2` → x², `sqrt` → √, `*` / `/` between numbers → × / ÷, simple LaTeX (`\frac`, `\sqrt`, `\times`) shown as text symbols, and fractions shown cleanly.
  - **Citations:** [1] shows as a small marker that names the source when you hover or tap it.
  - **Under 9:** plain only, with no lists or headings.
- **Avatar:** all Markdown symbols are removed before the text is spoken.
- **Tests:** unit tests, and an E2E check that no raw `**` or `#` shows in a learner's chat.

Each PR passes E2E before it goes live on lms-test. Short report at the end.

# ENARA AI Tutor: What It Can Do

*Status as of 13 Nov 2026. Code: branch `claude/codebase-review-kbxqan` (pull request #11), tutor fixes 1–7.*

How to read the marks:
- ✅ means built **and** checked by automated tests and paid test runs.
- 🟡 means built and tested, but not yet measured in a paid run.
- ⚪ means built but switched off.
- ❌ means not available.

All test results come from **simulated (AI) students**. No real student has used this version yet.

**Chat and live avatar now share one language engine (14 Nov 2026).** Both go through `backend/src/services/languageTurnPipeline.ts`: same teaching context and policy version (`ltc-v1`), same answer-hiding guards, hidden-marker removal, English-only rule, error diagnosis and learner history. The avatar adds only a thin voice layer (short spoken sentences, no lists or markdown). Tests (`backend/test/avatarLanguageLink.test.ts`) fail if either channel stops using the shared pipeline. **Trade-off:** for language courses the avatar waits for the whole reply before speaking, so the answer guards can run first; the first words come a little later than before. Not yet checked with real audio or a real student; the paid voice-vs-chat benchmark used simulated learners and no audio.

---

## 1. Teaching English lessons

| What it does | Status | Evidence |
|---|---|---|
| Teaches from the school's own lesson: objectives, success criteria, word list, grammar points and exercises | ✅ | Benchmark runs on the real student chat route |
| Presents the lesson's exercises exactly as the teacher wrote them | ✅ | Every run: the tutor received the exercise text 72 of 72 times |
| Checks answers against the teacher's answer key, without showing the key to the AI | ✅ | Answer keys in the tutor's instructions: **0** in every run |
| Adjusts its language to the student's level (A1–B2) | ✅ | "Fits the level": **91%** (3-run average after fix 3) |
| Adjusts tone and examples to the student's age (child, teen, adult) | ✅ | Age-appropriate score: about **100%** |
| Gives beginners **one task at a time**, with short replies and only lesson words | 🟡 | Fix 3: beginner replies shorter (42 → 36–39 words) |
| Replies **only in English** in English lessons, even if the student writes in Arabic | 🟡 | Fix 6: tested, not yet run in a paid test |

## 2. Helping without giving the answer away

| What it does | Status | Evidence |
|---|---|---|
| Uses a 6-step hint ladder: where to look → the idea → a guiding question → a partial frame → an example with a different word → the explained answer | ✅ | Built into every turn |
| **Automatically removes** any example that shows the answer before the student tries | ✅ | Fix 1: real leaks before a try went from 4–5 per run to **0** |
| Removes an already-completed copy of an exercise placed right next to it | ✅ | Fix 2: 6 real cases caught in stored replies |
| Two-choice questions (he/she): no hint that settles the choice | 🟡 | Fix 2 |
| Skill-aware hints: reading hints don't point at the answer sentence; vocabulary hints never give letters | 🟡 | Fix 4 |
| "Held back the answer" score (grammar lessons) | ✅ | **53% (old) → 76%** |

## 3. Handling what students do

| Situation | What the tutor does | Status |
|---|---|---|
| Student answers correctly | Confirms specifically, moves to the next exercise, never claims "mastery" from one answer | ✅ |
| Student makes a mistake | Points to the problem with a hint and lets them retry | ✅ |
| Student's wrong answer | Works out the likely cause (for example a missing -s) and aims the hint at the cause, never at the answer | 🟡 r4.4 #1 |
| Student keeps making the same type of mistake across sessions | Remembers the error type (not their text) and plans a spaced review | 🟡 r4.4 #2 |
| Student gets it right once | Asks for one more unaided check in a new context before moving on | 🟡 r4.4 #3 |
| Student misses twice | Names the mistaken idea, explains the rule with a different example, then lets them retry | 🟡 Fix 5 |
| Student gets it right after a mistake | Asks "Tell me the rule in your own words", then confirms with "Remember: …" or corrects only the wrong part | 🟡 Fix 7 |
| Student asks "why?" | Gives the reason as a clue, not the corrected answer | 🟡 Fix 4 |
| Student asks for the answer before trying | Encourages a try first with a small hint | ✅ 47% → 70% held back (multi-skill test) |
| Student goes off-topic (e.g. "write my history essay") | Politely declines and returns to English | ✅ (one case found where it offered maths help; listed to fix) |
| Teacher-written lesson text containing tricky instructions | Treated as content, never as commands | ✅ Security tests |

## 4. Skills covered

| Skill | Can it teach it? | Measured quality (share of conversations that met the bar; multi-skill test) |
|---|---|---|
| Grammar | ✅ Yes | Grammar-only test: **66 of 120** (3-run average) |
| Conversation / role-play | ✅ Yes | 33–46% |
| Writing (short texts, feedback) | ✅ Yes | 38–48% |
| Vocabulary | ✅ Yes | 23–29% (the AI grader may be too strict; needs teacher review) |
| Reading | 🟡 Partly: lessons have no field for a reading text yet | 12–15% (weakest) |
| Listening / speaking | 🟡 Through ENARA's voice and avatar features; the avatar now uses the shared language engine (text path tested; audio not tested) | See `docs/benchmarks/language-teaching/` voice-vs-chat report |
| Pronunciation scoring | ⚪ Provider-neutral interface and Azure adapter rebuilt and tested with a mocked provider; **off** until a supplier, price and audio consent are decided (no student route yet) | Not measured |

## 5. Does it help students learn?

*Learning simulation with AI students, not real learners.*

| Result | Number |
|---|---|
| Students wrong before the lesson who got **new** questions right afterwards: ENARA lesson | **28%** |
| Same, with lesson notes only | 15–20% |
| ENARA's advantage | about **+8 to +13 points**; ENARA beat notes alone in 5 of the 6 latest runs (one tie) |
| Longer lessons (12 vs 6 messages) | No extra gain |

- **A more rigorous experiment is running now:** 12 learning outcomes × 10 student types, with pre-test, post-test, transfer and retention tests, and control groups. See `docs/benchmarks/language-teaching/20261113-lo-experiment/`.
- **Real learning still needs proof:** that requires the classroom pilot and teacher review.

## 6. Safety, privacy and cost

| Area | Status |
|---|---|
| Students see only their own sessions; other students are blocked | ✅ Tested (cross-student access → 404) |
| No file paths or internal IDs shown to students | ✅ Fixed (POST-14) |
| Only one message processed at a time per session | ✅ Fixed (POST-07) |
| Every AI call is metered, and the cost matches the app's own records to the cent | ✅ Every paid run |
| Spending caps stop runs before they exceed budget | ✅ Worked in practice |
| Cost per tutor reply (Opus 5.5) | about **$0.019** |
| Cost per 120-conversation test run | about **$5** |

## 7. Known limits (what it can't do yet)

- **r4.4 features (rebuilt 13 Nov):** mistake-cause diagnosis, cross-session learner history (new collection, error types only), transfer checks, and the pronunciation adapter are back in the repository with tests. They have **not yet been measured in a paid run**.

- **Live avatar:** now linked to the shared language engine (see the note at the top). Everything measured in the earlier experiments is text chat only; the avatar was checked with simulated learners and no audio. Real voice quality, latency with the new buffering, and pronunciation are not measured.
- **Most simulated students keep their mistaken belief after a short lesson.** The tutor helps, but about 7 in 10 still get new questions wrong.
- **Reading lessons:** there is no proper place for a reading text, and reading is the weakest skill.
- **Grading reliability:** the two AI graders agree only moderately (κ about 0.2–0.3), so human teacher review is required. The review package exists.
- **No real-student evidence:** the classroom pilot has not been run; the plan is written (`docs/benchmarks/language-teaching/20261112-r44-advanced/PILOT_PROTOCOL_learning_outcomes.md`).
- **Pronunciation and speaking scores:** off or not measured.
- **Not deployed:** all fixes are on pull request #11, not in production.

# Language engine v2 (14 Nov 2026)

Four changes from the system deep-dive (`research/deep-learning-simulation-v2/reports/ENARA_SYSTEM_DEEP_DIVE.md`). **All default OFF.** Enable with `ENARA_ENGINE_V2="wrongAnswer,belief,memory,cache"` (or `all`). Nothing here has been shown to improve learning yet: it must beat the plain AI tutor in a pre-registered experiment before it is switched on anywhere.

| Switch | What it changes | Evidence it works as built |
|---|---|---|
| `wrongAnswer` | The "teach the rule after a missed attempt" step used to depend on an answer-key verdict that can only be "correct" or empty, so it never ran for wrong answers. It now triggers from the recorded previous verdict (INCORRECT/PARTIAL) when the new answer also misses the key, also for tutor-written follow-up tasks. New wording says "if this new answer is right, confirm it and do not teach". | `test/engineV2.test.ts`: through the real engine, the second wrong attempt gets the rule only with the switch on; a first attempt never does. |
| `belief` | The hidden assessment line may carry `belief=<mistaken idea>` (3–8 words, sanitised). The learning state merges the same idea across items; a repeated idea gets a "scope rule + contrast example + apply it" instruction, and a standing "never call a mistaken idea fine / a fair point" line. | Parsing, merging, finalize-only-on-failure and prompt tests. |
| `memory` | Cross-session profile now stores mistaken ideas (short text, no learner answers), whether each is resolved, spaced reviews (3, 7, 14 days after resolution), and which explanation style preceded independent success. The next session's prompt lists open and due items and, at the first message, asks for one short unaided check. New `GET /api/me/tutor/reviews/due` (empty unless on; own learner only). Profile writes are now optimistic (version check + retry), so overlapping chat and voice turns no longer overwrite each other. | Pure-logic tests, plus a real-route test: belief stored, shown to the next session with the opening review, listed as due, another learner sees nothing, two concurrent writes both persist. |
| `cache` | The same language instructions split into a part that is identical every turn of a lesson (facts, lesson spec, level rules, grounding, marker format), placed early with the cache breakpoint, and a per-turn part (moves, state, history lines, length) placed last. Chat and voice both use it. | Measured on a real 3-turn lesson (Opus 5.5): without the switch `cache_read = 0` on every call (inputs 2,741 / 3,779 / 4,077 tokens). With it: turn 1 writes 1,803 tokens to cache; turns 2 and 3 read 1,803 from cache (fresh input 1,887 / 2,097). At list prices that is about 45% less input cost per turn after the first and about 29% over three turns; output cost is unchanged. |

**Caching mechanics measured:** the model caches from about 1,100 tokens (probed at 1.1k, 2.2k, 3.3k and 4.9k tokens). ENARA's previous single breakpoint covered a prefix below that, so it never hit.

**Defaults and safety.** With all switches off the prompt and behaviour are unchanged; the existing language, avatar-link, ablation and research-flag suites pass (159 tests including 13 new). The answer-hiding guards, try-first rules and English-only rule are untouched.

**Known limits / not done.**
- No evidence yet about learning effects (Experiment 4's null warns against expecting large gains from prompt changes alone).
- The model's own "CORRECT" self-grade is still trusted (no independent check yet); answer-key matching is still exact-string.
- The repository has no student-data-erasure routine, so `learner_language_profiles` (old and new fields) is not covered by one; this needs an owner decision.
- Reading/writing/functional-language kinds, the reading guard exemption and the ped-v2 vs language-engine arbitration are unchanged.

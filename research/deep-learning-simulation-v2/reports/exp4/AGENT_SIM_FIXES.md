# Agent-run check of the clarity and hint fixes (no API): earlier new-switches version vs fixed version vs plain tutor

*14 Nov 2026. **AI agents play student and tutor; AI raters judge; no post-test.** Same 18 student cards and outcomes as `AGENT_SIM_18.md`. Sessions: `agent_sim_fixes/`.*

## What was fixed (backend, default off; see `docs/ENARA_ENGINE_V2.md`)
1. **Closing loop bug** (found from rater notes "recap loop"): the "tell me the rule in your own words" ask was repeated every turn from the 5th on, even after the student had answered. It now happens once; the rule check takes over.
2. **Spurious clarity trigger** (found while testing): `errorRecurrence` is the string `unknown`, so the explanation instruction fired after every evaluated answer. It now fires only when stuck, asking why, or (with `hints`) after the first recorded miss.
3. **`hints` switch**: if the tutor's last two replies were the same kind of hint question, the next reply must change form (rule in one plain sentence + right/wrong contrast, then ask to try again).
Tests: 12 in `backend/test/engineV2Closing.test.ts`.

## Result (18 triplets, 2 blind raters each; 1–5; difference with bootstrap 95% CI; uncorrected). **A = earlier new-switches version (with the bugs), B = fixed version, C = plain tutor.**
| Criterion | A earlier | B fixed | C plain | fixed − plain | fixed − earlier |
|---|---|---|---|---|---|
| Overall | 3.17 | 3.58 | 3.75 | −0.17 [−0.69, +0.33] | +0.42 [−0.17, +0.97] |
| Explanation clarity | 3.39 | 3.61 | 4.06 | **−0.44** [−0.81, −0.08] | +0.22 [−0.17, +0.61] |
| Hint progression | 2.92 | 3.28 | 3.39 | −0.11 [−0.61, +0.36] | +0.36 [−0.08, +0.81] |
| Makes the student reason | 3.94 | 4.03 | 3.28 | **+0.75** [+0.17, +1.33] | +0.08 |
| Answer protection | 3.81 | 3.92 | 3.11 | **+0.81** [+0.47, +1.14] | +0.11 |
| Consolidation | 2.97 | 3.06 | 3.47 | −0.42 [−0.86, 0.00] | +0.08 |
| Targets the misconception | 3.72 | 3.92 | 3.67 | +0.25 | +0.19 |

Ranked first (36 ratings): plain tutor 16, fixed 11, earlier 9. Ranked last: earlier 19, fixed 10, plain 7. Rater agreement: top pick 67%, pairwise order 78%, score correlation 0.64.
Process counts (18 sessions): the "own words" ask appeared 3 or more times in **10** earlier sessions and **2** fixed sessions (loop bug fixed); words per turn 60 vs 56 (plain 48).

## Reading
1. **The fixes helped in the intended direction but the evidence is weak.** Overall +0.42 and hint progression +0.36 against the earlier version, both with intervals that include zero. Hint progression is now level with the plain tutor (−0.11).
2. **Clarity is still the gap**: the fixed version is clearly behind the plain tutor (−0.44), and consolidation is still slightly behind (−0.42, borderline). Overall it is still a little behind the plain tutor (−0.17, not a clear difference).
3. **Strengths unchanged**: clearly ahead of the plain tutor on making students reason and on not giving answers away.
4. **No ship-bar win.** The plain tutor is still at least as good on overall transcript quality, and this set-up measures what transcripts look like, not whether students learn.
5. Absolute scores differ from `AGENT_SIM_18.md` (raters score relative to the three tutors in front of them); compare within a study, not across.

## Limits
Same as `AGENT_SIM_18.md` (same model plays both roles inside one agent context, tutor sees only the language-engine instructions, reconstructed engine history, AI raters, no post-test, uncorrected intervals, 6 messages). The earlier version's bugs mean the "+0.42" is partly a bug-fix effect.

## Next
Clarity is the remaining visible gap. Ideas not yet tried: a plain-language rule-first first explanation for every new rule (not only when stuck), a shorter recap format, and checking whether the "never state the rule" complaint is the Socratic habit itself.

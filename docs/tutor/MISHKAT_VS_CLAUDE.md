# Mishkat and v3b against Claude's grading

_23 Nov 2026, 8:05 PM Cairo. Development only. All the answers are **synthetic** (agent-written or simulated learners): the records hold no real learners' answers graded by Claude. Every Claude mark is labelled with the model and date it came from._

## In three lines
1. **On the same rubric (Claude Sonnet and Opus, 23 Nov), Mishkat agrees with Claude more than v3b does on spelling, vocabulary and Arabic grammar.** On essays it is close in both languages; on Arabic short answers it is clearly ahead (QWK 0.71–0.73 against 0.47–0.49). v3b agrees more on task completion everywhere, and on Arabic organisation.
2. **Before the move to DeepSeek, Claude mostly marked something else:** whether a drill answer used the target form. Neither grader was built for that, and both agree poorly with it. The one language criterion there (ESL7 writing, Opus 5.5, 20–21 Nov) favours Mishkat clearly: QWK 0.62 against 0.26.
3. **Caveat for part B:** Mishkat was trained on marks that include Sonnet's and Opus's, so it has an inbuilt advantage there. Part A has no such advantage, but it is mostly a different construct. Only teacher marks can settle it.

## What was found
Eight sources were found, and six are used:
- the five sources in the table below;
- the 23 Nov dev pool, which is Part B.

Two are excluded:
- 20 tutor turns (verdicts, not marks);
- 3 answers with no text.

No LAILA grading outputs survive in the records. **Arabic before the switch: only 16 answers** (phase 3, Opus 5.5, 25 Oct). That is too few to conclude anything.

## Part A: answers Claude graded before the switch (21 Nov 16:15 UTC)
"Same" = same mark; "QWK" = agreement beyond chance (1 = perfect). Claude marks are mapped to ENARA's scale as listed in `data/mishkat-dev/claude-compare/README.md`.

| Source (Claude model, date) | Lang, type, criterion | n | Mishkat vs Claude: same / within 1 / QWK | v3b vs Claude: same / within 1 / QWK | Average mark: Claude / Mishkat / v3b |
|---|---|---|---|---|---|
| ESL7 writing (Opus 5.5 agent, 20–21 Nov) | en essay, **grammar** (Claude "language" 0–3) | 104 | 0.48 / **0.98** / **0.62** | 0.48 / 0.73 / 0.26 | 0.93 / 1.47 / 1.72 |
| ESL7 writing (same) | en essay, task completion | 104 | 0.26 / 1.00 / no spread | **0.97** / 1.00 / no spread | 2.00 / 1.26 / 1.97 |
| Phase 3 benchmark (claude-opus-5-5 grader, 25 Oct) | en essay, task completion | 16 | 0.44 / 0.94 / 0.27 | **0.69** / 1.00 / **0.76** | 1.12 / 1.38 / 1.44 |
| Phase 3 (same) | **ar** essay, task completion | 12 | 0.50 / 0.92 / 0.31 | **0.75** / 1.00 / **0.80** | 1.25 / 1.67 / 1.33 |
| Phase 3 (same) | en / ar short, task completion | 6 / 4 | too few | too few | 0.00 / ~0.9 / ~1.3 |
| A1/A2 validation (Opus 5.5, 3 blind, 16–19 Nov) | en short, target form → task | 250 | 0.31 / **0.96** / 0.12 | **0.40** / 0.75 / **0.19** | 0.94 / 0.98 / 1.79 |
| ESL7 target form (Opus 5.5 agent, 20–21 Nov) | en short, target form → task | 150 | **0.20** / **1.00** / −0.26 | 0.07 / 0.53 / 0.02 | 0.26 / 0.78 / 1.67 |
| ESL1 free post-test (Opus 5.5, 2 passes, 15 Nov) | en short, correct/incorrect → task | 149 | 0.08 / **0.83** / −0.02 | **0.34** / 0.34 / 0.00 | 0.67 / 1.22 / 1.99 |
| SIM v2 judge (claude-haiku-5-5, 13 Nov) | en short, correct/incorrect → task | 150 | 0.12 / **0.87** / −0.05 | **0.43** / 0.61 / **0.20** | 0.75 / 0.91 / 1.69 |

**Reading Part A:**
- **Drills (target form, correct or incorrect):** Claude was told the target form and marked strictly (average 0.26–0.94 out of 2). v3b marks "did it answer the question" and is far more generous (1.67–1.99). Mishkat cannot see the question at all. Neither ranks the drills like Claude (QWK ≤ 0.20). This is a different task, not a verdict on either grader.
- **Writing language (ESL7):** Mishkat ranks like Claude (0.62) and v3b does not (0.26). Both are more generous than Opus, Mishkat less so.
- **Open-response task completion (phase 3):** v3b agrees with Claude far more (0.76–0.80 against 0.27–0.31). Mishkat does not read the question, as expected.

## Part B: the same v3b rubric, Claude Sonnet 5.5 and Opus 5.5 subagents (23 Nov, after the switch)
Mishkat here means cross-validated predictions: each answer was scored by a model that never saw it.

**QWK, Mishkat / v3b:**

| Criterion | English essays, Sonnet | English essays, Opus | Arabic essays, Sonnet | Arabic essays, Opus |
|---|---|---|---|---|
| Grammar | **0.72** / 0.66 | 0.73 / **0.76** | **0.76** / 0.71 | **0.81** / 0.77 |
| Spelling/punctuation | **0.57** / 0.40 | **0.48** / 0.39 | **0.78** / 0.69 | **0.77** / 0.68 |
| Vocabulary | **0.84** / 0.74 | **0.79** / 0.77 | **0.85** / 0.84 | **0.82** / 0.80 |
| Organisation | **0.77** / 0.73 | 0.70 / **0.75** | 0.75 / **0.82** | 0.70 / **0.75** |
| Task completion | 0.60 / **0.77** | 0.53 / **0.80** | 0.54 / **0.74** | 0.50 / **0.66** |

| Short answers | Sonnet | Opus |
|---|---|---|
| Arabic grammar | **0.71** / 0.49 | **0.73** / 0.47 |
| Arabic task completion | 0.39 / **0.70** | 0.39 / **0.67** |
| English task completion | 0.30 / **0.74** | 0.30 / **0.73** |
| English grammar and spelling, Arabic spelling | Almost all 1, so no spread | Same |

**Average marks (out of 2), Claude / Mishkat / v3b:**
- English spelling: 1.88–1.89 / 1.89 / **1.65**. v3b is harsher than Claude.
- English vocabulary: 1.15–1.24 / 1.25 / **1.38**. v3b is more generous.
- Arabic spelling: 1.68–1.69 / 1.61 / 1.54.
- Arabic grammar: 1.55–1.66 / 1.55 / 1.58.

**Where Mishkat agrees with Claude more than DeepSeek (v3b) does:**
- spelling (both languages, both Claude models);
- vocabulary (both, both);
- Arabic grammar (essays and short answers, both models);
- English grammar against Sonnet;
- English writing "language" before the switch (ESL7).

**Where it does not:**
- task completion everywhere, before and after the switch;
- Arabic organisation;
- English organisation and grammar against Opus, though only by 0.03–0.05;
- target-form drills, where neither matches Claude.

This is the same split as the switch plan: **Mishkat for grammar, spelling and vocabulary; v3b for task completion and organisation.**

## Arabic length tests (run 5) — needs your decision
| Test | English | Arabic (stage 2 only) |
|---|---|---|
| Short correct answer not marked down (≥ 90%) | ✅ 95–100% | ✅ 94% |
| Truncation (drop ≤ 0.3) | ✅ | ✅ 0.04 |
| Padding with 3 correct sentences (rise ≤ 0.1) | ✅ −0.03 | ❌ **0.17** (0.22 → 0.18 → 0.17 → 0.17 across four fixes) |

The augmentation has stopped helping. The cause is in v3b's own rubric: it judges grammar and spelling sentence by sentence ("lowest level when most sentences have errors"). Adding three correct sentences lowers the share of faulty sentences, so the median labels, and a marker following v3b, would rise too.

Options:
- **(a)** Keep the test as it is. Arabic grammar and spelling stay with v3b, and English could still use Mishkat.
- **(b)** Pad with sentences carrying the answer's own kind of errors, so the share stays the same, and keep the 0.1 bar. This tests length robustness without fighting the rubric. **I recommend (b).**

## Files
- **Comparison set:** `data/mishkat-dev/claude-compare/` on `claude/tutor-lms-mishkat` (synthetic answers, Claude marks as recorded, with mapping notes).
- **Sources and exclusions:** `docs/tutor/mishkat/claude_graded_sources.md`.

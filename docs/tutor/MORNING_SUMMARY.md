# Morning summary — 23 Nov 2026

_Overnight work on the assessment engine, lms-test only. Draft: updated through the night._

## In three lines
1. **P2a (grading engine for written answers) is live on lms-test.** A real quiz scored 14/18: essay 6/10, maths 7/7. Two display bugs were fixed.
2. **P2b (benchmark) is live.** The first run passed maths (0.91 and 0.97) and missed language (0.82 and 0.80). The language grader was calibrated and is being re-run.
3. **P3a (science and humanities) is live, and P3b (listening) is in CI.** The benchmark now has 900 practice answers in 10 sets.

## What was done
| Phase | PR | State |
|---|---|---|
| P2a grading engine, language and maths graders, teacher queue, override | [#90](https://github.com/EnaraAI/enara-staging-alpha/pull/90) | merged, live |
| P2b benchmark, maths grader fixes, display fixes | [#91](https://github.com/EnaraAI/enara-staging-alpha/pull/91) | merged, live |
| P3a science and humanities graders + benchmark | [#92](https://github.com/EnaraAI/enara-staging-alpha/pull/92) | merged, live |
| P3b listening + language calibration | [#93](https://github.com/EnaraAI/enara-staging-alpha/pull/93) | _in CI_ |

## Pictures
Teacher's grading view of a real quiz graded on lms-test. The model quotes the learner's own words as evidence and gives feedback in plain words:

![Teacher grading view](assessment-engine/p2a/teacher-grading-view.png)

## Benchmark results (lms-test, DeepSeek)
**Run 1** (engine-v1, 360 answers, 22:29-22:58 UTC). Share of answers scored within 1 point of the reference; the bar is 0.85:

| Set | Within 1 | Exact | Bias | Flagged | Result |
|---|---|---|---|---|---|
| Maths, English | 0.911 | 0.567 | +0.32 | 4% | ✅ |
| Maths, Arabic | 0.967 | 0.578 | +0.28 | 4% | ✅ |
| Language, English | 0.822 | 0.500 | +0.16 | 7% | ❌ |
| Language, Arabic | 0.800 | 0.411 | +0.61 | 14% | ❌ |

- **Why language missed:** the model kept to the middle level. It gave weak answers 1 where errors were in most sentences, and let Arabic colloquial pass as standard Arabic. It also gave good English essays 1 instead of 2 on spelling and organisation.
- **Fix:** anchors for each level in the language grader's instructions (engine-v2, in PR #93). Re-run: _pending_.
- **Cost:** the call records estimate $1.86 for run 1. That is **DeepSeek on your Modal endpoint, not Anthropic**, and it is an upper-bound estimate (no DeepSeek price is set).

## Needs your decision
1. **Code grader:** it has to run learners' code safely, which needs a sandbox service. Vercel has none, and an unsafe one would be wrong to build. Options: (a) a hosted sandbox such as Judge0 or Piston (cost, and a key you would add); (b) leave code questions graded by the teacher for now.
2. **Speaking:** the existing speaking exam never scores pronunciation (by design: there is no audio evidence, only the transcript). The plan mentions a "pronunciation flag". Should I keep the current rule (recommended) and only send speaking transcripts through the new language grader?
3. **The $2 Anthropic sample check** of the benchmark scores. It is off; say yes to turn it on.

## Notes
- No Anthropic credits were spent by any of this work. Benchmark calls never fall back to Anthropic.
- "Gold" (the reference scores) is **written by the authors of the practice answers, provisional**. Teacher-marked answers would replace it.

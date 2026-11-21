# Plan: make DeepSeek match Claude on the tutor (lms-test only)

**Goal:** close the gaps found in the 20-turn test. Targets on the same test:
- grading line fully right: **≥ 19/20** (now 14/20);
- rules: **≥ 98%** (now 95%);
- teaching: **≥ 95%** (now 88%).

**Where the gaps are:**
1. The hidden grading line is missing or has wrong values.
2. It points to the wrong mistake ("poard").
3. It sometimes gives the answer away.
4. It sometimes asks "tell me your thinking" instead of setting a task.

## The fixes, best value first (each one is a small PR, then a re-test)

| # | Fix | What it does | Fixes |
|---|---|---|---|
| 1 | **Grade first, then reply** | Two DeepSeek calls instead of one. Call 1 returns the verdict as strict JSON (the model supports structured output, so the format is guaranteed): verdict, next step, item, and **the exact part that is wrong**. Call 2 writes the reply from that verdict. The server builds the hidden line itself from call 1. Adds about 0.5 s (replies would take about 1.3 s). | Grading line 100% valid; the right mistake named |
| 2 | **Code finds the spelling mistake** | When the answer is one word, code compares it with the expected word and tells the model exactly what's wrong ("first letter: p should be b"). Pedagogy stays in code, as in the rest of ENARA. | "poard"-type errors |
| 3 | **Examples from Claude** | Add 3 short example turns per age band (under 9, 9–12, teen, adult) from our saved Claude replies to the system prompt (fake learners only). DeepSeek copies examples closely. | Teaching style, length, tone |
| 4 | **Two more checks on each reply** | Check for an answer given away (the expected answer is in the reply while the learner must retry) and for no task at the end. On a failure, regenerate once. | Answer given away, "tell me your thinking" with no task |
| 5 | **Small tuning** | Temperature 0.3 for steadier replies. Try reasoning "low" (instead of off) for the grading call only, and keep it only if accuracy goes up and speed stays under 1.5 s. | Consistency |
| 6 | **A bigger, automatic test** | Grow the test from 20 to 60 saved turns, with more right, wrong and stuck learners in every age group. Run it from GitHub after every DeepSeek change, scored by the same fixed rules each time. The targets above become the pass mark. | Proof, not guesses |
| 7 | *(Later, only if needed)* **Train DeepSeek on Claude's replies** | Our Modal endpoint can serve a small add-on to the model trained on Claude's tutor replies (fake learners only). Most effort, biggest gain. Needs your go and a check of the model's licence. | Closest match overall |

## Order
- **Fixes 1 + 2:** one PR. This should take the grading line to about 20/20 and fix the worst replies.
- **Fixes 3 + 4:** one PR.
- **Fix 5:** settings only.
- **Fix 6:** runs with every step.
- **Fix 7:** only if we are still below target after 1–6.

## Notes
- Anthropic is not touched. All of this is for DeepSeek only, on lms-test.
- E2E keeps the mock tutor, so each PR must pass the full suite before it goes live.
- Cost: fix 1 roughly doubles the number of calls per turn. Each call is cheap: still about $0.10 per session at the safe upper-bound price.
- Switching back to Claude stays one setting.

**Waiting for your "go"** (all of it, or the steps you choose).

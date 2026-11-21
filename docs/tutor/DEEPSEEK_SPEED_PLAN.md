# Plan: make the DeepSeek tutor faster (lms-test only)

**Now** (100-turn test, improvements on): a reply takes **2.5 s** at the median and **4.2 s** for the slowest 10%. In chat the learner sees nothing until the whole reply has been written and checked.
- **Why it is slow:**
  - Two model calls run one after the other (grade, then reply), plus a third when a check fails.
  - The reply is held back until it has been checked.
  - The two calls don't share their prompt, so the server reads the whole prompt twice.

**Targets** (same 100-turn test, quality must not drop):
- chat: first words in **≤ 1.0 s**, whole reply in **≤ 2.0 s** at the median;
- avatar: voice starts in **≤ 1.8 s** (now 2.0–3.6 s).

## Steps, biggest win first (each is a small PR, then the 100-turn test)

| # | Change | What it does | Expected gain |
|---|---|---|---|
| 1 | **Measure each part** | The test and the server record time per step: grade call, first word, whole reply, checks, regeneration. | Shows where the time goes |
| 2 | **Shared prompt for both calls** | The system prompt and conversation stay identical in the grade call and the reply call. The extra instructions go at the end. Our model server reuses what it has already read, so the second call starts much sooner. | About −0.4 to −0.8 s on long prompts |
| 3 | **Skip grading when there is nothing to grade** | When the learner asks a question, says hello or changes topic, code already knows the verdict ("not an answer"): one call instead of two. About 40% of turns in the test are like this. | One full call saved on those turns |
| 4 | **Stream the reply again** | The learner sees the reply as it is written. Checks run on each sentence as it arrives: a sentence that gives the answer away is held back and the reply is rewritten. The length and "one task" checks run at the end and only shorten the reply. | First words about 1.5 s sooner in chat |
| 5 | **A smaller grading call** | A shorter grading instruction and JSON answer, capped at about 120 tokens instead of 400. | About −0.1 to −0.2 s |
| 6 | **Avatar: speak sentence by sentence** | The avatar already speaks sentence by sentence for other subjects. For English lessons it waits for the whole reply; it will start speaking the first checked sentence. | Voice starts about 0.5–1 s sooner |
| 7 | *(Needs you)* **Server location and warm-up** | Our model server is in the US West, and I'll check which Vercel region lms-test runs in. Putting them in the same region, and keeping one model server always warm on Modal, cuts network time and cold starts. This is a Modal / Vercel setting you control; I'll measure first and tell you the gain. | About 0.1–0.3 s per call; no cold starts |

## Order
1. Step 1 (measure).
2. Steps 2 + 3 + 5: one PR, then the test.
3. Step 4: one PR, then the test.
4. Step 6: one PR, then a short avatar test (needs Anam minutes).
5. Step 7: only if you want it after seeing the numbers.

## Notes
- Anthropic is not touched; this is the DeepSeek path only, on lms-test.
- E2E must pass for every PR.
- If any step lowers the quality scores, I'll switch it off and tell you.
- Cost goes **down**, not up: fewer calls and shorter prompts.

**Waiting for your "go"** (all of it, or the steps you choose).

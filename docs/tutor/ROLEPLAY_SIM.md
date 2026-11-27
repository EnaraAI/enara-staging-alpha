# Role-play lessons: learner simulation (switch `liveRolePlay`)

*27 Nov 2026. Live tutor upgrade, item 4, PR 4. SIMULATION ONLY: fake learners, a fake school, and a throwaway database.*

## Decision: the switch stays **off**
The owner's rule is that the switch goes on only when both bars pass **in every subject**.

| Bar | Result with the final code (runs 15 and 16) | Pass |
|---|---|---|
| ≥ 90% of replies a teacher would accept, switch on (all replies) | run 15: 103/112 (92.0%) · run 16: 104/112 (92.9%) | yes |
| ≥ 90% in **every subject**, switch on (runs 15 and 16 together) | English 52/56 (92.9%) · **maths 49/56 (87.5%)** · science 55/56 (98.2%) · Arabic language 51/56 (91.1%) | **no (maths)** |
| Stuck learners: no worse than off | 0 of 8 off, 0 of 8 on, in both runs | yes |

**Why maths misses the bar:**
- The model judge prefers that a wrong sum be **left for the learner to try again**. The owner's design is that the character **fixes it in character** (a recast with the short working), and the rule comes in the debrief. Two of the seven maths rejections say exactly that.
- The other rejections are real model slips. The 8-year-old's picnic produced:
  - a "good" said after a wrong count;
  - a right answer called wrong after the scene;
  - a counting-back hint with a wrong count.
- The judge also erred twice in other runs: it called 7 − 4 = 3 wrong, and "30" wrong when it was right.
- **Next step (needs the owner):**
  1. Choose between the recast (now) and a retry-first for a wrong sum.
  2. Have a teacher rate the 20-reply sheet.
  3. Rerun the simulation (it now runs in about 10 minutes).

## What ran
- **The real text tutor.** `createApp` and `POST /api/me/tutor/sessions/:id/messages` (the JSON path, with its guards and regenerations), with every `ENARA_ENGINE_V2` switch that lms-test has, without the DeepSeek adapter parts (they run once, on lms-test).
  - **Off:** today's tutor.
  - **On:** the same, plus `liveRolePlay`.
  - The live call uses the same engine: the language engine for English and Arabic language courses, and `rolePlaySubject.ts` for the other subjects. Only the voice layer differs.
- **The model.** The only model is lms-test's tutor model, DeepSeek V4.1 Flash. Every call goes through lms-test's own maintenance route `POST /api/maintenance/llm-compare`, using the pipeline's token. The key stays on the server, and no Anthropic key exists in the job.
- **The same route also:**
  - plays the learners (persona prompts);
  - pre-screens every tutor reply: "Would a teacher accept this reply, as it is, for this learner at this point?" It answers yes or no, with a reason.
  - From run 4 on, the judge is also told what a teacher would know: some lessons run a short scene and then a short debrief.
- **Where the code is:**
  - script: `backend/src/scripts/rolePlaySim.ts`;
  - workflow: `.github/workflows/lms-roleplay-sim.yml`, which runs on a push to `claude/lms-live-roleplay-sim`;
  - results: the run's artifact (`summary.json`, `replies.json`, `teacher-sample.csv`).
- **Learners** (runs 7 to 16; 14 messages each). Message 1 is "Hello". Message 4 asks for a role-play (in Arabic in Arabic lessons), in both conditions.

  | Learner | Subject, lesson language | Lesson (fake course) |
  |---|---|---|
  | A1 adult | English, English | Jobs and the verb be |
  | B1 adult | English, English | Last holiday (past simple) |
  | Teen aged 14, **scripted to get stuck** (adds when he should multiply or subtract, or "لا أعرف", for his first four answers; "لا أعرف" / "ماذا؟" on the first two scene lines) | Maths, Arabic | النقود: المجموع والباقي |
  | Child aged 8 | Maths, English | Adding and taking away to 10 |
  | Adult | Science, Arabic | حالات المادة |
  | Child aged 11 | Science, English | What plants need |
  | Teen aged 15 | Arabic language, Arabic | أدوات الاستفهام والصفة |
  | Child aged 11 | Arabic language, Arabic | أسماء الفاكهة والسؤال بأين وكم |
- **Not in the simulation:**
  - the teaching-plan layer (the fake school has no objectives);
  - voice and Anam. No real avatar call was made: lms-test's Anam account is on the Free plan and has no minutes left until 22 Dec.

## The two scores
- **Score 1: would a teacher accept this reply.** DeepSeek pre-screens all 224 replies of a run.
  - **A sample of 20 replies for a teacher to rate:** `docs/tutor/ROLEPLAY_SIM_SAMPLE.csv`, from run 16.
    - 10 with the switch on (7 of them scene replies) and 10 with it off, across all eight learners.
    - It has the model's verdict and reason, plus empty columns for the teacher's yes/no and reason. The model accepted 18 of the 20.
- **Score 2: stuck learners**, computed by code from the turns the engine stored. A learner counts as stuck if either:
  - they failed 3 or more times on one item with no change of method; or, in a scene, 3 or more failed tries on one beat;
    - For the other subjects, any 3 wrong answers in a row count, because the tutor stores no item or method there. That is the strict reading.
  - the session ends with no unassisted right answer (a graded right answer after no more than a level-1 hint and no released answer).
  - Scene lines answered without help are counted separately and do **not** count.

## All runs
| Run | Change before the run | Off: accepted | On: accepted | Stuck off / on |
|---|---|---|---|---|
| 1–6 | English only (5 learners × 14 replies): the engine as in PR 2, then the fixes that went into PR 2b | 84–94% | 77% → 94.3% (run 5), 91.4% (run 6) | 0–1 / 0–1 |
| 7 | **every subject** (8 learners): new scenes, subject rule bank, choice by subject and lesson language | 108/112 (96.4%) | 105/112 (93.8%) | 0 / 0 |
| 8 | none (run 7 again) | 106/112 (94.6%) | 105/112 (93.8%) | 0 / 0 |
| 9 | maths scenes state every number themselves; the debrief answers a last question | 110/112 (98.2%) | 109/112 (97.3%) | 0 / 0 |
| 10 | none (run 9 again) | 111/112 (99.1%) | 105/112 (93.8%) | 0 / 0 |
| 11 | after the scene, the tutor speaks as itself again (in PR 2b) | 107/112 (95.5%) | 101/112 (90.2%) | 0 / 0 |
| 12 | Egyptian colloquial numbers are read; a wrong sum is never called right | 107/112 (95.5%) | 106/112 (94.6%) | 0 / 0 |
| 13 | none: **void** (lms-test's rate limit, 429; 6 sessions failed) | – | – | – |
| 14 | the simulation waits on 429 and runs 4 learners at a time | 108/112 (96.4%) | 99/112 (88.4%) | 0 / 0 |
| 15 | the debrief never claims a mistake that was not made; lines follow what the learner chose | 107/112 (95.5%) | 103/112 (92.0%) | 0 / 0 |
| 16 | none (run 15 again) | 108/112 (96.4%) | 104/112 (92.9%) | 0 / 0 |

**Notes:**
- **Spread:** one subject in one run is 28 replies, so one reply is 3.6 points. The same code moved between 88.4% and 94.6% overall (runs 12 and 14). The switch-on condition is 1 to 5 points below the switch-off condition in most runs.
- **What the judge rejected most with the switch on:**
  - fixed scene lines that ignore what the learner chose (asking about apples after the learner asked for bananas; a price that does not match an earlier one);
  - a wrong sum fixed instead of retried;
  - a debrief rule that does not match the item set right after it.
- **Fixes in this PR** (behind the switch):
  - Egyptian colloquial numbers ("أربعتاشر", "تلاتين") are read.
  - After a code-certain wrong number, praise at the start of a sentence ("صحيح"، "Yes,") is removed.
  - The debrief never claims a mistake that is not in the conversation.
  - Scene lines follow what the learner chose.

## Cost
- One run (8 learners × 14 messages × 2 conditions): about 650 model calls, about 1.1 million input and 47,000 output tokens.
  - At ENARA's cautious upper-bound prices for this model ($1 and $4 per million tokens), that is at most **about $1.30 per run**.
  - The model runs on ENARA's own Modal endpoint, which bills GPU time, so the real cost is lower and was not measured.
- 16 runs in all (1 void).
- No Anthropic spending.
- No Anam minutes.

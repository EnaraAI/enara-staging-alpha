# Role-play lessons: learner simulation (switch `liveRolePlay`)

*27 Nov 2026 (updated after runs 23–26). Live tutor upgrade, item 4. SIMULATION ONLY: fake learners, a fake school, and a throwaway database.*

## Decision (updated after runs 23–26): the switch stays **off**
**What blocks it now:** English, maths and Arabic language are each under 90% with the switch on. The decision rule was set before the runs and was not changed.

**Decision rule** (set before run 23): pool runs 23–26 (the final code, 4 runs × 112 replies per condition). `liveRolePlay` goes on only if both hold:
- every subject has at least 90% of replies accepted with the switch on;
- stuck learners with the switch on are no more than with it off, under the **original** stuck measure (runs 1–18).

| Subject (runs 23–26 pooled) | Off | On | ≥ 90% on |
|---|---|---|---|
| English | 100/112 (89.3%) | **97/112 (86.6%)** | **no** |
| Maths | 109/112 (97.3%) | **97/112 (86.6%)** | **no** |
| Science | 108/112 (96.4%) | 109/112 (97.3%) | yes |
| Arabic language | 106/112 (94.6%) | **99/112 (88.4%)** | **no** |
| All | 423/448 (94.4%) | 402/448 (89.7%) | – |

**Stuck learners, runs 23–26 (4 runs × 8 learners):**

| Measure | Off | On | No worse |
|---|---|---|---|
| Original (runs 1–18; the decision measure). For subjects without item ids, any 3 wrong answers in a row count as one point with one method. | 1 (child 8, maths, run 25) | 1 (teen 14, maths, run 24) | yes |
| Scene-aware (runs 19–22; reported only). Inside a scene, the beat is the point and the help given is the method. | 1 | 0 | yes |

**Earlier rounds, under the same rule:**
- **Runs 19–22** (retry-first maths): English 91/112 (**81.2%**), maths 101/112 (90.2%), science 110/112 (98.2%), Arabic 106/112 (94.6%).
  - Stuck: off 0, on 0. These runs recorded only the scene-aware measure, which replaced the original one in run 19.
  - Run 18, the last run under the original measure, had off 0, on 1.
  - From run 23, both measures are recorded.
- **Runs 15–16:** maths 87.5% blocked the switch.

**The English round** (runs 23–26; coordinator, 27 Nov 2026), all behind the switch:
- **The scene line responds to what the learner said.** A question in their message ("Where can I park?") is answered first, in character, and then the scene steers back to the beat. The post-check is unchanged.
- **Past-simple errors are found by code** ("goed", "buyed"; or a base verb in a sentence that names a past time, such as "I notice it an hour ago"). They are recast in the scene and logged with their code.
- **The debrief comes only from the learner's logged (code-certain) errors.** With none, it gives praise and one stretch item, and no rule.
- **Effect:** English moved from 81.2% to 86.6%, still under the bar. Maths and Arabic moved down (90.2% to 86.6%, and 94.6% to 88.4%), within the spread between runs.

**What the judge still rejects in English:**
- about half are lesson replies outside the scene (the first replies, and the replies after the scene); these also lower the off condition (89.3%);
- recasts the judge wants as explicit corrections ("models the correction without explaining");
- some past-tense errors the code does not catch;
- the hotel's fixed lines (the gym answer).

**Per the coordinator: no more rounds without the owner.**

---
*Earlier decision (runs 15–16): maths was 87.5%, under the bar. The owner then chose "try again first" for a wrong sum (PR #165).*

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
- **Learners** (runs 7 to 26; 14 messages each). Message 1 is "Hello". Message 4 asks for a role-play (in Arabic in Arabic lessons), in both conditions.

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
  - **A sample of 20 replies for a teacher to rate:** `docs/tutor/ROLEPLAY_SIM_SAMPLE.csv`, from run 26 (the final code).
    - 10 with the switch on (7 of them scene replies) and 10 with it off, across all eight learners.
    - It has the model's verdict and reason, plus empty columns for the teacher's yes/no and reason. The model accepted all 20. Ten are with the switch on, and seven of those are scene lines.
- **Score 2: stuck learners**, computed by code from the turns the engine stored. A learner counts as stuck if either:
  - they failed 3 or more times on one item with no change of method; or, in a scene, 3 or more failed tries on one beat;
    - For the other subjects, any 3 wrong answers in a row count, because the tutor stores no item or method there. That is the strict reading.
  - the session ends with no unassisted right answer (a graded right answer after no more than a level-1 hint and no released answer).
  - Scene lines answered without help are counted separately and do **not** count.
  - This is the **original** measure (runs 1–18 and 23–26), and it is the one the decision uses.
  - **Scene-aware measure** (runs 19–26; reported only): the same, except that in a scene the beat is the item and the help given is the method. So three wrong tries are stuck only if the help did not change between them.

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
| 17 | owner: a wrong computed answer is tried again first (#165) | 109/112 (97.3%) | 107/112 (95.5%) | 0 / 0 |
| 18 | none (run 17 again) | 108/112 (96.4%) | 104/112 (92.9%) | 0 / **1** (original measure) |
| 19 | none; the scene-aware stuck measure added | 108/112 (96.4%) | 107/112 (95.5%) | 0 / 0 (scene-aware only) |
| 20 | none | 110/112 (98.2%) | 105/112 (93.8%) | 0 / 0 (scene-aware only) |
| 21 | none | 109/112 (97.3%) | 96/112 (85.7%) | 0 / 0 (scene-aware only) |
| 22 | none (rule: pool 19–22 → English 81.2%, switch off) | 109/112 (97.3%) | 100/112 (89.3%) | 0 / 0 (scene-aware only) |
| 23 | **English round:** lines answer what was said then steer back; past-simple errors found and recast; the debrief only from logged errors | 107/112 (95.5%) | 101/112 (90.2%) | 0 / 0 (original), 0 / 0 (scene-aware) |
| 24 | none | 104/112 (92.9%) | 103/112 (92.0%) | 0 / 1, 0 / 0 |
| 25 | none | 106/112 (94.6%) | 99/112 (88.4%) | 1 / 0, 1 / 0 |
| 26 | none (rule: pool 23–26 → English, maths and Arabic under 90%, switch off) | 106/112 (94.6%) | 99/112 (88.4%) | 0 / 0, 0 / 0 |

**Notes:**
- **Spread:** one subject in one run is 28 replies, so one reply is 3.6 points. The same code moved between 88.4% and 94.6% overall (runs 12 and 14). The switch-on condition is 1 to 5 points below the switch-off condition in most runs.
- **What the judge rejected most with the switch on:**
  - fixed scene lines that ignore what the learner chose (asking about apples after the learner asked for bananas; a price that does not match an earlier one);
  - a wrong sum fixed instead of retried;
  - a debrief rule that does not match the item set right after it.
- **Fixes in PR #163** (behind the switch):
  - Egyptian colloquial numbers ("أربعتاشر", "تلاتين") are read.
  - After a code-certain wrong number, praise at the start of a sentence ("صحيح"، "Yes,") is removed.
  - The debrief never claims a mistake that is not in the conversation.
  - Scene lines follow what the learner chose.

## Cost
- One run (8 learners × 14 messages × 2 conditions): about 650 model calls, about 1.1 million input and 47,000 output tokens.
  - At ENARA's cautious upper-bound prices for this model ($1 and $4 per million tokens), that is at most **about $1.30 per run**.
  - The model runs on ENARA's own Modal endpoint, which bills GPU time, so the real cost is lower and was not measured.
- 26 runs in all (1 void).
- No Anthropic spending.
- No Anam minutes.

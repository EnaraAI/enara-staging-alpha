# SIMULATION ONLY

# EXPLORATORY: why A0+LE lost its lead to P+ in ESL4

**EXPLORATORY.** This analysis is for designing the next change. It is **not** evidence of any effect.

- **Data:** it uses only the existing ESL4 data (432 sessions, 10 rounds). No new sessions were run.
- **Rules:** nothing in the frozen ESL4 rules, prompts or analysis was changed.
- **Caveat:** judge agreement in ESL4 was 65.5%, so every event count below carries considerable judge noise.

Samples:
- Steps 1 and 4 use all 96 explicit-first learners (192 sessions per arm).
- Step 2 uses a hand-classified sample of 40 session-2 transcripts per arm.
- Step 3 uses 10 hand-read stalled learners.

**One-line answer.** In session 2, A0+LE mostly taught beliefs that were already fixed. It also kept hinting on items the learner was stuck on, rather than giving the answer. P+ drilled more, and it often added a quick "not X, but Y" line that hit the belief that was still wrong.

## Step 1. Rule events per arm and round (explicit-first learners)

These are the applied events, summed over 192 sessions per arm. Session 1 is rounds 1–5 and session 2 is rounds 6–10.

| Event | A0+LE, rounds 1–10 | P+, rounds 1–10 |
|---|---|---|
| R1 rule statement | 193 14 77 106 207 / **202 37 44 28 261** | 195 67 114 71 113 / **148 63 88 88 86** |
| R2 own-error contrast | 121 91 24 60 36 / **145 0 23 36 19** | 6 2 9 3 7 / **8 3 3 2 6** |
| R3 confirmed correct | 0 112 124 87 79 / **0 161 154 138 153** | 0 87 86 107 120 / **0 152 144 143 169** |
| R4 independent correct | 0 75 74 53 40 / **0 160 128 121 131** | 0 49 45 75 69 / **0 115 115 113 129** |
| R5 answer given | 0 in every round | 2 1 75 22 40 / **0 0 26 11 18** |
| R6 / R7 | 4 / 0 | 1 / 0 |

On raw counts, A0+LE earns *more* events than P+ in session 2: R1+R2 795 vs 495, R3 606 vs 608, R4 540 vs 472. The difference is **where** those events land.

| Session 2 (rounds 6–10) | A0+LE | P+ |
|---|---|---|
| R1/R2 events on a wrong belief **still above 0** (these lower it) | **76** | **128** |
| R1/R2 events on a belief **already at 0** (no effect) | 719 | 367 |
| Wrong beliefs set to 0 through the R4 independent count | 1 | 9 |
| Turns where the next task tests a still-live wrong belief | 198 / 346 = **57%** | 404 / 467 = **87%** |
| Total fall in W1+W2, rounds 6 / 7 / 8 / 9 / 10 | 22 / 2 / 7 / 9 / 30 | 34 / 21 / 30 / 24 / 21 |

**Where P+ earns more than A0+LE in session 2:**
- effective R1 and R2 on the live belief: 128 vs 76;
- R4 completions that zero a belief: 9 vs 1;
- practice aimed at the live belief: 87% vs 57%.

In session 1 the picture was reversed. A0+LE made 582 effective R1/R2 events and P+ made 466, which built A0+LE's early lead.

Wrong beliefs still live at round 10:
- A0+LE: 45. Of these, 37 are the learner's **primary** belief, and 13 are still at strength 3.
- P+: 46. Of these, 35 are primary and 4 are at strength 3.

## Step 2. What each arm does in session 2 (40 hand-classified transcripts per arm, 200 turns each)

| Turn type | A0+LE | P+ |
|---|---|---|
| (a) Re-explaining the rule | 26.0% | 8.0% |
| (b) Practice with hints / retry | 26.5% | 27.0% |
| (c) Independent practice, new item | 24.5% | 43.5% |
| (d) Free production (own sentence) | 3.0% | 2.0% |
| (e) Review of session 1 | 0.0% | 19.5% |
| (f) Recap / "tell me the rule" | 20.0% | 0.0% |
| Turns facing a still-live wrong belief | 36% | 61.5% |

**What the tags show (all session-2 turns).**
- A0+LE:
  - every turn has the strand `language_focused`;
  - `corrective_feedback_retry` appears in 80% of turns;
  - 25% of turns carry a rule line;
  - 21% of its next tasks are "state the rule", not an item to answer.
- P+ has no engine tags. Its next tasks are 92% blank items and 8% sentences.

**A0+LE** follows the same arc in every session: worked example, guided item, item "on your own", extension, then "tell me the rule in your own words". A large share of the session goes to explaining and recapping. Explicit review of session 1 never happens.

**P+** opens with a short "Remember: …" review of session 1. It then works through the item bank one item after another ("Next: …"). After two misses it says "the answer is X", and it never recaps.

Quoted examples (from the step-2 sample):
- A0+LE, s322_LE_r2, round 10, with W already 0: *"Let's close today's practice with a short recap… Tell me the rule in your own words."*
- P+, s365_PP_r1, round 6: *"Welcome back! … verbs ending in -ch, -sh, -s, -x or -o take -es… Try this: She ___ (watch) TV after dinner."*

## Step 3. Stalled learners

**16 explicit-first sessions** were stalled under A0+LE but not under P+:
- under A0+LE, W1+W2 did not fall from the end of round 5 to round 10;
- under P+, for the same learner and replication, it fell.

The 16 sessions:
- **12 articles sessions:** s300 (r1, r2), s306, s312, s318, s326, s336 (r1, r2), s342, s360, s372, s384.
- **4 sessions on he/she/it -s:** s308, s327, s357, s387.

The list comes from a pattern match on the learner ids, so treat the article / -s split as approximate.

Ten of them, A0+LE and P+ side by side:

| Learner | Live belief under A0+LE | A0+LE (decisive turn) | P+ (decisive turn) | Event P+ got that A0+LE did not |
|---|---|---|---|---|
| s300_r2 | W1 = 3 (leaves out a/an) | r10: "We use an before a vowel sound… Tell me the rule in your own words." [R1:W2, already 0] | r10: "this is the first time we talk about this elephant, so we need a or an…" [R1:W1] | R1:W1 |
| s342_r1 | W1 = 3 | r9: "Vowel letters are a, e, i, o, u. Is d a vowel letter?" [none] | r7: "one doctor needs 'a' or 'an'…" [R1:W1]; r8: "a doctor, not My uncle is doctor" [R2:W1] | R1:W1, R2:W1 |
| s300_r1 | W1 = 3 | r10: "a before a consonant sound… Tell me the rule" [R1:W2, at 0] | r9: "'My uncle is a doctor', not 'My uncle is doctor'" [R1:W1, R2:W1] | R1:W1, R2:W1 |
| s372_r1 | W1 = 2 (learner wrote "I saw apple") | r10: "apple needs a small word before it. Recap: a before a consonant sound…" [R1:W2, at 0] | r7: "'He is a doctor', not 'He is doctor'" [R1:W1, R2:W1] | R1:W1, R2:W1 |
| s387_r1 | W1 = 1 (learner states it in r10) | r10: "One thing needs 'a' or 'an'… how do you choose between 'a' and 'an'?" [none] | (W1 already 0) r7 R1:W2 | none on W1. A difference in starting state |
| s308_r1 (-s) | W2 = 1 (-es / -ies spelling) | r10: "Some verbs get -es, like 'watches'. Tell me the rule…" [R3/R4 only] | r8: "'Watch' ends in -ch, so we add -es, not just -s… look at the last letter!" [R1:W2] | R1:W2 |
| s327_r2 | W1 = 1 | r6 R1:W2 (at 0 afterwards) | r7 R1:W2 (W2 was live for P+) | none on W1. A difference in starting state |
| s336_r1 | W1 = 3 | r9: "Any answer is fine here, even a guess… I saw ___ dog." [none] | r10: "The answer is 'a'… we say 'He is a doctor', not 'He is doctor'." [R5, R2:W1] | R2:W1 |
| s384_r1 | W1 = 2 | r8: "Right: 'I have an egg.' Wrong: 'I have a egg.'" [R2:W2, at 0] | none on W1 in rounds 6–10 | none. W1 was already 0 for P+ before round 6 |
| s336_r2 | W1 = 3 | r10: "An goes before a vowel sound… Tell me the rule in your own words." [R1:W2] | r10: "we need 'a' with jobs: 'He is a doctor', not 'He is doctor'." [R5, R1:W1, R2:W1] | R1:W1, R2:W1 |

**Pattern.**
- In 7 of 10 pairs, P+ contradicted the belief that was still wrong (mostly article **omission**, W1) with one short line, usually tacked onto an item or an answer.
- In 9 of 10, A0+LE aimed its rule and contrast lines at the a/an **choice** (W2), which was already at 0. Even when the learner wrote the omission error ("I saw apple") or stated the omission belief, A0+LE answered with an a-versus-an recap.
- Three pairs (s327, s384, s387) are not real P+ wins in session 2. They come from different states at the start of session 2.

## Step 4. Answer withholding

We counted runs of **3 or more consecutive turns on the same item** in one session where the learner never got it right (no R3 or R4).

| | A0+LE | P+ |
|---|---|---|
| Stuck runs (≥ 3 turns) | **84** (61 of 3 turns, 23 of 4 turns) | 53 (34 of 3, 16 of 4, 3 of 5) |
| Learners affected | 52 of 96 | 38 of 96 |
| Runs where the tutor gave the answer during the run | **0** | 49 |

So yes: A0+LE's refusal to give answers regularly left learners stuck for 3–4 turns on the same item. It never released the answer. Example:
- **s306_LE_r1, rounds 6–8**, with W1 = 3 (omission):
  - The learner leaves the gap empty twice.
  - The tutor replies: "Step 1: say the word after the gap. Step 2: is its first sound a vowel sound…", and then "Let's look at my example again: 'I have a pen.'…".
  - Neither reply says that the gap *needs* a word, so W1 stays at 3.
- **s305_LE_r1, rounds 6–8:**
  - The learner writes "teachs" twice.
  - The tutor hints about "some verbs need one more letter" twice before stating the -es rule in round 8.

P+ usually gives the answer after two misses. That costs no learning under these rules (R5 has no effect), and it frees the turn for a contrast or a new item.

## Step 5. Judge disagreement (165 rechecked cases)

At the event level, 71 of the 165 rechecked cases had different state-changing events. Measured by resulting state, the count is 57. **No disagreement involved R2 or R7.**

| Cause | Cases | Example |
|---|---|---|
| A. Which correct belief to credit on R3/R4 (C1, C2 or both) | 24 | "My uncle is ___ doctor" → "a": judge 1 credits C1, judge 2 credits C2 |
| B. Whether R4 counts as a "new item" (retry after a hint, item already modelled, item outside C1/C2) | 14 | "Then try again: I ___ a student" → "am": R4 or R3 only? |
| C. R1 from an item-level explanation, or R1 on a belief already at 0 | 16 | "'He' is one person, so the verb takes -s" with W1 = 0 |
| D. R1 from a hint-like or vague line | 5 | "The rule: the gap always needs one word." |
| Mixed: C with B | 7 | — |
| Mixed: C with A | 5 | — |

- Cause C mostly concerns beliefs already at 0, so it adds noise without changing the state.
- Causes A and B do change outcomes.
- Causes B and C grow in round 7, where retries and modelled items are common.

The proposed wordings and worked examples for each cause are in **`config/agent_sim_esl5/JUDGE_RULES_DRAFT.md`**. It is an exploratory draft; the frozen ESL2 and ESL4 rules are unchanged.

## Candidate changes to ENARA

Each candidate cites the framework (`docs/ENARA_ESL_FRAMEWORK.md`), not the simulator rules.

**1. Target the learner's live error, not the lesson's next sub-rule.**
- **Change:** in session 2 (and any return visit), choose the rule line, contrast and items from the learner's *own recorded error type*. For an Arabic-speaking learner on articles, that means omission ("He is doctor"), not the a/an choice. When the learner produces or states the error, give explicit correction with a short reason.
- **Framework:**
  - §3 says to use explicit correction with a short reason "when the error shows the knowledge is missing (repeated same error…)", and to tie correction "to the evidence about this learner and this form".
  - §9 says to keep a library of expected Arabic-speaker errors and "check each against what the learner actually writes".
- **Risk of gaming the simulator:** **high.** The simulator pays one R1/R2 per targeted contradiction, so aiming at the live belief is exactly what it rewards. Real learners may need far more than one line per belief. The change is only worth making if it is defined from the learner's observed errors, not from the simulator state.

**2. Release the answer after two misses, then switch to a fresh item.**
- **Change:** after two failed attempts on the same item, state the answer with the reason and a right/wrong pair. Then give a *new* item on the same point, instead of a third hint or letter-level questions.
- **Framework:**
  - §3: use explicit correction when the knowledge is missing.
  - §4: "guided production with decreasing support, then … less-supported production in new contexts".
  - §6: push output, but "ask them to try again when the first attempt is vague". That supports one retry, not open-ended scaffolding.
- **Risk of gaming:** **medium.** The simulator gives no penalty for answers (R5 = no change), so this mainly removes dead turns. Real learners could become passive if answers come too easily. That is why the release should wait for two genuine attempts.

**3. Replace the session-end recap with retrieval practice on new items, and open session 2 with recall of session 1.**
- **Change:**
  - drop the routine "tell me the rule in your own words" closer, which took 20% of session-2 turns;
  - open session 2 with recall *attempts* on session-1 items (retrieval, not re-explanation);
  - spend the saved turns on new-context items and one own-sentence task.
- **Framework:**
  - §7: spaced retrieval, "each time as a recall attempt, not as re-reading";
  - §4: "repeated … production in new contexts, spread over days".
- **Risk of gaming:** **medium-high.** More new items means more R4 completions, which zero beliefs in the simulator, so the simulator may overstate the benefit. Rule restatement may help real learners' retention in ways the simulator ignores (it gives no credit for recap). This change should be judged on real retention, not on the simulator.

**4. Fade the worked example and rule line once the point is shown known.**
- **Change:** when the learner's record shows the point is known (for example, correct independent answers in session 1), session 2 skips the full worked example and rule restatement. It goes straight to a quick check and harder or mixed items, with more questions and "why", and less telling.
- **Framework:** §2, the expertise reversal effect: "explain for novices, question more as learners advance". Guidance "becomes redundant or harmful for more expert learners".
- **Risk of gaming:** **low to medium.** Under the simulator, re-explanations of beliefs already at 0 are simply wasted, so fading looks good mostly because it frees turns. For real learners, too much fading could miss a hidden misconception. A quick check before fading guards against this.

**5. Add a short own-sentence task in the second half of each session (pushed output).**
- **Change:** in session 2, include one or two "write your own sentence about X" tasks (only 3% today), with focused feedback on the target form.
- **Framework:**
  - §5: focus on form in the learner's own sentences, where "feedback matters most";
  - §6: pushed output, full sentences rather than single words.
- **Risk of gaming:** **low.** The simulator credits own sentences only through R3/R4, the same as blanks, so it neither strongly rewards nor penalises this change. Its value for real learners rests on the framework evidence (moderate), not on the simulator.

## Limits

- **Exploratory.** Every finding here was chosen after seeing the ESL4 result. None of it is evidence of an effect. Any change must be tested in a new pre-registered study, ideally with real learners (framework, cross-cutting point 4).
- **Judge noise.** Judge agreement was 65.5%, so event counts, and especially the C1/C2 credit and R4 calls, are noisy.
- **Hand classification.** The step 2 and step 3 classifications were done by agents on samples.
- **Small samples.** Three of the 10 stalled pairs reflect different starting states, not session-2 behaviour.
- **Simulation only.** Hand-written rules decide what counts as learning.

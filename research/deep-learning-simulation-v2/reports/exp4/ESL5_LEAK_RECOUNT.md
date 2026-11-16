# SIMULATION ONLY

# ESL5 leak recount: were the 263 LE answer releases really after two genuine attempts?

Date: 2026-11-16. Script: `src/offline/esl5_leak_recount.py` (reads the frozen `reports/exp4/agent_sim_esl5/sessions/*.json`; output `reports/exp4/agent_sim_esl5/leak_recount.json`). No API calls; no frozen file changed.

## Why

`AGENT_SIM_ESL5.md` passed the early-leak guard with LE 14 vs P+ (PP) 68 and set aside 263 LE `answerReleased` turns as legitimate. `PROTOCOL.md` (guard 2) makes a release legitimate only **after 2 genuine attempts**. `docs/ESL5_INSTRUCTION_FIXES.md` found the engine's `releaseAfterTwo` counter counted stale items, own-sentence answers and correct answers, so the 263 were never checked against that condition.

## Method

For every LE turn with `answerReleased=true` (263):
1. **Item** = the task sentence set in the previous tutor turn (last line with `___`, else the last line, instruction prefix removed). A tutor turn that asks to try / write it "again" without a new gap sentence keeps the previous item.
2. **Attempts** = the unbroken run of learner turns that answered that same item, ending at the release turn. Each one is judged from the turn's judge facts (`production.kind`, `production.correct`). A **genuine fail** is a blank or sentence answer judged wrong: not empty, not "don't know", not a copy of the prompt. The simulator's "(I leave it empty, no word)" counts as a genuine fail, as the protocol says.
3. **Class:** **(a)** ≥ 2 genuine fails on the item, so the release is legitimate. **(c)** the learner had already answered the item correctly, so no new answer was revealed. **(b)** exactly 1 genuine fail and not solved, so the release is premature. **(n)** no genuine attempt on a lesson item: almost all are "tell me the rule in your own words" tasks or requests. The protocol limits detection to lesson items, so (n) is not counted.
4. A release turn that `earlyLeakFinal` already flagged is not counted twice.

PP check: PP's 68 is the same detector (`earlyLeakFinal`, `esl5_analyze.py` line 86, `esl5Study.ts` `earlyLeakIn`). With the same reconstruction, **14** of PP's 68 flagged turns came after ≥ 2 genuine fails on the item. The protocol exempts only `releaseAfterTwo` releases, so PP stays at 68; this is noted only.

## Counts

| Class | Releases | already in earlyLeakFinal |
|---|---|---|
| (a) genuine, ≥ 2 fails | 40 | 6 |
| (b) premature, 1 fail | 23 | 6 |
| (c) item already answered correctly | 132 | 0 |
| (n) not a lesson item / no attempt | 68 | 0 |
| total | 263 | |

| Version | LE early leaks | PP | Guard (LE ≤ PP) |
|---|---|---|---|
| Original (as reported) | 14 | 68 | pass |
| SUBSTANTIVE: 14 + (b) | 31 | 68 | **pass** |
| STRICT: 14 + (b) + (c) | 163 | 68 | **fail** |

## What this means for the decision

Only 40 of the 263 releases (15%) meet the protocol's "after 2 genuine attempts" condition. The report's statement that the 263 releases were all legitimate is **wrong** and is corrected here.

The decision rule is CONFIRMED only if all guards pass, so the outcome depends on which count applies.
- **STRICT (163 > 68): the guard fails, and the decision would be NOT CONFIRMED.** This count treats every release not made after 2 genuine attempts as a protocol violation, because the protocol exempts releases only under that condition.
- **SUBSTANTIVE (31 ≤ 68): the guard passes, and CONFIRMED stands.** The protocol defines an early leak as the answer "of a lesson item that the learner **has not solved**". A class (c) release repeats an answer the learner has just produced, so by that wording it is not a leak.

**Corrected decision.** The brief for this recount said the strict count applies under the protocol's own definition. I record that ruling, and on that basis ESL5 is **NOT CONFIRMED**: guard 2 fails with 163 vs 68. The "has not solved" clause in the protocol supports the substantive reading instead, which passes. Report both readings, and do not cite ESL5 as a clean CONFIRMED result until this is settled before the next study. Either way, the primary-effect numbers do not change.

## Examples (10 per class, seeded sample; chain = judged attempts on the item, oldest first)

**(a) genuine**

| Session / turn | chain | learner (release turn) | tutor release |
|---|---|---|---|
| s607_LE_r2 t5 | fail fail | "watchs" | ""Watch" ends in -ch, so it gets -es, not only -s. Right: He touches the wall. Wrong: He to..." |
| s527_LE_r1 t3 | fail fail | "(I leave it empty, no word)" | "The answer is "an". "Orange" starts with the vowel sound "o". Right: I see an insect. Wron..." |
| s537_LE_r1 t5 | fail fail | "(I leave it empty, no word)" | "That is OK. The answer is: The baby is hungry. The baby is one person, so is goes between ..." |
| s573_LE_r1 t5 | fail fail | "My parents is teachers." | "You added a word, and that is the right idea. But parents are more than one person, so the..." |
| s501_LE_r2 t3 | fail fail | "(I leave it empty, no word)" | "The answer is am. I always goes with am. Right: I am ready. Wrong: I ready. Now a new one,..." |
| s549_LE_r1 t5 | fail fail | "My parents teachers." | "Your sentence still has no word between "My parents" and "teachers". The answer is: My par..." |
| s524_LE_r1 t5 | fail fail | "(I leave it empty, no word)" | "The answer is: He has a hat. Hat is one thing we can count, so a small word goes before it..." |
| s504_LE_r2 t3 | fail fail | "is" | "The answer here is "am". With I, we always use am. Right: "I am cold." Wrong: "I is cold."..." |
| s515_LE_r1 t3 | fail fail | "a" | "This one is "an", because "orange" begins with a vowel sound. Right: He eats an egg. Wrong..." |
| s552_LE_r2 t3 | fail fail | "is" | "The word here is "am". After I, we use am. Right: "I am kind." Wrong: "I is kind." Try thi..." |

**(b) premature**

| Session / turn | chain | learner | tutor release |
|---|---|---|---|
| s602_LE_r1 t10 | fail | "My aunt is artist." | "One small word is missing before "artist". The right sentence is: My aunt is an artist.  I..." |
| s541_LE_r1 t5 | fail | "My sister watchs TV." | "Not quite. Right: He fixes bikes. Wrong: He fixs bikes.  One last task, on your own. Write..." |
| s555_LE_r1 t5 | fail | "My brothers tall." | "In "My brothers tall", a word is missing. English needs am, is or are between the person a..." |
| s590_LE_r1 t10 | fail other | "OK. Can I have an exercise, please?" | "Sure, here is an exercise. First, your sentence: it should be "My sister is an engineer", ..." |
| s510_LE_r1 t4 | fail | "(I leave it empty, no word)" | "That is fine. An empty gap is not an answer yet. The sentence needs one word. Look at the ..." |
| s578_LE_r1 t10 | fail | "My aunt is a artist." | ""My aunt is" is fine, but the small word needs to change: it should be "an artist", becaus..." |
| s533_LE_r2 t5 | fail | "a" | "Here the answer is 'an', because 'egg' starts with a vowel sound. Now one last task, on yo..." |
| s519_LE_r1 t4 | fail other | "I think no am/is/are is needed in a present s" | "Thank you for telling me. In English, a sentence like this always needs am, is or are. The..." |
| s596_LE_r1 t10 | fail | "My aunt is artist." | "Your sentence is missing one small word before "artist". The right sentence is: My aunt is..." |
| s521_LE_r1 t4 | fail | "My aunt is engineer." | "Your sentence needs one small word. In English, we put a small word (a, an or the) before ..." |

**(c) already correct**

| Session / turn | chain | learner | tutor release |
|---|---|---|---|
| s566_LE_r1 t10 | fail correct | "a" | "Yes, "a" is the missing word: My brother has a bike. Next time, write the whole sentence s..." |
| s587_LE_r1 t4 | correct | "My brother is an engineer." | "Yes, "an engineer" is right. The first sound of "engineer" is a vowel sound. Now one more,..." |
| s507_LE_r2 t10 | correct | "are" | "Yes, "are" is correct, and the sentence has no gap now.  You did well with every person wo..." |
| s612_LE_r1 t5 | correct | "are" | "Correct: "are". The subject is two people joined by "and", so it is plural and takes "are"..." |
| s565_LE_r2 t5 | fail correct | "watches" | "Yes, "watches" is correct now. "Watch" ends in -ch, so it takes -es. To finish today, here..." |
| s513_LE_r2 t10 | correct | "is" | "Correct, "is" fits that sentence, and nothing is missing.  Let's finish today with one new..." |
| s539_LE_r1 t5 | correct | "My father is an engineer." | "Correct: "My father is an engineer." The small word is there now. Here is one last item fo..." |
| s526_LE_r2 t10 | fail correct | "My brother watches football every Sunday." | "Yes, "watches" is right now. "My brother" is one person, and "watch" ends in -ch, so it ta..." |
| s590_LE_r2 t5 | correct | "My uncle has a farm." | "Yes, "My uncle has a farm." is correct. There is a small word before "farm" now.  Here is ..." |
| s612_LE_r2 t5 | correct | "The new teacher and her class are in the gard" | "Correct: "The new teacher and her class are in the garden." Two subjects joined by and tak..." |

## Hand check

I read 32 classifications in context: 6 (a), all 23 (b), 6 (c) and 8 (n). 30 agree with the class. 2 (b) cases are doubtful:
- `s510_LE_r1` t4: the tutor gave a hint, not the answer, so this is a flag without a reveal.
- `s531_LE_r2` t10: the learner answered "is" correctly, but the judge fact says `correct: false`, so the case should be (c).

Both errors push the (b) count up slightly. Neither changes any guard outcome.

## Limits

- The reconstruction is post hoc and was not pre-registered. Item identity comes from tutor text by heuristic: the retry link and the task-line parsing.
- Attempt correctness comes from the judge's `production` facts, which contain at least one known error (s531).
- `answerReleased` marks the engine's decision to release. Some flagged turns give a hint rather than the answer, so (b) and (c) may overstate actual reveals.
- PP's 68 includes 14 turns given after ≥ 2 genuine fails. Under a symmetric rule, PP would be 54. That is still above SUBSTANTIVE (31) and below STRICT (163).

# DeepSeek match: results (21 Nov 2026, lms-test only)

Tutor track, lms-test only. test.enara.app stayed frozen, and no key was shown or stored.

## In short
- **DeepSeek now runs everything on lms-test:**
  - the tutor, in every subject;
  - the live avatar: replies and on-screen visuals;
  - the staff and background AI features: teacher assistant, data assistant, class summaries, reminders, next steps, objective drafts.
- **Results with the improvements on (100 test turns):**
  - the hidden grading line is right in **98/100** (before: 96);
  - rule checks pass **253/254, 99.6%** (before: 94%);
  - teaching quality is **96%** on my reading.
- **Trade-off:** slower replies. The median turn takes 2.5 s (1.5 s without the improvements in the same run), and the 90th percentile 4.2 s.

## Deploys (one line each)
| PR | What | Status |
|---|---|---|
| #67 | DeepSeek improvements (grade first, code answer checks, examples, reply checks, tuning), switched off; avatar visuals on DeepSeek; 100-turn test route | Live |
| #68 | Teacher assistant, data assistant, class summaries, reminders, next steps and objective drafts follow DeepSeek | Live |
| #69 | Fixes from the first test (must say "not in your materials"; no false "answer given away"; spelling slip ≠ right); improvements **switched on** | Live |
| #70 | Vowel marks and short words are not spelling slips (from reading the second test's replies) | Running its tests |

## The test
- **100 fake turns:**
  - 20 maths, 12 science, 8 Arabic grammar;
  - 20 questions answered from the course materials, 10 questions the materials don't cover, 10 questions asked in the middle of practice;
  - 20 English lesson turns.
- **Mix:** 30 in Arabic, 70 in English. 20 under 9, 28 aged 9–12, 29 teens, 23 adults.
- **How it ran:** every turn goes through lms-test's real prompt builder. Code scores it by fixed rules:
  - grading line present and right;
  - one task;
  - answer not given away;
  - length for the age;
  - same language as the learner;
  - a source shown for material answers;
  - "not in your materials" said first.

| | Before (off) | After (on) |
|---|---|---|
| Grading line present | 99 | **100** (no repair calls) |
| Grading line right | 96 | **98** |
| Rule checks | 239/254 (94%) | **253/254 (100%)** |
| Median / slowest 10% | 1.5 s / 2.4 s | 2.5 s / 4.2 s |
| Tokens per turn (in / out) | 1383 / 92 | 3030 / 166 |

**By kind of turn** (grading right, rule checks; before → after):
| Kind | Turns | Grading right | Rules |
|---|---|---|---|
| Maths practice | 20 | 19 → **20** | 57/57 → **57/57** |
| Science practice | 12 | 12 → **12** | 34/35 → **35/35** |
| Arabic grammar practice | 8 | 8 → **7** | 23/23 → **23/23** |
| Answers from course materials | 20 | 20 → **20** | 47/50 → **50/50** |
| Not in the materials | 10 | 10 → **10** | 24/35 → **34/35** |
| Question mid-practice | 10 | 10 → **10** | 24/24 → **24/24** |
| English lessons | 20 | 17 → **19** | 30/30 → **30/30** |

**By language:** Arabic rules 78/82 → 82/82; English 161/172 → 171/172.

**Biggest win:** questions the materials don't cover.
- Before, DeepSeek simply answered them (24/35 checks).
- Now it says first "This isn't in your course materials" / «هذا ليس في مواد مقررك» and labels the answer as general knowledge (34/35).

**Teaching quality** (my reading of all 100 "after" replies; I am a Claude model, so there may be some bias):
- **Score:** 192/200 (96%).
- **Six weak replies**, marked ⚠ below. Two are fixed in #70.
- **English turns vs the saved Claude replies:** 36/40 (90%), against Claude's 100%.
- **Still weaker than Claude:** hints that spell out the answer letter by letter.

## Targets from the plan
| Target | Result |
|---|---|
| Grading line right ≥ 95% | **98%** ✓ |
| Rules ≥ 98% | **99.6%** ✓ |
| Teaching ≥ 95% | **96%** ✓ (English alone: 90%) |
| Grounded answers ≥ 95% (source shown, says when not covered) | **100%** sources shown; **100%** say "not in your materials" first ✓ |

## The 3 worst replies (after)
1. **eng07** (9–12, "in" for "on"): "The first letter is wrong. We need a small word that starts with 'o'." It called a word choice a spelling slip and nearly gave the answer away. *Fixed in #70.*
2. **arab05** (teen, «الكتاب»): marked partly right for missing vowel marks; the answer is right. *Fixed in #70.*
3. **eng16** (under 9, "pag"): "Look at the letters: b, a, g." This gives the answer away.

## Speed and cost
- **Speed:** grading first means two calls per turn, and graded replies are checked before they are sent.
  - Chat turns: the first word now comes after about 2–3 s, instead of about 0.5 s when streamed.
  - Avatar: language turns were already held back for checks, so little changes there. In the avatar test the first words came after 1.4–1.7 s.
- **Cost per session (20 turns):**
  - DeepSeek after: about 3,000 tokens in and 170 out per turn, so at most about **$0.07**. This uses the safe upper-bound price of $1 / $4 per million tokens. Modal bills GPU time, so the real figure needs one day's Modal bill.
  - Claude Opus 5.5 with the same prompts: about **$0.15** without the cache.

## Avatar cost and speed test
- **Call 1 (DeepSeek):**
  - speech-to-text 4/4 exact;
  - first words after 1.4–1.7 s;
  - server reply 1.0–1.2 s;
  - model cost about $0.004 for 72 s.
- **Calls 2–24:** Anam cut the connection mid-call 2, then refused every new call with "Usage limit reached, please upgrade your plan".
  - **6/6 sentences** were heard right overall; "Sara" became "Sarah".
  - 29 of the 30 test calls are used, and the test is paused.
- **Bug found:** a refused call still logs about 31 s of avatar time in our cost record. I can fix it if you want.

## The live avatar calls with Anam (tutor on DeepSeek)
These are synthetic learner voices on lms-test. Anam turns speech into text and speaks the reply; our tutor writes the reply (DeepSeek) and puts a picture on the screen.
"First words" is the time from the end of the learner's sentence to the tutor's first text. "Voice starts" is the time until the avatar starts speaking. "Server" is the tutor's own time on lms-test.

### Call a01: adult woman (Amy), 74 s
- **Connected** in 2.5 s. Anam session 71.3 s.
- **Ended:** ended normally.

| # | Learner said | Anam heard | Tutor (DeepSeek) replied | First words | Voice starts |
|---|---|---|---|---|---|
| 1 | I have a cat. | I have a cat. ✓ | Nice sentence! I'm putting it on the screen so we can build on it. "I have a cat" is clear and correct. Now let's stretch it a little. Can you add one more word to describe your cat, like its colour or size? | 1.7 s | 2.7 s |
| 2 | My sister is ten. | My sister is ten. ✓ | Good sentence, that's correct. Let's use the sentence on screen as your model. "My sister is ten" tells us her age. Can you make one about your cat using the same shape, so "My cat is" and then a describing word? | 1.4 s | 2.3 s |
| 3 | I like apples. | I like apples. ✓ | Nice one, "I like apples" is correct and clear. I'm still using the sentence on the screen. Now try swapping apples for something you really like. What food would you put after "I like"? | 1.6 s | 2.4 s |
| 4 | He can swim. | He can swim. ✓ | Good, "He can swim" is a correct sentence. Now let's say what someone cannot do. Using the same shape, can you make a sentence starting with "She can't"? | 1.5 s | 2.0 s |

### Call a02: adult man (Ryan), 37 s
- **Connected** in 2.3 s. Anam session 35.1 s.
- **Ended:** Anam closed the connection during the 3rd sentence. This was most likely the usage limit: every later call was refused with that message.

| # | Learner said | Anam heard | Tutor (DeepSeek) replied | First words | Voice starts |
|---|---|---|---|---|---|
| 1 | My name is Sara. | My name is Sarah. (Sara → Sarah) | Nice to meet you, Sarah! I'm putting a speaking-practice card on the screen next to me. Let's warm up with one easy question. When you meet someone new, what do you usually say first? | 1.3 s | 2.8 s |
| 2 | I live in a big house. | I live in a big house. ✓ | Good sentence, Sarah! Now let's build on it. Look at the card on the screen. Can you add one more detail, like who lives in the house with you? | 2.2 s | 3.6 s |
| 3 | She has a red bag. | — (cut off) | — | — | — |

**Summary of the two calls**
- **Speech to text:** 6 of 6 sentences heard right. "Sara" was written "Sarah", the same name.
- **Tutor time on the server:** 1.2, 1.1, 1.2, 1.0, 1.0, 1.3 s.
- **Timings:** the first words came after 1.3–2.2 s, and the avatar started speaking after 2.0–3.6 s.
- **Replies:** short and spoken, one task each, and each says whether the sentence was right. The tutor put a picture or practice card on the screen at the start of each call (the avatar visuals, now on DeepSeek).
- **Model cost of call a01** (72 s): $0.0035 for the replies and $0.0008 for the visual, at the upper-bound price.
- **Calls a03–a20 and the 5 child-voice calls (c01–c05):** none started. Anam answered "Usage limit reached, please upgrade your plan".

## How to switch back
- When you say **"key set"** (a valid `ANTHROPIC_API_KEY`), I'll open one PR that sets `TUTOR_LLM_PROVIDER=anthropic`.
- Everything listed above then goes back to Claude: tutor, avatar, staff features.
- The `ds*` switches do nothing while the provider is Anthropic.

## Waiting for you
1. **Anam minutes:** add minutes, or tell me when the plan resets; and allow a few more test calls. Then I'll run the remaining 24 avatar calls (adult and child voices).
2. **The Modal cost for one day**, to turn tokens into a real price.
3. **The Anthropic key**, to switch back.
4. **Optional:** fix the cost-record bug for refused avatar calls.

## All 100 replies (after), with the task and the learner's answer
English turns also show the saved Claude reply. The hidden grading line is not shown; learners never see it. "failed" lists the code checks that did not pass.

### Maths practice

**math01** · under 9 · English · verdict CORRECT · 1690 ms

**Task:** Let's add! What is 3 + 5?

**Learner:** 8

**DeepSeek (now):**
> Great job! 8 is right. 🎉
>
> Now try this one: what is 4 + 2?

**math02** · under 9 · English · verdict INCORRECT · 1996 ms

**Task:** What is 7 - 2?

**Learner:** 4

**DeepSeek (now):**
> Not quite — count back from 7: 6, 5. What is 7 - 2?

**math03** · under 9 · Arabic · verdict CORRECT · 1772 ms

**Task:** هيا نجمع! كم يساوي ٤ + ٣؟

**Learner:** ٧

**DeepSeek (now):**
> أحسنت! ٤ + ٣ = ٧. 🎉
>
> الآن جرّب: كم يساوي ٥ + ٢؟

**math04** · under 9 · English · verdict INCORRECT · 2315 ms

**Task:** What is 2 + 6?

**Learner:** I don't know

**DeepSeek (now):**
> That's okay! Let's use your fingers. Hold up 2 fingers. Now count on: 3, 4, 5, 6, 7, 8. How many fingers are up now?

**math05** · 9–12 · English · verdict CORRECT · 2226 ms

**Task:** Write 1/2 as a decimal.

**Learner:** 0.5

**DeepSeek (now):**
> Great job — that's right! 1/2 means one part out of two, and as a decimal that's 0.5, because the 5 is worth five tenths [1].
>
> Now try this one: write 3/4 as a decimal.

**math06** · 9–12 · English · verdict INCORRECT · 2447 ms

**Task:** What is 2/8 + 3/8?

**Learner:** 5/16

**DeepSeek (now):**
> Not quite — you added the bottom numbers too. When the denominators are the same, the bottom number stays the same; only the top numbers get added [1].
>
> So keep the 8 on the bottom, and just add 2 + 3 on top. What do you get?

**math07** · 9–12 · English · verdict INCORRECT · 2412 ms

**Task:** Which is bigger, 0.6 or 0.59?

**Learner:** 0.59

**DeepSeek (now):**
> Not quite — the mistake is in the value: 0.59 is not bigger than 0.6.
>
> Think about place value: 0.6 means six **tenths**. 0.59 means five tenths and nine hundredths. Which is more: six tenths, or five tenths? [1]
>
> Try the same question again: which is bigger, 0.6 or 0.59?

**math08** · 9–12 · Arabic · verdict PARTIALLY_CORRECT · 2367 ms

**Task:** ما محيط مستطيل طوله ٧ سم وعرضه ٣ سم؟

**Learner:** ٢٠

**DeepSeek (now):**
> رقمك صح! 👏 بس ناقص شيء صغير: المحيط طول، فلازم نكتب الوحدة مع الرقم.
>
> إيه الوحدة اللي نقيس بيها الطول؟ جرّب تكتب الإجابة كاملة مرة تانية.

**math09** · 9–12 · English · verdict CORRECT · 1848 ms

**Task:** Write 3/4 as a percentage.

**Learner:** 75%

**DeepSeek (now):**
> Great work — that's right! 🎉
>
> You divided 3 by 4 to get 0.75, then multiplied by 100 to get 75% [1].
>
> Now try this one: what is 20% of 80?

**math10** · 9–12 · English · verdict CORRECT · 2538 ms

**Task:** Find 20% of 80.

**Learner:** 16

**DeepSeek (now):**
> That's right! 20% of 80 is 16. You can check it by thinking of 10% of 80 as 8, then doubling it to get 20%.
>
> Now try this one: find 25% of 60.

**math11** · teen · English · verdict CORRECT · 2184 ms

**Task:** Solve 3x + 4 = 19.

**Learner:** x = 5

**DeepSeek (now):**
> That's right — x = 5. You subtracted 4 from both sides to get 3x = 15, then divided by 3 [1].
>
> Now try this one: 2x − 7 = 9.

**math12** · teen · English · verdict INCORRECT · 3607 ms

**Task:** Solve 2x - 6 = 10.

**Learner:** x = 2

**DeepSeek (now):**
> Not quite — the mistake is in the value you got, not the method. Let's check it: put x = 2 back into 2x - 6. That gives 2×2 - 6 = 4 - 6 = -2, which isn't 10, so something slipped.
>
> Try the balance steps again, one at a time [1]: first, what do you add to both sides to get rid of the -6?
>
> Then tell me your new value for x.

**math13** · teen · English · verdict INCORRECT · 2456 ms

**Task:** What is the area of a triangle with base 6 cm and height 4 cm?

**Learner:** 24 cm²

**DeepSeek (now):**
> Not quite — you used the rectangle formula (base × height). A triangle is half of that rectangle, so you need to halve your answer [1].
>
> Try again: what is the area of a triangle with base 6 cm and height 4 cm?

**math14** · teen · Arabic · verdict CORRECT · 2169 ms

**Task:** حل المعادلة: ٥س = ٣٥

**Learner:** س = ٧

**DeepSeek (now):**
> أحسنت! إجابتك صحيحة تمامًا: قسمتَ الطرفين على ٥ فحصلت على س = ٧ ✓
>
> هذه نفس خطوة المثال في الدرس: نقسم الطرفين على نفس العدد ليبقى الطرفان متوازنين [1].
>
> جرّب الآن معادلة فيها جمع: ٢س + ٣ = ١١

**math15** · teen · English · verdict CORRECT · 1952 ms

**Task:** Simplify the ratio 10:15.

**Learner:** 2:3

**DeepSeek (now):**
> That's right — 10:15 simplifies to 2:3, because both parts divide by 5 [1].
>
> Now try this one: share 50 pencils in the ratio 2:3. How many pencils go in each share?

**math16** · teen · English · verdict INCORRECT · 1938 ms

**Task:** Two angles of a triangle are 50° and 60°. What is the third angle?

**Learner:** 80°

**DeepSeek (now):**
> Not quite — your subtraction slipped. The three angles must add up to 180°, so you need 180 − 50 − 60. Check that sum again carefully.
>
> Try the same question once more: two angles are 50° and 60°, what is the third angle?

**math17** · adult · English · verdict CORRECT · 2426 ms

**Task:** Find the mean of 4, 8 and 6.

**Learner:** 6

**DeepSeek (now):**
> Correct — 4 + 8 + 6 = 18, and 18 ÷ 3 = 6 [1]. Well done.
>
> Now try this one: find the **median** of 3, 7, 2, 9 and 5.

**math18** · adult · English · verdict CORRECT · 2311 ms

**Task:** Write 0.25 as a fraction in its simplest form.

**Learner:** 1/4

**DeepSeek (now):**
> That's right — 0.25 means 25 hundredths, and 25/100 simplifies to 1/4 [1]. Nice work.
>
> Next task: write 0.6 as a fraction in its simplest form.

**math19** · adult · Arabic · verdict CORRECT · 3623 ms

**Task:** ما احتمال ظهور العدد ٦ عند رمي حجر نرد مرة واحدة؟

**Learner:** 1/6

**DeepSeek (now):**
> إجابة صحيحة! ✅ عندك نتيجة واحدة مواتية (العدد ٦) من أصل ٦ نتائج ممكنة، فاحتمالها 1/6 [1].
>
> تذكّر القاعدة: الاحتمال = عدد النتائج المواتية ÷ العدد الكلي للنتائج، ويكون دائمًا بين 0 و1 [1].
>
> جرّب الآن: كيس فيه 3 كرات حمراء و7 كرات زرقاء. ما احتمال سحب كرة زرقاء؟

**math20** · adult · English · verdict PARTIALLY_CORRECT · 2332 ms

**Task:** What is the perimeter of a square with sides of 5 m?

**Learner:** 20

**DeepSeek (now):**
> Your number is right, but the unit is missing. Perimeter is a length, so it needs a unit of length, like cm or m [1].
>
> Try again: what is the perimeter of a square with sides of 5 m?


### Science practice

**sci01** · under 9 · English · verdict CORRECT · 2468 ms

**Task:** What do plants need from the Sun to make food?

**Learner:** light

**DeepSeek (now):**
> That's right! Plants use light from the Sun to make their food [1].
>
> Now a new one: where in the plant does this food-making happen?

**sci02** · under 9 · English · verdict INCORRECT · 3189 ms · ⚠ Hint gives the start of the answer ("l-e-a").

**Task:** Plants make food in their green l____. Write the word.

**Learner:** leef

**DeepSeek (now):**
> Good try! You got the first and last letters right. But look at the middle: you wrote **e**, and it should be **a**.
>
> So it starts l-e-a...
>
> Try the whole word again: l _ _ f

**sci03** · 9–12 · English · verdict INCORRECT · 3398 ms

**Task:** What gas do plants give out during photosynthesis?

**Learner:** carbon dioxide

**DeepSeek (now):**
> You named the gas the plant takes **in**, not the gas it gives **out**. Those are two different gases!
>
> Think of it this way: we breathe in air and breathe out something different. Plants do the same — they take in carbon dioxide and release a different gas.
>
> What gas do plants release during photosynthesis? Try again.

**sci04** · 9–12 · English · verdict CORRECT · 2404 ms

**Task:** In a food chain, what do we call the plant at the start?

**Learner:** a producer

**DeepSeek (now):**
> That's right — the plant at the start of a food chain is the producer [1]. It makes its own food using sunlight.
>
> Now try this one: in the chain grass → rabbit → fox, what do we call the rabbit?

**sci05** · 9–12 · Arabic · verdict CORRECT · 2593 ms

**Task:** ما الغاز الذي تأخذه النباتات من الهواء لتصنع غذاءها؟

**Learner:** ثاني أكسيد الكربون

**DeepSeek (now):**
> أحسنت! إجابة صحيحة: النبات يأخذ ثاني أكسيد الكربون من الهواء عبر الثغور [1].
>
> والآن: ما اسم العملية التي يصنع بها النبات غذاءه؟

**sci06** · teen · English · verdict PARTIALLY_CORRECT · 2786 ms · ⚠ Hint is muddled ("after the p" when they wrote f).

**Task:** What is the name of the process plants use to make their own food?

**Learner:** fotosynthesis

**DeepSeek (now):**
> Good try — you've got the right idea, but one letter is missing near the start: after the "p" there should be an "h" before the "o". So it's p-h-o-t-o... not f-o-t-o...
>
> Try writing the whole word again.

**sci07** · teen · English · verdict CORRECT · 2228 ms

**Task:** What is the unit of force?

**Learner:** the newton

**DeepSeek (now):**
> That's right — force is measured in the newton (N) [1].
>
> Now try this one: a bike's brakes slow it down. Is the friction there useful or not, and why?

**sci08** · teen · Arabic · verdict PARTIALLY_CORRECT · 2691 ms

**Task:** ما حالات المادة الثلاث؟

**Learner:** صلبة وسائلة

**DeepSeek (now):**
> أحسنت، ذكرت حالتين صحيحتين: الصلبة والسائلة [1]. لكنك نسيت الحالة الثالثة.
>
> تلميح: فكّر في البخار الذي يتصاعد من الماء المغلي — أي حالة هذه؟
>
> جرّب مرة أخرى: ما حالات المادة الثلاث؟

**sci09** · adult · English · verdict INCORRECT · 2207 ms

**Task:** Which planet is closest to the Sun?

**Learner:** Venus

**DeepSeek (now):**
> Not quite — Venus is the second planet from the Sun, not the first. Think of the order starting right at the Sun: the very first planet is the small rocky one before Venus [1].
>
> Try again: which planet is closest to the Sun?

**sci10** · adult · English · verdict CORRECT · 2265 ms

**Task:** What happens when two north poles of magnets are pushed together?

**Learner:** they repel each other

**DeepSeek (now):**
> That's right — like poles repel, so two north poles push apart [1].
>
> Now try this one: what happens if you bring the north pole of one magnet close to the south pole of another?

**sci11** · 9–12 · English · verdict CORRECT · 2438 ms

**Task:** Why won't a bulb light if there is a gap in the circuit?

**Learner:** because the circuit is not complete so the current cannot flow

**DeepSeek (now):**
> That's right! A gap breaks the loop, so the current can't flow and the bulb stays off [1].
>
> Now a new one: what is the difference between a conductor and an insulator?

**sci12** · teen · English · verdict NOT_EVALUATED · 4461 ms

**Task:** Which part of a plant cell is NOT found in an animal cell?

**Learner:** I'm not sure

**DeepSeek (now):**
> No problem — let's make it concrete. Think of a plant standing tall without bones. What stiff outer layer do you think keeps it upright? [1]
>
> Try the question again: which part of a plant cell is NOT found in an animal cell?


### Arabic grammar practice

**arab01** · 9–12 · Arabic · verdict CORRECT · 2335 ms

**Task:** ما المبتدأ في جملة «الطالبُ مجتهدٌ»؟

**Learner:** الطالب

**DeepSeek (now):**
> أحسنت! إجابة صحيحة ✅ «الطالب» هو المبتدأ، و«مجتهدٌ» هو الخبر [1].
>
> الآن جرّب جملة جديدة: ما المبتدأ وما الخبر في «السماءُ صافيةٌ»؟

**arab02** · 9–12 · Arabic · verdict INCORRECT · 2743 ms

**Task:** ما الخبر في جملة «السماءُ صافيةٌ»؟

**Learner:** السماء

**DeepSeek (now):**
> قريب! لكن «السماء» هي الجزء الذي نبدأ به الجملة ونتحدث عنه، وليس الجزء الذي يخبرنا عنها [1].
>
> اسأل نفسك: أي كلمة تخبرنا كيف حال السماء؟
>
> جرّب مرة أخرى: ما الخبر في «السماءُ صافيةٌ»؟

**arab03** · teen · Arabic · verdict CORRECT · 2487 ms

**Task:** ما الفاعل في جملة «نجح الطالبُ»؟

**Learner:** الطالب

**DeepSeek (now):**
> إجابة صحيحة! «الطالب» هو الفاعل لأنه هو الذي قام بالفعل، وعلامة رفعه الضمة [1].
>
> الآن جرّب: ما الفاعل في جملة «حضرَ المعلمونَ»؟ وما علامة رفعه؟

**arab04** · teen · Arabic · verdict PARTIALLY_CORRECT · 3250 ms

**Task:** أكمل بكلمة صحيحة الإملاء: ذهبتُ إلى ___ صباحًا (المكان الذي ندرس فيه).

**Learner:** المدرسه

**DeepSeek (now):**
> قريب جدًا! الكلمة صحيحة، لكن هناك خطأ واحد في الإملاء: الحرف الأخير. أنت كتبت الهاء المفتوحة، والمطلوب التاء المربوطة التي تُكتب فوقها نقطتان.
>
> جرّب مرة أخرى: اكتب الكلمة نفسها، وانتبه لنقطتي الحرف الأخير.

**arab05** · teen · Arabic · verdict PARTIALLY_CORRECT · 3145 ms · failed: verdict · ⚠ Too strict: no vowel marks is not a mistake (fixed in #70).

**Task:** استخرج المفعول به: «قرأ عليٌّ الكتابَ».

**Learner:** الكتاب

**DeepSeek (now):**
> قريب جدًا! الفكرة صحيحة: المفعول به هو «الكتاب»، لكن انتبه إلى **علامة النصب في آخر الكلمة** — أنت كتبتها بدون علامة الإعراب. المفعول به منصوب، فما الحركة التي يجب أن تكون على آخر الكلمة؟ [1]
>
> جرّب مرة أخرى واكتب الكلمة كاملة مع الحركة.

**arab06** · adult · Arabic · verdict INCORRECT · 2989 ms

**Task:** هل «كان» فعل ناقص أم حرف؟

**Learner:** حرف

**DeepSeek (now):**
> ليست حرفًا. تذكّر: الحرف لا يكون له معنى وحده، ولا يرفع اسمًا وينصب خبرًا. لكن «كان» في «كان الجوُّ جميلًا» ترفع المبتدأ وتنصب الخبر [1]. فماذا تكون إذن؟

**arab07** · adult · English · verdict CORRECT · 2781 ms

**Task:** Sure. In «كتب الولدُ الدرسَ», which word is the subject (al-fa'il)?

**Learner:** الولد

**DeepSeek (now):**
> Exactly right — الولد is the فاعل, the one who did the writing, and it is مرفوع with a ضمة [1].
>
> Now try a dual: in «حضرَ الطالبانِ», what is the علامة رفع of الطالبانِ — and why isn't it a ضمة? [1]

**arab08** · 9–12 · Arabic · verdict INCORRECT · 3129 ms

**Task:** ما نوع الجملة «يلعبُ الأطفالُ»: اسمية أم فعلية؟

**Learner:** اسمية

**DeepSeek (now):**
> قربت! لكن انتبه: الجملة تبدأ بفعل «يلعبُ»، مش باسم.
>
> اسأل نفسك: لو شلت أول كلمة، هل تفضل جملة كاملة؟ جرّب مرة ثانية: «يلعبُ الأطفالُ» اسمية أم فعلية؟


### Answers from course materials

**src01** · under 9 · English · verdict NOT_EVALUATED · 4233 ms

**Learner:** how do i add 2/8 and 3/8?

**DeepSeek (now):**
> Both fractions are cut into eighths, so the pieces are the same size [1]. You just add the top numbers: 2 + 3. What do you get on top, and what stays on the bottom?

**src02** · 9–12 · English · verdict NOT_EVALUATED · 2518 ms

**Learner:** whats the formula for area of a triangel

**DeepSeek (now):**
> The area of a triangle is:
>
> **A = ½ × base × height**
>
> So a triangle with base 10 cm and height 6 cm has area ½ × 10 × 6 = 30 cm² [1].
>
> One important thing: the height must be measured at a **right angle** to the base [1].
>
> Quick check: a triangle has a base of 8 cm and a perpendicular height of 5 cm. What is its area?

**src03** · teen · English · verdict NOT_EVALUATED · 2395 ms

**Learner:** solve 3x+4=19 pls, how do i get x alone

**DeepSeek (now):**
> Good question — this is exactly the goal in your notes: get x on its own by doing the same thing to both sides [1].
>
> Look at `3x + 4 = 19`. The `+ 4` is in the way first. What operation would undo a `+ 4`?

**src04** · adult · Arabic · verdict NOT_EVALUATED · 3048 ms

**Learner:** يعني إيه المقام في الكسر؟

**DeepSeek (now):**
> المقام هو الرقم اللي تحت في الكسر، وهو اللي بيقولنا الكل اتقسم لكام جزء متساوي [1].
>
> مثلًا في الكسر 3/8: الرقم 8 هو المقام، ومعناه إن الكل اتقسم لـ 8 أجزاء متساوية، والرقم 3 فوق بيقولنا إحنا بناخد 3 أجزاء منهم [1].
>
> سؤال صغير: في الكسر 5/6، إيه هو المقام، وإيه اللي بيقولنا عنه؟

**src05** · under 9 · Arabic · verdict NOT_EVALUATED · 2653 ms

**Learner:** ما هو قانون مساحة المستطيل؟

**DeepSeek (now):**
> مساحة المستطيل = الطول × العرض [1].
>
> مثال: مستطيل طوله ٦ سم وعرضه ٤ سم، مساحته ٦ × ٤ = ٢٤ سم² [1].
>
> سؤال صغير: مستطيل طوله ٥ سم وعرضه ٣ سم، كم مساحته؟

**src06** · 9–12 · Arabic · verdict NOT_EVALUATED · 2739 ms

**Learner:** كيف أحسب احتمال سحب كرة حمراء من كيس؟

**DeepSeek (now):**
> مرحباً! سؤال جميل. القاعدة بسيطة: الاحتمال = عدد النتائج المواتية ÷ العدد الكلي للنتائج [1].
>
> يعني لو الكيس فيه ٣ كرات حمراء و٧ كرات زرقاء، فعدد الكرات كلها = ١٠.
>
> سؤالي لك: كم عدد الكرات الحمراء (النتائج المواتية) في هذه الحالة؟

**src07** · teen · English · verdict NOT_EVALUATED · 2813 ms

**Learner:** where in the plant does photosynthesis happen

**DeepSeek (now):**
> Photosynthesis happens mainly in the leaves, inside the green parts of the cells called chloroplasts [1]. These contain chlorophyll, which absorbs light energy [1].
>
> So the leaf is the plant's "food factory." 🌿
>
> Quick check: which gas does the plant take in from the air for photosynthesis, and through which tiny holes?

**src08** · adult · English · verdict NOT_EVALUATED · 2577 ms

**Learner:** what gas do plants give out when they make food

**DeepSeek (now):**
> Good question! When plants make food, they take in carbon dioxide and water, and with light energy they make glucose — and they release **oxygen** as a by-product [1].
>
> The word equation is: carbon dioxide + water, in the presence of light → glucose + oxygen [1].
>
> Quick check: which gas do plants *take in* for this process, and through which tiny holes in the leaf?

**src09** · under 9 · English · verdict NOT_EVALUATED · 4370 ms

**Learner:** why can you pour a liquid but not a solid

**DeepSeek (now):**
> Good question! In a liquid the tiny bits can slide past each other, so it flows [1]. In a solid the bits are stuck in place, so it keeps its shape [1].
>
> Which one takes the shape of its cup?

**src10** · 9–12 · English · verdict NOT_EVALUATED · 2872 ms

**Learner:** what happens if you put two north poles together

**DeepSeek (now):**
> Good question! Think about what you already know about magnets.
>
> Every magnet has a north pole and a south pole [1]. Now, what do you think happens when two *like* poles — like two north poles — are pushed together? Do they pull toward each other or push apart?

**src11** · teen · Arabic · verdict NOT_EVALUATED · 4511 ms

**Learner:** إيه هي عملية البناء الضوئي؟

**DeepSeek (now):**
> البناء الضوئي هو العملية التي تصنع بها النباتات غذاءها بنفسها. يحدث بشكل رئيسي في الأوراق، داخل أجزاء خضراء في الخلية تسمى البلاستيدات الخضراء، والتي تحتوي على الكلوروفيل، وهي مادة خضراء تمتص طاقة ضوء الشمس [1]. يأخذ النبات ثاني أكسيد الكربون من الهواء عبر ثقوب صغيرة تسمى الثغور، ويمتص الماء من التربة عبر جذوره [1]. وباستخدام طاقة الضوء، يحوّل هذه المواد إلى جلوكوز (سكر) ويُطلق الأكسجين كناتج ثانوي [1].
>
> معادلة الكلام هي: ثاني أكسيد الكربون + الماء، في وجود الضوء، ينتج جلوكوز + أكسجين [1].
>
> سؤال سريع للتأكد من فهمك: من أين يحصل النبات على كل من ثاني أكسيد الكربون والماء؟

**src12** · adult · Arabic · verdict NOT_EVALUATED · 3613 ms

**Learner:** ما هي حالات المادة الثلاث؟

**DeepSeek (now):**
> حالات المادة الثلاث هي: **الصلبة، والسائلة، والغازية** [1].
>
> - **الصلبة:** الجزيئات متقاربة جدًا وثابتة في أماكنها، فلا تتحرك إلا بالاهتزاز، لذلك يحافظ الجسم الصلب على شكله [1].
> - **السائلة:** الجزيئات قريبة لكنها تنزلق فوق بعضها، فتسيل وتأخذ شكل الإناء [1].
> - **الغازية:** الجزيئات متباعدة وتتحرك بسرعة في كل الاتجاهات، فيملأ الغاز أي إناء [1].
>
> سؤال للتحقق: لو سكبتِ ماءً في كوب مختلف الشكل، هل سيحافظ على شكله أم سيأخذ شكل الكوب؟ ولماذا؟

**src13** · under 9 · Arabic · verdict NOT_EVALUATED · 4836 ms

**Learner:** ما الفرق بين الدائرة الكهربائية على التوالي وعلى التوازي؟

**DeepSeek (now):**
> في الدائرة على التوالي يوجد مسار واحد فقط للتيار [1]. وفي الدائرة على التوازي توجد عدة مسارات أو فروع [1].
>
> سؤالي لك: إذا انقطع سلك في أحد فروع الدائرة على التوازي، هل ينطفئ كل المصابيح أم يبقى بعضها مضيئًا؟

**src14** · 9–12 · Arabic · verdict NOT_EVALUATED · 3090 ms

**Learner:** يعني إيه جملة اسمية؟

**DeepSeek (now):**
> الجملة الاسمية هي الجملة التي تبدأ باسم، وتتكوّن من ركنين أساسيين: المبتدأ والخبر [1]. مثال: «الطالبُ مجتهدٌ» — هنا «الطالبُ» مبتدأ، و«مجتهدٌ» خبر، وكلاهما مرفوع في الغالب [1].
>
> فكرة مهمة: الجملة الاسمية تدل على الثبات والاستمرار، فهي تصف حال الشيء أو صفته، ولا تركّز على حدوث فعل [1].
>
> جرّب معي: انظر إلى الجملة «السماءُ صافيةٌ» — أيّ كلمة هي المبتدأ وأيّها الخبر؟

**src15** · teen · Arabic · verdict NOT_EVALUATED · 3096 ms

**Learner:** ما هما ركنا الجملة الاسمية

**DeepSeek (now):**
> سؤال جيد! الجملة الاسمية هي التي تبدأ باسم، وتتكوّن من ركنين أساسيين [1]:
>
> 1. **المبتدأ**: الاسم المرفوع الذي تبدأ به الجملة ونتحدث عنه [2].
> 2. **الخبر**: الجزء الذي يكمل المعنى ويخبرنا عن المبتدأ [2].
>
> مثال: «الطالبُ مجتهدٌ» — الطالبُ مبتدأ، ومجتهدٌ خبر [1].
>
> الآن جرّب أنت: في جملة «السماءُ صافيةٌ»، ما المبتدأ وما الخبر؟

**src16** · adult · Arabic · verdict NOT_EVALUATED · 2561 ms

**Learner:** مين الفاعل في جملة نجح الطالب؟

**DeepSeek (now):**
> الفاعل هو الاسم المرفوع الذي يدل على من قام بالفعل، ويأتي بعد الفعل مباشرة [1].
>
> في جملة «نجحَ الطالبُ»: الفعل هو «نجحَ»، فمن الذي قام بالنجاح؟ ابحث عن الاسم الذي بعده وقل لي: مين الفاعل؟

**src17** · under 9 · Arabic · verdict NOT_EVALUATED · 3717 ms

**Learner:** ايه اخوات كان؟

**DeepSeek (now):**
> أخوات "كان" أفعال مثل: أصبح، أمسى، ظلّ، بات، صار، ليس [1]. كلها ترفع الاسم وتنصب الخبر، مثل: «كان الجوُّ جميلًا» [1].
>
> هل تقدر تقول لي جملة واحدة فيها «أصبح»؟

**src18** · 9–12 · English · verdict NOT_EVALUATED · 4296 ms

**Learner:** what is a nominal sentence in arabic grammar

**DeepSeek (now):**
> A nominal sentence (جملة اسمية) is a sentence that **starts with a noun** [1]. It has two main parts: the مبتدأ (the thing you're talking about) and the خبر (what you say about it) [1]. For example, «الطالبُ مجتهدٌ» — "the student is hardworking" [1].
>
> Quick check: in «السماءُ صافيةٌ», which word is the مبتدأ?

**src19** · teen · English · verdict NOT_EVALUATED · 2261 ms

**Learner:** how do i find the direct object in a sentence

**DeepSeek (now):**
> To find the direct object (المفعول به), ask **"ماذا؟"** or **"من؟"** right after the verb and its subject [1].
>
> For example, in «قرأَ الولدُ القصةَ»:
> - Verb + subject: قرأ الولدُ
> - Ask: ماذا قرأ الولد؟ → القصةَ
> - So القصةَ is the direct object, and it's منصوب with a فتحة [1].
>
> Now you try: in the sentence «شاهدتُ المعلماتِ», ask the question and tell me which word is the direct object.

**src20** · adult · English · verdict NOT_EVALUATED · 2486 ms

**Learner:** which prepositions are used to make a noun majroor

**DeepSeek (now):**
> The course lists the main ḥurūf al-jarr: من، إلى، عن، على، في، الباء، اللام، الكاف [1]. When one of these comes before a noun, it makes it majrūr — its ending becomes kasra (or what stands in for it) [1]. For example, «ذهبتُ إلى المدرسةِ» — المدرسةِ is majrūr with kasra [1].
>
> Quick check: in «الكتابُ على الطاولةِ», which word is majrūr, and which preposition made it so?


### Not in the materials

**oos01** · 9–12 · English · verdict NOT_EVALUATED · 3586 ms

**Learner:** how do i find the volume of a cylinder

**DeepSeek (now):**
> This isn't in your course materials. From general knowledge: the volume of a cylinder is **V = π × r² × h**, where *r* is the radius of the circular base and *h* is the height. You can check with your teacher too!
>
> Quick check: if a cylinder has radius 2 cm and height 5 cm, what would you multiply together first?

**oos02** · teen · English · verdict NOT_EVALUATED · 3672 ms

**Learner:** what is the quadratic formula

**DeepSeek (now):**
> This isn't in your course materials. General knowledge: the quadratic formula solves equations of the form ax² + bx + c = 0, giving x = (−b ± √(b² − 4ac)) / 2a. Check with your teacher whether it is part of your course.
>
> Quick check: in the equation 2x² + 3x − 5 = 0, what are a, b and c?

**oos03** · adult · English · verdict NOT_EVALUATED · 4629 ms

**Learner:** explain pythagoras theorem

**DeepSeek (now):**
> This isn't in your course materials. General knowledge: Pythagoras' theorem says that in a right-angled triangle, the square of the hypotenuse equals the sum of the squares of the other two sides — a² + b² = c², where c is the side opposite the right angle. Check with your teacher whether it is part of your course.
>
> Quick check: in a right triangle with legs 3 cm and 4 cm, what is the hypotenuse?

**oos04** · under 9 · English · verdict NOT_EVALUATED · 4068 ms · failed: length

**Learner:** what is the periodic table and how are elements arranged

**DeepSeek (now):**
> This isn't in your course materials. From general knowledge: the periodic table is a chart of all the elements — the basic building blocks of everything. Elements are arranged in rows and columns by their properties.
>
> For example, elements in the same column behave in similar ways.
>
> Quick check: what do you think an "element" is?

**oos05** · 9–12 · English · verdict NOT_EVALUATED · 5847 ms

**Learner:** how do vaccines work

**DeepSeek (now):**
> This isn't in your course materials. From general knowledge: a vaccine shows your body a harmless piece of a germ, so your body learns to fight it before the real germ arrives.
>
> What do you think your body makes to fight the germ?

**oos06** · teen · English · verdict NOT_EVALUATED · 2639 ms

**Learner:** what causes earthquakes

**DeepSeek (now):**
> This isn't in your course materials. General knowledge: earthquakes mostly happen when stress builds up in the Earth's crust and is suddenly released along faults (breaks in the rock), sending out seismic waves. They also occur at plate boundaries, from volcanic activity, and from human activity like mining.
>
> Quick check: what do we call the point *inside* the Earth where an earthquake starts?

**oos07** · adult · Arabic · verdict NOT_EVALUATED · 5361 ms

**Learner:** ما هو إعراب الحال؟

**DeepSeek (now):**
> هذا ليس في مواد مقررك.
>
> من المعرفة العامة: الحال اسم منصوب يبيّن هيئة صاحبه عند وقوع الفعل، مثل: «عاد الطالبُ مسرورًا» فـ«مسرورًا» حال منصوبة.
>
> هل تريد أن نجرّب معًا مثالًا بسيطًا لتحديد الحال فيه؟

**oos08** · under 9 · Arabic · verdict NOT_EVALUATED · 5352 ms

**Learner:** ايه هي الاسماء الخمسة وازاي تتعرب

**DeepSeek (now):**
> هذا ليس في مواد مقررك.
>
> من المعرفة العامة: الأسماء الخمسة هي: أبوك، أخوك، حموك، فوك، ذو مال. تُعرب بالحروف: ترفع بالواو، وتنصب بالألف، وتجر بالياء.
>
> هل تقدر تعطيني مثالًا واحدًا بكلمة «أبوك» في جملة؟

**oos09** · 9–12 · Arabic · verdict NOT_EVALUATED · 3488 ms

**Learner:** ما هي أنواع الهمزة وكيف نكتبها؟

**DeepSeek (now):**
> هذا السؤال عن أنواع الهمزة ليس في موادك الدراسية بالضبط، لكن سأشرحه لك من المعرفة العامة، ويمكنك أن تسأل معلمك للتأكد.
>
> الهمزة في الكتابة لها نوعان رئيسيان:
>
> 1. **همزة القطع (أ / إ)**: تُنطق دائمًا في بداية الكلمة، مثل: **أ**حمد، **إ**براهيم.
> 2. **همزة الوصل (ا)**: تُنطق في بداية الكلام فقط، وتسقط عند وصلها بما قبلها، مثل: **ا**بن، **ا**سم.
>
> **سؤال لك:** عندما تقول "ذهب **ا**بنُ الجار"، هل تُنطق الهمزة في كلمة "ابن" أم تسقط؟

**oos10** · teen · English · verdict NOT_EVALUATED · 1958 ms

**Learner:** who won the football world cup in 2022?

**DeepSeek (now):**
> This isn't in your course materials. General knowledge: Argentina won the 2022 FIFA World Cup, beating France on penalties after a 3–3 draw. Check with your teacher if this is part of your course.
>
> Is there a topic from your lessons you'd like to work on instead?


### Question mid-practice

**mid01** · 9–12 · English · verdict NOT_EVALUATED · 2322 ms

**Task:** What is 2/8 + 3/8?

**Learner:** wait, what does the denominator mean?

**DeepSeek (now):**
> Good question! The denominator is the bottom number of a fraction. It tells you how many equal parts the whole is cut into [1].
>
> So in 2/8, the 8 means the whole is split into 8 equal parts.
>
> Picture a pizza cut into 8 slices — the denominator is that 8.
>
> Now: in 3/8, what does the 3 (the numerator) tell you?

**mid02** · teen · English · verdict NOT_EVALUATED · 3139 ms

**Task:** Solve 2x + 3 = 11.

**Learner:** why do we subtract 3 first?

**DeepSeek (now):**
> Good question! Think about what we want: x **on its own** [1].
>
> Right now x is tangled up with two things: it's multiplied by 2, and then 3 is added. To untangle it, we undo the *last* thing done to x first — and the +3 is on the outside.
>
> Here's an everyday picture: you put on socks, then shoes. To undo it, you take off the **shoes first**, not the socks. The +3 is the "shoes" — it's the outer layer.
>
> So: subtract 3 from both sides to get 2x = 8. Then the "socks" come off last: divide by 2.
>
> Now you try: what is x?

**mid03** · adult · Arabic · verdict NOT_EVALUATED · 3042 ms

**Task:** احسب ٢٥٪ من ٤٠.

**Learner:** يعني إيه نسبة مئوية أصلاً؟

**DeepSeek (now):**
> النسبة المئوية تعني "من كل ١٠٠". الرمز % يعني "لكل مئة"، فـ ٣٥٪ تعني ٣٥ من كل ١٠٠ [1]. ولإيجاد نسبة من عدد، نحوّل النسبة إلى كسر عشري أو كسر عادي ثم نضرب [1].
>
> مثال بسيط: ٢٠٪ من ٨٠ ← نكتب ٢٠٪ كـ ٠٫٢ ثم ٠٫٢ × ٨٠ = ١٦ [1].
>
> طيب، لو عندك ٢٥٪، تكتبها ككسر عشري إزاي؟

**mid04** · under 9 · English · verdict NOT_EVALUATED · 2039 ms

**Task:** What do plants need to make food?

**Learner:** what is a leaf for?

**DeepSeek (now):**
> Good question! A leaf is like a little food factory for the plant. It catches sunlight to make food [1].
>
> What green stuff inside the leaf catches the sunlight?

**mid05** · teen · English · verdict NOT_EVALUATED · 4238 ms

**Task:** What is the unit of force?

**Learner:** is weight the same as mass?

**DeepSeek (now):**
> Good question — they're related but not the same.
>
> - **Mass** is how much matter is in an object. It's measured in **kilograms (kg)** and doesn't change wherever you go.
> - **Weight** is the force of gravity pulling on that mass. It's a force, so it's measured in **newtons (N)**.
>
> So a 10 kg bag has a mass of 10 kg on Earth and on the Moon — but it weighs less on the Moon because gravity is weaker there.
>
> Quick check: if your mass is 40 kg, does your mass change if you go to the Moon? And does your weight?

**mid06** · 9–12 · Arabic · verdict NOT_EVALUATED · 2869 ms

**Task:** ما الذي يجعل الماء يتبخر؟

**Learner:** يعني إيه يتبخر؟

**DeepSeek (now):**
> سؤال جيد! التبخر معناه أن الماء يتحول من سائل إلى غاز اسمه بخار الماء [1].
>
> مثال من حياتك: لما تنشر غسيل مبلل في الشمس، بعد شوية بيجف. الماء اللي كان فيه مش اختفى، لكنه اتحول لبخار وطلع في الهوا.
>
> فإيه اللي بيعمل الحرارة دي للماء في الطبيعة؟

**mid07** · teen · Arabic · verdict NOT_EVALUATED · 2371 ms

**Task:** ما المفعول به في «شرب الولدُ الحليبَ»؟

**Learner:** إزاي أعرف المفعول به أصلاً؟

**DeepSeek (now):**
> تمام، سؤال مهم! الطريقة سهلة: بعد الفعل والفاعل اسأل **ماذا؟** أو **من؟** [1]
>
> مثال: «قرأَ الولدُ القصةَ» → ماذا قرأ الولد؟ → القصةَ، وهي مفعول به منصوب [1].
>
> جرّب الآن: في «شرب الولدُ الحليبَ»، اسأل نفسك: **ماذا شرب الولد؟** وقول لي الكلمة.

**mid08** · adult · Arabic · verdict NOT_EVALUATED · 3426 ms

**Task:** أدخل «كان» على جملة «الجوُّ جميلٌ».

**Learner:** هي كان بتعمل إيه في الجملة؟

**DeepSeek (now):**
> «كان» وأخواتها أفعال ناقصة تدخل على الجملة الاسمية، فترفع المبتدأ ويُسمى اسمها، وتنصب الخبر ويُسمى خبرها [1].
>
> يعني ببساطة: هي ما بتغيّرش المعنى، بس بتغيّر حركة الكلمة التانية (الخبر) من الرفع للنصب.
>
> مثال من الدرس: «كان الجوُّ جميلًا» — الجوُّ اسم كان مرفوع، وجميلًا خبرها منصوب [1].
>
> طيب، لو قلت لك: «كان الطالبُ مجتهدٌ» — إيه الحركة الصح على كلمة «مجتهد» بعد ما دخلت عليها «كان»؟

**mid09** · under 9 · English · verdict NOT_EVALUATED · 2020 ms

**Task:** What is 4 + 4?

**Learner:** can we play a game after?

**DeepSeek (now):**
> Yes, we can play a game after! First, one quick sum: what is 4 + 4?

**mid10** · adult · English · verdict NOT_EVALUATED · 2240 ms

**Task:** Which planet is closest to the Sun?

**Learner:** how big is the sun compared with earth?

**DeepSeek (now):**
> Good question! The Sun is huge compared with Earth — about 109 Earths could fit across it side by side, and it holds almost all the mass in the solar system [1].
>
> So the Sun is far bigger than Earth. Now, back to our practice: which planet is closest to the Sun?


### English lessons

**eng01** · under 9 · English · verdict CORRECT · 2523 ms

**Task:** Sam is my friend. Start every sentence with a capital letter, like S. Wrong: sam is my friend. Now you: fix "the cat is big".

**Learner:** The cat is big.

**Claude (saved):**
> Yes! "The cat is big." has a capital T.
> Write 3 sentences about your teacher.

**DeepSeek (now):**
> Yes! "The cat is big." has a capital T and a full stop. Now write 3 sentences about your teacher.

**eng02** · under 9 · English · verdict CORRECT · 2618 ms

**Task:** Hello again! Let us play a quick memory game. Complete: "I ___ tall."

**Learner:** am

**Claude (saved):**
> Yes, "am" is right.
> Write these words as two sentences: my uncle ___ a driver he has a white van

**DeepSeek (now):**
> Yes, "am" is right! Now write these words as two sentences: my uncle ___ a driver he has a white van

**eng03** · under 9 · English · verdict INCORRECT · 2140 ms

**Task:** Yes, "pencil" is a right word for your sentence. Good writing!
Complete: "The teacher writes on the ___."

**Learner:** poard

**Claude (saved):**
> Nice try! You are close. Check the first letter of your word.
> Write it again: The teacher writes on the ___.

**DeepSeek (now):**
> Close! Check the first letter of that word. Try the same sentence again.

**eng04** · 9–12 · English · verdict CORRECT · 2390 ms

**Task:** Yes, you asked nicely! Here is your word game.

Write the word: you drink it, it is white. ___

**Learner:** milk

**Claude (saved):**
> Yes, "milk" is right. Good job!
> Now write one sentence about a person you know, using a food word.

**DeepSeek (now):**
> Yes, milk is right! Good work.
>
> Now write one sentence about a person you know, using a food word.

**eng05** · 9–12 · English · verdict CORRECT · 1817 ms

**Task:** I like rice. Rice is the name of this food. Use the right name for each food.
Write the word: it swims, you can eat it. ___

**Learner:** fish

**Claude (saved):**
> Yes, "fish" is right! Now write one sentence about a food you like. Start with: I like

**DeepSeek (now):**
> Yes, fish is right! Good work.
>
> Now you write one sentence. Use "I like" and one food word.

**eng06** · 9–12 · English · verdict INCORRECT · 2156 ms · ⚠ Contrast uses "on" though the learner wrote "in".

**Task:** Look: "We eat lunch at 12:00." Use at before a clock time. Wrong: "We eat lunch on 12:00."
Write in, on or at: School ends ___ 3:00.

**Learner:** in

**Claude (saved):**
> Good try! Use at before a clock time. Right: "We swim at 5:00." Wrong: "We swim in 5:00."
> Write in, on or at: School ends ___ 3:00.

**DeepSeek (now):**
> "in" is wrong here. We use at before a clock time. Wrong: "The film starts on 8:00." Right: "The film starts at 8:00."
> Try again: School ends ___ 3:00.

**eng07** · 9–12 · English · verdict INCORRECT · 1783 ms · ⚠ Called "in" for "on" a spelling slip (fixed in #70).

**Task:** Hi again! Quick game. Write in, on or at: We swim ___ Friday.

**Learner:** in

**Claude (saved):**
> Rule: on goes with a day, in with a month.
> Right: We play on Sunday.
> Wrong: We play in Sunday.
> Try again: Write in, on or at: We swim ___ Friday.

**DeepSeek (now):**
> Good try! The first letter is wrong. We need a small word that starts with "o". Try again: We swim ___ Friday.

**eng08** · teen · English · verdict INCORRECT · 2296 ms

**Task:** Hello! Here is your exercise. Fill in the gap.

Write in, on or at: My train leaves ___ 5 o'clock.

**Learner:** in

**Claude (saved):**
> Your answer "in" does not fit a clock time. Example: The film starts at half past nine (9:30). Rule: use "at" before a clock time. Right: The bus comes at half past eight. Wrong: The bus comes in half past eight. Now try: School ends ___ half past three. Write in, on or at.

**DeepSeek (now):**
> Good try. "In" is not the word we use with a clock time like 5 o'clock.
>
> Think: which small word goes with a time on the clock?
>
> Try again: My train leaves ___ 5 o'clock.

**eng09** · teen · English · verdict CORRECT · 1721 ms

**Task:** Right: The bus comes at half past six (6:30). Wrong: The bus comes in half past six. Use at with a clock time.
Write at, on or in: "The party starts ___ half past eight."

**Learner:** at

**Claude (saved):**
> Yes, "at" is right with half past eight. Next:
> Write in, on or at: They get married ___ April.

**DeepSeek (now):**
> Yes, "at" is right with a clock time.
>
> Next: Write in, on or at: They get married ___ April.

**eng10** · teen · English · verdict INCORRECT · 1867 ms

**Task:** Example: "Leo brings juice at 3:00. The party begins at 3:30." Question: "When does the party begin?"
Rule: read the whole question first, then pick the time that fits it. Right answer: 3:30, not 3:00, because the time changed.
Now you try. Read the message. What day is the game?

**Learner:** the first day named in the message

**Claude (saved):**
> The first day is not always the answer. Read the whole question, then pick the day that fits it. Example: "Sam comes on Monday. The party is on Friday." Question: "What day is the party?" Right: Friday. Wrong: Monday.
> Sorry, the message was missing. Here it is: "Practice is on Wednesday. The game is on Saturday." What day is the game?

**DeepSeek (now):**
> You picked the first day you saw, but the question asks which day the game is on. The message changes the day, so read the whole question, then find the day that fits it.
> Try the same task again: What day is the game?

**eng11** · teen · English · verdict CORRECT · 2440 ms

**Task:** Hi again! Quick check. Read the message: "Hi Sam! I have 2 tickets for the concert, not 3. Meet me at the cafe." How many tickets are there?

**Learner:** 2

**Claude (saved):**
> Yes, 2 is right. It fits the whole question.
> Next, read a new message and answer.
> Read the message. What time does the game start? Text: "Hi Mona! The football game is on Thursday. It is not on Monday this week. Ali brings the ball at 5:15. The game starts at 5:30. Meet me at the sports hall, not at the gate. Bring 3 friends and 1 bottle of water. From Jamal"

**DeepSeek (now):**
> Yes, 2 is right. "Not 3" is the trap, and you found the real number.
>
> Now read this message: "Hi Mona! The football game is on Thursday. It is not on Monday this week. Ali brings the ball at 5:15. The game starts at 5:30. Meet me at the sports hall, not at the gate. Bring 3 friends and 1 bottle of water. From Jamal"
>
> What time does the game start?

**eng12** · adult · English · verdict INCORRECT · 2241 ms

**Task:** Hello! Here is your exercise. Correct the sentence.
Correct the sentence: "She can swims."

**Learner:** She can swims.

**Claude (saved):**
> You wrote the sentence without a change. Look: Ana can sing. After can, the verb does not change. Wrong: Ana can sings. Now you: correct "Tom can cooks."

**DeepSeek (now):**
> You copied the sentence without changing anything. Look at the verb after "can". What in the sentence needs to change?

**eng13** · adult · English · verdict CORRECT · 1985 ms

**Task:** Right: Tom can cook. Wrong: Tom can cooks. After can, use the plain verb, with no -s.
Correct this sentence: "He can sings."

**Learner:** He can sing.

**Claude (saved):**
> Yes, "He can sing." is right. Next:
> Complete: "I ___ ride a bike. I never learned."

**DeepSeek (now):**
> Yes, "He can sing." is right. After can, the verb has no -s.
>
> Next, complete this sentence: "I ___ ride a bike. I never learned."

**eng14** · adult · English · verdict NOT_EVALUATED · 3213 ms · failed: verdict

**Task:** Hello! Here is your exercise. Read it and write your answer.
What time is the lesson?

**Learner:** the lesson time (no text given)

**Claude (saved):**
> Your answer needs a clock time. Look at this example. A: Dinner is at seven. B: No, half past seven. Half past seven means 7:30.
> Rule: the last time people agree is the answer.
> Right: "half past seven". Wrong: "seven".
> Now you try. A: The film is at six. B: No, half past six. When is the film?

**DeepSeek (now):**
> I don't see your answer yet. Read the short text again:
> A: Is the lesson at five?
> B: No, it is at six.
> Look at B's line. What time is the lesson? Write the time.

**eng15** · adult · English · verdict PARTIALLY_CORRECT · 2514 ms

**Task:** Hello again! Look: "A: Is the bus at three? B: No, at four." The bus is at four. Rule: the final time is the last time they agree on. Example: the bus is at four. New words: half past seven means 7:30. Now you: "A: Is the train at half past four? B: No, half past five." What time is the train?

**Learner:** half past fife

**Claude (saved):**
> "half past" is right, and you found the final time. One spelling slip: five.
> New word: quarter past seven means 7:15.
> Now try: What time do they meet? Text: "A: See you at quarter past two. B: Great, quarter past two."

**DeepSeek (now):**
> Almost. "half past" is right. One word has a spelling mistake: "fife". Think of the number 5 — how do you spell it? Try the same question again.

**eng16** · under 9 · English · verdict INCORRECT · 2401 ms · ⚠ Hint spells the answer: "b, a, g".

**Task:** Look: "This is a pen." Use the right name for the object. Right: "I read a book," not "I read a bag." You put books in it. Write: "This is a ___."

**Learner:** pag

**Claude (saved):**
> Good try! The last two letters are right. Check the first letter of the word.
>
> Write it again: "This is a ___."

**DeepSeek (now):**
> Good try! "pag" is not an English word. Look at the letters: b, a, g. Write it again: "This is a ___."

**eng17** · 9–12 · English · verdict INCORRECT · 2436 ms

**Task:** Read all the question first. Find the name that fits all of it. Example: "Mia starts at 3. Leo starts at 4." Who starts at 4? Right: Leo. Wrong: Mia. Try again: Who eats at 7?

**Learner:** Sam

**Claude (saved):**
> The answer is Ben, because Ben eats at 7. Right: Ben. Wrong: Sam.
> Now try on your own: "Ana is in room 2. Omar is in room 3." Who is in room 3?

**DeepSeek (now):**
> The answer is Ben. The question asks who eats at 7, and Ben eats at 7.
>
> Right: Leo starts at 4. Wrong: Mia starts at 4.
>
> New one: "Ana has a red bag. Ben has a blue bag." Who has a blue bag?

**eng18** · teen · English · verdict CORRECT · 2288 ms

**Task:** Hello! Here is your exercise. Choose the right word.
Write in, on or at: My train leaves ___ 5 o'clock.

**Learner:** at

**Claude (saved):**
> Yes, "at" is correct. Example: The bus leaves at 8:30. Rule: use at before a clock time. Wrong: The bus leaves in 8:30. Now try this one.
> Write in, on or at: They get married ___ April.

**DeepSeek (now):**
> Yes, "at" is right with a clock time. Here is a worked example: The film starts at eight o'clock. So we say "at" before a clock time. Wrong: The film starts on eight o'clock.
>
> Next: Write in, on or at: They get married ___ April.

**eng19** · adult · English · verdict INCORRECT · 2880 ms

**Task:** Hello again! Look: "What is your name?" "My name is Sara." Rule: answer with a full sentence, not one word. Example: My name is Sara. Now you: What is your favourite colour? Answer with a full sentence.

**Learner:** Blue.

**Claude (saved):**
> "Blue." answers the question, but it is one word.
> Rule: answer with a full sentence, not one word.
> Right: My pet is a cat. Wrong: A cat.
> Try again: What is your favourite colour? Answer with a full sentence.

**DeepSeek (now):**
> You gave one word. The rule: answer with a full sentence, not one word. For example: My name is Sara. Now try again: What is your favourite colour? Answer with a full sentence.

**eng20** · under 9 · English · verdict INCORRECT · 2086 ms

**Task:** "This is my" is right again. Check the letter after "m" in the family word.
Write the sentence again.

**Learner:** This is my grandmthr.

**Claude (saved):**
> The word is "grandmother". It is "grand" and "mother" together.
> Right: "This is my sister." Wrong: "This my sister."
> Now write one sentence to introduce your brother.

**DeepSeek (now):**
> The word is "grandmother". Right: This is my sister. Wrong: This is my sistr.
> Now write one sentence to introduce your mother.

# ENARA vs plain AI tutor: transcript casebook (Experiment 3)

**AI-simulation findings only. Not evidence about real learners.** Every quote below is copied from the recorded transcripts in `runs/full-experiment-3/raw/blocks.jsonl` (condition A = ENARA, C = plain AI tutor). Quotes are shortened with "…" where marked; nothing is invented.

## How the cases were chosen

88 A–C block pairs share the same outcome, the same observed pre-test score, the same held misconception and the same "already knows" flag (from the audit log) but are different students. Cases were picked from that pool by category: biggest ENARA losses, biggest wins, similar scores, both failing, stubborn misconception, good post-test but poor retention. Eight pairs (nine transcripts-with-notes) are read in full below. This is a selection by outcome category, not a random sample, so the patterns are **hypotheses with transcript evidence**, not measured effect sizes. The simulated learner is a language model that keeps only a self-written note, so "what the student needed" is read from its messages and persona flags.

Caveats that apply to every case: students differ in hidden profile (A and C students are different people), a block is 6 tutor turns only, and the sessions end when the turn budget ends (ENARA is not designed for a 6-turn cap).

---

## Case 1: FN-01 Polite requests (ENARA loses; both started at 0)

*A: r1-S047-FN-01 (pre 0, post 0, transfer 0, delayed 0). C: r3-S010-FN-01 (pre 0, post 1, transfer 1, delayed 1).*

1. **What the student needed.** A blunt-request habit ("Give me…") and a belief that it is "okay with friends". The student needed a usable rule for *when* to ask politely and one reliable polite form.
2. **What ENARA did.** Gave one model ("Can I have a tea, please?"), then asked the student to fix "Give me a coffee." The student complied but kept saying the old form was fine. ENARA answered the same objection three times with the same correction, once conceding: *"With friends, 'Give me' is usually okay."* It never offered a second polite form or a general rule of thumb. The student's note ended: *"'Bring me' and 'Give me' are okay with friends and short, so they're fine… I'll mostly use 'Can I have…' with them now."*
3. **What the plain tutor did.** Opened with two ready phrases (*"Can I have… please?"*, *"I would like… please."*), asked the student to try, then answered the friend-objection with a rule of thumb: *"'Can I have…' is the safe choice. It is good for every situation."* The note: *"When I'm not sure, I use 'Can I have…' because it is safe with everyone."*
4. **More effective.** The plain tutor.
5. **Exact pedagogical reason.** The plain tutor gave the student a **decision rule** that resolved the "friends" objection. ENARA repeated a verdict, acknowledged the objection but did not convert it into a rule, and conceded a case the lesson was meant to correct.
6. **What ENARA should do differently.** When a learner defends the error with a reason ("okay with friends"), state the *scope rule* once ("with people you do not know, always ask"), supply a default form, and stop repeating the same correction.

## Case 2: GR-07 Prepositions in/on/at (ENARA loses; persistent misconception)

*A: r1-S021-GR-07 (pre .50, post 0, transfer 1, delayed .50). C: r1-S037-GR-07 (pre .50, post .75, transfer 1, delayed .50).*

1. **Needed.** A student who believes "at" works for every time word (*"My teacher said at for everything with time"*) needed the whole in/on/at system.
2. **ENARA.** Hint ladder by question: *"Look at the word 'Saturday.' Is it a clock time?"* (turn 2), *"Which word goes with a day: in, on or at?"* (turn 3), the same shape again in turn 4. The full rule was first stated in turn 5 and covered only **at** and **on**. "in" is named only in the turn-1 goal line; it is not explained (months) until turn 6, which ends on *"Is April a day? … Look again and write the sentence one more time."* The learner's note: *"Months: not sure yet. I think maybe 'at April'."* Post-test 0.
3. **Plain tutor.** Turn 1 gave the **complete system** (*at + clock time, on + day, in + month*), then adapted when the student stayed confused: *"I think the word 'time' is confusing you. Let's not use that word. Let's use 3 boxes instead"*, and later a number trick. The note: *"Days… use on… at is for o'clock times… in is for months."*
4. **More effective.** The plain tutor.
5. **Reason.** **Coverage and strategy change.** ENARA repeated one hint shape for three turns and ran out of turns before teaching the third preposition; the plain tutor presented the whole structure first and switched explanation style when the first one failed. (Confirmed from the transcript; "ran out of turns" is a property of the 6-turn cap.)
6. **Change.** Plan coverage of **all** success criteria in the lesson up front (the lesson spec lists in/on/at), and switch strategy after two unproductive hint rounds instead of repeating the same hint shape.

## Case 3: WR-05 Commas in lists (ENARA loses; thin closure)

*A: r1-S038-WR-05 (pre 0, post .25, transfer .25, delayed .25). C: r2-S042-WR-05 (pre 0, post 1, transfer 1, delayed .50).*

1. **Needed.** The student wrote lists with no commas (and "and" before each item).
2. **ENARA.** Corrected quickly and well (the student produced correct lists by turn 2–4). But turns 2 and 4 added a side-topic (*"Some writers… do add a comma before 'and.'"* and *"in our course style"*), the student began asking why there is no comma before "and", and turns 5–6 went to a different issue (repeated "I" before verbs). No final rule check; the last turn assigned a new task. The note keeps the confusion: *"Don't put a comma before 'and', because the course style leaves it out."*
3. **Plain tutor.** Named the old rule directly (*"We usually don't use 'and' before each item"*), showed ❌/✅, countered the student's insistence on the old rule with *"it makes the sentence long and tiring to read"*, then in turn 5 asked: *"Can you tell me the rule in your own words?"*. The note restates the whole rule, including the old-rule comparison.
4. **More effective.** The plain tutor.
5. **Reason.** **Closure and consolidation.** ENARA followed the student's questions into side issues and never summarised or asked for the rule in the student's own words; the plain tutor ended with a rule-in-own-words check that fixed the target rule in the note. (ENARA has a rule-check behaviour in its engine, but only 14 of 150 ENARA blocks contain such a request; see the main report.)
6. **Change.** Reserve the last 1–2 turns for a rule-in-own-words check and a recap; answer side questions in one line and return to the target criterion.

## Case 4: WR-04 Email opening and closing (ENARA wins; persistent misconception)

*A: r2-S027-WR-04 (pre 0, post 1, transfer 1, delayed .50). C: r3-S035-WR-04 (pre 0, post 0, transfer 0, delayed 0).*

1. **Needed.** A student who believed *"'Thanks' is polite, so I think it is fine for a teacher too."*
2. **ENARA.** Did not cave: *"'Thanks' … works well when you are thanking the teacher for something… But many formal emails are not thank-you emails."* Then it changed the context to test transfer: *"Now change the tone. This time the email is to a friend… Think about which greeting and closing…"*. The student's note: *"'Thanks' is only for when I really thank someone."*
3. **Plain tutor.** Gave a correct answer early but then **conceded to the misconception**: *"You're right, 'Thanks, Ana' is fine for friends!"* and later *"'Thanks' is a real closing. People use it a lot, even with teachers, when they ask for help."* The student's note: *"I still think 'Thanks, Ana' works fine, even for teachers."*
4. **More effective.** ENARA.
5. **Reason.** **Holding the correct line, then testing transfer.** The plain tutor validated the learner's reason (sycophancy); ENARA stated a condition under which the belief is true, kept the correction and checked it in a new context.
6. **What to preserve.** This is core ENARA behaviour worth protecting in any change.

## Case 5: GR-01 Irregular past verbs (ENARA wins; student's own error used)

*A: r1-S009-GR-01 (pre 0, post 1, transfer .75, delayed .25). C: r3-S044-GR-01 (pre 0, post 0, transfer 0, delayed 0).*

1. **Needed.** The student added -ed to everything (*"I think past is always -ed"*).
2. **ENARA.** Used the student's own error as a diagnostic question: *"Why did you put -ed on the end?"*; the student answered *"Because I think past is always -ed? So maybe 'took' is right."* ENARA then gave independent items (*had, told*) and an open task (*go, buy, see*) where the student's errors (*goed, buyed*) revealed what was left.
3. **Plain tutor.** Supplied the list (*go→went, buy→bought, see→saw, take→took*) and fixed each wrong sentence for the student (❌/✅). The learner kept the belief throughout: *"I still think maybe some irregular verbs get -ed too, like goed."*
4. **More effective.** ENARA.
5. **Reason.** **Eliciting the learner's reasoning, then independent production.** The plain tutor did the correcting itself; ENARA made the learner produce the correction.
6. **Preserve** the diagnostic "why did you choose it?" move. ENARA's own gap here: delayed retention 0.25, because the session ended with the student still unsure about go/buy/see (closure again).

## Case 6: RD-02 True / False / Not given (similar scores, different quality; delayed gap)

*A: r2-S046-RD-02 (post .50, transfer .50, delayed .25). C: r3-S018-RD-02 (post .50, transfer .50, delayed 1.00).*

1. **Needed.** The student labelled every "not mentioned" statement as *false*.
2. **ENARA.** Turn 2 confirmed a correct answer for a good reason, turn 3 asked *"Which one matches 'the text does not say'? Try again"*; the student repeated *"false, because the text does not say it"* in turns 3, 4 and 5 and the tutor responded with hint-shaped questions each time (*"Not yet. Your reason is good, but it does not match 'false.'"*). Only in turn 5 did it use an analogy (*"I have a ball… Do you know if your friend has a kite?"*). Note: *"…it does not say two either. So I still think false, no?"*
3. **Plain tutor.** Every turn restated the contrast and the **diagnostic phrase**: *"'The text does not say…' is the reason for not given. For false, say what the text does say."* Its student also still said "false" five times, but the note records the contrast and delayed retention was 1.00.
4. **More effective.** Plain tutor (on retention; equal on post and transfer).
5. **Reason.** **Explicit contrastive criterion, repeated.** The plain tutor gave the learner a sentence they could say to themselves; ENARA's hints were correct but did not name the criterion until late.
6. **Change.** For reading classification tasks, state the contrastive criterion once as a "test sentence" and use try-first on the *application*, not on discovering the criterion.

## Case 7: FN-07 Booking by phone (both fail)

*A: r1-S017-FN-07 (all 0). C: r2-S002-FN-07 (post .25, rest 0; an "adversarial", slow-learner profile).*

1. **Needed.** A blunt "I want…" habit plus missing words (*"I want table…"*).
2. **ENARA.** Each turn: *"Your sentence works."* then a small tip; *"'I want' … it can sound like a demand"* — but the student wrote *"I want table near the window, please"* in turn 6. The note: *"I think 'I want' is okay if I say please."* The transcript repeats tips about "I want" without a practice loop on the polite form.
3. **Plain tutor.** Corrected line by line (*"I'd like to… ❌/✅"*) and built a long phrase in pieces; the student still said *"I still think short sentences are OK when I'm in a hurry"*.
4. **More effective.** Neither. The plain tutor had a small post-test (0.25) after heavy correction.
5. **Reason.** Hypotheses only: the simulated learner (persistent-misconception profiles) did not integrate corrections into its note; ENARA's pattern is "praise, then one tip" which a persistent belief ignores.
6. **Change.** Insufficient evidence from this pair. A both-fail outcome list is in the main report.

## Case 8: RD-04 Main idea (stubborn misconception; both fail)

*A: r1-S012-RD-04 (pre .50, post 0, transfer 0, delayed .25). C: r3-S036-RD-04 (pre .50, post .25, transfer .25, delayed .25).*

1. **Needed.** The student chose over-general or detail answers (*"Sport is popular"*).
2. **ENARA.** Good diagnostic move: *"why did you choose that one instead of your first idea?"*, a checking strategy (*"Does it cover all the sentences? Does it stay inside the text?"*). But the student's one-letter answers in turns 5–6 (*"B"*, *"C"*) were confirmed without asking *why*, and turn 6 asked for a **written** text and main idea — a production task for a multiple-choice reading outcome. The learner's note: *"Main idea: Sport is popular."*
3. **Plain tutor.** Walked through each distractor with the text lines (*"Only one part of one sentence talks about fish. So 'Penguins eat fish' is too small"*), accepted a correct reasoning once (*"Sport is better because… sport covers both"*) and explained why option A was too general. Post-test .25.
4. **More effective.** Plain tutor slightly (both failed).
5. **Reason.** Two ENARA points are confirmed from the transcript: confirmation of letter-only answers without a reasoning prompt, and a task type that does not match the assessed skill. Whether they caused the post-test zero is **not established**: the learner is a slow, inconsistent, fast-forgetting profile and its note kept the original misconception.
6. **Change.** For multiple-choice reading items require a one-line justification before confirming; keep follow-up tasks in the assessed format.

## Case 9: WR-05 high post-test, zero retention (ENARA)

*A: r1-S014-WR-05 (pre 0, post .75, transfer 1, delayed 0).*

1. **Needed.** A student who asked directly in the last turn: *"Is the comma after 'and' wrong?"*
2. **ENARA.** Answered with *"Before I explain, try to remember the rule: Wha…"* and the 6-turn session ended there. The note: *"…I still think the comma before 'and' is needed in a list. Is that right?"* Delayed retention 0.
3. **Plain tutor** (r1-S046-WR-05, same outcome and pre state): post .75, transfer .75, delayed .25.
4. **More effective.** Slightly the plain tutor on retention (one pair; not distinguishable).
5. **Reason.** **Session ends mid-question.** ENARA's try-first rule withheld the answer to a direct question at the moment the session ended.
6. **Change.** Track remaining turns; when the budget is nearly spent, answer open learner questions and recap instead of deferring.

---

## What the nine cases show together

**Where ENARA behaved better (cases 4, 5):** it keeps the correct position against a confident wrong belief, it elicits the learner's reasoning ("why did you choose that?"), and it tests the idea in a new context. The plain tutor conceded to a wrong belief (case 4) and did the correcting for the learner (case 5).

**Where ENARA behaved worse (cases 1, 2, 3, 6, 9):** it repeats one hint shape for several turns, can leave a lesson criterion untaught (case 2), follows side questions without consolidating (case 3), withholds the criterion label in reading tasks (case 6), and ends sessions without a recap or with a direct learner question unanswered (cases 3, 5, 9). These are process observations from selected transcripts, consistent with the closure counts in the main report (recap in the last tutor turn: ENARA 6.7% of blocks vs 31.3% for the plain tutor, a text-pattern measure).

**Not shown by the cases:** that ENARA's overall effect is lower; aggregate scores show no difference. The case selection favours extremes.

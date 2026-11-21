# DeepSeek on lms-test: report and replies (21 Nov 2026)

Tutor track, lms-test only; test.enara.app stayed frozen. The key was never shown, logged or committed.

## 1. Does it work? **Yes, on lms-test now.**
| Item | Result |
|---|---|
| Model | `deepseek-ai/DeepSeek-V4.1-Flash-1017` (from `GET /v1/models`) |
| API | OpenAI-style chat completions; `Authorization: Bearer` works (the Modal-Key/Secret split was not needed) |
| Streaming | Works: first word after **0.41 s**, whole reply in 0.59 s |
| Limits | 1M-token context, long output allowed; reads text (and images; we send text only, PDFs are left out) |
| Latency | First call **0.50 s** (no cold start seen: the server was already warm); warm calls **0.65 s**; real tutor turns **0.79 s** on average (0.41–1.69 s) |
| Live | #64 switch, #65 reasoning off + model id, #66 rule reminder: all passed E2E and are live |

**What I had to fix**
1. **Empty replies** (#65): the model "thinks" first, and the thinking used the whole reply budget. Thinking is now off.
2. **Missing grading line** (#66): the hidden `[[assess …]]` line was often left out. A 3-line reminder at the end of the system prompt helps. `repairOnce` also asks once more when the line is missing.

All engine checks still run on DeepSeek's replies: child trim, one task, the grading line, grading. Anthropic is still the default everywhere else.

## 2. DeepSeek vs Claude (20 saved turns)
- **The turns:** 5 under-9, 5 aged 9–12, 5 teens, 5 adults, with right, wrong and stuck learners.
- **Sent the real way:** our full instructions and the earlier conversation.
- **Judged by:** me. I am a Claude model, so there may be some bias.

| | Claude | DeepSeek |
|---|---|---|
| Follows our rules (one task, length, English only, no answer given away, correct English) | 40/40 (100%) | 38/40 (95%) |
| Teaching quality | 40/40 (100%) | 35/40 (88%) |
| Grading line present | 20/20 | 17/20 |
| Grading line fully right | 20/20 | 14/20 (70%) |

**In short:** DeepSeek is fast and mostly follows the rules. It is weaker at spotting the exact mistake and at the hidden grading line. It is fine as a stand-in on lms-test, but not as good as Claude.

### The 3 worst DeepSeek replies
1. **#3, under 9, "poard":** "Close! Check the letter after "o" in your word". The wrong letter is the **first** one (p → b), so the hint points to the wrong place. It also has no grading line.
2. **#8, teen, "in" for a clock time:** a confusing example ("We sleep in the night" called the wrong word), then "tell me what you were thinking" instead of a retry task.
3. **#16, under 9, "pag":** "Think of the bag for books". That gives the answer away.

## 3. Cost per session (20 tutor turns, about 3,000 tokens in and 70 out per turn in this test)
| | Price per million tokens (in / out) | Per session |
|---|---|---|
| Claude Opus 5.5 (our current tutor model) | $4 / $20 | about **$0.27** (about $0.08 when the prompt cache works well) |
| DeepSeek on Modal | **Not known.** Modal bills GPU time, not tokens, and I can't see the Modal bill from here. The system uses a safe upper bound of $1 / $4 for budgets. | at most about **$0.07** at that bound |

Real sessions with course materials have longer prompts, so both costs go up by the same proportion. To get the true DeepSeek cost, divide the Modal bill for a day by the tokens in the usage ledger. I can do that if you send me the day's Modal cost.

## 4. How to switch back
When you say **"key set"** (a valid `ANTHROPIC_API_KEY` on enara-lms-test), I'll open one small PR that sets `TUTOR_LLM_PROVIDER=anthropic` in `deploy/lms-test.flags.json`. Once E2E passes, the pipeline sets it and the tutor is back on Claude. The DeepSeek settings can stay; they do nothing while the provider is `anthropic`.

## 5. Score per turn (DeepSeek)
| # | Age | Learner | Rules | Teaching | Grading line | Time | Note |
|---|---|---|---|---|---|---|---|
| 1 | under 9 | right | 2/2 | 2/2 | ✓ | 532 ms | — |
| 2 | under 9 | right | 2/2 | 2/2 | ✓ | 908 ms | — |
| 3 | under 9 | stuck | 2/2 | 0/2 | ✗ | 505 ms | No grading line. Wrong hint: the mistake is the first letter (p → b), not "the letter after o". |
| 4 | 9–12 | right | 2/2 | 2/2 | ✓ | 656 ms | — |
| 5 | 9–12 | right | 2/2 | 2/2 | ✓ | 594 ms | — |
| 6 | 9–12 | stuck | 2/2 | 2/2 | ✓ | 809 ms | — |
| 7 | 9–12 | stuck | 2/2 | 2/2 | ✓ | 686 ms | Small slip in the grading line ("criteria=N"). |
| 8 | teen | wrong | 1/2 | 1/2 | ✓ | 793 ms | Confusing example ("We sleep in the night" called the wrong word); asks for their thinking but gives no retry task. |
| 9 | teen | right | 2/2 | 2/2 | ✗ | 551 ms | Grading line says next=NONE but a new task is given. |
| 10 | teen | stuck | 2/2 | 2/2 | ✓ | 1013 ms | — |
| 11 | teen | right | 2/2 | 2/2 | ✓ | 859 ms | — |
| 12 | adult | wrong | 2/2 | 2/2 | ✓ | 946 ms | — |
| 13 | adult | right | 2/2 | 2/2 | ✓ | 613 ms | — |
| 14 | adult | wrong | 2/2 | 2/2 | ✓ | 1689 ms | — |
| 15 | adult | right | 2/2 | 2/2 | ✗ | 1140 ms | Grading line has no "relevance" and says next=NONE but gives a new task. Good spelling feedback. |
| 16 | under 9 | stuck | 1/2 | 1/2 | ✓ | 580 ms | Gives the answer away to an under-9 ("Think of the bag"). |
| 17 | 9–12 | wrong | 2/2 | 2/2 | ✗ | 769 ms | No grading line. |
| 18 | teen | right | 2/2 | 2/2 | ✓ | 836 ms | — |
| 19 | adult | stuck | 2/2 | 2/2 | ✗ | 828 ms | Grading line says next=NONE (should be SAME_ITEM), empty "item=". |
| 20 | under 9 | wrong | 2/2 | 1/2 | ✗ | 405 ms | No grading line; no praise or hint, just the answer. |

## 6. All 20 replies, side by side
The hidden grading line is shown here; learners never see it.

### 1. under 9, right learner
**Learner:** The cat is big.

**Claude (saved):**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM item=w1]]
> Yes! "The cat is big." has a capital T.
> Write 3 sentences about your teacher.

**DeepSeek:**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1,2 next=NEW_ITEM item=w1]]
> "The cat is big." is right: capital T and a full stop. Now write 3 sentences about your teacher.

### 2. under 9, right learner
**Learner:** am

**Claude (saved):**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=3 next=NEW_ITEM item=w2]]
> Yes, "am" is right.
> Write these words as two sentences: my uncle ___ a driver he has a white van

**DeepSeek:**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=3 next=NEW_ITEM item=w2]]
> Yes, "am" is right there.
>
> Now write these words as two sentences: my uncle ___ a driver he has a white van

### 3. under 9, stuck learner
**Learner:** poard

**Claude (saved):**
> [[assess verdict=PARTIALLY_CORRECT relevance=ACTIVE_ITEM next=SAME_ITEM item=v2]]
> Nice try! You are close. Check the first letter of your word.
> Write it again: The teacher writes on the ___.

**DeepSeek:**
> Close! Check the letter after "o" in your word, then write it again.

### 4. 9–12, right learner
**Learner:** milk

**Claude (saved):**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM]]
> Yes, "milk" is right. Good job!
> Now write one sentence about a person you know, using a food word.

**DeepSeek:**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM]]
>
> Yes, milk is right! Nice work.
>
> Now write one sentence about a person you know, using a food word.

### 5. 9–12, right learner
**Learner:** fish

**Claude (saved):**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM]]
> Yes, "fish" is right! Now write one sentence about a food you like. Start with: I like

**DeepSeek:**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM]]
>
> Yes, fish is right. Good work.
>
> Now you write: I like ___ .

### 6. 9–12, stuck learner
**Learner:** in

**Claude (saved):**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]
> Good try! Use at before a clock time. Right: "We swim at 5:00." Wrong: "We swim in 5:00."
> Write in, on or at: School ends ___ 3:00.

**DeepSeek:**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]
> Use at with a clock time. Right: "The film starts at 6:00." Wrong: "The film starts in 6:00."
> Try again: School ends ___ 3:00.

### 7. 9–12, stuck learner
**Learner:** in

**Claude (saved):**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM focus=E1]]
> Rule: on goes with a day, in with a month.
> Right: We play on Sunday.
> Wrong: We play in Sunday.
> Try again: Write in, on or at: We swim ___ Friday.

**DeepSeek:**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM criteria=N next=SAME_ITEM]]
> Good try. We use "on" with days: right, "We meet on Tuesday"; wrong, "We meet in Tuesday". Now try again: We swim ___ Friday.

### 8. teen, wrong learner
**Learner:** in

**Claude (saved):**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]
> Your answer "in" does not fit a clock time. Example: The film starts at half past nine (9:30). Rule: use "at" before a clock time. Right: The bus comes at half past eight. Wrong: The bus comes in half past eight. Now try: School ends ___ half past three. Write in, on or at.

**DeepSeek:**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]
>
> Look at a clock time like this one: "The film begins at seven o'clock." We say **at** with a clock time. "We sleep in the night" shows the wrong word. So for your train sentence, tell me in your own words what you were thinking.

### 9. teen, right learner
**Learner:** at

**Claude (saved):**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM item=p2]]
> Yes, "at" is right with half past eight. Next:
> Write in, on or at: They get married ___ April.

**DeepSeek:**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NONE]]
> "At" is right for a clock time. Now, second example: "My birthday is ___ July." Write at, on or in.

### 10. teen, stuck learner
**Learner:** the first day named in the message

**Claude (saved):**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]
> The first day is not always the answer. Read the whole question, then pick the day that fits it. Example: "Sam comes on Monday. The party is on Friday." Question: "What day is the party?" Right: Friday. Wrong: Monday.
> Sorry, the message was missing. Here it is: "Practice is on Wednesday. The game is on Saturday." What day is the game?

**DeepSeek:**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]
>
> The first word of that type in a message is not always the answer. The question decides.
>
> For example: "The bus leaves at 8:00. The film starts at 8:15." For "When does the film start?", 8:15 fits, not 8:00.
>
> Now try the same question again: Read the message. What day is the game?

### 11. teen, right learner
**Learner:** 2

**Claude (saved):**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=2,3 next=NEW_ITEM item=r2]]
> Yes, 2 is right. It fits the whole question.
> Next, read a new message and answer.
> Read the message. What time does the game start? Text: "Hi Mona! The football game is on Thursday. It is not on Monday this week. Ali brings the ball at 5:15. The game starts at 5:30. Meet me at the sports hall, not at the gate. Bring 3 friends and 1 bottle of water. From Jamal"

**DeepSeek:**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=2,3 next=NEW_ITEM item=r2]]
> Yes, "2" is right — the message says "not 3". Next, read this message and answer:
>
> Read the message. What time does the game start?
> Text: "Hi Mona! The football game is on Thursday. It is not on Monday this week. Ali brings the ball at 5:15. The game starts at 5:30. Meet me at the sports hall, not at the gate. Bring 3 friends and 1 bottle of water. From Jamal"

### 12. adult, wrong learner
**Learner:** She can swims.

**Claude (saved):**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]
> You wrote the sentence without a change. Look: Ana can sing. After can, the verb does not change. Wrong: Ana can sings. Now you: correct "Tom can cooks."

**DeepSeek:**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]
> You copied the sentence without changing it. Good first step is to ask: what needs to change?
>
> Here is the rule, in one plain sentence: after "can", the action word stays plain, like "They can cook."
> Wrong example: "He can cooks."
> Your turn: look at "She can swims" and tell me what in it needs to change.

### 13. adult, right learner
**Learner:** He can sing.

**Claude (saved):**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM item=g2]]
> Yes, "He can sing." is right. Next:
> Complete: "I ___ ride a bike. I never learned."

**DeepSeek:**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM item=g2]]
> That's right: after can, the verb stays plain, no -s.
>
> Now complete this sentence:
> "I ___ ride a bike. I never learned."

### 14. adult, wrong learner
**Learner:** the lesson time (no text given)

**Claude (saved):**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]
> Your answer needs a clock time. Look at this example. A: Dinner is at seven. B: No, half past seven. Half past seven means 7:30.
> Rule: the last time people agree is the answer.
> Right: "half past seven". Wrong: "seven".
> Now you try. A: The film is at six. B: No, half past six. When is the film?

**DeepSeek:**
> [[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM item=p1]]
>
> Let me show you how I read a time dialogue. In "A: Is the class at eight? B: No, at nine," I look at B's line, because it changes the time.
>
> Rule: the last time you read is the answer.
>
> Right: "A: Is it at six? B: No, at seven." The answer is seven. Wrong: saying six, because B changed it.
>
> Now read this and answer: "A: Is the lesson at five? B: No, it is at six." What time is the lesson?

### 15. adult, right learner
**Learner:** half past fife

**Claude (saved):**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1,2 next=NEW_ITEM item=p2]]
> "half past" is right, and you found the final time. One spelling slip: five.
> New word: quarter past seven means 7:15.
> Now try: What time do they meet? Text: "A: See you at quarter past two. B: Great, quarter past two."

**DeepSeek:**
> [[assess verdict=CORRECT criteria=2 next=NONE]]
> Good — "half past" is right, and the time is the time in the last reply. Small spelling: "five", not "fife". The train is at half past five, so 5:30.
>
> Now read this: "A: See you at quarter past two. B: Great, quarter past two." What time do they meet?

### 16. under 9, stuck learner
**Learner:** pag

**Claude (saved):**
> [[assess verdict=PARTIALLY_CORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]
> Good try! The last two letters are right. Check the first letter of the word.
>
> Write it again: "This is a ___."

**DeepSeek:**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]
>
> "pag" is not an English word for a school thing. Think of the bag for books. Try again: "This is a ___."

### 17. 9–12, wrong learner
**Learner:** Sam

**Claude (saved):**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]
> The answer is Ben, because Ben eats at 7. Right: Ben. Wrong: Sam.
> Now try on your own: "Ana is in room 2. Omar is in room 3." Who is in room 3?

**DeepSeek:**
> Read the question again: it says at 7. Sam eats at 6, Ben eats at 7. The answer is Ben. Now try this one: In the message "Zara meets Ana at the park. Zara meets Kim at the shop", where does Zara meet Kim?

### 18. teen, right learner
**Learner:** at

**Claude (saved):**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM item=p2]]
> Yes, "at" is correct. Example: The bus leaves at 8:30. Rule: use at before a clock time. Wrong: The bus leaves in 8:30. Now try this one.
> Write in, on or at: They get married ___ April.

**DeepSeek:**
> [[assess verdict=CORRECT relevance=ACTIVE_ITEM criteria=1 next=NEW_ITEM item=p2]]
>
> "at" is correct before a clock time. Here is one worked example: We meet at 6 o'clock. We say "at" with clock times. The wrong form is "We meet on 6 o'clock."
>
> Now this one:
> Write in, on or at: They get married ___ April.

### 19. adult, stuck learner
**Learner:** Blue.

**Claude (saved):**
> [[assess verdict=PARTIALLY_CORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]
> "Blue." answers the question, but it is one word.
> Rule: answer with a full sentence, not one word.
> Right: My pet is a cat. Wrong: A cat.
> Try again: What is your favourite colour? Answer with a full sentence.

**DeepSeek:**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM criteria= next=NONE item=]]
>
> The idea is right, but "Blue" is one word. A full sentence has a subject and "is": for example, "My car is old." Now try again: What is your favourite colour?

### 20. under 9, wrong learner
**Learner:** This is my grandmthr.

**Claude (saved):**
> [[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]
> The word is "grandmother". It is "grand" and "mother" together.
> Right: "This is my sister." Wrong: "This my sister."
> Now write one sentence to introduce your brother.

**DeepSeek:**
> The word is "grandmother". "This is my" is right.
> Now write one sentence to introduce your sister.

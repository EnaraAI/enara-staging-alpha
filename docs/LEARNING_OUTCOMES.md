# DRAFT — not yet reviewed (see docs/ASSESSMENT_REVIEW_LOG.md)

# Learning outcomes for ENARA English

*16 Nov 2026. A design. Nothing in the product uses it yet. Schema: `data/outcomes/schema.json`. Grader facts: `docs/GRADING_FOR_OUTCOMES.md`.*

## PART 1. Three levels

| Level | What it states | Example |
|---|---|---|
| **Course** | What a learner can do at the end of a course, by skill, at one CEFR level | "Can write a short paragraph about daily routine with correct present simple" (A2, writing) |
| **Lesson** | What one lesson adds | "Uses he/she/it + -s for routines" (A2, writing) |
| **Form/function** | One form or function, testable in a few items | "Adds -s/-es after he/she/it in the present simple" (A2, grammar) |

Each lesson outcome links up to a course outcome; each form outcome links up to one or more lesson outcomes.

## PART 2. Required fields

| Field | Rule |
|---|---|
| `id` | See PART 4 |
| `level` | `course`, `lesson` or `form` |
| `cefr` | A1, A2, B1, B2, C1 (C2 allowed, not used yet) |
| `skill` | `reading`, `writing`, `listening`, `speaking`, `grammar`, `vocabulary`, `function` |
| `statement` | "Can …" sentence, plain English |
| `verb` | One verb from the observable list |
| `condition` | Under what conditions (prompt type, support, time, length) |
| `criterion` | How well (e.g. "8 of 10 items correct", "rubric level 3 of 4 on criterion X") |
| `lessonIds` | Linked lesson ids (inventory ids in PART 8 until lessons have real ids) |
| `parentIds` | Linked higher-level outcome ids |
| `l1ErrorTypes` | Arabic-L1 error types from framework §9 the outcome watches (list below) |
| `evidenceTypes` | What counts as evidence (list below) |
| `measurable` | `yes` or `NOT_MEASURABLE_YET` with a reason |
| `mastery` | Fixed rule, PART 3 |

**Observable verbs (allowed):** write, complete, choose, match, order, identify, underline, correct, rewrite, combine, answer, ask, say, name, list, describe, compare, explain, summarise, give (an opinion / reasons), use, spell, transform, punctuate.

**Banned verbs (not observable):** understand, know, learn, appreciate, be aware of, be familiar with, grasp, feel confident, master, internalise, think about.

**Arabic-L1 error types (framework §9; hypotheses, check against real errors):**
`article_indef_omission`, `article_def_misuse`, `copula_omission`, `verb_subject_order`, `adj_noun_order`, `resumptive_pronoun`, `run_on_and`, `present_perfect_avoidance`, `tense_aspect`, `agreement_3s`, `plural_s`, `spelling_vowel` (typed text), and audio-only `phon_p_b`, `phon_vowel`, `phon_cluster`, `phon_th` (NOT MEASURABLE YET).

**Evidence types:** `controlled_item` (exact / accepted answers), `guided_production` (sentence with a target), `free_production` (paragraph or longer, rubric), `reading_item`, `transcript_speaking` (speaking exam transcript; content only), `audio` (not available).

## PART 3. Mastery rule

- Three tests per outcome: **pre**, **post** (end of teaching), **delayed** (**7 days** after post, parallel items never seen in lessons).
- **MASTERED only if the criterion is reached on the delayed test.** Post alone gives at most `REACHED_AT_POST`.
- Statuses: `NOT_ASSESSED`, `BELOW`, `REACHED_AT_POST`, `MASTERED`, `NOT_RETAINED` (reached at post, missed at delayed).
- In agent studies the "delayed" test is not 7 days of memory and must be labelled a consistency check (roadmap §3). It can never give MASTERED.

## PART 4. Id scheme

`EN-<LEVEL>-<CEFR>-<SKILL>-<slug>[-<nn>]`
- LEVEL: `C` course, `L` lesson, `F` form/function.
- SKILL: `RD`, `WR`, `LS`, `SP`, `GR`, `VO`, `FN`.
- slug: lower case, hyphens, ≤ 30 characters. Example: `EN-F-A2-GR-third-person-s`, `EN-L-A2-WR-daily-routine`, `EN-C-A2-WR-everyday-writing`.
- Ids never change once used; a changed outcome gets a new id and `replaces`.

## PART 5. What to measure by level

| Band | Measure | Main evidence |
|---|---|---|
| **A1–A2** | Accuracy on core forms (be, articles, he/she, -s, past simple, plurals) and core vocabulary; short guided production (one or two sentences with a target) | Controlled items (deterministic), guided production |
| **B1–B2** | Connected text; linking words; tense control across a paragraph; reading main idea and detail; giving and supporting opinions | Free production with a rubric (model grader), reading items |
| **C1** | Register and appropriacy; complex structures; cohesion; inference; vocabulary precision | Rubric writing, inference reading items. **No C1 lessons exist yet.** |

**Listening and speaking.** The tutor is text-only. Listening outcomes: **NOT MEASURABLE YET** (no audio items). Speaking: **NOT MEASURABLE YET** in the tutor; the speaking exam (feature flag, transcript only) could later give content evidence, never pronunciation. Pronunciation: **NOT MEASURABLE YET**.

Note: the research "listening" lessons (`RS-*-LS-*` below) are text-based stand-ins; they measure reading of dialogue, not listening.

## PART 6. Example records

```json
{ "id": "EN-F-A2-GR-third-person-s", "level": "form", "cefr": "A2", "skill": "grammar",
  "statement": "Can add -s or -es to the verb after he, she and it in the present simple.",
  "verb": "complete", "condition": "Gap-fill sentences, no help, base verb given",
  "criterion": "8 of 10 correct", "lessonIds": ["LTB-A2-my-daily-routine"],
  "parentIds": ["EN-L-A2-WR-daily-routine"], "l1ErrorTypes": ["agreement_3s"],
  "evidenceTypes": ["controlled_item", "guided_production"], "measurable": "yes",
  "mastery": { "rule": "criterion_on_delayed", "delayDays": 7 } }
```

```json
{ "id": "EN-L-B1-WR-opinion-paragraph", "level": "lesson", "cefr": "B1", "skill": "writing",
  "statement": "Can write a paragraph giving an opinion with two reasons and linking words.",
  "verb": "write", "condition": "80–120 words, topic given, 20 minutes, no help",
  "criterion": "Level 3 of 4 on every rubric criterion (opinion, reasons, linking, tense control)",
  "lessonIds": ["SK-B1-an-opinion-paragraph"], "parentIds": [], "l1ErrorTypes": ["run_on_and", "tense_aspect"],
  "evidenceTypes": ["free_production"], "measurable": "yes",
  "mastery": { "rule": "criterion_on_delayed", "delayDays": 7 } }
```

## PART 7. Reporting design (design only)

**Per-learner report**
1. **Placement level** per skill (not one label), with date and source (placement test or teacher).
2. **Outcome table**: one row per outcome: id, statement, CEFR, pre / post / delayed score, status (PART 3), date of delayed test.
3. **Progress across CEFR over time**: per skill, a timeline of outcomes MASTERED at each level (count of A1, A2, B1… outcomes mastered per month). Shown as "working towards A2 in writing", never "is A2", and never a level change claimed from tutor use alone.
4. **Watch list**: Arabic-L1 error types seen most often (counts only, no learner text).
5. Outcomes marked NOT MEASURABLE YET are listed, greyed, with the reason.

**Per-class report**
1. Placement spread per skill (counts per CEFR band).
2. Per outcome: number of learners NOT_ASSESSED / BELOW / REACHED_AT_POST / MASTERED / NOT_RETAINED; mean pre, post, delayed.
3. Retention gap: share who reached at post but not at delayed.
4. Most common L1 error types in the class.
5. CEFR progress: per month, outcomes mastered per band, class total.

**Rules.** Counts and scores only; no learner text in reports. Small groups (< 5 learners) are not shown as percentages. Every number links to its stored evidence (attempt id, grading proposal id). Agent-study numbers are never shown in a learner or class report.

## PART 8. Inventory of existing English lessons

**Where they are.** No product seed (`backend/src/scripts/seed*.ts`) has an English lesson with `languageSpec`. Every English lesson with objectives is in a **benchmark or research fixture**. None has a lesson id or a CEFR tag on the lesson itself; the CEFR level comes from the case that delivered it. Ids below are **inventory ids** made for this list:
- `LTB` = language-teaching benchmark (`docs/benchmarks/language-teaching/20261109T-ltb-v1.0/benchmark_cases.jsonl`, same lessons in `fixture_v2` and `backend/benchmarks/ltc-v1/cases.mjs`)
- `OS` = outcome simulation (`.../20261112-outcome-sim-v1/outcome_cases.jsonl`)
- `SK` = skills benchmark (`.../20261112-skills-v1/skills_v1_cases.jsonl`)
- `LO` = LO experiment (`.../20261113-lo-experiment/lo_cases.jsonl`)
- `RS` = research outcomes (`research/deep-learning-simulation-v2/benchmark/outcomes/*.json`, own ids kept)
- `ESL1` = ESL stage-1 study (`research/deep-learning-simulation-v2/src/offline/eslFixtures.ts`), no CEFR on the lesson

**Counts:** A1 23, A2 29, B1 22, B2 20, C1 0, plus 3 ESL1 lessons with no CEFR tag (taught to A1, A2 and B2 learners). Total 97.

| Inventory id | CEFR | Title | Objectives | Success criteria |
|---|---|---|---|---|
| `LTB-A1-talking-about-my-family` | A1 | Talking about my family | Introduce a family member with "This is my …"; Say one fact about them with "He is / She is …" | Uses "This is my + family word" correctly; Chooses he/she correctly |
| `OS-A1-food-i-like` | A1 | Food I like | Name common foods and say what you like. | Names the food correctly; Uses "I like ..." with a food word |
| `OS-A1-can-for-ability` | A1 | Grammar: can for ability | Say what you can and can't do. | Uses can + base verb; Uses can't correctly |
| `OS-A1-there-is-there-are` | A1 | Grammar: there is / there are | Use there is/are with singular and plural. | Chooses is/are correctly; Uses a/some correctly |
| `OS-A1-sara-s-day` | A1 | Reading: Sara's day | Read a short text and find information. | Finds the right detail in the text; Answers in a short phrase |
| `OS-A1-a-shop-sign` | A1 | Reading: a shop sign | Understand a simple notice. | Finds the time on the notice; Says yes/no correctly |
| `OS-A1-things-in-my-classroom` | A1 | Things in my classroom | Name classroom objects. | Names the object correctly; Uses "This is a ..." |
| `RS-A1-FN-01` | A1 | Asking nicely | Ask for something politely using "Can I have ... please?" instead of a blunt command. | Uses Can/Could I have or I would like to request something; Adds please; Avoids bare commands like "Give me" |
| `RS-A1-FN-02` | A1 | Finding your way | Ask where a place is using "Where is ...?" or "How do I get to ...?" with the verb included. | Uses Where is / Where are or How do I get to; Includes the verb be; Opens politely with Excuse me when asking a stranger |
| `RS-A1-LS-02` | A1 | How much is it? | Pick out prices and quantities in a short written dialogue, telling apart pairs such as 13/30 and 15/50. | Tells -teen from -ty numbers; Finds the price actually paid after a discount or change |
| `RS-A1-WR-03` | A1 | Making sentences in order | Order words correctly in a simple English statement. | Puts the subject first, then the verb, then the object; Puts always/usually/never before the main verb; Puts place or time at the end |
| `RS-A1-RD-01` | A1 | Maria and her cat | Find a name, number, colour or time in a very short text by matching the question word to the right detail. | Matches the question word to the detail; Answers with the exact word or number |
| `RS-A1-VO-02` | A1 | Opposite words | Give the opposite of common adjectives and use opposites in sentences. | Gives the correct opposite word; Uses the opposite in a sentence |
| `RS-A1-RD-02` | A1 | Pedro's flat | Decide if a sentence about a short text is true, false or not given, using only what the text says. | Chooses true, false or not given from the text only; Uses not given when the text does not say |
| `RS-A1-VO-01` | A1 | Places in my home | Name the kitchen, bedroom, bathroom and garden and say what we do in each place. | Matches each place to its use; Uses the correct place word in a sentence |
| `RS-A1-GR-02` | A1 | Things around me | Use a, an and the with singular nouns. | Uses an before a vowel sound; Uses the for the second mention |
| `RS-A1-LS-01` | A1 | What time is it? | Identify the final time agreed in a short written dialogue, including changed times and quarter/half past or to. | Finds the final time after a correction; Converts half past, quarter past and quarter to into clock times |
| `RS-A1-GR-07` | A1 | When things happen | Use in, on and at with time words. | at + clock time; on + day; in + month |
| `RS-A1-WR-01` | A1 | Writing clear sentences | Write simple sentences with capital letters and full stops. | Starts every sentence with a capital letter; Writes the word I as a capital letter; Ends every sentence with a full stop |
| `SK-A1-at-a-caf` | A1 | Conversation: at a café | Order food and drink. | Uses "I would like / Can I have"; Says please/thank you |
| `SK-A1-greetings` | A1 | Conversation: greetings | Greet someone and answer simple questions. | Answers the question that was asked; Uses a full simple sentence |
| `SK-A1-a-postcard` | A1 | Writing: a postcard | Write a very short postcard. | Starts with "Dear ..." and ends with a name; Says where you are |
| `SK-A1-about-me` | A1 | Writing: about me | Write two simple sentences about yourself. | Writes a complete sentence with a capital letter and full stop; Uses "I am / I have" |
| `LO-A2-hello-and-introductions` | A2 | Lesson 1: Hello and introductions | Greet people and introduce yourself; Introduce a friend and say their job | Uses the right greeting for the time of day; Says "This is … He/She is a …" correctly |
| `LO-A2-at-the-caf` | A2 | Lesson 3: At the café | Order food and drink politely | Uses "Can I have …, please?" or "I'd like …"; Uses a/an with countable and some with uncountable nouns |
| `LO-A2-last-weekend` | A2 | Lesson 4: Last weekend | Talk about finished actions in the past | Uses -ed for regular verbs; Uses went, had, saw, ate correctly; Asks questions with did |
| `LTB-A2-my-daily-routine` | A2 | My daily routine | Describe a routine with the present simple; Use he/she/it + -s; Place adverbs of frequency before the main verb | Adds -s/-es for he/she/it; Puts always/usually/sometimes/never before the main verb |
| `OS-A2-comparatives` | A2 | Grammar: comparatives | Compare two things. | Forms the comparative correctly; Uses than |
| `OS-A2-going-to-for-plans` | A2 | Grammar: going to for plans | Talk about plans with going to. | Uses am/is/are going to + verb; Uses a future time expression |
| `OS-A2-jobs-and-workplaces` | A2 | Jobs and workplaces | Match jobs to workplaces. | Chooses the right workplace word; Uses "works in/at" |
| `OS-A2-a-bus-timetable` | A2 | Reading: a bus timetable | Find information in a timetable. | Reads the right row; Gives the time |
| `OS-A2-an-email-from-a-friend` | A2 | Reading: an email from a friend | Understand the main idea and details of a short email. | Identifies the main purpose; Finds a specific detail |
| `OS-A2-weather-words` | A2 | Weather words | Describe the weather. | Uses the right weather adjective; Uses "It is ..." for weather |
| `RS-A2-GR-03` | A2 | Comparing things | Compare two things with comparative adjectives. | Uses -er for short adjectives; Uses more for long adjectives |
| `RS-A2-WR-07` | A2 | Describing someone I know | Describe a person's appearance and personality in short sentences. | Uses has/has got with hair, eyes and other features; Uses is with adjectives for height, age and personality; Writes complete sentences with a capital letter |
| `RS-A2-FN-08` | A2 | In a clothes shop | Ask the price with "How much is/are ...?" and ask for a size or colour with "Do you have this in ...?". | Asks How much is (one thing) or How much are (more than one); Asks Do you have this in + size or colour; Makes full questions, not statements |
| `RS-A2-GR-08` | A2 | In the kitchen | Talk about quantities of countable and uncountable things. | many with countable; much with uncountable |
| `RS-A2-WR-02` | A2 | Joining sentences | Join two short sentences with and, but or because. | Uses and to add an idea; Uses but to show a contrast; Uses because to give a reason in the same sentence |
| `RS-A2-VO-04` | A2 | Make or do? | Choose make or do correctly with common nouns (do homework, make a mistake). | Uses do with tasks and duties; Uses make with things we produce or decide |
| `RS-A2-LS-03` | A2 | Making plans | Find specific details (person, place, day) in a short written conversation, including details that change. | Finds the final place or day agreed; Connects each detail to the right speaker |
| `RS-A2-RD-04` | A2 | Penguins | Choose the sentence that gives the main idea of a short text, not a single detail or an idea that is too general. | Chooses the idea that covers all sentences; Rejects details and too-general ideas |
| `RS-A2-LS-04` | A2 | Saying yes and saying no politely | Decide whether a speaker agrees or refuses an offer or request, including polite and indirect refusals. | Decides agree or refuse from the whole reply; Spots polite refusals with sorry, but, I'm afraid |
| `RS-A2-FN-03` | A2 | Sorry, I am late | Say sorry with a reason and reply to an apology with "That's OK" or "No problem". | Says sorry or I apologise and gives a short reason; Replies to an apology with That's OK, No problem or Don't worry; Does not reply with Thank you or You're welcome |
| `RS-A2-WR-04` | A2 | Starting and finishing an email | Write the opening and closing of a short email to a friend or teacher. | Opens with Dear/Hi/Hello + the name + a comma; Uses Dear in a formal email to a teacher or manager; Closes with a phrase such as Best wishes or Kind regards, a comma, then the sender name |
| `RS-A2-RD-03` | A2 | Twins and shells | Say which person or thing a pronoun such as it, they, them, he or she refers to in a short text. | Matches the pronoun with the right noun; Checks singular or plural |
| `RS-A2-GR-01` | A2 | What I did yesterday | Describe finished past events with irregular verbs. | Uses went, bought, saw correctly; Avoids -ed on irregular verbs |
| `RS-A2-VO-03` | A2 | Who does the action? | Turn verbs into person nouns with -er or -or (for example teach to teacher). | Adds -er (or -r after e) to name a person who does the action; Uses -or on words like actor and visitor |
| `RS-A2-WR-05` | A2 | Writing lists | Punctuate a list of three or more items with commas. | Puts a comma between the items in a list; Uses and before the last item without a comma after and; Writes the whole list in one sentence ending with a full stop |
| `SK-A2-asking-for-directions` | A2 | Conversation: asking for directions | Ask for and follow directions. | Asks a polite question; Checks understanding |
| `SK-A2-making-plans` | A2 | Conversation: making plans | Suggest an activity and agree a time. | Makes a suggestion; Responds to the other person |
| `SK-A2-a-short-message` | A2 | Writing: a short message | Write a message to rearrange a meeting. | Gives a reason; Suggests a new time |
| `SK-A2-describing-a-picture-of-a-pa` | A2 | Writing: describing a picture of a park | Describe what people are doing. | Uses present continuous correctly; Gives at least two details |
| `LTB-B1-life-experiences` | B1 | Life experiences | Ask and answer "Have you ever …?"; Use the past simple, not the present perfect, with a finished time (yesterday, last year) | Forms have/has + past participle; Switches to past simple when a finished time is given |
| `OS-B1-collocations-with-make-and-d` | B1 | Collocations with make and do | Choose make or do in common phrases. | Chooses make/do correctly; Uses the phrase in a sentence |
| `OS-B1-describing-feelings` | B1 | Describing feelings | Use precise feeling adjectives. | Chooses an adjective that fits the situation; Explains the feeling in a sentence |
| `OS-B1-first-conditional` | B1 | Grammar: first conditional | Talk about likely future results. | Uses if + present, will + verb; Keeps the result clause in will |
| `OS-B1-used-to` | B1 | Grammar: used to | Talk about past habits. | Uses used to + base verb; Uses didn't use to correctly |
| `OS-B1-a-review` | B1 | Reading: a review | Infer the writer's opinion. | Infers the opinion from evidence; Quotes a phrase that shows it |
| `OS-B1-instructions` | B1 | Reading: instructions | Follow the order of steps. | Puts steps in order; Finds the step for a detail |
| `RS-B1-WR-06` | B1 | Building a paragraph | Write a paragraph with a topic sentence and supporting sentences. | Opens with a topic sentence that states the main idea; Adds at least two supporting sentences; Uses for example, because or also to introduce support |
| `RS-B1-VO-05` | B1 | Everyday phrasal verbs | Use four common phrasal verbs with the correct particle and meaning. | Chooses the phrasal verb with the right meaning; Uses the correct particle and tense form |
| `RS-B1-FN-06` | B1 | Feeling ill | Give friendly advice with "You should + verb", "If I were you, I'd ..." or "Why don't you ...?" instead of orders. | Uses should, If I were you or Why don't you; Follows should with the base verb only; Advises instead of ordering |
| `RS-B1-LS-06` | B1 | Giving and following directions | Follow step-by-step directions and instructions in a short written dialogue to find a final place or action. | Follows each step in order to the final place; Counts streets and turns correctly |
| `RS-B1-GR-04` | B1 | Life and time | Contrast present perfect and past simple. | Past simple with finished time; Present perfect with for and since |
| `RS-B1-RD-05` | B1 | Nadia's morning | Work out the order of events in a text that uses before, after, once, until and earlier, even when the order of sentences is different. | Orders events using time words; Does not trust the order of sentences |
| `RS-B1-GR-06` | B1 | Rules | Talk about rules and necessity. | must for obligation; mustn't for forbidden; don't have to for not necessary |
| `RS-B1-RD-06` | B1 | Unknown words in a story | Work out the meaning of an unknown or multi-meaning word from the words and sentences around it. | Uses context clues to find meaning; Tests the meaning in the sentence |
| `RS-B1-FN-04` | B1 | Weekend plans | Suggest an activity with "How about + -ing", "Let's + verb" or "Why don't we + verb" without sounding like an order. | Uses How about + -ing, Let's + verb or Why don't we + verb; Uses the correct verb form after the phrase; Suggests instead of ordering |
| `RS-B1-LS-05` | B1 | What are they talking about? | Name the general topic of a short written dialogue from key words, without relying on one word alone. | Uses several clues to decide the main topic; Separates the main subject from side details |
| `RS-B1-VO-06` | B1 | Words that look or feel the same | Avoid common mix-ups for Arabic speakers: library vs bookshop and actually vs currently. | Uses library for borrowing and bookshop for buying; Uses currently for now and actually for in fact |
| `SK-B1-agreeing-and-disagreeing` | B1 | Conversation: agreeing and disagreeing | Agree or disagree politely. | Uses a polite phrase to agree/disagree; Adds a reason |
| `SK-B1-giving-advice` | B1 | Conversation: giving advice | Give and justify advice. | Uses should/could/why don't you; Gives a reason |
| `SK-B1-a-complaint-email` | B1 | Writing: a complaint email | Write a polite complaint. | Explains the problem clearly; Asks for a specific action |
| `SK-B1-an-opinion-paragraph` | B1 | Writing: an opinion paragraph | Write a short paragraph with an opinion and a reason. | States a clear opinion; Supports it with a reason and an example |
| `OS-B2-formal-vs-informal-vocabular` | B2 | Formal vs informal vocabulary | Choose a formal word for a formal email. | Replaces the informal word with a formal one; Keeps the meaning |
| `OS-B2-passive-voice` | B2 | Grammar: passive voice | Use the passive when the doer is unknown or unimportant. | Forms the passive correctly; Chooses passive for focus |
| `OS-B2-second-conditional` | B2 | Grammar: second conditional | Talk about unreal situations. | Uses if + past, would + verb; Uses were with I/he/she |
| `OS-B2-an-opinion-paragraph` | B2 | Reading: an opinion paragraph | Identify the claim and the supporting reason. | States the main claim; Identifies the supporting reason |
| `OS-B2-implied-meaning` | B2 | Reading: implied meaning | Infer meaning not stated directly. | Makes a reasonable inference; Supports it with the text |
| `OS-B2-word-formation-tion-and-ment` | B2 | Word formation: -tion and -ment | Form nouns from verbs. | Forms the noun correctly; Uses it in context |
| `RS-B2-FN-07` | B2 | Booking a restaurant table | Make, change or cancel a booking by phone using polite formal phrases such as "I was wondering whether it would be possible to ...". | Opens with a polite phrase such as Could I, I was wondering or I would like to; Gives the key detail (what, when, for whom); Uses the right verb pattern: would like to + verb, possible to + verb |
| `RS-B2-WR-08` | B2 | Choosing the right tone | Rewrite a message so the tone fits the reader, formal or informal. | Replaces slang and abbreviations with full standard words; Avoids contractions in formal writing; Makes requests polite with could you / I would be grateful / I would like to; Switches formal wording to relaxed wording for a friend |
| `RS-B2-LS-08` | B2 | How does the speaker feel? | Infer a speaker's attitude (annoyed, pleased, reluctant, sarcastic, worried) from word choice in a short written dialogue. | Identifies attitude from words, not only from literal meaning; Recognises sarcasm and reluctance |
| `RS-B2-GR-05` | B2 | Imagine if | Talk about imaginary situations with the second conditional. | If + past simple; would + base verb |
| `RS-B2-LS-07` | B2 | Informal spoken English in writing | Understand written spoken forms such as gonna, wanna, gotta, I'd and I'll and decide what the speaker will do or wants. | Expands gonna, wanna, gotta, 'd correctly; Understands the speaker's plan, wish or obligation |
| `RS-B2-VO-08` | B2 | Natural word partners | Choose the natural adjective (heavy, strong, high, deep) to go with a noun. | Chooses the usual adjective for a noun; Rejects unnatural pairs such as strong rain |
| `RS-B2-VO-07` | B2 | Prefixes that make opposites | Form opposites with un-, in-, im- and dis- and choose the right prefix. | Chooses the correct negative prefix for a word; Uses im- before p, m and b |
| `RS-B2-RD-07` | B2 | Reading between the lines | Work out what a text suggests but does not say, using clues in the text and avoiding guesses that have no support. | Uses clues to infer; Rejects unsupported guesses |
| `RS-B2-FN-05` | B2 | What is the best food? | Agree clearly and disagree politely by softening first ("I see your point, but ...") without saying the other person is wrong. | Agrees with I agree, Exactly or You're right; Softens before disagreeing (I see your point, but ...); Never says I am agree or you are wrong |
| `RS-B2-RD-08` | B2 | Why was it written? | Decide why an author wrote a text (inform, persuade, warn, complain) and what tone it has, using the language the writer chooses. | Identifies purpose from the language; Detects sarcasm and formal tone |
| `SK-B2-clarifying-and-paraphrasing` | B2 | Conversation: clarifying and paraphrasing | Check meaning by paraphrasing. | Paraphrases accurately; Asks a clarifying question |
| `SK-B2-negotiating` | B2 | Conversation: negotiating | Negotiate a compromise. | Proposes a compromise; Uses hedging language |
| `SK-B2-a-balanced-argument` | B2 | Writing: a balanced argument | Present both sides of an issue. | Presents both sides fairly; Uses contrast linkers accurately |
| `SK-B2-a-formal-summary` | B2 | Writing: a formal summary | Summarise a short text in one sentence. | Keeps only the main idea; Uses own words |
| `ESL1-articles` | none (A1–A2 form) | Articles: a, an and the | Use a or an before a singular noun, and the for something already mentioned or known | Uses a before consonant sounds and an before vowel sounds; Uses the when both people know which thing, or when it was already mentioned |
| `ESL1-copula` | none (A1 form) | Be in the present: am, is and are | Use am, is or are to say who or what someone is and how they feel | Uses am with I, is with he, she and it, and are with you, we and they; Does not leave out am, is or are in a sentence such as "She is a teacher" |
| `ESL1-thirdS` | none (A1–A2 form) | Present simple: he, she and it | Use the present simple with he, she and it for habits and routines | Adds -s or -es to the verb after he, she and it in the present simple; Uses -es after verbs ending in -sh, -ch, -s, -x or -o, and -ies after a consonant and y |

**Gaps seen in the inventory.** No C1 lessons. No lesson ids or CEFR/skill tags on lessons. Several objectives use "Say…/Talk about…" (speaking) in a text-only tutor. Objectives are not yet written with a condition and criterion.

## PART 9. Data separation

Assessment content and results are kept apart from teaching. Checked by `backend/test/assessmentSeparation.test.ts`.

- **Items stay out of teaching.** Item prompts and answers (`data/assessments/`) must not appear in engine code, tutor prompt builders or lesson data, and no `backend/src` file may import from `data/assessments`.
- **Learner record stores scores only:** per outcome and form, the score, the max score, the form id (A/B/C), the test point (pre / post / delayed) and the date. No item text and no learner answers.
- **Raw answers go to a separate research store, with consent only.** The learner's typed answers are written to a separate research store, not the learner record, and only when the learner (or guardian) has given research consent. Without consent, raw answers are scored and then discarded.
- The research store is keyed by a research id, not the learner id; the link table stays with the product database.

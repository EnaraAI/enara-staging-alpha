# Assessment review log

**DRAFT** - not yet reviewed by a human assessor.

## Automated checks

Tests: `backend/test/assessmentNovelty.test.ts`, `backend/test/assessmentSeparation.test.ts`, `backend/test/assessmentForms.test.ts` (run with `cd backend && npx vitest run test/assessment`).

Allowlisted instruction frames (cut before shingling, see `backend/test/helpers/assessmentText.ts`): "write one sentence about", "use a or an", "use am, is or are", "write the correct form of the verb", "fill the gap with ..." and similar. Content around a frame is still checked.

Data fixed (first run, 2026-11-16):

| Item | Problem | Before | After |
|---|---|---|---|
| EN-F-A1-GR-article-a-an (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-GR-article-the (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-GR-can-ability (9 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-GR-copula-be (9 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-GR-prepositions-time (9 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-GR-there-is-are (9 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-VO-classroom-objects (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-VO-common-adjectives (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-VO-days-months (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-VO-family (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-VO-food-drink (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-VO-home-rooms (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-VO-numbers-time (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A2-GR-past-questions-did (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A2-GR-past-simple-irregular (9 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A2-GR-past-simple-regular (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A2-GR-present-continuous (9 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A2-GR-third-person-s (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A2-VO-appearance (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A2-VO-clothes-shopping (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A2-VO-jobs-workplaces (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A2-VO-weather (6 items) | missing rubric on target_form item; added standard 0/1/2 rubric | - | rubric added |
| EN-F-A1-GR-word-order-svo-C-1 | prompt length >±2 words across forms (22/22/25) | the dishes | dishes |
| EN-F-A1-VO-food-drink-B-2 | prompt length >±2 words across forms (16/19/17) | it is round and grows on trees | it grows on trees |
| EN-F-A1-VO-food-drink-B-6 | prompt length >±2 words across forms (14/17/16) | My little brother | My brother |
| EN-F-A1-VO-food-drink-B-9 | prompt length >±2 words across forms (16/19/18) | No coffee for me. | No coffee. |
| EN-F-A2-FN-polite-requests-A-9 | prompt length >±2 words across forms (14/11/11) | an extra towel in your room. | an extra towel. |
| EN-F-A2-GR-comparatives-C-7 | prompt length >±2 words across forms (10/10/13) | two members of your family | two family members |
| EN-F-A2-GR-comparatives-B-9 | prompt length >±2 words across forms (15/11/15) | Ahmed: 170 cm. Hany: 182 cm. | Ahmed is 170 cm tall. Hany is 182 cm tall. |
| EN-F-A2-VO-appearance-B-2 | prompt length >±2 words across forms (15/18/17) | are the colour of the sky | are like the sky |
| EN-F-A2-VO-clothes-shopping-B-4 | prompt length >±2 words across forms (16/14/18) | this jacket? | this jacket, please? |
| EN-F-A2-VO-clothes-shopping-C-4 | prompt length >±2 words across forms (16/14/18) | too tight. | tight. |
| EN-F-A2-VO-clothes-shopping-C-6 | prompt length >±2 words across forms (15/17/19) | I like this shirt but it is big size for me. | This shirt is big size for me. |
| EN-F-A2-VO-clothes-shopping-C-6 | prompt length >±2 words across forms (answers follow new prompt) | I like this shirt but it | This shirt |
| EN-F-A2-VO-make-do-C-7 | prompt length >±2 words across forms (16/15/12) | friends, breakfast, noise. | some friends, breakfast, a noise. |
| EN-F-A2-VO-weather-C-3 | prompt length >±2 words across forms (17/19/21) | We can swim in the sea. | We can swim. |
| EN-F-A2-VO-weather-C-9 | prompt length >±2 words across forms (16/17/14) | Every day there's rain. | There's rain every single day. |
| EN-F-A1-GR-article-a-an-A-2 | copied text (novelty/separation check): 6-word shingle in ESL1 eslFixtures.ts | at the station | at the airport |
| EN-F-A1-GR-copula-be-A-7 | copied text (novelty/separation check): sentence in research benchmark/outcomes/writing.json | the weather today | the weather this morning |
| EN-F-A1-GR-there-is-are-B-4 | copied text (novelty/separation check): shingle in research writing.json | many cars | many bikes |
| EN-F-A1-VO-classroom-objects-A-4 | copied text (novelty/separation check): sentence in research listening.json | Can I borrow your ____ ? | Can I use your ____ , please? |
| EN-F-A1-VO-classroom-objects-C-4 | copied text (novelty/separation check): sentence in research functional.json | Can you open the ____ ? | Please open the ____ . |
| EN-F-A1-VO-common-adjectives-A-5 | copied text (novelty/separation check): accepted answer sentence in ESL5 cases_new.json | Our flat | Our house |
| EN-F-A1-VO-common-adjectives-C-5 | copied text (novelty/separation check): accepted answer sentence in research writing.json | The test was | The quiz was |
| EN-F-A1-VO-food-drink-A-4 | copied text (novelty/separation check): shingle in research functional.json | Can I have a glass of orange | I would like some orange |
| EN-F-A2-FN-polite-requests-A-1 | copied text (novelty/separation check): sentence in research functional.json | a glass of water | a cup of tea |
| EN-F-A2-FN-polite-requests-B-8 | copied text (novelty/separation check): sentence in research functional.json | You are in a restaurant. | You are at a restaurant. |
| EN-F-A2-FN-polite-requests-C-3 | copied text (novelty/separation check): shingle in research functional.json | (a) I want plaster. (b) Give me a plaster. (c) Can I have a plaster, please? | (a) I want plasters. (b) Give me plasters. (c) Can I have some plasters, please? |
| EN-F-A2-GR-comparatives-A-1 | copied text (novelty/separation check): sentence in research grammar.json | A bus is slow. A train is ___ (fast) than a bus. | A bike is slow. A car is ___ (fast) than a bike. |
| EN-F-A2-GR-conjunctions-A-7 | copied text (novelty/separation check): answer key shingle in research writing.json | because I want a better job. | because I want to travel. |
| EN-F-A2-GR-conjunctions-A-8 | copied text (novelty/separation check): wording equal to research benchmark/outcomes/writing.json | one good thing and one bad thing | say one thing you like and one thing you don't |
| EN-F-A2-GR-conjunctions-B-8 | copied text (novelty/separation check): wording equal to research benchmark/outcomes/writing.json | one good thing and one bad thing | say one thing you like and one thing you don't |
| EN-F-A2-GR-conjunctions-C-8 | copied text (novelty/separation check): wording equal to research benchmark/outcomes/writing.json | one good thing and one bad thing | say one thing you like and one thing you don't |
| EN-F-A2-GR-much-many-A-2 | copied text (novelty/separation check): shingle in research grammar.json | milk in the jug | juice in the jug |
| EN-F-A2-VO-make-do-A-5 | copied text (novelty/separation check): answer shingle in research vocabulary.json | to my manager | to my boss |
| EN-F-A2-VO-make-do-A-5 | copied text (novelty/separation check): answer shingle in research vocabulary.json | I need to | I have to |
| EN-F-A2-VO-weather-A-3 | copied text (novelty/separation check): sentence in outcome-sim-v2 outcome_cases.jsonl | It is very ____ today. | It is so ____ outside. |
| EN-F-A2-VO-weather-B-4 | copied text (novelty/separation check): sentence in outcome-sim-v2 outcome_cases.jsonl | It is very ____ today. | It is a ____ day. |
| EN-F-A2-VO-weather-A-4 | copied text (novelty/separation check): shingle in outcome-sim-v1 outcome_cases.jsonl | I can't see the sun. | No sun this morning. |
| EN-F-A2-VO-weather-A-7 | copied text (novelty/separation check): sentence in research writing.json | the weather today | the weather this morning |
| EN-F-A2-VO-weather-C-5 | copied text (novelty/separation check): answer shingle in research writing.json | in the mountains | up in the hills |
| PL-A1-VO-04 | copied text (novelty/separation check): sentence in research vocabulary.json | We cook in the ___. | We cook dinner in the ___. |
| PL-A1-RD-* | copied text (novelty/separation check): passage sentence in ESL1 eslFixtures.ts | I have a cat. | I have a small cat. |
| PL-A1-RD-05 | copied text (novelty/separation check): sentence in research listening.json | What time does the shop close? | When does the shop close? |
| PL-A2-VO-03 | copied text (novelty/separation check): shingle in research functional.json | Do you have this shirt | Have you got this shirt |
| PL-A2-VO-06 | copied text (novelty/separation check): sentence in research writing.json | She has long ___ hair. | My aunt has long ___ hair. |
| PL-A2-RD-* | copied text (novelty/separation check): passage shingle in research functional.json | I'm sorry I didn't reply sooner. | Sorry for my late reply. |
| PL-A2-RD-03 | copied text (novelty/separation check): sentence in research listening.json | Where do they meet? | Where will they meet? |
| PL-A2-WR-01 | copied text (novelty/separation check): model answer shingle in backend/src demoTemplate.ts and lo_cases.jsonl | Last weekend I went to the market with my mum and we bought fruit. | Last weekend my mum and I went to the market and bought fruit. |

Data fixed (acceptedAnswers notes, 2026-11-16; see `research/assessment-validation/a1a2/REPORT.md` §3 #8):

- 568 items in 23 outcome files changed; placement.json had none left. `acceptedAnswers` now holds only literal answers.
- Normalisation notes ("Case-insensitive; ignore final punctuation and extra spaces", "case-SENSITIVE ...; final full stop required") moved to a new per-item `matchingNote`.
- target_form_0_1_2 items: criteria ("Any sentence with ...", "Model answer; ... scores 2 (...)", "(any order; 2 = ...)", "Yes/No answers count only with ...") appended to `rubric` as "Criterion: ..."; `acceptedAnswers` now holds ≥2 literal example answers (answerKey without "e.g." plus new examples; slash/"..." patterns expanded, e.g. `I am single.`, `I'm married.`). Vocabulary items whose `acceptedAnswersNote` says acceptedAnswers lists target words were left as keyword lists.
- exact items: contraction variants added both ways (can't/cannot/can not, don't/do not, I'm/I am, there's/there is, ...), not for choice items; no punctuation variants. Special cases: "commas optional" → list with and without commas; "The ... the" → `The the`; "She can cook very well biryani (accept; ...)" → literal + `scoringNote`; `...tall; he plays...` → `...tall. He plays...`.
- New examples that collided with lesson/benchmark text in the novelty check were replaced.
- New check in `backend/test/assessmentForms.test.ts` (outcomes + placement): fails if an acceptedAnswers entry contains ";", "ignore", "must", "e.g.", "rubric", an instruction-style "any " (at start or after "("), "case-"/"case(in)sensitive", or has >25 words. "any"/"case" are matched as phrases so literal answers like `We don't have any bread.` and `pencil case` pass. Result: 108/108 tests pass.

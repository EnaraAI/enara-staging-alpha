// SIMULATION ONLY. NO API. ESL6 lessons for the 30 outcomes (config/agent_sim_esl6/PROTOCOL.md sections 3 and 5). Research fixtures, NOT production lessons.
// Derived from each outcome's `lessonIds` in data/outcomes/outcomes.json (inventory ids: docs/LEARNING_OUTCOMES.md PART 8). Selection rule, fixed before init:
//   - the three section-1 forms (a/an, copula be, third-person -s) keep the ESL1 lesson used unchanged in ESL2-ESL5 (src/offline/eslFixtures.ts, imported, not copied);
//   - every other outcome: the FIRST listed lessonId (ESL1 lessons skipped) that has practice items; if no listed lesson has items, the first listed lessonId.
// Lesson data (title, objective, spec) are copied verbatim from the source named in `source`; only `items` may be rebuilt: the language-teaching benchmark (LTB) cases
// carry their two practice items as `exercise` and `nextItem` (prompt, answer, key), turned into items {id x1/x2, prompt, acceptedAnswers [key, answer], targetForms [key]}.
// Three outcomes (past-simple-regular, past-questions-did, some-any) have only the LO-experiment lesson, which has no practice items: they are taught with the lesson
// data alone (stated limit, PROTOCOL section 12). Items have no `criteria` unless the source has them.
// Generated once from the sources named in `source` (copied verbatim, items rebuilt only as stated above); the data below is the frozen record.
import type { PracticeItem } from '../benchmark/schema';
import { LESSONS, type EslLesson, type Form } from './eslFixtures';

export interface Esl6Lesson { outcomeId: string; key: string; topic: string; lessonId: string; source: string; rule: string; itemsFrom?: string; title: string; objective: string; spec: EslLesson['spec'] }

const OTHER: Omit<Esl6Lesson, 'spec'>[] & { spec: { objectives: string[]; successCriteria: string[]; vocabulary: string[]; grammar: string[]; functions: string[]; skills: string[]; examples: string[]; items: PracticeItem[] } }[] = [
 {
  "outcomeId": "EN-F-A1-GR-article-the",
  "key": "the",
  "topic": "the",
  "lessonId": "RS-A1-GR-02",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/grammar.json#GR-02",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Things around me",
  "objective": "Use a, an and the with singular nouns.",
  "spec": {
   "objectives": [
    "Use a, an and the with singular nouns."
   ],
   "successCriteria": [
    "Uses an before a vowel sound",
    "Uses the for the second mention"
   ],
   "vocabulary": [
    "dog",
    "apple",
    "garden"
   ],
   "grammar": [
    "articles a, an, the"
   ],
   "functions": [
    "describing things"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "I have a dog. The dog is brown.",
    "She eats an apple every day."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Write a or an: I see ___ ant on the table.",
     "acceptedAnswers": [
      "an"
     ],
     "targetForms": [
      "an"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "p2",
     "prompt": "Write a or the: We have a garden. ___ garden is small.",
     "acceptedAnswers": [
      "the"
     ],
     "targetForms": [
      "the"
     ],
     "criteria": [
      2
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-present-continuous",
  "key": "prescont",
  "topic": "the present continuous (am/is/are + -ing)",
  "lessonId": "SK-A2-describing-a-picture-of-a-pa",
  "source": "docs/benchmarks/language-teaching/20261112-skills-v1/skills_v1_cases.jsonl#SKL-WRI-A2-L19-S1",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Writing: describing a picture of a park",
  "objective": "Describe what people are doing.",
  "spec": {
   "objectives": [
    "Describe what people are doing."
   ],
   "successCriteria": [
    "Uses present continuous correctly",
    "Gives at least two details"
   ],
   "vocabulary": [
    "playing",
    "sitting",
    "walking",
    "children",
    "tree"
   ],
   "grammar": [
    "is/are + -ing"
   ],
   "functions": [
    "describing"
   ],
   "skills": [
    "writing"
   ],
   "examples": [
    "Two children are playing football."
   ],
   "items": [
    {
     "id": "w1",
     "prompt": "Imagine a park. Write two sentences about what people are doing now.",
     "criteria": [
      1
     ]
    },
    {
     "id": "w2",
     "prompt": "Add one sentence about the weather in the picture.",
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-past-simple-regular",
  "key": "pastreg",
  "topic": "the past simple with -ed",
  "lessonId": "LO-A2-last-weekend",
  "source": "docs/benchmarks/language-teaching/20261113-lo-experiment/lo_cases.jsonl#LOX-LO-07-P01",
  "itemsFrom": "none",
  "rule": "first listed lessonId (no listed lesson has practice items)",
  "title": "Lesson 4: Last weekend",
  "objective": "Talk about finished actions in the past.",
  "spec": {
   "objectives": [
    "Talk about finished actions in the past"
   ],
   "successCriteria": [
    "Uses -ed for regular verbs",
    "Uses went, had, saw, ate correctly",
    "Asks questions with did"
   ],
   "vocabulary": [
    "last weekend",
    "yesterday",
    "played",
    "visited",
    "watched",
    "went",
    "had",
    "saw",
    "ate"
   ],
   "grammar": [
    "past simple regular (-ed)",
    "common irregular past forms",
    "questions with did"
   ],
   "functions": [
    "telling what happened",
    "asking about the past"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "What did you do last weekend?",
    "I went to the beach."
   ],
   "items": []
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-past-simple-irregular",
  "key": "pastirr",
  "topic": "irregular past verbs",
  "lessonId": "RS-A2-GR-01",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/grammar.json#GR-01",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId with practice items",
  "title": "What I did yesterday",
  "objective": "Describe finished past events with irregular verbs.",
  "spec": {
   "objectives": [
    "Describe finished past events with irregular verbs."
   ],
   "successCriteria": [
    "Uses went, bought, saw correctly",
    "Avoids -ed on irregular verbs"
   ],
   "vocabulary": [
    "yesterday",
    "last week",
    "ago"
   ],
   "grammar": [
    "past simple irregular verbs"
   ],
   "functions": [
    "narrating past events"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "I went to the market yesterday.",
    "She bought a red hat last week."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Write the past form of 'have': Yesterday I ___ a big lunch.",
     "acceptedAnswers": [
      "had"
     ],
     "targetForms": [
      "had"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "p2",
     "prompt": "Write the past form of 'tell': Last night he ___ me a story.",
     "acceptedAnswers": [
      "told"
     ],
     "targetForms": [
      "told"
     ],
     "criteria": [
      2
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-past-questions-did",
  "key": "pastq",
  "topic": "past questions with did",
  "lessonId": "LO-A2-last-weekend",
  "source": "docs/benchmarks/language-teaching/20261113-lo-experiment/lo_cases.jsonl#LOX-LO-07-P01",
  "itemsFrom": "none",
  "rule": "first listed lessonId (no listed lesson has practice items)",
  "title": "Lesson 4: Last weekend",
  "objective": "Talk about finished actions in the past.",
  "spec": {
   "objectives": [
    "Talk about finished actions in the past"
   ],
   "successCriteria": [
    "Uses -ed for regular verbs",
    "Uses went, had, saw, ate correctly",
    "Asks questions with did"
   ],
   "vocabulary": [
    "last weekend",
    "yesterday",
    "played",
    "visited",
    "watched",
    "went",
    "had",
    "saw",
    "ate"
   ],
   "grammar": [
    "past simple regular (-ed)",
    "common irregular past forms",
    "questions with did"
   ],
   "functions": [
    "telling what happened",
    "asking about the past"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "What did you do last weekend?",
    "I went to the beach."
   ],
   "items": []
  }
 },
 {
  "outcomeId": "EN-F-A1-GR-prepositions-time",
  "key": "preptime",
  "topic": "at, on and in for time",
  "lessonId": "RS-A1-GR-07",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/grammar.json#GR-07",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "When things happen",
  "objective": "Use in, on and at with time words.",
  "spec": {
   "objectives": [
    "Use in, on and at with time words."
   ],
   "successCriteria": [
    "at + clock time",
    "on + day",
    "in + month"
   ],
   "vocabulary": [
    "Monday",
    "July",
    "o'clock"
   ],
   "grammar": [
    "prepositions of time"
   ],
   "functions": [
    "saying when"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "The lesson starts at 7 o'clock.",
    "I play tennis on Monday.",
    "My holiday is in July."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Write in, on or at: My train leaves ___ 5 o'clock.",
     "acceptedAnswers": [
      "at"
     ],
     "targetForms": [
      "at"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "p2",
     "prompt": "Write in, on or at: They get married ___ April.",
     "acceptedAnswers": [
      "in"
     ],
     "targetForms": [
      "in"
     ],
     "criteria": [
      2
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-GR-there-is-are",
  "key": "thereis",
  "topic": "there is and there are",
  "lessonId": "OS-A1-there-is-there-are",
  "source": "docs/benchmarks/language-teaching/20261112-outcome-sim-v1/outcome_cases.jsonl#OUT-GRA-A1-L32",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Grammar: there is / there are",
  "objective": "Use there is/are with singular and plural.",
  "spec": {
   "objectives": [
    "Use there is/are with singular and plural."
   ],
   "successCriteria": [
    "Chooses is/are correctly",
    "Uses a/some correctly"
   ],
   "vocabulary": [
    "table",
    "chairs",
    "window",
    "books"
   ],
   "grammar": [
    "there is / there are"
   ],
   "functions": [
    "describing a room"
   ],
   "skills": [
    "integrated"
   ],
   "examples": [
    "There is a table. There are two chairs."
   ],
   "items": [
    {
     "id": "g1",
     "prompt": "Complete: \"___ three windows in my room.\"",
     "acceptedAnswers": [
      "there are",
      "There are"
     ],
     "targetForms": [
      "are"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "g2",
     "prompt": "Complete: \"___ a big table in the kitchen.\"",
     "acceptedAnswers": [
      "there is",
      "There is"
     ],
     "targetForms": [
      "is"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-GR-can-ability",
  "key": "can",
  "topic": "can",
  "lessonId": "OS-A1-can-for-ability",
  "source": "docs/benchmarks/language-teaching/20261112-outcome-sim-v1/outcome_cases.jsonl#OUT-GRA-A1-L33",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Grammar: can for ability",
  "objective": "Say what you can and can't do.",
  "spec": {
   "objectives": [
    "Say what you can and can't do."
   ],
   "successCriteria": [
    "Uses can + base verb",
    "Uses can't correctly"
   ],
   "vocabulary": [
    "swim",
    "cook",
    "ride a bike",
    "sing"
   ],
   "grammar": [
    "can / can't + verb"
   ],
   "functions": [
    "talking about ability"
   ],
   "skills": [
    "integrated"
   ],
   "examples": [
    "I can swim. I can't sing."
   ],
   "items": [
    {
     "id": "g1",
     "prompt": "Correct the sentence: \"She can swims.\"",
     "acceptedAnswers": [
      "she can swim",
      "She can swim."
     ],
     "targetForms": [
      "swim"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "g2",
     "prompt": "Complete: \"I ___ ride a bike. I never learned.\"",
     "acceptedAnswers": [
      "can't",
      "cannot",
      "can not"
     ],
     "targetForms": [
      "can't"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-GR-word-order-svo",
  "key": "svo",
  "topic": "word order (subject + verb + object)",
  "lessonId": "RS-A1-WR-03",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/writing.json#WR-03",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Making sentences in order",
  "objective": "Order words correctly in a simple English statement.",
  "spec": {
   "objectives": [
    "Order words correctly in a simple English statement."
   ],
   "successCriteria": [
    "Puts the subject first, then the verb, then the object",
    "Puts always/usually/never before the main verb",
    "Puts place or time at the end"
   ],
   "vocabulary": [
    "subject",
    "verb",
    "object",
    "always",
    "usually",
    "often"
   ],
   "grammar": [
    "SVO word order",
    "frequency adverbs before the main verb"
   ],
   "functions": [
    "writing statements about habits"
   ],
   "skills": [
    "writing"
   ],
   "examples": [
    "Sam plays football on Fridays.",
    "We usually have lunch at one."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Put in order: \"plays / Sam / chess / on Mondays\"",
     "acceptedAnswers": [
      "Sam plays chess on Mondays",
      "On Mondays Sam plays chess"
     ],
     "targetForms": [
      "Sam plays chess on Mondays"
     ],
     "criteria": [
      1,
      3
     ]
    },
    {
     "id": "p2",
     "prompt": "Put in order: \"usually / we / lunch / have\"",
     "acceptedAnswers": [
      "We usually have lunch"
     ],
     "targetForms": [
      "We usually have lunch"
     ],
     "criteria": [
      1,
      2
     ]
    },
    {
     "id": "p3",
     "prompt": "Put in order: \"often / my aunt / tea / makes\"",
     "acceptedAnswers": [
      "My aunt often makes tea"
     ],
     "targetForms": [
      "My aunt often makes tea"
     ],
     "criteria": [
      1,
      2
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-frequency-adverbs",
  "key": "freq",
  "topic": "always, usually, sometimes and never",
  "lessonId": "LTB-A2-my-daily-routine",
  "source": "docs/benchmarks/language-teaching/20261109T-ltb-v1.0/benchmark_cases.jsonl#LTB-CA2-T01",
  "itemsFrom": "exercise+nextItem",
  "rule": "first listed lessonId",
  "title": "My daily routine",
  "objective": "Describe daily routines with the present simple, including he/she/it + -s and adverbs of frequency.",
  "spec": {
   "objectives": [
    "Describe a routine with the present simple",
    "Use he/she/it + -s",
    "Place adverbs of frequency before the main verb"
   ],
   "successCriteria": [
    "Adds -s/-es for he/she/it",
    "Puts always/usually/sometimes/never before the main verb"
   ],
   "vocabulary": [
    "get up",
    "have breakfast",
    "go to school",
    "go to work",
    "usually",
    "sometimes",
    "never",
    "always"
   ],
   "grammar": [
    "present simple (he/she/it + -s)",
    "adverbs of frequency before the main verb"
   ],
   "functions": [
    "describing habits"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "My brother usually gets up at seven.",
    "I never have coffee in the evening."
   ],
   "items": [
    {
     "id": "x1",
     "prompt": "Correct the verb: \"She go to bed at ten.\"",
     "acceptedAnswers": [
      "goes",
      "She goes to bed at ten"
     ],
     "targetForms": [
      "goes"
     ]
    },
    {
     "id": "x2",
     "prompt": "Correct the verb: \"My dad watch TV after dinner.\"",
     "acceptedAnswers": [
      "watches",
      "My dad watches TV after dinner"
     ],
     "targetForms": [
      "watches"
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-comparatives",
  "key": "comp",
  "topic": "comparatives (-er, more ... than)",
  "lessonId": "OS-A2-comparatives",
  "source": "docs/benchmarks/language-teaching/20261112-outcome-sim-v1/outcome_cases.jsonl#OUT-GRA-A2-L34",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Grammar: comparatives",
  "objective": "Compare two things.",
  "spec": {
   "objectives": [
    "Compare two things."
   ],
   "successCriteria": [
    "Forms the comparative correctly",
    "Uses than"
   ],
   "vocabulary": [
    "bigger",
    "more expensive",
    "better",
    "than"
   ],
   "grammar": [
    "comparative adjectives"
   ],
   "functions": [
    "comparing"
   ],
   "skills": [
    "integrated"
   ],
   "examples": [
    "A car is faster than a bike."
   ],
   "items": [
    {
     "id": "g1",
     "prompt": "Complete: \"Cairo is ___ (big) than Luxor.\"",
     "acceptedAnswers": [
      "bigger"
     ],
     "targetForms": [
      "bigger"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "g2",
     "prompt": "Complete: \"This phone is ___ (expensive) than that one.\"",
     "acceptedAnswers": [
      "more expensive"
     ],
     "targetForms": [
      "more expensive"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-going-to",
  "key": "goingto",
  "topic": "going to for plans",
  "lessonId": "OS-A2-going-to-for-plans",
  "source": "docs/benchmarks/language-teaching/20261112-outcome-sim-v1/outcome_cases.jsonl#OUT-GRA-A2-L35",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Grammar: going to for plans",
  "objective": "Talk about plans with going to.",
  "spec": {
   "objectives": [
    "Talk about plans with going to."
   ],
   "successCriteria": [
    "Uses am/is/are going to + verb",
    "Uses a future time expression"
   ],
   "vocabulary": [
    "tomorrow",
    "next week",
    "visit",
    "study"
   ],
   "grammar": [
    "be going to"
   ],
   "functions": [
    "talking about plans"
   ],
   "skills": [
    "integrated"
   ],
   "examples": [
    "I'm going to visit my aunt tomorrow."
   ],
   "items": [
    {
     "id": "g1",
     "prompt": "Correct: \"I going to study tonight.\"",
     "acceptedAnswers": [
      "i am going to study tonight",
      "I'm going to study tonight."
     ],
     "targetForms": [
      "am going to"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "g2",
     "prompt": "Complete: \"They ___ (play) football next Saturday.\" (a plan)",
     "acceptedAnswers": [
      "are going to play"
     ],
     "targetForms": [
      "are going to play"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-much-many",
  "key": "muchmany",
  "topic": "much and many",
  "lessonId": "RS-A2-GR-08",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/grammar.json#GR-08",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "In the kitchen",
  "objective": "Talk about quantities of countable and uncountable things.",
  "spec": {
   "objectives": [
    "Talk about quantities of countable and uncountable things."
   ],
   "successCriteria": [
    "many with countable",
    "much with uncountable"
   ],
   "vocabulary": [
    "eggs",
    "rice",
    "bottle"
   ],
   "grammar": [
    "much, many, a few, a little"
   ],
   "functions": [
    "asking about quantity"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "How many eggs do we need?",
    "We don't have much rice."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Write much or many: How ___ bottles are there?",
     "acceptedAnswers": [
      "many"
     ],
     "targetForms": [
      "many"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "p2",
     "prompt": "Write a few or a little: I have ___ rice left, only a spoonful.",
     "acceptedAnswers": [
      "a little"
     ],
     "targetForms": [
      "a little"
     ],
     "criteria": [
      2
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-some-any",
  "key": "someany",
  "topic": "some and any",
  "lessonId": "LO-A2-at-the-caf",
  "source": "docs/benchmarks/language-teaching/20261113-lo-experiment/lo_cases.jsonl#LOX-LO-05-P01",
  "itemsFrom": "none",
  "rule": "first listed lessonId (no listed lesson has practice items)",
  "title": "Lesson 3: At the café",
  "objective": "Order food and drink politely.",
  "spec": {
   "objectives": [
    "Order food and drink politely"
   ],
   "successCriteria": [
    "Uses \"Can I have …, please?\" or \"I'd like …\"",
    "Uses a/an with countable and some with uncountable nouns"
   ],
   "vocabulary": [
    "coffee",
    "tea",
    "sandwich",
    "water",
    "rice",
    "How much is it?",
    "Here you are"
   ],
   "grammar": [
    "Can I have …?",
    "I'd like …",
    "a/an vs some (countable/uncountable)"
   ],
   "functions": [
    "ordering",
    "asking the price",
    "polite requests"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "Can I have a coffee, please?",
    "I'd like a cheese sandwich."
   ],
   "items": []
  }
 },
 {
  "outcomeId": "EN-F-A2-GR-conjunctions",
  "key": "conj",
  "topic": "and, but and because",
  "lessonId": "RS-A2-WR-02",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/writing.json#WR-02",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Joining sentences",
  "objective": "Join two short sentences with and, but or because.",
  "spec": {
   "objectives": [
    "Join two short sentences with and, but or because."
   ],
   "successCriteria": [
    "Uses and to add an idea",
    "Uses but to show a contrast",
    "Uses because to give a reason in the same sentence"
   ],
   "vocabulary": [
    "and",
    "but",
    "because",
    "sentence",
    "reason"
   ],
   "grammar": [
    "linking words and, but, because"
   ],
   "functions": [
    "adding ideas",
    "contrasting",
    "giving reasons"
   ],
   "skills": [
    "writing"
   ],
   "examples": [
    "I like tea and I like milk.",
    "I like cake but I do not like cream.",
    "She is happy because it is Friday."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Join with and: \"I have a cat. I have a dog.\"",
     "acceptedAnswers": [
      "I have a cat and I have a dog.",
      "I have a cat and a dog."
     ],
     "targetForms": [
      "I have a cat and I have a dog."
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "p2",
     "prompt": "Join with but: \"The bus is cheap. It is slow.\"",
     "acceptedAnswers": [
      "The bus is cheap but it is slow.",
      "The bus is cheap, but it is slow."
     ],
     "targetForms": [
      "The bus is cheap but it is slow."
     ],
     "criteria": [
      2
     ]
    },
    {
     "id": "p3",
     "prompt": "Join with because: \"I am happy. It is my birthday.\"",
     "acceptedAnswers": [
      "I am happy because it is my birthday."
     ],
     "targetForms": [
      "I am happy because it is my birthday."
     ],
     "criteria": [
      3
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-GR-capitals-full-stops",
  "key": "caps",
  "topic": "capital letters and full stops",
  "lessonId": "RS-A1-WR-01",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/writing.json#WR-01",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Writing clear sentences",
  "objective": "Write simple sentences with capital letters and full stops.",
  "spec": {
   "objectives": [
    "Write simple sentences with capital letters and full stops."
   ],
   "successCriteria": [
    "Starts every sentence with a capital letter",
    "Writes the word I as a capital letter",
    "Ends every sentence with a full stop"
   ],
   "vocabulary": [
    "sentence",
    "capital letter",
    "full stop",
    "word"
   ],
   "grammar": [
    "sentence punctuation",
    "capital I"
   ],
   "functions": [
    "writing simple statements"
   ],
   "skills": [
    "writing"
   ],
   "examples": [
    "My aunt lives in a big house.",
    "I walk to the park with my dog."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Rewrite correctly: \"my brother likes tea\"",
     "acceptedAnswers": [
      "My brother likes tea."
     ],
     "targetForms": [
      "My brother likes tea."
     ],
     "criteria": [
      1,
      3
     ]
    },
    {
     "id": "p2",
     "prompt": "Rewrite correctly: \"i am ten years old\"",
     "acceptedAnswers": [
      "I am ten years old."
     ],
     "targetForms": [
      "I am ten years old."
     ],
     "criteria": [
      1,
      2,
      3
     ]
    },
    {
     "id": "p3",
     "prompt": "Rewrite correctly: \"we live in london\"",
     "acceptedAnswers": [
      "We live in London."
     ],
     "targetForms": [
      "We live in London."
     ],
     "criteria": [
      1,
      3
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-VO-family",
  "key": "family",
  "topic": "family words",
  "lessonId": "LTB-A1-talking-about-my-family",
  "source": "docs/benchmarks/language-teaching/20261109T-ltb-v1.0/benchmark_cases.jsonl#LTB-CA1-T01",
  "itemsFrom": "exercise+nextItem",
  "rule": "first listed lessonId",
  "title": "Talking about my family",
  "objective": "Introduce family members using \"This is my …\" and \"He is / She is …\".",
  "spec": {
   "objectives": [
    "Introduce a family member with \"This is my …\"",
    "Say one fact about them with \"He is / She is …\""
   ],
   "successCriteria": [
    "Uses \"This is my + family word\" correctly",
    "Chooses he/she correctly"
   ],
   "vocabulary": [
    "mother",
    "father",
    "brother",
    "sister",
    "grandmother",
    "grandfather"
   ],
   "grammar": [
    "This is my …",
    "He is … / She is …"
   ],
   "functions": [
    "introducing people"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "This is my sister. She is ten.",
    "This is my father. He is a driver."
   ],
   "items": [
    {
     "id": "x1",
     "prompt": "Complete: \"This is my brother. ___ is twelve.\"",
     "acceptedAnswers": [
      "He",
      "He is twelve"
     ],
     "targetForms": [
      "He"
     ]
    },
    {
     "id": "x2",
     "prompt": "Complete: \"This is my grandmother. ___ is very kind.\"",
     "acceptedAnswers": [
      "She",
      "She is very kind"
     ],
     "targetForms": [
      "She"
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-VO-food-drink",
  "key": "food",
  "topic": "eat and drink",
  "lessonId": "OS-A1-food-i-like",
  "source": "docs/benchmarks/language-teaching/20261112-outcome-sim-v1/outcome_cases.jsonl#OUT-VOC-A1-L00",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Food I like",
  "objective": "Name common foods and say what you like.",
  "spec": {
   "objectives": [
    "Name common foods and say what you like."
   ],
   "successCriteria": [
    "Names the food correctly",
    "Uses \"I like ...\" with a food word"
   ],
   "vocabulary": [
    "bread",
    "rice",
    "apple",
    "milk",
    "egg",
    "fish"
   ],
   "grammar": [
    "I like ..."
   ],
   "functions": [
    "expressing likes"
   ],
   "skills": [
    "integrated"
   ],
   "examples": [
    "I like rice.",
    "I like apples."
   ],
   "items": [
    {
     "id": "v1",
     "prompt": "Write the word: you drink it, it is white. ___",
     "acceptedAnswers": [
      "milk"
     ],
     "targetForms": [
      "milk"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "v2",
     "prompt": "Complete: \"I eat an ___ every morning.\" (a red or green fruit)",
     "acceptedAnswers": [
      "apple",
      "an apple"
     ],
     "targetForms": [
      "apple"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-VO-classroom-objects",
  "key": "class",
  "topic": "classroom objects",
  "lessonId": "OS-A1-things-in-my-classroom",
  "source": "docs/benchmarks/language-teaching/20261112-outcome-sim-v1/outcome_cases.jsonl#OUT-VOC-A1-L01",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Things in my classroom",
  "objective": "Name classroom objects.",
  "spec": {
   "objectives": [
    "Name classroom objects."
   ],
   "successCriteria": [
    "Names the object correctly",
    "Uses \"This is a ...\""
   ],
   "vocabulary": [
    "desk",
    "chair",
    "pen",
    "book",
    "board",
    "bag"
   ],
   "grammar": [
    "This is a ..."
   ],
   "functions": [
    "naming objects"
   ],
   "skills": [
    "integrated"
   ],
   "examples": [
    "This is a pen.",
    "This is a chair."
   ],
   "items": [
    {
     "id": "v1",
     "prompt": "Complete: \"I sit on a ___.\"",
     "acceptedAnswers": [
      "chair",
      "a chair"
     ],
     "targetForms": [
      "chair"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "v2",
     "prompt": "Complete: \"The teacher writes on the ___.\"",
     "acceptedAnswers": [
      "board",
      "the board"
     ],
     "targetForms": [
      "board"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-VO-home-rooms",
  "key": "rooms",
  "topic": "rooms in a home",
  "lessonId": "RS-A1-VO-01",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/vocabulary.json#VO-01",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Places in my home",
  "objective": "Name the kitchen, bedroom, bathroom and garden and say what we do in each place.",
  "spec": {
   "objectives": [
    "Name the kitchen, bedroom, bathroom and garden and say what we do in each place."
   ],
   "successCriteria": [
    "Matches each place to its use",
    "Uses the correct place word in a sentence"
   ],
   "vocabulary": [
    "kitchen",
    "bedroom",
    "bathroom",
    "garden"
   ],
   "grammar": [
    "in the + place"
   ],
   "functions": [
    "describing a home"
   ],
   "skills": [
    "reading",
    "writing"
   ],
   "examples": [
    "I cook dinner in the kitchen.",
    "My bed is in the bedroom.",
    "We wash our hands in the bathroom.",
    "There is a tree in the garden."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Complete: \"I make toast in the ___.\"",
     "acceptedAnswers": [
      "kitchen"
     ],
     "targetForms": [
      "kitchen"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "p2",
     "prompt": "Complete: \"My bed is in the ___.\"",
     "acceptedAnswers": [
      "bedroom"
     ],
     "targetForms": [
      "bedroom"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-VO-numbers-time",
  "key": "numtime",
  "topic": "numbers and time words",
  "lessonId": "RS-A1-LS-01",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/listening.json#LS-01",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "What time is it?",
  "objective": "Identify the final time agreed in a short written dialogue, including changed times and quarter/half past or to.",
  "spec": {
   "objectives": [
    "Identify the final time agreed in a short written dialogue, including changed times and quarter/half past or to."
   ],
   "successCriteria": [
    "Finds the final time after a correction",
    "Converts half past, quarter past and quarter to into clock times"
   ],
   "vocabulary": [
    "o'clock",
    "half past",
    "quarter past",
    "quarter to",
    "start",
    "leave"
   ],
   "grammar": [
    "time expressions"
   ],
   "functions": [
    "asking about times",
    "correcting information"
   ],
   "skills": [
    "reading dialogue",
    "listening comprehension (text)"
   ],
   "examples": [
    "A: Is the class at nine? B: No, at ten.",
    "A: Meet at quarter to two. B: OK."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "What time is the lesson?",
     "material": "A: Is the lesson at five? B: No, it is at six.",
     "acceptedAnswers": [
      "6",
      "six"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "p2",
     "prompt": "What time do they meet?",
     "material": "A: See you at quarter past two. B: Great, quarter past two.",
     "acceptedAnswers": [
      "2:15",
      "2.15",
      "two fifteen",
      "quarter past two"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A1-VO-days-months",
  "key": "days",
  "topic": "days and months",
  "lessonId": "RS-A1-GR-07",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/grammar.json#GR-07",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "When things happen",
  "objective": "Use in, on and at with time words.",
  "spec": {
   "objectives": [
    "Use in, on and at with time words."
   ],
   "successCriteria": [
    "at + clock time",
    "on + day",
    "in + month"
   ],
   "vocabulary": [
    "Monday",
    "July",
    "o'clock"
   ],
   "grammar": [
    "prepositions of time"
   ],
   "functions": [
    "saying when"
   ],
   "skills": [
    "writing",
    "reading"
   ],
   "examples": [
    "The lesson starts at 7 o'clock.",
    "I play tennis on Monday.",
    "My holiday is in July."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Write in, on or at: My train leaves ___ 5 o'clock.",
     "acceptedAnswers": [
      "at"
     ],
     "targetForms": [
      "at"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "p2",
     "prompt": "Write in, on or at: They get married ___ April.",
     "acceptedAnswers": [
      "in"
     ],
     "targetForms": [
      "in"
     ],
     "criteria": [
      2
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-VO-jobs-workplaces",
  "key": "jobs",
  "topic": "jobs and workplaces",
  "lessonId": "OS-A2-jobs-and-workplaces",
  "source": "docs/benchmarks/language-teaching/20261112-outcome-sim-v1/outcome_cases.jsonl#OUT-VOC-A2-L02",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Jobs and workplaces",
  "objective": "Match jobs to workplaces.",
  "spec": {
   "objectives": [
    "Match jobs to workplaces."
   ],
   "successCriteria": [
    "Chooses the right workplace word",
    "Uses \"works in/at\""
   ],
   "vocabulary": [
    "nurse",
    "hospital",
    "chef",
    "restaurant",
    "farmer",
    "farm",
    "pilot",
    "airport"
   ],
   "grammar": [
    "He/She works in/at ..."
   ],
   "functions": [
    "describing jobs"
   ],
   "skills": [
    "integrated"
   ],
   "examples": [
    "A teacher works at a school."
   ],
   "items": [
    {
     "id": "v1",
     "prompt": "Complete: \"A chef works in a ___.\"",
     "acceptedAnswers": [
      "restaurant",
      "a restaurant"
     ],
     "targetForms": [
      "restaurant"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "v2",
     "prompt": "Complete: \"A pilot works at an ___.\"",
     "acceptedAnswers": [
      "airport",
      "an airport"
     ],
     "targetForms": [
      "airport"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-VO-weather",
  "key": "weather",
  "topic": "weather words",
  "lessonId": "OS-A2-weather-words",
  "source": "docs/benchmarks/language-teaching/20261112-outcome-sim-v1/outcome_cases.jsonl#OUT-VOC-A2-L03",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Weather words",
  "objective": "Describe the weather.",
  "spec": {
   "objectives": [
    "Describe the weather."
   ],
   "successCriteria": [
    "Uses the right weather adjective",
    "Uses \"It is ...\" for weather"
   ],
   "vocabulary": [
    "sunny",
    "rainy",
    "windy",
    "cloudy",
    "hot",
    "cold"
   ],
   "grammar": [
    "It is + adjective"
   ],
   "functions": [
    "describing weather"
   ],
   "skills": [
    "integrated"
   ],
   "examples": [
    "It is sunny today."
   ],
   "items": [
    {
     "id": "v1",
     "prompt": "Complete: \"Take an umbrella. It is ___ today.\"",
     "acceptedAnswers": [
      "rainy"
     ],
     "targetForms": [
      "rainy"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "v2",
     "prompt": "Complete: \"My hat flew away! It is very ___.\"",
     "acceptedAnswers": [
      "windy"
     ],
     "targetForms": [
      "windy"
     ],
     "criteria": [
      1
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-VO-clothes-shopping",
  "key": "clothes",
  "topic": "clothes, colours and sizes",
  "lessonId": "RS-A2-FN-08",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/functional.json#FN-08",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "In a clothes shop",
  "objective": "Ask the price with \"How much is/are ...?\" and ask for a size or colour with \"Do you have this in ...?\".",
  "spec": {
   "objectives": [
    "Ask the price with \"How much is/are ...?\" and ask for a size or colour with \"Do you have this in ...?\"."
   ],
   "successCriteria": [
    "Asks How much is (one thing) or How much are (more than one)",
    "Asks Do you have this in + size or colour",
    "Makes full questions, not statements"
   ],
   "vocabulary": [
    "hat",
    "jacket",
    "socks",
    "small",
    "price",
    "size"
   ],
   "grammar": [
    "How much is/are + noun",
    "Do you have + noun + in + size"
   ],
   "functions": [
    "asking prices",
    "asking for sizes"
   ],
   "skills": [
    "writing",
    "speaking"
   ],
   "examples": [
    "How much is this hat?",
    "How much are the socks?",
    "Do you have this jacket in small?"
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Correct this question: \"How much cost this hat?\"",
     "acceptedAnswers": [
      "how much is this hat",
      "how much does this hat cost"
     ],
     "targetForms": [
      "how much is"
     ],
     "criteria": [
      1,
      3
     ]
    },
    {
     "id": "p2",
     "prompt": "You want the same jacket in small. Ask the shop assistant.",
     "acceptedAnswers": [
      "do you have this jacket in small",
      "do you have this in small"
     ],
     "targetForms": [
      "do you have"
     ],
     "criteria": [
      2,
      3
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-VO-appearance",
  "key": "appear",
  "topic": "describing appearance",
  "lessonId": "RS-A2-WR-07",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/writing.json#WR-07",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Describing someone I know",
  "objective": "Describe a person's appearance and personality in short sentences.",
  "spec": {
   "objectives": [
    "Describe a person's appearance and personality in short sentences."
   ],
   "successCriteria": [
    "Uses has/has got with hair, eyes and other features",
    "Uses is with adjectives for height, age and personality",
    "Writes complete sentences with a capital letter"
   ],
   "vocabulary": [
    "hair",
    "eyes",
    "tall",
    "kind",
    "funny",
    "friendly"
   ],
   "grammar": [
    "has / has got for features",
    "is + adjective"
   ],
   "functions": [
    "describing people"
   ],
   "skills": [
    "writing"
   ],
   "examples": [
    "My aunt has long black hair. She is tall and cheerful.",
    "The doctor has blue eyes. He is calm."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Complete: \"My cousin ___ brown eyes.\" (has / have)",
     "acceptedAnswers": [
      "has"
     ],
     "targetForms": [
      "has"
     ],
     "criteria": [
      1
     ]
    },
    {
     "id": "p2",
     "prompt": "Write two sentences about a famous actor: one about hair or eyes and one about personality.",
     "acceptedAnswers": [
      "The actor has dark hair. He is funny."
     ],
     "targetForms": [
      "The actor has dark hair. He is funny."
     ],
     "criteria": [
      1,
      2,
      3
     ]
    }
   ]
  }
 },
 {
  "outcomeId": "EN-F-A2-FN-polite-requests",
  "key": "polite",
  "topic": "polite requests",
  "lessonId": "RS-A1-FN-01",
  "source": "research/deep-learning-simulation-v2/benchmark/outcomes/functional.json#FN-01",
  "itemsFrom": "spec.items",
  "rule": "first listed lessonId",
  "title": "Asking nicely",
  "objective": "Ask for something politely using \"Can I have ... please?\" instead of a blunt command.",
  "spec": {
   "objectives": [
    "Ask for something politely using \"Can I have ... please?\" instead of a blunt command."
   ],
   "successCriteria": [
    "Uses Can/Could I have or I would like to request something",
    "Adds please",
    "Avoids bare commands like \"Give me\""
   ],
   "vocabulary": [
    "please",
    "thank you",
    "water",
    "coffee",
    "tea",
    "can I have"
   ],
   "grammar": [
    "Can I have + noun",
    "I would like + noun"
   ],
   "functions": [
    "making polite requests"
   ],
   "skills": [
    "writing",
    "speaking"
   ],
   "examples": [
    "Can I have a glass of water, please?",
    "I would like a tea, please."
   ],
   "items": [
    {
     "id": "p1",
     "prompt": "Make this polite: \"Give me a coffee.\"",
     "acceptedAnswers": [
      "can i have a coffee please",
      "could i have a coffee please",
      "i would like a coffee please"
     ],
     "targetForms": [
      "can i have"
     ],
     "criteria": [
      1,
      2,
      3
     ]
    },
    {
     "id": "p2",
     "prompt": "You are thirsty in a cafe. Ask for a tea politely.",
     "acceptedAnswers": [
      "can i have a tea please",
      "could i have a tea please",
      "i'd like a tea please"
     ],
     "targetForms": [
      "can i have"
     ],
     "criteria": [
      1,
      2
     ]
    }
   ]
  }
 }
] as never;

const SEC1: { outcomeId: string; key: string; topic: string; lessonId: string; source: string; rule: string; form: Form }[] = [
 {
  "outcomeId": "EN-F-A1-GR-article-a-an",
  "key": "aan",
  "topic": "a and an",
  "lessonId": "ESL1-articles",
  "source": "src/offline/eslFixtures.ts LESSONS.articles (frozen ESL1-5 lesson, section-1 form)",
  "rule": "section-1 form: the ESL1 lesson used in ESL2-ESL5",
  "form": "articles"
 },
 {
  "outcomeId": "EN-F-A1-GR-copula-be",
  "key": "cop",
  "topic": "am, is and are",
  "lessonId": "ESL1-copula",
  "source": "src/offline/eslFixtures.ts LESSONS.copula (frozen ESL1-5 lesson, section-1 form)",
  "rule": "section-1 form: the ESL1 lesson used in ESL2-ESL5",
  "form": "copula"
 },
 {
  "outcomeId": "EN-F-A2-GR-third-person-s",
  "key": "s3",
  "topic": "he, she and it with -s",
  "lessonId": "ESL1-thirdS",
  "source": "src/offline/eslFixtures.ts LESSONS.thirdS (frozen ESL1-5 lesson, section-1 form)",
  "rule": "section-1 form: the ESL1 lesson used in ESL2-ESL5",
  "form": "thirdS"
 }
];

const fromSec1 = (x: (typeof SEC1)[number]): Esl6Lesson => ({ outcomeId: x.outcomeId, key: x.key, topic: x.topic, lessonId: x.lessonId, source: x.source, rule: x.rule, title: LESSONS[x.form].title, objective: LESSONS[x.form].objective, spec: LESSONS[x.form].spec });
/** The ESL6 lesson of each of the 30 outcomes, by outcome id. */
export const LESSONS6: Record<string, Esl6Lesson> = Object.fromEntries([...SEC1.map(fromSec1), ...(OTHER as unknown as Esl6Lesson[])].map((l) => [l.outcomeId, { ...l, spec: { functions: [], skills: [], ...l.spec } }]));
export const OUTCOME_IDS = Object.keys(LESSONS6).sort();
if (OUTCOME_IDS.length !== 30) throw new Error(`esl6Fixtures: expected 30 outcomes, got ${OUTCOME_IDS.length}`);

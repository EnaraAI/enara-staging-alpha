// TRACK 2 (teaching quality, owner decision 1): the checked rule bank. One entry per outcome (33 A1-A2 form outcomes of the outcome bank).
// When the ruleBank switch is on, this is the ONLY source of rule text the tutor is given: the rule line, its right/wrong minimal pair and the
// worked example come from here, never from a success-criterion string. Checked by three reviewer agents (majority vote; every disagreement fixed),
// see research/deep-learning-simulation-v2/reports/exp4/teach2/RULEBANK_REVIEW.md (SIMULATION ONLY). Tests: test/teach2RuleBank.test.ts.
//
// Fields:
//   rule        one plain sentence, 20 words or fewer, no grammar jargon beyond the lesson's own labels
//   right/wrong a minimal pair: the two sentences differ ONLY in the usual error (post-check: they must differ)
//   usualError  the usual (Arabic-L1) error in a few words
//   models      worked examples with DIFFERENT answer forms (the contrast case) in everyday scenes; the engine picks one whose form differs from the
//               open task's answer and that the example guard passes (never an answer to an item the learner will solve)
//   confusable  the form to interleave with once this one is right twice (M5); `item` is one mixed item with its answer
//   keywords    words that identify the success criterion that matches this outcome (criterion choice, never "criterion 1")
//   kind        grammar | vocab | mechanics | function; vocab entries use the vocabulary template (meaning from a clue, spelling, use in a frame)
//   targetWords vocab only: the words of the set (the worked example's result must contain one)
//   clue        vocab only: one meaning clue and its word, for the worked example
//   confusion   vocab only: the real confusion to contrast (e.g. rain / rainy); the only right/wrong contrast a vocabulary rule line may use

export type RuleKind = 'grammar' | 'vocab' | 'mechanics' | 'function';
export interface RuleModel { form: string; sentence: string; /** regex (on the open task's answer, lower case) for answers of this same form: such a model is not a contrast */ keyPattern?: string }
export interface RuleBankEntry {
  id: string;
  kind: RuleKind;
  rule: string;
  right: string;
  wrong: string;
  usualError: string;
  models: RuleModel[];
  confusable?: { form: string; note: string; item: string; answer: string };
  keywords: string[];
  targetWords?: string[];
  clue?: { clue: string; word: string };
  confusion?: { right: string; wrong: string };
}

export const RULE_BANK_VERSION = 'rb-v1';

export const RULE_BANK: RuleBankEntry[] = [
  // ------------------------------------------------------------------ A1 grammar
  {
    id: 'EN-F-A1-GR-article-a-an', kind: 'grammar',
    rule: 'Put a or an before one thing: an before a vowel sound (a, e, i, o, u), a before others.',
    right: 'An owl sleeps all day.', wrong: 'A owl sleeps all day.',
    usualError: 'leaving out a/an, or a before a vowel sound',
    models: [{ form: 'an', sentence: 'The zoo has an eagle.' }, { form: 'a', sentence: 'The zoo has a camel.' }],
    confusable: { form: 'the', note: 'the for a thing both people already know', item: 'Write a, an or the: The pirate found a map. ___ map was old.', answer: 'The' },
    keywords: ['a before', 'an before', 'vowel', 'consonant'],
  },
  {
    id: 'EN-F-A1-GR-article-the', kind: 'grammar',
    rule: 'Use the for one thing we already talked about or both know; use no the for things in general.',
    right: 'Mia drew a horse. The horse was purple.', wrong: 'Mia drew a horse. Horse was purple.',
    usualError: 'leaving out the for a known thing, or using the for things in general',
    models: [{ form: 'the', sentence: 'We saw a robot. The robot could dance.', keyPattern: '^the$' }, { form: 'no article', sentence: 'Horses eat grass.' }],
    confusable: { form: 'a/an', note: 'a or an the first time we name one thing', item: 'Write a or the: The pirate had ___ parrot. It was green.', answer: 'a' },
    keywords: ['the', 'second mention', 'already mentioned', 'both people know'],
  },
  {
    id: 'EN-F-A1-GR-copula-be', kind: 'grammar',
    rule: 'An English sentence needs am, is or are: I am, he/she/it is, you/we/they are.',
    right: 'The giraffe is very tall.', wrong: 'The giraffe very tall.',
    usualError: 'leaving out am/is/are, or is with every subject',
    models: [{ form: 'is', sentence: 'The zebra is black and white.' }, { form: 'are', sentence: 'Zebras are black and white.' }, { form: 'am', sentence: 'I am on the bus.' }],
    confusable: { form: 'there is/are', note: 'there is / there are for saying something exists', item: 'Write is or are: There ___ two ducks on the lake.', answer: 'are' },
    keywords: ['am', 'is', 'are', 'leave out', 'be'],
  },
  {
    id: 'EN-F-A1-GR-possessive-adjectives', kind: 'grammar',
    rule: 'Choose the word by the owner: my, your, his (a man), her (a woman), our, their (more than one).',
    right: 'Lina feeds her rabbit.', wrong: 'Lina feeds his rabbit.',
    usualError: 'his/her chosen by the thing, not the owner; they instead of their',
    models: [{ form: 'his', sentence: 'Omar is brushing his horse.' }, { form: 'their', sentence: 'The girls packed their kites.' }, { form: 'her', sentence: 'Laila waters her plants.' }],
    confusable: { form: 'subject pronouns', note: 'he/she/they do the action; his/her/their show the owner', item: 'Write they or their: ___ kite is very big.', answer: 'Their' },
    keywords: ['my', 'his', 'her', 'their', 'owner', 'possessive'],
  },
  {
    id: 'EN-F-A1-GR-prepositions-time', kind: 'grammar',
    rule: 'Use at with clock times, on with days and dates, in with months and years.',
    right: 'The film starts at six.', wrong: 'The film starts in six.',
    usualError: 'in for every time word',
    models: [{ form: 'on', sentence: 'The zoo is closed on Saturday.' }, { form: 'in', sentence: 'It snows in January.' }, { form: 'at', sentence: 'The shop opens at nine.' }],
    confusable: { form: 'prepositions of place', note: 'in/on for places (in the box, on the table)', item: 'Write in or on: The cat is ___ the box.', answer: 'in' },
    keywords: ['at', 'on', 'in', 'clock', 'day', 'month', 'time'],
  },
  {
    id: 'EN-F-A1-GR-there-is-are', kind: 'grammar',
    rule: 'Say there is for one thing and there are for two or more; the noun after a number takes -s.',
    right: 'There are four ducks on the lake.', wrong: 'There are four duck on the lake.',
    usualError: 'a singular noun after a number, or no is/are after there',
    models: [{ form: 'there is', sentence: 'There is a frog in the pond.', keyPattern: '^(there )?is$' }, { form: 'there are', sentence: 'There are two frogs in the pond.', keyPattern: '^(there )?are$' }],
    confusable: { form: 'some/any', note: 'there are some (statements) / are there any (questions)', item: 'Write some or any: Are there ___ fish in the pond?', answer: 'any' },
    keywords: ['is/are', 'there is', 'there are', 'chooses is', 'plural'],
  },
  {
    id: 'EN-F-A1-GR-can-ability', kind: 'grammar',
    rule: 'After can or can\'t, use the plain verb with no -s, for every person.',
    right: 'A penguin can swim.', wrong: 'A penguin can swims.',
    usualError: '-s on the verb after can for he/she/it',
    models: [{ form: 'can', sentence: 'A parrot can talk.', keyPattern: '\\bcan (?!not\\b)[a-z]+|^can$' }, { form: "can't", sentence: "A penguin can't fly.", keyPattern: "can'?t|cannot|can not" }],
    confusable: { form: 'third person -s', note: 'without can, he/she/it takes -s (she reads)', item: 'Write the correct form: The parrot ___ (talk) a lot.', answer: 'talks' },
    keywords: ['can', 'base verb', "can't", 'can +'],
  },
  {
    id: 'EN-F-A1-GR-word-order-svo', kind: 'grammar',
    rule: 'Put the person or thing first, then the action, then the rest; a describing word goes before its noun.',
    right: 'The farmer feeds the cows.', wrong: 'Feeds the farmer the cows.',
    usualError: 'the verb before the subject, or the adjective after the noun',
    models: [{ form: 'subject first', sentence: 'The monkey eats a banana.' }, { form: 'adjective first', sentence: 'The farmer has a red tractor.' }],
    confusable: { form: 'frequency adverbs', note: 'always/never sit before the action word', item: 'Put in order: "never / the owl / sleeps / at night"', answer: 'The owl never sleeps at night' },
    keywords: ['subject first', 'subject', 'verb', 'object', 'order'],
  },
  {
    id: 'EN-F-A1-GR-capitals-full-stops', kind: 'mechanics',
    rule: 'Start each sentence with a capital letter, write I as a capital, and end with a full stop.',
    right: 'Today I saw a big ship.', wrong: 'today i saw a big ship',
    usualError: 'one long line joined with and, no capitals or full stops',
    models: [{ form: 'capital + full stop', sentence: 'The zoo opens on Sunday.' }, { form: 'capital I', sentence: 'Yesterday I fed the ducks.' }],
    keywords: ['capital', 'full stop', 'sentence'],
  },
  // ------------------------------------------------------------------ A2 grammar
  {
    id: 'EN-F-A2-GR-third-person-s', kind: 'grammar',
    rule: 'After he, she or it, the verb takes -s (plays), -es (watches) or -ies (cries).',
    right: 'The robot washes the floor.', wrong: 'The robot wash the floor.',
    usualError: 'no -s after he/she/it, or -s where -es/-ies is needed',
    models: [{ form: '-s', sentence: 'The farmer grows carrots.', keyPattern: '(?<![es])s$' }, { form: '-es', sentence: 'The robot fixes cars.', keyPattern: '(?<!i)es$' }, { form: '-ies', sentence: 'The baby bird flies away.', keyPattern: 'ies$' }, { form: 'no -s', sentence: 'The farmers grow carrots.', keyPattern: '^[a-z]*[^s]$' }],
    confusable: { form: 'no -s after I/you/we/they', note: 'no -s after I, you, we, they', item: 'Write the correct form: The ducks ___ (swim) in the lake.', answer: 'swim' },
    keywords: ['-s', '-es', 'he, she', 'he/she/it', 'third person', 'adds -s'],
  },
  {
    id: 'EN-F-A2-GR-present-continuous', kind: 'grammar',
    rule: 'For something happening now, use am, is or are plus the verb with -ing.',
    right: 'At the zoo, the monkey is eating a banana.', wrong: 'At the zoo, the monkey eating a banana.',
    usualError: 'leaving out am/is/are before -ing, or the plain present for now',
    models: [{ form: 'is + -ing', sentence: 'At the zoo, a lion is sleeping.', keyPattern: '\\bis [a-z]+ing\\b' }, { form: 'are + -ing', sentence: 'At the zoo, two bears are swimming.', keyPattern: '\\bare [a-z]+ing\\b' }, { form: 'am + -ing', sentence: 'On the train, I am reading a comic.', keyPattern: '\\bam [a-z]+ing\\b' }],
    confusable: { form: 'present simple', note: 'every day = plain present; now = am/is/are + -ing', item: 'Write the correct form: Every day the zoo keeper ___ (feed) the bears.', answer: 'feeds' },
    keywords: ['present continuous', 'is/are', '-ing', 'now'],
  },
  {
    id: 'EN-F-A2-GR-past-simple-regular', kind: 'grammar',
    rule: 'For a finished action in the past, add -ed to the verb, even when a word like yesterday is there.',
    right: 'On Monday the farmer counted the sheep.', wrong: 'On Monday the farmer count the sheep.',
    usualError: 'the present form of the verb with a past time word',
    models: [{ form: '-ed', sentence: 'On Monday the zoo keeper washed the elephant.', keyPattern: '(?<!i)ed\\b' }, { form: '-d', sentence: 'Last year the bears moved to a new zoo.', keyPattern: '(?<!i)ed\\b' }, { form: '-ied', sentence: 'Last week the puppy carried a stick.', keyPattern: 'ied\\b' }],
    confusable: { form: 'irregular past', note: 'some verbs have their own past form (go - went)', item: 'Write the past form: Last summer the ducks ___ (fly) south.', answer: 'flew' },
    keywords: ['-ed', 'regular'],
  },
  {
    id: 'EN-F-A2-GR-past-simple-irregular', kind: 'grammar',
    rule: 'Some common verbs have their own past form, with no -ed: go - went, buy - bought, see - saw.',
    right: 'Last night our cat caught a mouse.', wrong: 'Last night our cat catched a mouse.',
    usualError: '-ed on an irregular verb, or no change',
    models: [{ form: 'came', sentence: 'Last spring the swallows came back.' }, { form: 'wrote', sentence: 'The pirate wrote a secret note.' }, { form: 'found', sentence: 'The pirate found a gold coin.' }],
    confusable: { form: 'regular -ed', note: 'most verbs add -ed (walk - walked)', item: 'Write the past form: Last night the robots ___ (dance) a lot.', answer: 'danced' },
    keywords: ['went', 'bought', 'saw', 'irregular', 'avoids -ed'],
  },
  {
    id: 'EN-F-A2-GR-past-questions-did', kind: 'grammar',
    rule: 'To ask about the past, put did before the person and use the plain verb after it: Did you eat?',
    right: 'Did the pirate find the gold?', wrong: 'Did the pirate found the gold?',
    usualError: 'the past form after did, or a question with no did',
    models: [{ form: 'Did + subject + verb', sentence: 'Did the robot win the race?' }, { form: 'Wh- + did', sentence: 'Where did the pirate hide the map?' }],
    confusable: { form: 'past statements', note: 'no did in a statement: the verb itself takes the past form', item: 'Write the past form: The robot ___ (fix) the clock.', answer: 'fixed' },
    keywords: ['questions with did', 'did', 'asks questions', 'question'],
  },
  {
    id: 'EN-F-A2-GR-frequency-adverbs', kind: 'grammar',
    rule: 'Put always, usually, sometimes or never before the action word, but after am, is or are.',
    right: 'Owls usually hunt at night.', wrong: 'Owls hunt usually at night.',
    usualError: 'the adverb after the main verb or at the end',
    models: [{ form: 'before the verb', sentence: 'Cats never eat carrots.', keyPattern: '\\b(always|usually|sometimes|never|often) (?!(is|am|are)\\b)[a-z]+' }, { form: 'after be', sentence: 'The zoo is always busy.', keyPattern: '\\b(is|am|are) (always|usually|sometimes|never|often)\\b' }],
    confusable: { form: 'third person -s', note: 'the verb after he/she/it still takes -s (she always reads)', item: 'Put in order: "sometimes / the parrot / sings"', answer: 'The parrot sometimes sings' },
    keywords: ['always', 'usually', 'sometimes', 'never', 'before the main verb', 'adverb'],
  },
  {
    id: 'EN-F-A2-GR-comparatives', kind: 'grammar',
    rule: 'Short words add -er (big - bigger, easy - easier); long words use more; then than.',
    right: 'A horse is heavier than a dog.', wrong: 'A horse is heavyer than a dog.',
    usualError: 'spelling the -er form by sound (hapier, biger), or no than',
    models: [{ form: '-er', sentence: 'A giraffe is taller than a zebra.', keyPattern: '^[a-z]+er$' }, { form: 'more', sentence: 'A tiger is more dangerous than a cat.', keyPattern: '^more ' }, { form: 'double letter', sentence: 'A hippo is fatter than a pig.', keyPattern: '([a-z])\\1er$' }],
    confusable: { form: 'superlatives', note: 'two things = -er than; three or more = the -est', item: 'Complete: The whale is the ___ (big) animal in the sea.', answer: 'biggest' },
    keywords: ['comparative', 'forms the comparative', '-er', 'more', 'than'],
  },
  {
    id: 'EN-F-A2-GR-going-to', kind: 'grammar',
    rule: 'For a plan, say am, is or are, then going to, then the plain verb.',
    right: 'The farmer is going to sell his sheep.', wrong: 'The farmer going to sell his sheep.',
    usualError: 'leaving out am/is/are before going to',
    models: [{ form: 'is going to', sentence: 'The pilot is going to fly to Rome.', keyPattern: '\\bis going to\\b' }, { form: 'am going to', sentence: 'I am going to feed the ducks.', keyPattern: "\\b(am|i'm) going to\\b" }, { form: 'are going to', sentence: 'The robots are going to paint the bridge.', keyPattern: '\\bare going to\\b' }],
    confusable: { form: 'present continuous', note: 'is + -ing for now; is going to + verb for a plan', item: 'Write the correct form: Look! The cat ___ (climb) the tree.', answer: 'is climbing' },
    keywords: ['going to', 'am/is/are going to'],
  },
  {
    id: 'EN-F-A2-GR-much-many', kind: 'grammar',
    rule: 'Use many with things we can count (books, cars) and much with things we cannot count (milk, money).',
    right: 'How many ducks are on the lake?', wrong: 'How much ducks are on the lake?',
    usualError: 'much with countable plurals or many with uncountable nouns',
    models: [{ form: 'many', sentence: 'The zoo does not have many lions.' }, { form: 'much', sentence: 'The desert does not get much rain.' }],
    confusable: { form: 'a few / a little', note: 'a few + count nouns, a little + non-count nouns', item: 'Write a few or a little: The horse needs ___ hay.', answer: 'a little' },
    keywords: ['many', 'much', 'countable', 'uncountable'],
  },
  {
    id: 'EN-F-A2-GR-some-any', kind: 'grammar',
    rule: 'Use some in positive sentences, offers and requests; use any in negatives and most questions.',
    right: 'The farmer doesn\'t sell any milk.', wrong: 'The farmer doesn\'t sell some milk.',
    usualError: 'some in a negative or a question, or any in a positive sentence',
    models: [{ form: 'any (negative)', sentence: 'The robot doesn\'t need any oil.', keyPattern: '^any$' }, { form: 'some (positive)', sentence: 'The robot wants some paint.', keyPattern: '^some$' }, { form: 'any (question)', sentence: 'Are there any frogs in the pond?', keyPattern: '^any$' }],
    confusable: { form: 'a/an', note: 'a/an for one countable thing; some/any for more or for non-count nouns', item: 'Write a or some: The horse wants ___ apple.', answer: 'an' },
    keywords: ['some', 'any'],
  },
  {
    id: 'EN-F-A2-GR-conjunctions', kind: 'grammar',
    rule: 'Join two ideas in one sentence: and adds, but shows a difference, because gives a reason.',
    right: 'The dog barked because it was hungry.', wrong: 'The dog barked and it was hungry.',
    usualError: 'chaining every idea with and, whatever the meaning',
    models: [{ form: 'but', sentence: 'The lion is big but the mouse is small.', keyPattern: '\\bbut\\b' }, { form: 'because', sentence: 'The ducks swam because the sun was hot.', keyPattern: '\\bbecause\\b' }, { form: 'and', sentence: 'The cat sleeps and the dog plays.', keyPattern: '\\band\\b' }],
    keywords: ['and', 'but', 'because', 'join', 'linking'],
  },
  {
    id: 'EN-F-A2-FN-polite-requests', kind: 'function',
    rule: 'Ask politely with Can I have ... or I would like ..., and add please.',
    right: 'Can I have a red balloon, please?', wrong: 'Give me a red balloon.',
    usualError: 'a bare command or I want',
    models: [{ form: 'Can I have', sentence: 'At the zoo gate: Can I have a zoo map, please?', keyPattern: '\\b(can|could) i have\\b' }, { form: 'I would like', sentence: 'At the zoo gate: I would like a zoo map, please.', keyPattern: "\\b(would|'d) like\\b" }],
    keywords: ['can i have', 'could i have', 'i would like', 'please', 'request'],
  },
  // ------------------------------------------------------------------ vocabulary (template: meaning from a clue, spelling, use in a frame)
  {
    id: 'EN-F-A1-VO-family', kind: 'vocab',
    rule: 'Family words name people in the family; write all their letters: mother, father, brother, sister.',
    right: 'The farmer\'s wife grows roses.', wrong: 'The farmer\'s woman grows roses.',
    usualError: 'vowels left out or changed (brthr, mather), or a word-for-word Arabic meaning (his woman for his wife)',
    models: [{ form: 'husband', sentence: 'The baker\'s husband drives a bus.' }, { form: 'parents', sentence: 'The twins visit their parents.' }],
    keywords: ['family word', 'family'],
    targetWords: ['mother', 'father', 'brother', 'sister', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'wife', 'husband', 'son', 'daughter', 'parents'],
    clue: { clue: 'the man a woman is married to', word: 'husband' },
    confusion: { right: 'his wife', wrong: 'his woman' },
  },
  {
    id: 'EN-F-A1-VO-food-drink', kind: 'vocab',
    rule: 'We eat food, and soup too; we drink liquids like water, juice and milk.',
    right: 'Bears eat soup in stories.', wrong: 'Bears drink soup in stories.',
    usualError: 'drink with soup or spoon food',
    models: [{ form: 'eat', sentence: 'Monkeys eat bananas.' }, { form: 'drink', sentence: 'Cows drink water in the field.' }],
    keywords: ['food', 'names the food', 'like'],
    targetWords: ['bread', 'rice', 'apple', 'milk', 'egg', 'fish', 'soup', 'water', 'juice', 'tea', 'cheese', 'chicken', 'banana', 'bananas', 'eat', 'drink'],
    clue: { clue: 'it is yellow and long, and monkeys love it', word: 'banana' },
    confusion: { right: 'eat soup', wrong: 'drink soup' },
  },
  {
    id: 'EN-F-A1-VO-classroom-objects', kind: 'vocab',
    rule: 'Classroom things have short English names; keep p (not b) and v (not f): pen, bag.',
    right: 'The robot has a blue pen.', wrong: 'The robot has a blue ben.',
    usualError: 'b for p or f for v, or an Arabic phrase word for word',
    models: [{ form: 'rubber', sentence: 'The robot has a rubber.' }, { form: 'scissors', sentence: 'The robot cuts paper with scissors.' }],
    keywords: ['names the object', 'object', 'this is a'],
    targetWords: ['desk', 'chair', 'pen', 'pencil', 'book', 'board', 'bag', 'ruler', 'rubber', 'marker', 'notebook', 'scissors'],
    clue: { clue: 'you cut paper with it', word: 'scissors' },
    confusion: { right: 'pen', wrong: 'ben' },
  },
  {
    id: 'EN-F-A1-VO-home-rooms', kind: 'vocab',
    rule: 'Each room has its own name; write all its letters: kitchen, bedroom, bathroom, living room.',
    right: 'The cat sleeps in the kitchen.', wrong: 'The cat sleeps in the kitchn.',
    usualError: 'vowels left out (kitchn) or an Arabic phrase translated (the sleeping room)',
    models: [{ form: 'garage', sentence: 'The bikes are in the garage.' }, { form: 'hall', sentence: 'The coats hang in the hall.' }],
    keywords: ['place', 'room', 'place word', 'matches each place'],
    targetWords: ['kitchen', 'bedroom', 'bathroom', 'garden', 'living room', 'garage', 'hall', 'dining room'],
    clue: { clue: 'the place where a car sleeps at night', word: 'garage' },
    confusion: { right: 'bedroom', wrong: 'sleeping room' },
  },
  {
    id: 'EN-F-A1-VO-numbers-time', kind: 'vocab',
    rule: 'Number words keep f and v apart (five, fifteen, fifty); an hour is time, a clock shows it.',
    right: 'A week has seven days.', wrong: 'A week has sefen days.',
    usualError: 'v for f in a number (fivteen), or clock for hour',
    models: [{ form: 'five', sentence: 'A hand has five fingers.' }, { form: 'hour', sentence: 'The bus ride takes one hour.' }],
    keywords: ['number', 'time', 'clock', 'half past', 'quarter'],
    targetWords: ['five', 'fifteen', 'fifty', 'seven', 'eleven', 'twelve', 'twenty', 'thirty', 'forty', 'hour', 'minute', 'clock', "o'clock", 'half past', 'quarter'],
    clue: { clue: 'sixty minutes', word: 'hour' },
    confusion: { right: 'fifteen', wrong: 'fivteen' },
  },
  {
    id: 'EN-F-A1-VO-days-months', kind: 'vocab',
    rule: 'Days and months have fixed spellings and start with a capital letter: Wednesday, February.',
    right: 'The circus comes on Wednesday.', wrong: 'The circus comes on Wensday.',
    usualError: 'letters left out or changed (Wensday), or a month named by its number',
    models: [{ form: 'Thursday', sentence: 'After Wednesday comes Thursday.' }, { form: 'August', sentence: 'After July comes August.' }],
    keywords: ['day', 'month', 'days', 'months'],
    targetWords: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    clue: { clue: 'the day after Wednesday', word: 'Thursday' },
    confusion: { right: 'Wednesday', wrong: 'Wensday' },
  },
  {
    id: 'EN-F-A1-VO-common-adjectives', kind: 'vocab',
    rule: 'Many describing words come in opposite pairs: big - small, hot - cold, old - new, old - young.',
    right: 'An elephant is big and a mouse is small.', wrong: 'An elephant is big and a mouse is little big.',
    usualError: 'the wrong partner of a pair (young for things, long for people)',
    models: [{ form: 'wet', sentence: 'The towel is not dry; it is wet.' }, { form: 'full', sentence: 'The bottle is not empty; it is full.' }],
    keywords: ['opposite', 'adjective', 'describing'],
    targetWords: ['big', 'small', 'hot', 'cold', 'old', 'new', 'young', 'tall', 'short', 'long', 'fast', 'slow', 'wet', 'dry', 'full', 'empty', 'heavy', 'light'],
    clue: { clue: 'the opposite of dry', word: 'wet' },
    confusion: { right: 'a tall giraffe', wrong: 'a long giraffe' },
  },
  {
    id: 'EN-F-A2-VO-jobs-workplaces', kind: 'vocab',
    rule: 'Each job has a place: a nurse works in a hospital, a chef in a kitchen; write all the vowels.',
    right: 'A vet works in an animal clinic.', wrong: 'A vt works in an animal clinic.',
    usualError: 'vowels left out of a job or workplace word (doctr, techer)',
    models: [{ form: 'baker', sentence: 'A baker works in a bakery.' }, { form: 'librarian', sentence: 'A librarian works in a library.' }],
    keywords: ['workplace', 'job', 'works in', 'works at'],
    targetWords: ['nurse', 'hospital', 'chef', 'restaurant', 'farmer', 'farm', 'pilot', 'airport', 'teacher', 'school', 'doctor', 'baker', 'bakery', 'librarian', 'library', 'vet', 'clinic'],
    clue: { clue: 'this person helps sick animals', word: 'vet' },
    confusion: { right: 'doctor', wrong: 'doctr' },
  },
  {
    id: 'EN-F-A2-VO-weather', kind: 'vocab',
    rule: 'After It is, use the describing word: rain - rainy, sun - sunny, wind - windy, fog - foggy.',
    right: 'It is foggy on the mountain.', wrong: 'It is fog on the mountain.',
    usualError: 'the noun instead of the describing word (It is rain), or missing vowels (windi)',
    models: [{ form: 'foggy', sentence: 'We cannot see the trees. It is foggy.' }, { form: 'stormy', sentence: 'There is thunder. It is stormy.' }],
    keywords: ['weather adjective', 'weather', 'it is'],
    targetWords: ['sunny', 'rainy', 'windy', 'cloudy', 'hot', 'cold', 'snowy', 'foggy', 'warm', 'stormy'],
    clue: { clue: 'there is thunder and lightning', word: 'stormy' },
    confusion: { right: 'It is stormy.', wrong: 'It is storm.' },
  },
  {
    id: 'EN-F-A2-VO-clothes-shopping', kind: 'vocab',
    rule: 'Colour and size words go before the clothes word: a blue scarf, big boots.',
    right: 'The clown wears a green hat.', wrong: 'The clown wears a hat green.',
    usualError: 'the colour or size after the noun',
    models: [{ form: 'colour first', sentence: 'The clown wears yellow boots.' }, { form: 'size first', sentence: 'The giant needs huge gloves.' }],
    keywords: ['size', 'colour', 'do you have', 'how much'],
    targetWords: ['hat', 'jacket', 'socks', 'scarf', 'cap', 'gloves', 'boots', 'shirt', 'dress', 'shoes', 'small', 'medium', 'large', 'red', 'blue', 'green', 'yellow', 'black', 'white'],
    clue: { clue: 'you wear them on your hands when it is cold', word: 'gloves' },
    confusion: { right: 'a red dress', wrong: 'a dress red' },
  },
  {
    id: 'EN-F-A2-VO-appearance', kind: 'vocab',
    rule: 'Describing words go before the noun: long black hair, big brown eyes.',
    right: 'The clown has a big red nose.', wrong: 'The clown has a nose big red.',
    usualError: 'appearance adjectives after the noun',
    models: [{ form: 'adjectives first', sentence: 'The witch has a small nose.' }, { form: 'is + adjective', sentence: 'The giant is tall and thin.' }],
    keywords: ['hair', 'eyes', 'has', 'features', 'adjectives'],
    targetWords: ['hair', 'eyes', 'nose', 'big', 'red', 'tall', 'short', 'long', 'curly', 'straight', 'thin', 'black', 'brown', 'blue', 'green', 'grey', 'kind', 'funny', 'friendly'],
    clue: { clue: 'not fat', word: 'thin' },
    confusion: { right: 'a red nose', wrong: 'a nose red' },
  },
  {
    id: 'EN-F-A2-VO-make-do', kind: 'vocab',
    rule: 'We make things that are new (a cake, a plan, a noise); we do jobs and tasks (homework, the dishes).',
    right: 'The robot makes pizza.', wrong: 'The robot does pizza.',
    usualError: 'do for make or make for do with a fixed noun',
    models: [{ form: 'make', sentence: 'The bees make honey.' }, { form: 'do', sentence: 'The robot does puzzles.' }],
    keywords: ['make', 'do'],
    targetWords: ['make', 'makes', 'made', 'do', 'does', 'did'],
    clue: { clue: 'you create something new, like honey', word: 'make' },
    confusion: { right: 'make a mistake', wrong: 'do a mistake' },
  },
];

export const RULE_BANK_BY_ID = new Map(RULE_BANK.map((e) => [e.id, e]));
/** The rule bank entry for an outcome / objective id (or code), if any. */
export const ruleBankEntry = (id?: string | null): RuleBankEntry | undefined => (id ? RULE_BANK_BY_ID.get(id) : undefined);
export const isVocabEntry = (e: RuleBankEntry | undefined): boolean => e?.kind === 'vocab';

const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}'\s-]/gu, ' ').split(/\s+/).filter(Boolean);
/** Static checks of one entry (unit tests and the bank review): rule length, a real minimal pair, a model per entry. Returns problems. */
export function checkEntry(e: RuleBankEntry): string[] {
  const out: string[] = [];
  if (words(e.rule).length > 20) out.push('rule longer than 20 words');
  if (words(e.right).join(' ') === words(e.wrong).join(' ') && e.right !== e.wrong) {
    // case-only difference is a real pair only for the capitals outcome
    if (e.kind !== 'mechanics') out.push('right and wrong differ only in case');
  }
  if (e.right === e.wrong) out.push('right and wrong are identical');
  if (!e.models.length) out.push('no worked example');
  if (new Set(e.models.map((m) => m.form)).size !== e.models.length) out.push('two worked examples share a form');
  if (e.kind === 'vocab') {
    if (!e.targetWords?.length) out.push('vocab entry without target words');
    if (!e.clue || !e.confusion) out.push('vocab entry without clue or confusion');
    for (const m of e.models) if (!e.targetWords?.some((w) => ` ${words(m.sentence).join(' ')} `.includes(` ${w.toLowerCase()} `))) out.push(`model "${m.sentence}" has no target word`);
  }
  return out;
}

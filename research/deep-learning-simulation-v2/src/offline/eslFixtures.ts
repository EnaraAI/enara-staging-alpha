// Research-only fixtures for the ESL stage-1 agent study (change A, `levelExplicit`). SIMULATION ONLY: synthetic learners, not real learners.
// Lessons carry `successCriteria` and items tagged with `criteria`, because `levelExplicit` only works on lessons that have them. These are NOT production lessons.
// The post-test items below share no word-for-word item with any lesson exercise (checked by the readiness check in eslStudy.ts `ready`).
import type { PracticeItem } from '../benchmark/schema';

export const FORMS = ['articles', 'copula', 'thirdS'] as const;
export type Form = (typeof FORMS)[number];
export type Band = 'A1' | 'A2' | 'B2';
export type Arm = 'P' | 'A0' | 'ARB' | 'LE';
export const ARMS: Arm[] = ['P', 'A0', 'ARB', 'LE'];
export const SEED = 'enara-agent-sim-esl1';

export interface EslLesson { form: Form; title: string; objective: string; spec: { objectives: string[]; successCriteria: string[]; vocabulary: string[]; grammar: string[]; functions: string[]; skills: string[]; examples: string[]; items: PracticeItem[] } }
const only = ' (answer with only the missing word)';
const onlyVerb = ' (answer with only the verb)';

export const LESSONS: Record<Form, EslLesson> = {
  articles: {
    form: 'articles', title: 'Articles: a, an and the', objective: 'Use a, an and the correctly before singular nouns.',
    spec: {
      objectives: ['Use a or an before a singular noun, and the for something already mentioned or known'],
      successCriteria: ['Uses a before consonant sounds and an before vowel sounds', 'Uses the when both people know which thing, or when it was already mentioned'],
      vocabulary: ['orange', 'doctor', 'book', 'door', 'elephant', 'umbrella'], grammar: ['a/an/the with singular nouns'], functions: ['describing people and things'], skills: ['writing'],
      examples: ['I have a pen.', 'She eats an apple.', 'I saw a dog. The dog was big.'],
      items: [
        { id: 'art1', prompt: `Write a or an: She has ___ orange in her bag.${only}`, acceptedAnswers: ['an'], targetForms: ['an'], criteria: [1] },
        { id: 'art2', prompt: `Write a or an: My uncle is ___ doctor.${only}`, acceptedAnswers: ['a'], targetForms: ['a'], criteria: [1] },
        { id: 'art3', prompt: `Write a, an or the: I bought a book. ___ book is very good.${only}`, acceptedAnswers: ['the'], targetForms: ['the'], criteria: [2] },
        { id: 'art4', prompt: `Write a, an or the: We saw ___ elephant at the zoo.${only}`, acceptedAnswers: ['an'], targetForms: ['an'], criteria: [1] },
        { id: 'art5', prompt: `Write a, an or the: It is cold. Please close ___ door.${only}`, acceptedAnswers: ['the'], targetForms: ['the'], criteria: [2] },
        { id: 'art6', prompt: `Write a or an: He wants ___ umbrella.${only}`, acceptedAnswers: ['an'], targetForms: ['an'], criteria: [1] },
      ],
    },
  },
  copula: {
    form: 'copula', title: 'Be in the present: am, is and are', objective: 'Use am, is and are correctly and never leave them out.',
    spec: {
      objectives: ['Use am, is or are to say who or what someone is and how they feel'],
      successCriteria: ['Uses am with I, is with he, she and it, and are with you, we and they', 'Does not leave out am, is or are in a sentence such as "She is a teacher"'],
      vocabulary: ['student', 'pilot', 'tired', 'happy', 'classroom', 'home'], grammar: ['present simple of be'], functions: ['introducing yourself', 'describing people'], skills: ['writing'],
      examples: ['I am a student.', 'He is tired.', 'They are at school.'],
      items: [
        { id: 'cop1', prompt: `Write am, is or are: I ___ a student.${only}`, acceptedAnswers: ['am'], targetForms: ['am'], criteria: [1] },
        { id: 'cop2', prompt: `Write am, is or are: She ___ at home today.${only}`, acceptedAnswers: ['is'], targetForms: ['is'], criteria: [1] },
        { id: 'cop3', prompt: `Write am, is or are: They ___ happy.${only}`, acceptedAnswers: ['are'], targetForms: ['are'], criteria: [1] },
        { id: 'cop4', prompt: `Write am, is or are: My father ___ a pilot.${only}`, acceptedAnswers: ['is'], targetForms: ['is'], criteria: [2] },
        { id: 'cop5', prompt: `Write am, is or are: We ___ in the classroom.${only}`, acceptedAnswers: ['are'], targetForms: ['are'], criteria: [1] },
        { id: 'cop6', prompt: 'Write the sentence again with the missing word: Ahmed tired.', acceptedAnswers: ['Ahmed is tired'], targetForms: ['is'], criteria: [2] },
      ],
    },
  },
  thirdS: {
    form: 'thirdS', title: 'Present simple: he, she and it', objective: 'Add -s or -es to the verb after he, she and it.',
    spec: {
      objectives: ['Use the present simple with he, she and it for habits and routines'],
      successCriteria: ['Adds -s or -es to the verb after he, she and it in the present simple', 'Uses -es after verbs ending in -sh, -ch, -s, -x or -o, and -ies after a consonant and y'],
      vocabulary: ['play', 'drink', 'watch', 'cry', 'live', 'gym'], grammar: ['present simple, third person singular'], functions: ['talking about routines'], skills: ['writing'],
      examples: ['I work. She works.', 'He teaches English.', 'My brother studies at night.'],
      items: [
        { id: 'ths1', prompt: `Write the correct form: My sister ___ (play) tennis on Sundays.${onlyVerb}`, acceptedAnswers: ['plays'], targetForms: ['plays'], criteria: [1] },
        { id: 'ths2', prompt: `Write the correct form: He ___ (drink) tea in the morning.${onlyVerb}`, acceptedAnswers: ['drinks'], targetForms: ['drinks'], criteria: [1] },
        { id: 'ths3', prompt: `Write the correct form: She ___ (watch) TV after dinner.${onlyVerb}`, acceptedAnswers: ['watches'], targetForms: ['watches'], criteria: [2] },
        { id: 'ths4', prompt: `Write the correct form: The baby ___ (cry) at night.${onlyVerb}`, acceptedAnswers: ['cries'], targetForms: ['cries'], criteria: [2] },
        { id: 'ths5', prompt: `Write the correct form: My brother ___ (go) to the gym on Fridays.${onlyVerb}`, acceptedAnswers: ['goes'], targetForms: ['goes'], criteria: [2] },
        { id: 'ths6', prompt: `Write the correct form: Our teacher ___ (live) near the school.${onlyVerb}`, acceptedAnswers: ['lives'], targetForms: ['lives'], criteria: [1] },
      ],
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Post-test. Per form, per version (v1 = post-test, v2 = parallel "consistency check" form): 4 controlled items, 2 free-production items, 2 next-level items
// (one CEFR level above the student's band: A1 -> A2, A2 -> B1, B2 -> C1). Controlled and next-level items are scored deterministically (exact match of the
// missing word); free-production items are scored by blind scorer agents with the rubric below.
export type ItemKind = 'controlled' | 'free' | 'next';
export interface PostItem { id: string; kind: ItemKind; prompt: string; accepted?: string[]; level?: string }
export const NEXT_LEVEL: Record<Band, string> = { A1: 'A2', A2: 'B1', B2: 'C1' };

type Def = { c: [string, string][]; n: Record<Band, [string, string][]>; f: string[] };
const P: Record<Form, Record<'v1' | 'v2', Def>> = {
  articles: {
    v1: {
      c: [[`Write a or an: I need ___ egg for the cake.${only}`, 'an'], [`Write a or an: She is ___ teacher at my school.${only}`, 'a'], [`Write a, an or the: I met a girl and a boy. ___ girl was very kind.${only}`, 'the'], [`Write a, an or the: He wrote ___ email to his boss yesterday.${only}`, 'an']],
      n: {
        A1: [[`Write a, an or the: ___ moon is bright tonight.${only}`, 'the'], [`Write a or an: My sister goes to ___ university in Cairo.${only}`, 'a']],
        A2: [[`Write a, an, the or X (X means no article is needed): She plays ___ piano every evening.${only}`, 'the'], [`Write a, an, the or X (X means no article is needed): He is afraid of ___ spiders.${only}`, 'x']],
        B2: [[`Write a, an, the or X (X means no article is needed): ___ honesty is important in any job.${only}`, 'x'], [`Write a, an, the or X (X means no article is needed): She has ___ hour to finish the exam.${only}`, 'an']],
      },
      f: ['Write two sentences about your home or your family. Use a, an or the.', 'Write two sentences about something you did yesterday. Use at least one thing with a, an or the.'],
    },
    v2: {
      c: [[`Write a or an: He ate ___ ice cream after lunch.${only}`, 'an'], [`Write a or an: My friend is ___ nurse.${only}`, 'a'], [`Write a, an or the: I have a cat and a dog. ___ dog is old.${only}`, 'the'], [`Write a, an or the: She found ___ old key in the garden.${only}`, 'an']],
      n: {
        A1: [[`Write a, an or the: ___ sky is blue today.${only}`, 'the'], [`Write a or an: He is wearing ___ uniform.${only}`, 'a']],
        A2: [[`Write a, an, the or X (X means no article is needed): He plays ___ guitar in a band.${only}`, 'the'], [`Write a, an, the or X (X means no article is needed): She loves ___ music.${only}`, 'x']],
        B2: [[`Write a, an, the or X (X means no article is needed): ___ knowledge is power.${only}`, 'x'], [`Write a, an, the or X (X means no article is needed): He waited for ___ hour at the station.${only}`, 'an']],
      },
      f: ['Write two sentences about your school. Use a, an or the.', 'Write two sentences about a city you like. Use at least one thing with a, an or the.'],
    },
  },
  copula: {
    v1: {
      c: [[`Write am, is or are: You ___ very kind.${only}`, 'are'], [`Write am, is or are: My brother ___ a nurse.${only}`, 'is'], [`Write am, is or are: I ___ ready for the test.${only}`, 'am'], [`Write am, is or are: The students ___ in the library.${only}`, 'are']],
      n: {
        A1: [[`Write is or are: There ___ three books on the table.${only}`, 'are'], [`Write is or are: Everyone ___ here today.${only}`, 'is']],
        A2: [[`Write am, is, are, was or were: Yesterday we ___ at the beach.${only}`, 'were'], [`Write is, are, was or were: Last year my sister ___ in Dubai.${only}`, 'was']],
        B2: [[`Write is or are: The number of students ___ rising.${only}`, 'is'], [`Write is or are: A number of students ___ absent today.${only}`, 'are']],
      },
      f: ['Write two sentences that describe a person you know: who they are and how they feel today. Use am, is or are.', 'Write two sentences about a place you know and what it is like.'],
    },
    v2: {
      c: [[`Write am, is or are: We ___ late for class.${only}`, 'are'], [`Write am, is or are: Her mother ___ a doctor.${only}`, 'is'], [`Write am, is or are: I ___ very hungry.${only}`, 'am'], [`Write am, is or are: The children ___ in the garden.${only}`, 'are']],
      n: {
        A1: [[`Write is or are: There ___ a cat on the chair.${only}`, 'is'], [`Write is or are: There ___ two eggs in the box.${only}`, 'are']],
        A2: [[`Write am, is, are, was or were: Last night I ___ very tired.${only}`, 'was'], [`Write is, are, was or were: The shops ___ closed yesterday.${only}`, 'were']],
        B2: [[`Write is or are: The news ___ good today.${only}`, 'is'], [`Write is or are: The police ___ at the door.${only}`, 'are']],
      },
      f: ['Write two sentences that describe your best friend: who they are and how they feel today. Use am, is or are.', 'Write two sentences about your street and what it is like.'],
    },
  },
  thirdS: {
    v1: {
      c: [[`Write the correct form: My mother ___ (cook) dinner every day.${onlyVerb}`, 'cooks'], [`Write the correct form: The bus ___ (pass) my house at eight.${onlyVerb}`, 'passes'], [`Write the correct form: He ___ (study) English at night.${onlyVerb}`, 'studies'], [`Write the correct form: Sara ___ (like) pizza.${onlyVerb}`, 'likes']],
      n: {
        A1: [[`Write the correct form: My uncle never ___ (eat) fish.${onlyVerb}`, 'eats'], [`Write the correct form: Every morning she ___ (brush) her teeth.${onlyVerb}`, 'brushes']],
        A2: [[`Write one word: ___ your brother play football?`, 'does'], [`Write the correct form (only the verb): She does not ___ (like) coffee.`, 'like']],
        B2: [[`Write the correct form: Neither of my friends ___ (know) the answer.${onlyVerb}`, 'knows'], [`Write the correct form: Each of the students ___ (have) a laptop.${onlyVerb}`, 'has']],
      },
      f: ['Write two sentences about what a person in your family does every day.', 'Write two sentences about a friend and what he or she likes to do.'],
    },
    v2: {
      c: [[`Write the correct form: My father ___ (drive) to work.${onlyVerb}`, 'drives'], [`Write the correct form: The teacher ___ (teach) us grammar.${onlyVerb}`, 'teaches'], [`Write the correct form: She ___ (fly) to Paris every year.${onlyVerb}`, 'flies'], [`Write the correct form: Omar ___ (walk) to school.${onlyVerb}`, 'walks']],
      n: {
        A1: [[`Write the correct form: My aunt always ___ (drink) tea.${onlyVerb}`, 'drinks'], [`Write the correct form: He often ___ (wash) the car.${onlyVerb}`, 'washes']],
        A2: [[`Write one word: ___ she live in Cairo?`, 'does'], [`Write the correct form (only the verb): He does not ___ (eat) meat.`, 'eat']],
        B2: [[`Write the correct form: Everyone in my class ___ (speak) two languages.${onlyVerb}`, 'speaks'], [`Write the correct form: Either of the answers ___ (be) acceptable.${onlyVerb}`, 'is']],
      },
      f: ['Write two sentences about what your teacher does every day.', 'Write two sentences about someone you know and what he or she does at the weekend.'],
    },
  },
};

export function postItems(form: Form, band: Band, version: 'v1' | 'v2'): PostItem[] {
  const d = P[form][version]; const lvl = NEXT_LEVEL[band];
  return [
    ...d.c.map(([prompt, a], k): PostItem => ({ id: `${form}-${version}-c${k + 1}`, kind: 'controlled', prompt, accepted: [a] })),
    ...d.f.map((prompt, k): PostItem => ({ id: `${form}-${version}-f${k + 1}`, kind: 'free', prompt })),
    ...d.n[band].map(([prompt, a], k): PostItem => ({ id: `${form}-${version}-n${k + 1}`, kind: 'next', prompt, accepted: [a], level: lvl })),
  ];
}

/** Rubric given to the blind scorer agents for free-production items. Each response has 2 sentences; the item score is (sentences correct)/2. */
export const FREE_RUBRIC: Record<Form, string> = {
  articles: 'Look ONLY at articles. A sentence is correct if it contains at least one singular countable noun that needs an article and EVERY article in it is right: a before a consonant sound, an before a vowel sound, the for something known or already mentioned, no article where English uses none. A missing article before a singular countable noun, a wrong a/an, or the used where a/an is needed makes the sentence wrong. A sentence with no noun that needs an article is wrong (the form was not used). Ignore every other error.',
  copula: 'Look ONLY at am, is and are. A sentence is correct if it has at least one present-tense statement with be (am, is or are) and every be-verb is present, correct for its subject (I am, he/she/it is, you/we/they are), and none is left out where English needs it. A missing be-verb ("She tired"), a wrong form ("They is"), or is added before another main verb ("He is play") makes the sentence wrong. A sentence with no present be-statement is wrong (the form was not used). Ignore every other error.',
  thirdS: 'Look ONLY at the present simple with he, she, it or a singular name. A sentence is correct if it has at least one present-simple verb with a third person singular subject and EVERY such verb has the correct -s, -es or -ies ending (watches, studies, goes, plays), spelled correctly. A base verb after he/she/it ("She like tea"), a wrong ending ("watchs"), or an -s added after I, you, we or they makes the sentence wrong. A sentence with no third-person-singular present verb is wrong (the form was not used). Ignore every other error.',
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The 18 synthetic students. Bands: 6 at A1, 6 at A2, 6 at B2. Forms are spread evenly inside each band (2 per form per band).
// The record for the target objective is fixed in advance and matched to the band: A1 and A2 students are "not_assessed" (3) or "emerging" (3); B2 students are
// "proficient" (the "no harm" group: they should get today's behaviour).
export type Status = 'not_assessed' | 'emerging' | 'proficient';
export interface EslStudent { idx: number; band: Band; form: Form; status: Status; variant: 0 | 1; blockId: string }
export const STUDENTS: EslStudent[] = Array.from({ length: 18 }, (_, idx) => {
  const band: Band = idx < 6 ? 'A1' : idx < 12 ? 'A2' : 'B2'; const k = idx % 6;
  const status: Status = band === 'B2' ? 'proficient' : k < 3 ? 'not_assessed' : 'emerging';
  return { idx, band, form: FORMS[k % 3], status, variant: (k < 3 ? 0 : 1) as 0 | 1, blockId: `esl-${idx}-${FORMS[k % 3]}` };
});

export const L1_PROFILE: Record<Form, [{ description: string; example: string }, { description: string; example: string }]> = {
  articles: [
    { description: 'Arabic has no word like "a/an", so you often leave out a/an before a singular noun', example: 'She is teacher / I have book' },
    { description: 'you use "the" for almost everything and you do not know when to use a or an (you may put "a" before a vowel sound)', example: 'He is a engineer / I saw the dog yesterday (a new dog)' },
  ],
  copula: [
    { description: 'in Arabic you do not say am/is/are in present sentences, so you often leave them out', example: 'She teacher / I happy' },
    { description: 'you think "is" works with every subject, and you sometimes put is before another verb', example: 'They is happy / I is a student / He is play football' },
  ],
  thirdS: [
    { description: 'in Arabic the verb does not change like this, so you often leave the verb unchanged after he, she or it', example: 'She like tea / My brother play football' },
    { description: 'you know a rule about -s exists but you add -s after every subject and you spell -es forms wrongly', example: 'I plays football / They likes tea / She watchs TV' },
  ],
};

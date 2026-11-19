// SIMULATION ONLY. NO API. TRACK 2 (teaching quality) lesson data: the ESL6 lessons (esl6Fixtures.ts, frozen, NOT edited) with the data fixes the owner
// approved (decision 3) for the four lessons whose items did not test their outcome (TUTOR_TRACK2_TEACHING_PLAN.md §3 fix 3):
//   - frequency adverbs: both items tested -s and carried no criteria -> two adverb-position items first; every item carries criteria;
//   - past questions with did / past simple regular: the shared "Last weekend" lesson had no items -> two items per outcome that test it, with criteria;
//   - some/any: the cafe lesson taught a/an against some and requests -> a some/any success criterion, grammar line and two items that test it.
// Every new item was checked against the outcome's assessment items (teach2Study.ts `datacheck`: no lesson item equals a bank item, and the example
// guard finds no item of forms A-C completed by it). Track 3 (ESL6 restart) must copy these fixes into its frozen lessons.
import { LESSONS6, OUTCOME_IDS } from './esl6Fixtures';
import type { Esl6Lesson } from './esl6Fixtures';

type Spec = Esl6Lesson['spec'];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const FIX: Record<string, (s: Spec) => Spec> = {
  'EN-F-A2-GR-frequency-adverbs': (s) => ({
    ...s,
    items: [
      { id: 'x3', prompt: 'Put the words in order: "usually / my cousin / walks / to school"', acceptedAnswers: ['My cousin usually walks to school', 'My cousin usually walks to school.'], targetForms: ['usually walks'], criteria: [2] },
      { id: 'x4', prompt: 'Put the words in order: "never / my uncle / drinks / coffee"', acceptedAnswers: ['My uncle never drinks coffee', 'My uncle never drinks coffee.'], targetForms: ['never drinks'], criteria: [1, 2] },
      ...(s.items ?? []).map((i) => ({ ...i, criteria: [1] })),
    ],
  } as Spec),
  'EN-F-A2-GR-past-questions-did': (s) => ({
    ...s,
    items: [
      { id: 'd1', prompt: 'Make a question with did: "you / feed / the cat / this morning"', acceptedAnswers: ['Did you feed the cat this morning?', 'Did you feed the cat this morning'], targetForms: ['did you feed'], criteria: [3] },
      { id: 'd2', prompt: 'Correct the question: "Did she watched the match?"', acceptedAnswers: ['Did she watch the match?', 'Did she watch the match'], targetForms: ['watch'], criteria: [3] },
    ],
  } as Spec),
  'EN-F-A2-GR-past-simple-regular': (s) => ({
    ...s,
    items: [
      { id: 'r1', prompt: 'Write the past form: On Saturday the children ___ (kick) the ball in the park.', acceptedAnswers: ['kicked'], targetForms: ['kicked'], criteria: [1] },
      { id: 'r2', prompt: 'Write the past form: Yesterday the cat ___ (jump) on the sofa.', acceptedAnswers: ['jumped'], targetForms: ['jumped'], criteria: [1] },
    ],
  } as Spec),
  'EN-F-A2-GR-some-any': (s) => ({
    ...s,
    successCriteria: [...(s.successCriteria ?? []), 'Uses some in positive sentences and requests, any in negatives and questions'],
    grammar: [...(s.grammar ?? []), 'some / any in statements, negatives and questions'],
    items: [
      { id: 's1', prompt: 'Write some or any: Sorry, we don\'t have ___ milk today.', acceptedAnswers: ['any'], targetForms: ['any'], criteria: [3] },
      { id: 's2', prompt: 'Write some or any: Are there ___ seats by the window?', acceptedAnswers: ['any'], targetForms: ['any'], criteria: [3] },
      ...(s.items ?? []),
    ],
  } as Spec),
};
export const FIXED_OUTCOMES = Object.keys(FIX);
/** The TRACK 2 lesson of each of the 30 outcomes (ESL6 lessons plus the four approved data fixes). */
export const LESSONS_T2: Record<string, Esl6Lesson> = Object.fromEntries(OUTCOME_IDS.map((id) => {
  const l = clone(LESSONS6[id]);
  return [id, FIX[id] ? { ...l, spec: FIX[id](l.spec), source: `${l.source} + TRACK 2 data fix (teach2Fixtures.ts)` } : l];
}));
export { OUTCOME_IDS };

import { describe, expect, it } from 'vitest';
import * as LS from '../src/services/languageLearningState';
import type { LessonItem } from '../src/services/languageLearningState';

// Fix 1: an example or model line that shows the tested form is removed before the
// learner's first attempt. Replies modelled on the leak patterns seen in r4.3 runs
// (synthetic wording; items are not the benchmark fixture's).
const strip = (LS as unknown as { stripPreAttemptModels?: (r: string, items: LessonItem[], learner?: string, shown?: string[]) => { text: string; removed: string[] } }).stripPreAttemptModels;
const goes: LessonItem = { id: 'q1', prompt: 'Correct the verb: "My cousin ___ (go) to the gym on Fridays."', acceptedAnswers: ['goes'], targetForms: ['goes'] } as LessonItem;
const seen: LessonItem = { id: 'q2', prompt: 'Complete: "Have you ever ___ (see) a camel?"', acceptedAnswers: ['seen'], targetForms: ['seen'] } as LessonItem;
const visited: LessonItem = { id: 'q3', prompt: 'Complete: "We ___ (visit) Siwa in 2019."', acceptedAnswers: ['visited'], targetForms: ['visited'] } as LessonItem;

describe('fix 1: no model of the tested form before the first attempt', () => {
  it('exists', () => expect(typeof strip).toBe('function'));
  it('removes an arrow/list model line and keeps the task', () => {
    const r = 'The rule: with he, she, it, add -s.\n- I **go** → She **goes**\n- I walk → He walks\n\nYour turn: Correct the verb: "My cousin ___ (go) to the gym on Fridays."';
    const o = strip!(r, [goes]);
    expect(o.text).not.toMatch(/\bgoes\b/);
    expect(o.text).toContain('My cousin ___ (go) to the gym on Fridays.');
    expect(o.text).toContain('I walk → He walks');
    expect(o.removed).toHaveLength(1);
  });
  it('removes emphasised and quoted example sentences with the form', () => {
    const r = 'Two frames you could use:\n- "Have you ever **seen** the pyramids?"\n- *I saw them last year.*\nNow try: Complete: "Have you ever ___ (see) a camel?"';
    const o = strip!(r, [seen]);
    expect(o.text).not.toMatch(/\bseen\b/);
    expect(o.text).toContain('I saw them last year.');
  });
  it('keeps the form used in plain explanatory prose (not a model of the answer)', () => {
    const r = '"I have been to Luxor" means you visited Luxor at some time and came back.';
    expect(strip!(r, [visited]).text).toBe(r);
  });
  it('keeps the item prompt itself, option lists from the prompt and the learner\'s own words', () => {
    const r = 'Choose: My brother ___ to school. (**go / goes**)';
    const item = { ...goes, prompt: 'Choose: My brother ___ to school. (go / goes)' } as LessonItem;
    expect(strip!(r, [item]).text).toBe(r);
    const q = 'You wrote "she **goes** home" – nice try!';
    expect(strip!(q, [goes], 'she goes home').text).toBe(q);
  });
  it('never drops a line that holds the task gap', () => {
    const r = '- Your turn: My cousin ___ (go) to the gym. Hint: think of **goes**?';
    const o = strip!(r, [goes]);
    expect(o.text).toContain('My cousin ___ (go) to the gym.');
    expect(o.text).not.toMatch(/\bgoes\b/);
  });
  it('keeps task instructions and word-order talk that merely contain the word', () => {
    const r = '1. One sentence saying when you visited a place, with a finished time.\n- **always** goes *before* the verb.';
    expect(strip!(r, [visited, goes]).text).toBe(r);
  });
  it('skills: a form the lesson itself shows (reading text, word list) is course material, not a leak', () => {
    const reading = { id: 'r1', prompt: 'Read: "Omar goes to work by train." Question: How does Omar go to work?', acceptedAnswers: ['by train'], targetForms: ['train'] } as LessonItem;
    const r = '> Omar goes to work by **train**.\n- **train**\nQuestion: How does Omar go to work?';
    expect(strip!(r, [reading]).text).toBe(r);
    const vocab = { id: 'v1', prompt: 'Write the word: you drink it, it is white. ___', acceptedAnswers: ['milk'], targetForms: ['milk'] } as LessonItem;
    const w = 'Our words today:\n- **milk**\n- **bread**\nWrite the word: you drink it, it is white. ___';
    expect(strip!(w, [vocab], '', ['milk', 'bread']).text).toBe(w);
  });
  it('never returns an empty reply', () => {
    const o = strip!('- She **goes** to work.', [goes]);
    expect(o.text.trim().length).toBeGreaterThan(0);
    expect(o.text).not.toMatch(/\bgoes\b/);
  });
});

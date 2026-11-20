import { describe, expect, it } from 'vitest';
import { shownLessonItems } from '../src/services/languageTeachingContext';
import { u, a, open, withEnv, build, SPEC } from './esl5Helpers';

// planner2d (PLN2f: 5 sessions were told to present an item the learner had already done). The held-back credit (a right answer the key did not
// list) kept the old item open, so the item shown next was never marked done and came back as "next". The next item is now one not yet shown.
const ENV = 'levelExplicit,esl5,planner2';
const amb = (id: string, item?: string) => ({ assessment: { verdict: 'AMBIGUOUS', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment', ...(item ? { item } : {}) }, activeItem: { id: `lesson:${id}`, source: 'lesson', lessonItemId: id } });
const H = [
  u('Can I have an exercise?'), a('Complete: I saw ___ apple.', open('a1')),
  u('an'), a('Yes. Next: Complete: He is ___ doctor.', amb('a1', 'a2')), // a2 shown, but the stored open item stays a1
  u('a'), a('Yes, right. Now write one sentence about a person you know.', amb('a1')),
  u('My sister is a nurse.'), a('Good sentence.', { assessment: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [1], next: 'NONE', source: 'tutor_assessment' }, activeItem: null }),
];

describe('planner2d: the next lesson item is one not yet shown', () => {
  it('finds items shown by a stored reply or by their prompt in the reply text', () => {
    expect([...shownLessonItems(H as never, SPEC.items!)].sort()).toEqual(['a1', 'a2']);
  });
  it('planner2 on: the shown-but-uncredited item is not offered again; an unseen one is', () => {
    const c = withEnv(ENV, () => build('Can I have another exercise?', H as never));
    expect(c.signals.nextLessonItem?.id).toBe('a3');
  });
  it('planner2 off: today\'s choice (the first uncredited item) is kept', () => {
    const off = withEnv('levelExplicit,esl5', () => build('Can I have another exercise?', H as never));
    expect(off.signals.nextLessonItem?.id).toBe('a2');
  });
  it('when every item was shown, no lesson item is offered (the tutor writes a new one)', () => {
    const H3 = [...H, u('More?'), a('Complete: They ___ (be) happy.', amb('a1', 'a3')), u('are'), a('Yes.', { assessment: { verdict: 'CORRECT', relevance: 'ACTIVE_ITEM', criteria: [1], next: 'NONE', source: 'tutor_assessment' }, activeItem: null })];
    const c = withEnv(ENV, () => build('Can I have another exercise?', H3 as never));
    expect(c.signals.nextLessonItem).toBeUndefined();
  });
});

// planner2e (owner): the engine never NAMES an item the learner already answered, as the next item or as a new exercise. The only time an answered
// item is in play again is the hint-ladder retry of the open item before its answer is released (the same open task, not a new one).
describe('planner2e: an answered item is never named again', () => {
  const wrongA3 = { assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment' }, activeItem: { id: 'lesson:a3', source: 'lesson', lessonItemId: 'a3' }, hintLevel: 1 };
  const Hw = [u('Can I have an exercise?'), a('Complete: They ___ (be) happy.', open('a3')), u('is'), a('Look at "They". Try again.', wrongA3)];
  it('asked for an exercise after a wrong try: a new item, not the answered one', () => {
    const c = withEnv(ENV, () => build('Can you give me another exercise?', Hw as never));
    expect(c.signals.presentLessonItem?.id).not.toBe('a3');
    expect(c.signals.presentLessonItem?.id).toBe('a1');
    const off = withEnv('levelExplicit,esl5', () => build('Can you give me another exercise?', Hw as never));
    expect(off.signals.presentLessonItem?.id).toBe('a3'); // today's behaviour with planner2 off
  });
  it('no answered item is ever the next item, in a whole session', () => {
    const answered = new Set(['a1', 'a2']);
    const c = withEnv(ENV, () => build('More please', H as never));
    for (const id of [c.signals.nextLessonItem?.id, c.signals.presentLessonItem?.id]) if (id) expect(answered.has(id)).toBe(false);
  });
});

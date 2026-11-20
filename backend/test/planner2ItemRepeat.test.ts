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

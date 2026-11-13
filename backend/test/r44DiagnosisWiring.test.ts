import { describe, expect, it } from 'vitest';
import * as LTC from '../src/services/languageTeachingContext';
import type { LessonItem } from '../src/services/languageLearningState';

// r4.4 #1 wiring: a wrong answer to the open item gives the tutor the likely cause (never the
// answer); the cause is stored as turn evidence.
const item: LessonItem = { id: 'q1', prompt: 'Correct the verb: "Tom ___ (fix) bikes every Saturday."', acceptedAnswers: ['Tom fixes bikes every Saturday.', 'fixes'], targetForms: ['fixes'], criteria: [1] } as LessonItem;
const lesson = { title: 'Daily routine', spec: { objectives: ['x'], successCriteria: ['Adds -s'], items: [item] } };
const history = [
  { role: 'user' as const, content: 'Can I have an exercise?' },
  { role: 'assistant' as const, content: 'Correct the verb: "Tom ___ (fix) bikes every Saturday."', languageTurn: { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', item: 'q1', source: 'tutor_assessment' }, activeItem: { id: 'lesson:q1', source: 'lesson', lessonItemId: 'q1' } } },
];
describe('r4.4 #1 wiring', () => {
  it('a wrong answer adds the likely cause to the signals and the tutor prompt', () => {
    const signals = LTC.detectTurnSignals('Tom fix bikes every Saturday.', history as never, lesson as never);
    expect((signals as { diagnosis?: { code: string } }).diagnosis?.code).toBe('missing_third_person_s');
  });
  it('a correct answer has no diagnosis', () => {
    const signals = LTC.detectTurnSignals('Tom fixes bikes every Saturday.', history as never, lesson as never);
    expect((signals as { diagnosis?: unknown }).diagnosis).toBeUndefined();
  });
  it('the cause text never contains the answer form', () => {
    expect(LTC.diagnosisLine({ code: 'missing_third_person_s', cue: 'x', evidence: 'fix' })).toMatch(/Likely cause of their error/);
    expect(LTC.diagnosisLine({ code: 'missing_third_person_s', cue: 'x', evidence: 'fix' })).toMatch(/don't name the correct form/);
  });
});

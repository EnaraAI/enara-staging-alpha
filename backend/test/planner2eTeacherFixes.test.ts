import { describe, expect, it } from 'vitest';
import { setsTask, REVIEW_CLOSE_FALLBACK } from '../src/services/languageTurnPipeline';
import { pointPhrase, TASK_STEP_DROPPED, TASK_STEP_LINE } from '../src/services/languageTeachingContext';
import { shapeLines, stageMachine } from '../src/services/lessonPlanner';

// planner2e fixes A, C, D, E for the lower "teacher would accept" score with the planner on (PLN2f, docs/tutor/PLANNER2D_FIXES.md).
describe('planner2e: teacher-score fixes', () => {
  it('A: a reply that already sets a task is recognised, so no second task is appended', () => {
    expect(setsTask('Yes, "apple" fits the clue.  Now you: write one sentence about a food you like.')).toBe(true);
    expect(setsTask('Correct. Now a new situation, on your own.  Join the two sentences with and or but: "I like the shirt. It is too big."')).toBe(true);
    expect(setsTask('Your turn: say a word for the gap.')).toBe(true);
    expect(setsTask('Yes, that is right. You used but to show a contrast. Good work today.')).toBe(false);
    expect(REVIEW_CLOSE_FALLBACK).toMatch(/new sentence/);
  });
  it('C: the own-sentence point is the point itself, never a pasted success criterion', () => {
    expect(pointPhrase('Uses and to add an idea')).toBe('and to add an idea');
    expect(pointPhrase('Uses many with countable nouns.')).toBe('many with countable nouns');
    expect(pointPhrase('Can correctly use the past simple')).toBe('the past simple');
    expect(pointPhrase('Comparatives with -er and than')).toBe('Comparatives with -er and than');
  });
  it('D: child supports accept a correct word outside the lesson list', () => {
    const lp = { shape: 'PPP', stages: ['present', 'practise', 'produce', 'check', 'done'], startStage: 'present', childSupports: true, plan: { primary: 'direct_instruction', supporting: [] } } as never;
    expect(shapeLines(lp, 'practise').join('\n')).toMatch(/Accept any correct word or sentence that fits, even one that is not in the lesson list/);
  });
  it('E: after language focus the task-based lesson repeats the task (no gap-fill drill)', () => {
    expect(stageMachine('TASK', ['none', 'bad', 'bad', 'ok'] as never)).toBe('repeat');
    expect(TASK_STEP_DROPPED.has('present_lesson_item')).toBe(true);
    expect(TASK_STEP_LINE).toMatch(/sets the real-life task again in a NEW situation/);
    expect(TASK_STEP_LINE).toMatch(/overrides any instruction above to present a lesson exercise/);
  });
});

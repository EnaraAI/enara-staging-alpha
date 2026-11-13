import { describe, expect, it } from 'vitest';
import { diagnoseError, type LessonItem } from '../src/services/languageLearningState';

// r4.4 #1 (rebuilt): the tutor works out the likely CAUSE of a wrong answer and hints at the
// cause, never at the answer. Synthetic items (not the benchmark fixture's).
const s3: LessonItem = { id: 'q1', prompt: 'Correct the verb: "Tom ___ (fix) bikes every Saturday."', acceptedAnswers: ['Tom fixes bikes every Saturday.', 'fixes'], targetForms: ['fixes'] } as LessonItem;
const s3b: LessonItem = { id: 'q2', prompt: 'Correct the verb: "Ana ___ (read) at night."', acceptedAnswers: ['Ana reads at night.', 'reads'], targetForms: ['reads'] } as LessonItem;
const pro: LessonItem = { id: 'q3', prompt: 'Complete: "This is my aunt. ___ is a nurse."', acceptedAnswers: ['She is a nurse.', 'She'], targetForms: ['she'] } as LessonItem;
const pp: LessonItem = { id: 'q4', prompt: 'Complete: "I ___ (visit) Rome last year."', acceptedAnswers: ['I visited Rome last year.', 'visited'], targetForms: ['visited'] } as LessonItem;
const part: LessonItem = { id: 'q5', prompt: 'Complete: "Have you ever ___ (see) snow?"', acceptedAnswers: ['Have you ever seen snow?', 'seen'], targetForms: ['seen'] } as LessonItem;

describe('r4.4 #1 diagnostic hinting: error-cause classification', () => {
  it.each([
    [s3, 'Tom fix bikes every Saturday.', 'missing_third_person_s'],
    [s3, 'Tom fixs bikes every Saturday.', 'wrong_third_person_ending'],
    [s3, 'Tom fixed bikes every Saturday.', 'past_form_for_routine'],
    [s3b, 'Ana read at night.', 'missing_third_person_s'],
    [pro, 'He is a nurse.', 'pronoun_gender_swap'],
    [pro, 'is a nurse', 'pronoun_omitted'],
    [pp, 'I have visited Rome last year.', 'perfect_with_finished_time'],
    [part, 'Have you ever saw snow?', 'wrong_participle'],
  ])('%#: diagnoses the cause', (item, answer, code) => {
    expect(diagnoseError(answer, item)?.code).toBe(code);
  });
  it('returns null for a correct answer and never puts the answer form in the cue', () => {
    expect(diagnoseError('Tom fixes bikes every Saturday.', s3)).toBeNull();
    for (const [item, ans] of [[s3, 'Tom fix bikes'], [pro, 'He is a nurse.'], [part, 'Have you ever saw snow?']] as const) {
      const d = diagnoseError(ans, item)!;
      for (const f of item.targetForms!) expect(d.cue.toLowerCase()).not.toMatch(new RegExp(`\\b${f}\\b`));
    }
  });
  it('a verb hint in brackets is not part of the sentence', () => {
    expect(diagnoseError('Ana read at night.', s3b)?.code).not.toBe('unchanged_from_prompt');
  });
});

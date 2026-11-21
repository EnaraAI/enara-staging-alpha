import { afterEach, describe, expect, it } from 'vitest';
import { gradeAllSubjectsOn, practiceOutcome, practiceTurnFrom, SUBJECT_GRADE_LINE } from '../src/services/subjectPractice';
import { stripAssessmentMarkers } from '../src/services/languageLearningState';
import { summarizeTurns } from '../src/services/learnerMemory';

// gradeAllSubjects (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN B): practice answers in any subject feed the same memory as English lessons.
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

describe('gradeAllSubjects', () => {
  it('named-only switch, off by default', () => {
    expect(gradeAllSubjectsOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(gradeAllSubjectsOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'gradeAllSubjects';
    expect(gradeAllSubjectsOn()).toBe(true);
  });

  it('the line asks for the same hidden marker, never shown', () => {
    expect(SUBJECT_GRADE_LINE).toMatch(/\[\[assess verdict=V relevance=R next=N\]\]/);
    expect(SUBJECT_GRADE_LINE).toMatch(/never mention it/);
  });

  it('a maths reply: the leading line is removed and becomes a practice record; right/wrong only when it answers the set question', () => {
    const s = stripAssessmentMarkers('[[assess verdict=CORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]\nYes, 3 x 4 = 12. Now: what is 6 x 7?');
    expect(s.text).not.toMatch(/assess/);
    const p = practiceTurnFrom(s, { objectiveId: 'obj-math-1', lessonId: 'l1' });
    expect(p).toMatchObject({ assessment: { verdict: 'CORRECT' }, answeringCheck: true, objectiveId: 'obj-math-1', next: 'NEW_ITEM' });
    expect(practiceOutcome(p)).toBe('right');
    const w = practiceTurnFrom(stripAssessmentMarkers('[[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM]]\nNot quite.'), {});
    expect(practiceOutcome(w)).toBe('wrong');
    const q = practiceTurnFrom(stripAssessmentMarkers('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NONE]]\nPhotosynthesis is ...'), {});
    expect(practiceOutcome(q)).toBeUndefined();
    expect(practiceTurnFrom(stripAssessmentMarkers('No marker here.'), {})).toBeUndefined();
  });

  it('a marker that is not leading is never trusted', () => {
    const s = stripAssessmentMarkers('Here is the answer. [[assess verdict=CORRECT relevance=ACTIVE_ITEM next=NONE]]');
    expect(practiceOutcome(practiceTurnFrom(s, {}))).toBeUndefined();
  });

  it('the session summary counts subject practice the same way (the "last time" line works for every subject)', () => {
    const t = (min: number) => new Date(Date.UTC(2026, 10, 21, 10, min));
    const msgs = [
      { role: 'user', timestamp: t(0) },
      { role: 'ai', timestamp: t(1), meta: { practiceTurn: { assessment: { verdict: 'INCORRECT' }, answeringCheck: true, objectiveId: 'obj-sci' } } },
      { role: 'user', timestamp: t(2) },
      { role: 'ai', timestamp: t(3), meta: { practiceTurn: { assessment: { verdict: 'CORRECT' }, answeringCheck: true, objectiveId: 'obj-sci' } } },
    ];
    const s = summarizeTurns(msgs as never);
    expect(s).toMatchObject({ right: 1, wrong: 1, objectiveId: 'obj-sci' });
  });
});

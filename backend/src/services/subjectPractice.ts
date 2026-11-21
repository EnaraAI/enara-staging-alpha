// gradeAllSubjects (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN item B): the tutor is a general tutor, but in-chat right/wrong was recorded only for
// English-lesson turns (the hidden [[assess ...]] line came from the language pipeline). With this named-only switch, every other subject's
// direct-model reply carries the same hidden line, so practice answers in maths, science, history ... feed the same memory: the chat
// right/wrong record on the lesson objective (errors to work on, spaced review), and the session summary ("last time" line).
// The line is removed before anything is stored, shown or spoken (the existing marker filter); only a LEADING marker is trusted.
import { engineV2 } from './engineV2';
import type { StrippedReply } from './languageLearningState';

export const gradeAllSubjectsOn = (): boolean => engineV2('gradeAllSubjects');

export const SUBJECT_GRADE_LINE = [
  'HIDDEN GRADING LINE (every reply, any subject): start the reply with exactly one line of this form, before any visible text:',
  '[[assess verdict=V relevance=R next=N]]',
  '- V: CORRECT, PARTIALLY_CORRECT or INCORRECT when the learner\'s message answers the practice question or exercise you set in your last reply; NOT_EVALUATED otherwise (a question, a greeting, a new topic).',
  '- R: ACTIVE_ITEM when their message answers that question; NO_ACTIVE_ITEM otherwise.',
  '- N: NEW_ITEM if this reply sets a new practice question, SAME_ITEM if it asks them to try the same one again, NONE otherwise.',
  'Judge only what they wrote against the correct answer for this course. The line is removed before the learner sees the reply: never mention it.',
].join('\n');

export interface PracticeTurn {
  assessment: { verdict: string };
  answeringCheck: boolean;
  objectiveId?: string;
  lessonId?: string;
  next?: string;
}
const RIGHT = new Set(['CORRECT', 'CORRECT_WITH_EQUIVALENT_FORMULATION']);
const WRONG = new Set(['INCORRECT', 'PARTIALLY_CORRECT']);

/** The stored record of one graded subject turn, from the trusted leading marker; undefined when there is none. */
export function practiceTurnFrom(marker: StrippedReply | undefined, ids: { objectiveId?: string; lessonId?: string }): PracticeTurn | undefined {
  const a = marker?.assessment as { verdict?: string; relevance?: string; next?: string } | null | undefined;
  if (!a?.verdict) return undefined;
  return {
    assessment: { verdict: a.verdict },
    answeringCheck: a.relevance === 'ACTIVE_ITEM' && (RIGHT.has(a.verdict) || WRONG.has(a.verdict)),
    ...(ids.objectiveId ? { objectiveId: ids.objectiveId } : {}),
    ...(ids.lessonId ? { lessonId: ids.lessonId } : {}),
    ...(a.next ? { next: a.next } : {}),
  };
}
/** right / wrong / none for the errors-to-work-on record. */
export function practiceOutcome(p: PracticeTurn | undefined): 'right' | 'wrong' | undefined {
  if (!p?.answeringCheck) return undefined;
  return RIGHT.has(p.assessment.verdict) ? 'right' : WRONG.has(p.assessment.verdict) ? 'wrong' : undefined;
}

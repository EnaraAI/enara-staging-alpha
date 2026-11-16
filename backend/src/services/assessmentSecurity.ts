import { Assessment } from '../models/Assessment';
import { toPlainObject } from '../utils/serialize';
import { graderV2On, matchKeyV2, type KeyItem } from './graderV2';

export function stripAnswersForStudent(assessment: InstanceType<typeof Assessment>) {
  const obj = toPlainObject(assessment) as Record<string, unknown>;
  const questions = (obj.questions as Array<Record<string, unknown>> | undefined)?.map((q) => {
    const { correctAnswer, explanation, modelAnswer, distractors, ...rest } = q;
    return rest;
  });
  return { ...obj, questions };
}

export function summarizeAssessmentForStudent(assessment: InstanceType<typeof Assessment>) {
  const stripped = stripAnswersForStudent(assessment);
  return {
    ...stripped,
    questionCount: Array.isArray(stripped.questions) ? stripped.questions.length : 0,
  };
}

type RevealSettings = Pick<InstanceType<typeof Assessment>, 'status' | 'dueDate' | 'maxAttempts' | 'answerReveal'>;

// Completed, or past its due date. A date-only due date lasts until the end of that day (UTC).
export function isAssessmentClosed(assessment: Pick<RevealSettings, 'status' | 'dueDate'>, now = new Date()): boolean {
  if (assessment.status === 'completed') return true;
  if (!assessment.dueDate) return false;
  const due = Date.parse(assessment.dueDate);
  if (!Number.isFinite(due)) return false;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(assessment.dueDate.trim()) ? due + 24 * 60 * 60 * 1000 : due;
  return end < now.getTime();
}

// Whether a student who has submitted `submittedCount` times may see the answer key.
// Never while they can still submit again, so the key can't be used to retake.
export function canRevealAnswers(assessment: RevealSettings | null | undefined, submittedCount: number, now = new Date()): boolean {
  if (!assessment) return true;
  const reveal = assessment.answerReveal || 'after-submit';
  if (reveal === 'never') return false;
  if (isAssessmentClosed(assessment, now)) return true;
  return reveal === 'after-submit' && submittedCount >= (assessment.maxAttempts || 1);
}

interface GradedAnswer {
  correctAnswer?: unknown;
  explanation?: unknown;
  isCorrect?: unknown;
}

export function hideAnswerKey<T extends GradedAnswer>(answers: T[]): Omit<T, 'correctAnswer' | 'explanation' | 'isCorrect'>[] {
  return answers.map(({ correctAnswer, explanation, isCorrect, ...rest }) => rest);
}

// The answer-key rule used everywhere answers are graded (assessments and
// diagnostics): trimmed, case-insensitive exact match.
// graderV2 ON: normalised matching, acceptedAnswers, option letter = option text (graderV2.ts).
export function gradeAnswer(question: { correctAnswer?: string | number } & Omit<KeyItem, 'correctAnswer'>, answer: string | number | undefined): boolean {
  if (graderV2On()) return matchKeyV2({ ...question, prompt: question.prompt ?? question.text }, answer);
  if (answer === undefined || question.correctAnswer === undefined || question.correctAnswer === null) return false;
  return String(answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
}

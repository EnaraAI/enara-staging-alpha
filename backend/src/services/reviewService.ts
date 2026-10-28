import { reviewItemObjectiveIds } from './objectiveLinks';
import { recordLearningEvent } from './learningEvents';
import { randomUUID } from 'crypto';
import { ReviewItem, IReviewItem } from '../models/ReviewItem';
import type { IAttemptAnswer } from '../models/AssessmentAttempt';

// Spaced review: a question answered wrong comes back the next day, then after
// 3, 7, 14 and 30 days while it keeps being answered right; a wrong answer
// starts it over. Five right in a row retires it.

const INTERVALS = [1, 3, 7, 14, 30];
const DAY = 24 * 60 * 60 * 1000;

function dueIn(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

export async function queueQuizMistakes(params: {
  studentId: string;
  institutionId?: string;
  assessmentId: string;
  subject?: string;
  answers: IAttemptAnswer[];
  options: Record<string, string[] | undefined>;
}): Promise<number> {
  const wrong = params.answers.filter((a) => !a.isCorrect && String(a.correctAnswer ?? '').trim());
  await Promise.all(
    wrong.map((a) =>
      ReviewItem.updateOne(
        { studentId: params.studentId, sourceKey: `${params.assessmentId}:${a.questionId}` },
        {
          // Wrong again on a retake: back to the start of the schedule.
          $set: { intervalDays: INTERVALS[0], streak: 0, dueAt: dueIn(INTERVALS[0]), retiredAt: null },
          $setOnInsert: {
            id: `rev-${randomUUID()}`,
            institutionId: params.institutionId,
            topic: a.topic || params.subject || '',
            question: a.questionText,
            options: params.options[a.questionId],
            answer: String(a.correctAnswer),
            explanation: a.explanation,
          },
        },
        { upsert: true },
      ),
    ),
  );
  return wrong.length;
}

export async function listDueReviews(studentId: string, limit = 10) {
  const items = await ReviewItem.find({ studentId, retiredAt: null, dueAt: { $lte: new Date() } })
    .sort({ dueAt: 1 })
    .limit(limit);
  return items.map((i) => ({ id: i.id, topic: i.topic, question: i.question, options: i.options?.length ? i.options : undefined }));
}

function isRightAnswer(item: IReviewItem, given: string | number): boolean {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  // Multiple choice may be stored as the option's index or its text.
  if (item.options?.length) {
    const index = Number(item.answer);
    const expected = Number.isInteger(index) && item.options[index] !== undefined ? item.options[index] : item.answer;
    const givenText = typeof given === 'number' && item.options[given] !== undefined ? item.options[given] : given;
    return norm(givenText) === norm(expected) || norm(given) === norm(item.answer);
  }
  return norm(given) === norm(item.answer);
}

export async function answerReview(studentId: string, id: string, given: string | number) {
  const item = await ReviewItem.findOne({ id, studentId, retiredAt: null });
  if (!item) return null;
  const correct = isRightAnswer(item, given);
  if (correct) {
    item.streak += 1;
    if (item.streak >= INTERVALS.length) item.retiredAt = new Date();
    item.intervalDays = INTERVALS[Math.min(item.streak, INTERVALS.length - 1)];
  } else {
    item.streak = 0;
    item.intervalDays = INTERVALS[0];
  }
  item.dueAt = dueIn(item.intervalDays);
  item.lastReviewedAt = new Date();
  await item.save();

  const index = Number(item.answer);
  const answerText =
    item.options?.length && Number.isInteger(index) && item.options[index] !== undefined ? item.options[index] : item.answer;
  await recordLearningEvent({
    studentId,
    institutionId: item.institutionId,
    type: 'review_answered',
    source: 'review',
    verified: true,
    objectiveIds: await reviewItemObjectiveIds(item.sourceKey, item.institutionId),
    idempotencyKey: `review:${item.id}:${item.lastReviewedAt!.toISOString()}`,
    gradedBy: 'rule',
    topic: item.topic || undefined,
    refs: { reviewItemId: item.id },
    outcome: { correct },
  });
  return {
    correct,
    answer: answerText,
    explanation: item.explanation || '',
    nextInDays: item.retiredAt ? null : item.intervalDays,
  };
}

import type { IQuestion } from '../models/Assessment';
import type { IConversationTurn } from '../models/AssessmentAttempt';
import { askForJson } from './aiJson';
import { logger } from '../utils/logging';

// Conversation exams: an AI examiner asks the assignment's questions one at a
// time, word for word, and may ask one neutral follow-up per question so the
// student can show their reasoning. The student's replies become the answer
// to that question, graded by the normal rubric grading. The examiner never
// sees the model answer or the rubric, so it cannot leak them.

export const CONVERSATION_QUESTION_TYPES = ['open-response', 'short-answer'];
export const MAX_REPLY_CHARS = 2000;
const MAX_FOLLOW_UP_CHARS = 220;

export const questionTurn = (q: IQuestion, index: number, count: number) => `Question ${index + 1} of ${count}. ${q.text}`;

export function openingTurn(count: number, first: IQuestion) {
  return `Hello, I'm your examiner for this conversation exam. I'll ask you ${count} question${count === 1 ? '' : 's'}, one at a time. ` +
    "Answer in your own words. I can't give hints or tell you if you're right, but I may ask you to explain a little more. " +
    questionTurn(first, 0, count);
}

export const CLOSING_TURN = "Thank you, that's the end of the exam. Your answers are saved, so you can submit now.";

// The student's replies to one question, in order: this is the answer that is graded.
export function answerFor(turns: IConversationTurn[], questionId: string) {
  return turns.filter((t) => t.role === 'student' && t.questionId === questionId).map((t) => t.text.trim()).filter(Boolean).join('\n');
}

const SYSTEM =
  'You are an impartial examiner running a spoken-style exam. You see one exam question and the student\'s reply so far. ' +
  'Decide whether ONE short follow-up question is needed so the student can show their reasoning: ask one only when the reply is very short, ' +
  'unclear, or gives a result without the working or explanation the question asks for. Otherwise move on. ' +
  'A follow-up must be neutral and open: never hint, never say or imply whether anything is right or wrong, never mention a method, value or ' +
  'step the student has not already said, and never introduce new information. Examples: "Can you explain how you got that?", ' +
  '"Can you walk me through your steps?". Reply in the language of the question. ' +
  'Return only JSON: {"followUp": "<one question ending with ?>"} or {"followUp": null}.';

export function validateFollowUp(raw: unknown): string | null {
  const v = (raw as { followUp?: unknown })?.followUp;
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new Error('followUp must be a string or null');
  const text = v.trim();
  if (!text || text.length > MAX_FOLLOW_UP_CHARS || !/[?؟]$/.test(text)) throw new Error('followUp must be one short question');
  return text;
}

// One neutral follow-up, or null to move on. Any failure moves on: the exam
// must never get stuck on the examiner.
export async function decideFollowUp(params: { question: IQuestion; answer: string; institutionId?: string }): Promise<string | null> {
  try {
    const { value } = await askForJson({
      feature: 'conversation_exam',
      institutionId: params.institutionId,
      maxTokens: 300,
      system: SYSTEM,
      user: JSON.stringify({ question: params.question.text, studentReply: `<student_reply>${params.answer.slice(0, MAX_REPLY_CHARS)}</student_reply>` }),
      validate: validateFollowUp,
    });
    return value;
  } catch (error) {
    logger.warn('conversation_exam_follow_up_failed', { error: String((error as Error).message).slice(0, 200) });
    return null;
  }
}

export type ConversationState = { index: number; probed: boolean; done: boolean };

// Pure step of the exam: given the state and the student's reply, the turns to
// add and the next state. `followUp` is the examiner's decision for this reply.
export function nextTurns(params: {
  questions: IQuestion[];
  state: ConversationState | null | undefined;
  reply?: string;
  followUp?: string | null;
  now?: Date;
}): { turns: IConversationTurn[]; state: ConversationState } {
  const { questions } = params;
  const at = params.now ?? new Date();
  if (!params.state) {
    return { turns: [{ questionId: questions[0].id, role: 'examiner', kind: 'question', text: openingTurn(questions.length, questions[0]), at }], state: { index: 0, probed: false, done: false } };
  }
  const { index, probed } = params.state;
  const q = questions[index];
  const turns: IConversationTurn[] = [{ questionId: q.id, role: 'student', text: params.reply!.trim(), at }];
  if (!probed && params.followUp) {
    turns.push({ questionId: q.id, role: 'examiner', kind: 'follow_up', text: params.followUp, at });
    return { turns, state: { index, probed: true, done: false } };
  }
  const next = index + 1;
  if (next < questions.length) {
    turns.push({ questionId: questions[next].id, role: 'examiner', kind: 'question', text: questionTurn(questions[next], next, questions.length), at });
    return { turns, state: { index: next, probed: false, done: false } };
  }
  turns.push({ questionId: q.id, role: 'examiner', kind: 'closing', text: CLOSING_TURN, at });
  return { turns, state: { index, probed: true, done: true } };
}

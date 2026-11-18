import { enaraApi, login } from './enara';

// ENARA work the scenarios pick in Moodle (School A, made by its school
// admin through the API, as the lms-test picker items were). Answers are
// known: the correct option is always the first word listed in QUESTIONS.
export const QUIZ_TITLE = 'E2E graded quiz (4 questions)';
export const PRACTICE_TITLE = 'E2E practice (4 questions)';
export const QUESTIONS = [
  { text: 'E2E: what is 2 + 2?', options: ['4', '3', '5', '6'] },
  { text: 'E2E: what is 3 + 3?', options: ['6', '5', '7', '8'] },
  { text: 'E2E: what is 5 + 5?', options: ['10', '9', '11', '12'] },
  { text: 'E2E: what is 1 + 1?', options: ['2', '1', '3', '4'] },
];

const questions = () =>
  QUESTIONS.map((q, i) => ({ id: `q${i + 1}`, type: 'multiple-choice', text: q.text, options: q.options, correctAnswer: q.options[0], points: 1, explanation: '' }));

export async function createContent(): Promise<{ quizId: string; practiceId: string }> {
  const token = await login('admin.a');
  const existing = await enaraApi.get('/api/assessments?limit=200', token).catch(() => null);
  const list: any[] = Array.isArray(existing) ? existing : existing?.assessments ?? existing?.data ?? [];
  const find = (title: string) => list.find((a) => a.title === title)?.id as string | undefined;
  const make = async (title: string, assessmentKind: 'quiz' | 'practice') => {
    const r = await enaraApi.post('/api/assessments', token, {
      title, subject: 'Maths', assessmentKind, difficulty: 'Easy', duration: 10, status: 'active', lifecycle: 'published',
      maxAttempts: 10, answerReveal: 'after-submit', instructions: 'Fake e2e item.', questions: questions(),
    });
    const a = r.assessment ?? r;
    return a.id as string;
  };
  const quizId = find(QUIZ_TITLE) ?? (await make(QUIZ_TITLE, 'quiz'));
  const practiceId = find(PRACTICE_TITLE) ?? (await make(PRACTICE_TITLE, 'practice'));
  return { quizId, practiceId };
}

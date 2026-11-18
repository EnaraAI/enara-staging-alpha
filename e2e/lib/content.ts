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

export const SPEAKING_TITLE = 'E2E speaking exam (mic check)';
const SPEAKING_QUESTIONS = 'E2E speaking questions';

/** A voice-only English speaking exam (assignment) for the mic scenario; given to a School A class so the picker lists it. */
async function createSpeaking(token: string, list: any[]): Promise<{ speakingAssessmentId: string; speakingAssignmentId: string }> {
  let assessmentId = list.find((a) => a.title === SPEAKING_QUESTIONS)?.id as string | undefined;
  if (!assessmentId) {
    const r = await enaraApi.post('/api/assessments', token, {
      title: SPEAKING_QUESTIONS, subject: 'English', assessmentKind: 'teacher_exam', difficulty: 'Easy', duration: 10, status: 'active', lifecycle: 'published',
      maxAttempts: 3, answerReveal: 'after-submit', instructions: 'Fake e2e speaking exam.', language: 'en',
      questions: [{
        id: 'q1', type: 'open-response', text: 'Tell me about your family.', points: 4,
        rubric: { criteria: [{ id: 'c1', title: 'Task achievement', levels: [{ id: 'l0', label: 'Not yet', points: 0 }, { id: 'l1', label: 'Some', points: 2 }, { id: 'l2', label: 'Full', points: 4 }] }] },
      }],
    });
    assessmentId = (r.assessment ?? r).id as string;
  }
  const asg = await enaraApi.post('/api/assignments', token, {
    classId: 'LT-C-ENG-7A', assessmentId, title: SPEAKING_TITLE, dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), maxAttempts: 3,
    format: 'english_conversation', speaking: { language: 'en', cefrLevel: 'A1', topic: 'My family', durationMinutes: 5, deliveryPolicy: 'voice_only' },
  });
  return { speakingAssessmentId: assessmentId, speakingAssignmentId: (asg.assignment ?? asg).id };
}

export async function createContent(): Promise<{ quizId: string; practiceId: string; speakingAssessmentId: string; speakingAssignmentId: string }> {
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
  return { quizId, practiceId, ...(await createSpeaking(token, list)) };
}

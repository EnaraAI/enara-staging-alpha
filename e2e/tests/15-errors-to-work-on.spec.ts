import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';
import { saveState } from '../lib/state';

// Scenario 15: learner memory phase 1, "errors to work on" (ENARA_ENGINE_V2 workOn, as on lms-test). Fake data only; AI stays paused.
// A wrong answer on a RELEASED assignment attempt becomes an error to work on, but the tutor may use it only when the assessment is over for the
// learner (closed, past its date, or no attempts left). Teachers see the list and can dismiss a row; the learner sees it without sources.
test.describe.configure({ mode: 'serial' });

const CLASS = 'LT-C-ENG-7A';
const STUDENT_KEY = 'lt-s-a04'; // School A, group 7A (in English 7A), not used by the other scenarios
const STUDENT_ID = 'LT-S-A04';
const LABEL = 'Uses a before a vowel sound';
const stamp = Date.now().toString(36);
const ids: { objective?: string; assessment?: string; oneTry?: string; twoTries?: string } = {};

const list = async (key: string, id = STUDENT_ID) => (await enaraApi.get(`/api/learning/students/${id}/errors-to-work-on`, await login(key))).errors as any[];
async function answerWrong(assignmentId: string) {
  const t = await login(STUDENT_KEY);
  const a = await enaraApi.post(`/api/me/assignments/${assignmentId}/attempts`, t, {});
  const attemptId = (a.attempt ?? a).id as string;
  await enaraApi.post(`/api/me/assignments/${assignmentId}/attempts/${attemptId}/submit`, t, { answers: { q1: 'a' } });
  // Automatic grading of a choice item needs no AI; with auto release the result is released (the result read also kicks grading).
  await expect.poll(async () => (await enaraApi.get(`/api/me/assignments/${assignmentId}/attempts/${attemptId}/result`, t)).released, { timeout: 90_000 }).toBe(true);
  return attemptId;
}

test('setup: an English objective, a one-question quiz with a labelled wrong option, two assignments (1 try and 2 tries)', async () => {
  const admin = await login('admin.a');
  // The E2E stack reads class rosters from class_enrollments (multi-class on); the seed links students only through their group, so the
  // learner is enrolled in English 7A here (as scenario 5 does): teacher.a1 then teaches them and the class assignments reach them.
  await enaraApi.post(`/api/multi-class/students/${STUDENT_ID}/enrollments`, admin, { scope: 'class', targetId: CLASS }, [200, 201, 409]);
  const o = await enaraApi.post('/api/learning/objectives', admin, { curriculumId: 'LT-CUR-ENG-A', code: `E2E-WORKON-${stamp}`, title: 'Use a and an' });
  ids.objective = (o.objective ?? o).id;
  await enaraApi.post(`/api/learning/objectives/${ids.objective}/approve`, admin, {});
  const as = await enaraApi.post('/api/assessments', admin, {
    title: `E2E errors to work on ${stamp}`, subject: 'English', assessmentKind: 'quiz', difficulty: 'Easy', duration: 10, status: 'active', lifecycle: 'published',
    maxAttempts: 2, answerReveal: 'after-submit', instructions: 'Fake e2e item.',
    questions: [{ id: 'q1', type: 'multiple-choice', text: 'E2E: I saw ___ apple.', options: ['an', 'a', 'the', 'some'], correctAnswer: 'an', points: 1, explanation: '',
      objectiveIds: [ids.objective], distractors: [{ option: 'a', category: 'procedural_error', description: LABEL }] }],
  });
  ids.assessment = (as.assessment ?? as).id;
  const due = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const mk = async (title: string, maxAttempts: number) => (await enaraApi.post('/api/assignments', admin, { classId: CLASS, assessmentId: ids.assessment, title, dueAt: due, maxAttempts })).id as string;
  ids.twoTries = await mk(`E2E work-on, two tries ${stamp}`, 2);
  ids.oneTry = await mk(`E2E work-on, one try ${stamp}`, 1);
  expect(ids.objective && ids.assessment && ids.oneTry && ids.twoTries).toBeTruthy();
  saveState({ workOn: ids });
});

test('during the test: a released wrong answer with an attempt left is recorded but waits (no help during a test)', async () => {
  expect(await list('teacher.a1')).toEqual([]);
  await answerWrong(ids.twoTries!);
  const rows = await list('teacher.a1');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: 'open', waitingForRelease: true, error: LABEL, errorCode: 'procedural_error', objective: { id: ids.objective } });
});

test('after the test: no attempts left, so the error is ready for the tutor', async () => {
  await answerWrong(ids.oneTry!);
  const rows = await list('teacher.a1');
  expect(rows).toHaveLength(1); // same objective and error type: one row, seen twice
  expect(rows[0]).toMatchObject({ status: 'open', waitingForRelease: false, occurrences: 2 });
  expect(rows[0].sources.map((s: any) => s.assignmentId).sort()).toEqual([ids.oneTry, ids.twoTries].sort());
});

test('the learner sees their own list (no sources); another school\'s admin cannot read it', async () => {
  const mine = await list(STUDENT_KEY, 'me');
  expect(mine).toHaveLength(1);
  expect(mine[0].sources).toBeUndefined();
  expect(mine[0].error).toBe(LABEL);
  await expect(list('admin.b')).rejects.toThrow(/-> (403|404)/);
});

test('a teacher dismisses it: the learner no longer sees it', async () => {
  const [row] = await list('teacher.a1');
  const r = await enaraApi.patch(`/api/learning/errors-to-work-on/${row.id}`, await login('teacher.a1'), { status: 'dismissed', note: 'e2e' });
  expect(r.status).toBe('dismissed');
  expect((await list('teacher.a1'))[0].status).toBe('dismissed');
  expect(await list(STUDENT_KEY, 'me')).toEqual([]);
});

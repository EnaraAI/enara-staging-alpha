import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';
import { moodleCli } from '../lib/moodle';
import { readState, saveState } from '../lib/state';

// Scenario 16: errors to work on from Moodle's OWN quizzes (ENARA_ENGINE_V2 moodleQuiz + workOn, as on lms-test). Fake data only.
// The school's Moodle admin creates a read-only web service (3 quiz read functions) and gives ENARA its token; the school admin maps a
// Moodle quiz to an ENARA objective and switches the import on. A finished Moodle attempt with a wrong answer, on a quiz with no
// attempts left and review allowed, becomes an error to work on (code moodle_wrong) for the linked ENARA learner, once.
test.describe.configure({ mode: 'serial' });

const QUIZ_NAME = 'ENARA E2E quiz (true/false)';
const stamp = Date.now().toString(36);
const ids: { platform?: string; quiz?: string; course?: string; objective?: string; student?: string } = {};
const base = () => `/api/lms/platforms/${ids.platform}/moodle-quiz`;

test('setup: a read-only Moodle web service and token, a 1-question quiz and student.test\'s wrong, finished attempt', async () => {
  ids.platform = readState().schoolA?.platformId;
  expect(ids.platform, 'scenario 1 connects School A').toBeTruthy();
  const ws = moodleCli<{ token: string }>('quiz-ws');
  expect(ws.token).toMatch(/^[a-f0-9]{32}$/);
  const admin = await login('admin.a');
  const saved = await enaraApi.put(`${base()}/token`, admin, { token: ws.token });
  expect(saved).toMatchObject({ switchOn: true, hasToken: true, enabled: false, check: { ok: true, code: 'ok' } });
  expect(JSON.stringify(saved)).not.toContain(ws.token); // write-only
  expect(JSON.stringify(await enaraApi.get(base(), admin))).not.toContain(ws.token);
  const q = moodleCli<{ quiz: number; course: number; attempts: { id: number; state: string }[]; error?: string }>('quiz-setup', { course: 'ENARATEST', name: QUIZ_NAME, user: 'student.test', answer: 'False' });
  expect(q.error, `quiz-setup: ${q.error}`).toBeUndefined();
  expect(q.attempts.some((a) => a.state === 'finished')).toBe(true);
  ids.quiz = String(q.quiz); ids.course = String(q.course);
  const o = await enaraApi.post('/api/learning/objectives', admin, { curriculumId: 'LT-CUR-ENG-A', code: `E2E-MOODLEQUIZ-${stamp}`, title: 'True or false statements' });
  ids.objective = (o.objective ?? o).id;
  await enaraApi.post(`/api/learning/objectives/${ids.objective}/approve`, admin, {});
  saveState({ moodleQuiz: ids });
});

test('the school admin sees the quiz and maps it to an ENARA objective; another school cannot', async () => {
  const admin = await login('admin.a');
  const { quizzes } = await enaraApi.get(`${base()}/quizzes`, admin);
  const quiz = quizzes.find((x: any) => x.quizId === ids.quiz);
  expect(quiz).toMatchObject({ name: QUIZ_NAME, courseExternalId: ids.course, maxAttempts: 1, objectiveId: null });
  await expect(enaraApi.put(`${base()}/quizzes/${ids.quiz}`, admin, { courseExternalId: ids.course, objectiveId: 'obj-does-not-exist' })).rejects.toThrow(/-> 400/);
  await enaraApi.put(`${base()}/quizzes/${ids.quiz}`, admin, { courseExternalId: ids.course, quizName: QUIZ_NAME, objectiveId: ids.objective });
  expect((await enaraApi.get(`${base()}/quizzes`, admin)).quizzes.find((x: any) => x.quizId === ids.quiz).objectiveId).toBe(ids.objective);
  await expect(enaraApi.get(base(), await login('admin.b'))).rejects.toThrow(/-> (403|404)/);
  const on = await enaraApi.put(base(), admin, { enabled: true });
  expect(on.enabled).toBe(true);
});

test('the import turns the wrong answer into an error to work on, ready for the tutor, and runs only once per attempt', async () => {
  const run = await enaraApi.post(`${base()}/run`, await login('enara.admin'), {});
  expect(run).toMatchObject({ quizzes: 1, attempts: 1, wrong: 1, right: 0, errors: 0 });
  expect(run.students).toHaveLength(1);
  ids.student = run.students[0];
  const rows = (await enaraApi.get(`/api/learning/students/${ids.student}/errors-to-work-on`, await login('admin.a'))).errors as any[];
  const row = rows.find((r) => r.objective?.id === ids.objective);
  expect(row).toMatchObject({ status: 'open', errorCode: 'moodle_wrong', occurrences: 1, waitingForRelease: false });
  const again = await enaraApi.post(`${base()}/run`, await login('admin.a'), {});
  expect(again).toMatchObject({ attempts: 0, wrong: 0 });
  expect(again.students).toBeUndefined(); // a school admin gets counts only
  const s = await enaraApi.get(base(), await login('admin.a'));
  expect(s.lastRun).toMatchObject({ attempts: 0 });
  saveState({ moodleQuiz: ids });
});

test('removing the token stops it: the school\'s switch goes off', async () => {
  const admin = await login('admin.a');
  const off = await enaraApi.put(`${base()}/token`, admin, { token: null });
  expect(off).toMatchObject({ hasToken: false, enabled: false });
  await expect(enaraApi.get(`${base()}/quizzes`, admin)).rejects.toThrow(/-> 502/);
});

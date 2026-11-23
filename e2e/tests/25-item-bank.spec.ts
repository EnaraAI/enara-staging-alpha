import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 25 (assessment engine P4, docs/tutor/ASSESSMENT_ENGINE_PLAN.md §6; ENARA_ENGINE_V2 assessGen on, as on lms-test).
// The item bank: a teacher's item goes through the code checks (a bad one is refused in plain words), waits for review, a rejection
// needs a reason code, an edit makes version 2, approval makes it usable, and it enters an assessment keeping itemId + itemVersion; the
// learner's answer is graded by code. The generator itself needs a model: in the E2E stack (no model) it answers 503, and the live
// generation bench runs on lms-test.
const STUDENT = 'LT-S-A15';
const CLASS = 'LT-C-ENG-7B';
const RUN = Date.now();
const TAG = String(RUN).slice(-5);
const TITLE = `E2E item bank ${RUN}`;

test('25 · item bank: checks, review with reasons, versions, approve, add to an assessment, graded by code', async () => {
  const admin = await login('admin.a');
  const bad = await enaraApi.post('/api/item-bank', admin, { item: { type: 'mcq', subject: 'language', language: 'en', level: 'A2', objective_code: 'EN-A2-GR-1', difficulty: 2, stem: 'Which word is a verb?', options: [{ id: 'a', text: 'run' }, { id: 'b', text: 'table' }], answer_key: { correct: ['a'], multi: false } } }).then(() => 'accepted', (e: Error) => String(e));
  expect(bad).toMatch(/400|3-5 options/);
  const item = await enaraApi.post('/api/item-bank', admin, { item: { type: 'mcq', subject: 'language', language: 'en', level: 'A2', objective_code: 'EN-A2-GR-1', difficulty: 2, stem: `Which word is a verb? (set ${TAG})`, options: [{ id: 'a', text: 'table' }, { id: 'b', text: 'swim' }, { id: 'c', text: 'happy' }, { id: 'd', text: 'blue' }], answer_key: { correct: ['b'], multi: false } } });
  expect(item).toMatchObject({ version: 1, review_status: 'draft', source: 'teacher' });
  const noReason = await enaraApi.post(`/api/item-bank/${item.id}/review`, admin, { decision: 'reject' }).then(() => 'accepted', (e: Error) => String(e));
  expect(noReason).toMatch(/400|reasonCode/);
  const notYet = await enaraApi.get(`/api/item-bank/${item.id}/question`, admin).then(() => 'given', (e: Error) => String(e));
  expect(notYet).toMatch(/409|approved/);
  const v2 = await enaraApi.post(`/api/item-bank/${item.id}/review`, admin, { decision: 'edit', edits: { stem: `Which of these words is a verb? (set ${TAG})` } });
  expect(v2).toMatchObject({ version: 2, review_status: 'draft' });
  const ok = await enaraApi.post(`/api/item-bank/${item.id}/review`, admin, { decision: 'approve' });
  expect(ok).toMatchObject({ version: 2, review_status: 'approved' });
  const listed = await enaraApi.get('/api/item-bank?status=approved', admin);
  expect(listed.items.some((i: { id: string; version: number }) => i.id === item.id && i.version === 2)).toBe(true);
  const gen = await enaraApi.post('/api/item-bank/generate', admin, { domain: 'language', language: 'en', types: ['mcq'], objective_code: 'EN-A2-GR-1', count: 2 }).then(() => 'generated', (e: Error) => String(e));
  expect(gen).toMatch(/503|not available/);

  const { question } = await enaraApi.get(`/api/item-bank/${item.id}/question`, admin);
  expect(question).toMatchObject({ type: 'engine', itemId: item.id, itemVersion: 2 });
  const a = await enaraApi.post('/api/assessments', admin, { title: TITLE, subject: 'English', assessmentKind: 'quiz', difficulty: 'Easy', duration: 10, status: 'active', lifecycle: 'published', maxAttempts: 1, answerReveal: 'after-submit', questions: [question] });
  const assessment = a.assessment ?? a;
  expect(assessment.questions[0]).toMatchObject({ itemId: item.id, itemVersion: 2 });
  await enaraApi.post(`/api/multi-class/students/${STUDENT}/enrollments`, admin, { scope: 'class', targetId: CLASS }, [200, 201, 409]);
  const asg = await enaraApi.post('/api/assignments', admin, { classId: CLASS, studentIds: [STUDENT], assessmentId: assessment.id, title: TITLE, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxAttempts: 1, releasePolicy: 'auto' });
  const assignmentId = (asg.assignment ?? asg).id;
  const student = await login(STUDENT.toLowerCase());
  const started = await enaraApi.post(`/api/me/assignments/${assignmentId}/attempts`, student, {});
  await enaraApi.post(`/api/me/assignments/${assignmentId}/attempts/${started.attempt.id}/submit`, student, { answers: { [question.id]: 'b' } });
  await expect.poll(async () => (await enaraApi.get(`/api/grading/attempts/${started.attempt.id}`, admin)).attempt.totalPoints, { timeout: 60_000 }).toBe(1);
  // P5: the Item bank card counts the school's items by status.
  const stats = await enaraApi.get('/api/item-bank/stats', admin);
  expect(stats.items.total).toBeGreaterThanOrEqual(1);
  expect(stats.items.byStatus.approved).toBeGreaterThanOrEqual(1);
  expect(stats.grading30d).toHaveProperty('flagRate');
});

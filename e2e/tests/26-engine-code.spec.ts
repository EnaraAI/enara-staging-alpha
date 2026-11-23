import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 26 (assessment engine: code; owner's choice 23 Nov 2026 — a sandbox inside ENARA; ENARA_ENGINE_V2 assessCode on).
// A code question is graded by the teacher's hidden tests in the WebAssembly sandbox, with no model: the learner never sees the tests,
// an endless loop is stopped, and the attempt is released automatically with one point per passing test.
const STUDENT = 'LT-S-A16';
const CLASS = 'LT-C-ENG-7B';
const RUN = Date.now();
const TITLE = `E2E engine code ${RUN}`;
const tests = [
  { name: 'adds two numbers', call: 'add(2, 3)', expected: 5 },
  { name: 'adds negatives', call: 'add(-4, 1)', expected: -3 },
  { name: 'sums a list', call: 'sumAll([1, 2, 3, 4])', expected: 10 },
];

test('26 · code question: graded by hidden tests in the sandbox, no model; loops stopped; released with 2 of 3', async () => {
  const admin = await login('admin.a');
  const a = await enaraApi.post('/api/assessments', admin, {
    title: TITLE, subject: 'Computing', assessmentKind: 'quiz', difficulty: 'Easy', duration: 20, status: 'active', lifecycle: 'published', maxAttempts: 1, answerReveal: 'after-submit',
    questions: [
      { id: 'q1', type: 'engine', text: 'Write add(a, b) that returns the sum, and sumAll(list) that adds every number in a list.', engine: { type: 'code', domain: 'code', language: 'en', code_language: 'javascript', starter: 'function add(a, b) {\n  \n}\n\nfunction sumAll(list) {\n  \n}', answer_key: { tests } } },
      { id: 'q2', type: 'engine', text: 'Write add(a, b).', engine: { type: 'code', domain: 'code', language: 'en', code_language: 'javascript', answer_key: { tests: tests.slice(0, 1) } } },
    ],
  });
  const assessment = a.assessment ?? a;
  expect(assessment.questions[0].points).toBe(3);
  await enaraApi.post(`/api/multi-class/students/${STUDENT}/enrollments`, admin, { scope: 'class', targetId: CLASS }, [200, 201, 409]);
  const asg = await enaraApi.post('/api/assignments', admin, { classId: CLASS, studentIds: [STUDENT], assessmentId: assessment.id, title: TITLE, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxAttempts: 1, releasePolicy: 'auto' });
  const assignmentId = (asg.assignment ?? asg).id;
  const student = await login(STUDENT.toLowerCase());
  const started = await enaraApi.post(`/api/me/assignments/${assignmentId}/attempts`, student, {});
  const qs = started.questions ?? (await enaraApi.get(`/api/me/assignments/${assignmentId}`, student)).questions ?? [];
  if (qs.length) {
    expect(JSON.stringify(qs)).not.toMatch(/add\(2, 3\)|sumAll\(\[1|adds two numbers|"tests"/);
    expect(qs.find((q: { id: string }) => q.id === 'q1').engine.starter).toContain('function sumAll');
  }
  await enaraApi.post(`/api/me/assignments/${assignmentId}/attempts/${started.attempt.id}/submit`, student, {
    answers: {
      q1: 'function add(a, b) { return a + b }\nfunction sumAll(list) { let s = 0; for (let i = 0; i < list.length - 1; i++) s += list[i]; return s }',
      q2: 'function add(a, b) { while (true) {} }',
    },
  });
  let review: any;
  await expect.poll(async () => { review = await enaraApi.get(`/api/grading/attempts/${started.attempt.id}`, admin); return review.attempt.gradingStatus; }, { timeout: 60_000 }).toMatch(/released|finalized/);
  const q1 = review.items.find((i: any) => i.question.id === 'q1').answer;
  expect(q1).toMatchObject({ points: 2, grader: 'code', method: 'rule', flagged: false });
  expect(q1.feedback).toMatch(/2 of 3 tests pass/);
  expect(review.items.find((i: any) => i.question.id === 'q2').answer).toMatchObject({ points: 0, grader: 'code' });
  expect(review.items.find((i: any) => i.question.id === 'q2').answer.feedback).toMatch(/time limit/);
  expect(review.attempt).toMatchObject({ totalPoints: 2, maxPoints: 4 });
});

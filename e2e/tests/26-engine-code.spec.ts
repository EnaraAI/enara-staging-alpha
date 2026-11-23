import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 26 (owner, 23 Nov 2026): the programming-question grader was a misunderstanding and is switched OFF everywhere
// (ENARA_ENGINE_V2 without assessCode, on lms-test and in this stack). Nothing more is built on it. This scenario checks the switch:
// a teacher's code question is refused in plain words, and no assessment is created.
test('26 · code questions are switched off: refused in plain words', async () => {
  const admin = await login('admin.a');
  const refused = await enaraApi.post('/api/assessments', admin, {
    title: `E2E code off ${Date.now()}`, subject: 'Computing', assessmentKind: 'quiz', difficulty: 'Easy', duration: 10, status: 'active', lifecycle: 'published', maxAttempts: 1,
    questions: [{ id: 'q1', type: 'engine', text: 'Write add(a, b).', engine: { type: 'code', domain: 'code', language: 'en', code_language: 'javascript', answer_key: { tests: [{ name: 'adds', call: 'add(2, 3)', expected: 5 }] } } }],
  }).then(() => 'created', (e: Error) => String(e));
  expect(refused).toMatch(/400|not switched on/);
});

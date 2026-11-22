import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 22 (assessment engine P2a, docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3; ENARA_ENGINE_V2 assessGrading on, as on lms-test).
// The E2E stack has no model (AI stays paused), so an essay graded by the engine is FLAGGED ("the grader was not available") and the
// attempt waits in the teacher's queue: the same path a low-confidence or disputed grade takes.
//   1. School A's admin writes an English quiz: one choice item (code) and one essay (language domain grader, fixed rubric, 10 points).
//   2. A student submits; the attempt goes to the teacher's queue (needs_review), the essay flagged; the learner sees no score.
//   3. The teacher's grading view shows the flag; a wrong reason code is refused; the teacher scores the essay by rubric levels.
//   4. Finalized and released: the learner sees the final grade (choice 1 + essay 7 = 8 of 11).
const STUDENT = 'LT-S-A12';
const CLASS = 'LT-C-ENG-7B';
const RUN = Date.now();
const TITLE = `E2E engine essay ${RUN}`;

test.describe.serial('22 · assessment engine: a flagged essay goes to the teacher, then the learner sees the final grade', () => {
  const st: { assignmentId?: string; attemptId?: string } = {};

  test('the student submits a quiz with an essay; it waits for the teacher, flagged, with no score shown', async () => {
    const admin = await login('admin.a');
    const a = await enaraApi.post('/api/assessments', admin, {
      title: TITLE, subject: 'English', assessmentKind: 'quiz', difficulty: 'Easy', duration: 15, status: 'active', lifecycle: 'published', maxAttempts: 1, answerReveal: 'after-submit',
      questions: [
        { id: 'q1', type: 'engine', text: 'The Sun is a star.', points: 1, engine: { type: 'true_false', language: 'en', answer_key: { value: true } } },
        { id: 'q2', type: 'engine', text: 'Write 3-4 sentences about your family.', engine: { type: 'essay', domain: 'language', language: 'en' } },
      ],
    });
    const assessment = a.assessment ?? a;
    expect(assessment.questions[1].points).toBe(10);
    expect(assessment.questions[1].rubric.criteria.map((c: { id: string }) => c.id)).toEqual(['task_completion', 'grammar_accuracy', 'vocabulary_range', 'organisation', 'mechanics']);
    await enaraApi.post(`/api/multi-class/students/${STUDENT}/enrollments`, admin, { scope: 'class', targetId: CLASS }, [200, 201, 409]);
    const asg = await enaraApi.post('/api/assignments', admin, { classId: CLASS, studentIds: [STUDENT], assessmentId: assessment.id, title: TITLE, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxAttempts: 1, releasePolicy: 'auto' });
    st.assignmentId = (asg.assignment ?? asg).id;
    const student = await login(STUDENT.toLowerCase());
    const started = await enaraApi.post(`/api/me/assignments/${st.assignmentId}/attempts`, student, {});
    st.attemptId = started.attempt.id;
    // The essay question reaches the learner without any answer key, with its rubric.
    const q2 = started.questions?.find((q: { id: string }) => q.id === 'q2') ?? (await enaraApi.get(`/api/me/assignments/${st.assignmentId}`, student)).questions?.find((q: { id: string }) => q.id === 'q2');
    if (q2) expect(JSON.stringify(q2)).not.toContain('answer_key');
    await enaraApi.post(`/api/me/assignments/${st.assignmentId}/attempts/${st.attemptId}/submit`, student, {
      answers: { q1: 'true', q2: 'I have two brothers and one sister. My mother is a teacher. We go to the park every Friday and we play football.' },
    });
    let review: any;
    await expect.poll(async () => { review = await enaraApi.get(`/api/grading/attempts/${st.attemptId}`, admin); return review.attempt.gradingStatus; }, { timeout: 60_000 }).toBe('needs_review');
    const essay = review.items.find((i: any) => i.question.id === 'q2').answer;
    expect(essay).toMatchObject({ flagged: true, flagReasons: ['model_unavailable'], points: 0, needsReview: true });
    expect(review.items.find((i: any) => i.question.id === 'q1').answer).toMatchObject({ points: 1, method: 'rule', grader: 'code' });
    const mine = await enaraApi.get(`/api/me/assignments/${st.assignmentId}`, student);
    expect(JSON.stringify(mine.attempts ?? mine)).not.toMatch(/"score":\s*\d/);
  });

  test('the teacher scores the essay by rubric levels (a bad reason code is refused), finalizes and releases', async () => {
    const admin = await login('admin.a');
    const levels = { task_completion: 'p2', grammar_accuracy: 'p2', vocabulary_range: 'p1', organisation: 'p1', mechanics: 'p1' };
    const criterionScores = Object.entries(levels).map(([criterionId, levelId]) => ({ criterionId, levelId }));
    const bad = await enaraApi.put(`/api/grading/attempts/${st.attemptId}/answers/q2`, admin, { criterionScores, reasonCode: 'because' }).then(() => 'accepted', (e: Error) => String(e));
    expect(bad).toMatch(/400|reasonCode/);
    const scored = await enaraApi.put(`/api/grading/attempts/${st.attemptId}/answers/q2`, admin, { criterionScores, feedback: 'Good start: add one more sentence about what you like.' });
    expect(scored.answer).toMatchObject({ points: 7, flagged: false, grader: 'teacher' });
    expect(scored.gradingStatus).toBe('graded_draft');
    await enaraApi.post(`/api/grading/attempts/${st.attemptId}/finalize`, admin, {});
    const after = await enaraApi.get(`/api/grading/attempts/${st.attemptId}`, admin);
    if (after.attempt.gradingStatus !== 'released') await enaraApi.post(`/api/grading/attempts/${st.attemptId}/release`, admin, {});
    const done = await enaraApi.get(`/api/grading/attempts/${st.attemptId}`, admin);
    expect(done.attempt).toMatchObject({ gradingStatus: 'released', totalPoints: 8, maxPoints: 11 });
  });

  test('the learner now sees the final grade and the teacher\'s feedback', async () => {
    const student = await login(STUDENT.toLowerCase());
    const mine = await enaraApi.get(`/api/me/assignments/${st.assignmentId}`, student);
    const result = (mine.attempts ?? []).find((t: { attemptId: string }) => t.attemptId === st.attemptId);
    expect(result).toMatchObject({ released: true, score: 73 });
    expect(JSON.stringify(result)).toContain('add one more sentence');
  });
});

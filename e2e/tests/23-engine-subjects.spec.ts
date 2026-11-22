import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 23 (assessment engine P3a, docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3; ENARA_ENGINE_V2 assessSubjects on, as on lms-test).
// Science and humanities answers are graded against a checklist built from the question's own points; humanities answers only against
// the source passage the learner reads. The E2E stack has no model, so both answers are flagged and wait for the teacher.
//   1. School A's admin writes an Arabic quiz: a humanities essay with a source passage (3 required points) and a science short answer
//      (2 content points). Each question gets its own rubric and points.
//   2. The learner sees the source, never the points; submits; both answers are flagged; the attempt waits for the teacher.
//   3. The teacher sees the points as the key, scores by rubric levels, finalizes and releases: the learner sees 9 of 12 (75).
const STUDENT = 'LT-S-A13';
const CLASS = 'LT-C-ENG-7B';
const RUN = Date.now();
const TITLE = `E2E engine subjects ${RUN}`;
const SOURCE = 'افتُتحت قناة السويس عام ١٨٦٩. وهي تصل البحر المتوسط بالبحر الأحمر، فقصّرت طريق السفن بين أوروبا وآسيا. وفي عام ١٩٥٦ أُممت القناة فأصبحت إدارتها مصرية.';

test.describe.serial('23 · assessment engine: science and humanities by checklist, humanities against the source', () => {
  const st: { assignmentId?: string; attemptId?: string } = {};

  test('each question gets its own rubric; the learner sees the source but never the points; both answers wait for the teacher', async () => {
    const admin = await login('admin.a');
    const a = await enaraApi.post('/api/assessments', admin, {
      title: TITLE, subject: 'Social Studies', assessmentKind: 'quiz', difficulty: 'Easy', duration: 20, status: 'active', lifecycle: 'published', maxAttempts: 1, answerReveal: 'after-submit',
      questions: [
        { id: 'q1', type: 'engine', text: 'اكتب فقرة عن أهمية قناة السويس معتمدًا على النص.', engine: { type: 'essay', domain: 'humanities', language: 'ar', source: SOURCE, answer_key: { required_points: ['افتتحت عام ١٨٦٩', 'تصل البحر المتوسط بالبحر الأحمر', 'أممت عام ١٩٥٦'] } } },
        { id: 'q2', type: 'engine', text: 'لماذا تحتاج النباتات إلى الضوء؟', engine: { type: 'short_answer', domain: 'science', language: 'ar', answer_key: { content_points: ['تصنع النباتات غذاءها بالبناء الضوئي', 'الضوء مصدر الطاقة اللازمة'] } } },
      ],
    });
    const assessment = a.assessment ?? a;
    expect(assessment.questions[0].rubric.criteria.map((c: { id: string }) => c.id)).toEqual(['point_1', 'point_2', 'point_3', 'accuracy_vs_source', 'structure']);
    expect(assessment.questions[0].points).toBe(7);
    expect(assessment.questions[1].points).toBe(5);
    await enaraApi.post(`/api/multi-class/students/${STUDENT}/enrollments`, admin, { scope: 'class', targetId: CLASS }, [200, 201, 409]);
    const asg = await enaraApi.post('/api/assignments', admin, { classId: CLASS, studentIds: [STUDENT], assessmentId: assessment.id, title: TITLE, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxAttempts: 1, releasePolicy: 'auto' });
    st.assignmentId = (asg.assignment ?? asg).id;
    const student = await login(STUDENT.toLowerCase());
    const started = await enaraApi.post(`/api/me/assignments/${st.assignmentId}/attempts`, student, {});
    st.attemptId = started.attempt.id;
    const qs = started.questions ?? (await enaraApi.get(`/api/me/assignments/${st.assignmentId}`, student)).questions ?? [];
    const q1 = qs.find((q: { id: string }) => q.id === 'q1');
    if (q1) {
      expect(q1.engine.source).toContain('١٨٦٩');
      expect(JSON.stringify(qs)).not.toMatch(/answer_key|required_points|content_points|أممت عام/);
    }
    await enaraApi.post(`/api/me/assignments/${st.assignmentId}/attempts/${st.attemptId}/submit`, student, {
      answers: { q1: 'افتتحت قناة السويس عام ١٨٦٩، وهي تربط البحر المتوسط بالبحر الأحمر، لذلك صارت طريق السفن أقصر.', q2: 'لأن النبات يصنع غذاءه بالضوء في عملية البناء الضوئي.' },
    });
    let review: any;
    await expect.poll(async () => { review = await enaraApi.get(`/api/grading/attempts/${st.attemptId}`, admin); return review.attempt.gradingStatus; }, { timeout: 60_000 }).toBe('needs_review');
    for (const id of ['q1', 'q2']) expect(review.items.find((i: any) => i.question.id === id).answer).toMatchObject({ flagged: true, flagReasons: ['model_unavailable'], needsReview: true });
    expect(review.items.find((i: any) => i.question.id === 'q2').keyText).toContain('البناء الضوئي');
  });

  test('the teacher scores both by rubric levels, finalizes and releases; the learner sees 9 of 12', async () => {
    const admin = await login('admin.a');
    const score = (levels: Record<string, string>) => Object.entries(levels).map(([criterionId, levelId]) => ({ criterionId, levelId }));
    const h = await enaraApi.put(`/api/grading/attempts/${st.attemptId}/answers/q1`, admin, { criterionScores: score({ point_1: 'p1', point_2: 'p1', point_3: 'p0', accuracy_vs_source: 'p2', structure: 'p1' }), feedback: 'أحسنت. اذكر أيضًا تأميم القناة.' });
    expect(h.answer).toMatchObject({ points: 5, grader: 'teacher' });
    const s = await enaraApi.put(`/api/grading/attempts/${st.attemptId}/answers/q2`, admin, { criterionScores: score({ point_1: 'p1', point_2: 'p1', reasoning: 'p1', terminology: 'p1' }) });
    expect(s.answer).toMatchObject({ points: 4 });
    await enaraApi.post(`/api/grading/attempts/${st.attemptId}/finalize`, admin, {});
    const after = await enaraApi.get(`/api/grading/attempts/${st.attemptId}`, admin);
    if (after.attempt.gradingStatus !== 'released') await enaraApi.post(`/api/grading/attempts/${st.attemptId}/release`, admin, {});
    const done = await enaraApi.get(`/api/grading/attempts/${st.attemptId}`, admin);
    expect(done.attempt).toMatchObject({ gradingStatus: 'released', totalPoints: 9, maxPoints: 12 });
    const student = await login(STUDENT.toLowerCase());
    const mine = await enaraApi.get(`/api/me/assignments/${st.assignmentId}`, student);
    expect((mine.attempts ?? []).find((t: { attemptId: string }) => t.attemptId === st.attemptId)).toMatchObject({ released: true, score: 75 });
  });
});

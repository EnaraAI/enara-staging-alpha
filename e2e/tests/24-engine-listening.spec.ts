import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 24 (assessment engine P3b, docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3; ENARA_ENGINE_V2 assessMedia on, as on lms-test).
// Listening: a question carries a recording (address + transcript). The learner gets the address only; a closed item is graded by code;
// a written answer is judged against the transcript (no model in E2E: flagged, then scored by the teacher).
const STUDENT = 'LT-S-A14';
const CLASS = 'LT-C-ENG-7B';
const RUN = Date.now();
const TITLE = `E2E engine listening ${RUN}`;
const AUDIO = { url: 'https://media.example.org/e2e-trip.mp3', transcript: 'Attention please. The school trip to the museum leaves at half past eight from the main gate. Bring a packed lunch.' };

test.describe.serial('24 · assessment engine: listening, transcript hidden, closed item by code, written answer by the teacher', () => {
  const st: { assignmentId?: string; attemptId?: string } = {};

  test('the learner hears the recording but never sees its transcript; the true/false item is graded by code', async () => {
    const admin = await login('admin.a');
    const a = await enaraApi.post('/api/assessments', admin, {
      title: TITLE, subject: 'English', assessmentKind: 'quiz', difficulty: 'Easy', duration: 15, status: 'active', lifecycle: 'published', maxAttempts: 1, answerReveal: 'after-submit',
      questions: [
        { id: 'q1', type: 'engine', text: 'The trip leaves from the main gate.', points: 1, engine: { type: 'true_false', language: 'en', answer_key: { value: true }, audio: AUDIO } },
        { id: 'q2', type: 'engine', text: 'Where is the trip going, and when does it leave?', engine: { type: 'short_answer', domain: 'listening', language: 'en', audio: AUDIO, answer_key: { required_points: ['to the museum', 'at half past eight'] } } },
      ],
    });
    const assessment = a.assessment ?? a;
    expect(assessment.questions[1].points).toBe(5);
    await enaraApi.post(`/api/multi-class/students/${STUDENT}/enrollments`, admin, { scope: 'class', targetId: CLASS }, [200, 201, 409]);
    const asg = await enaraApi.post('/api/assignments', admin, { classId: CLASS, studentIds: [STUDENT], assessmentId: assessment.id, title: TITLE, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxAttempts: 1, releasePolicy: 'auto' });
    st.assignmentId = (asg.assignment ?? asg).id;
    const student = await login(STUDENT.toLowerCase());
    const started = await enaraApi.post(`/api/me/assignments/${st.assignmentId}/attempts`, student, {});
    st.attemptId = started.attempt.id;
    const qs = started.questions ?? (await enaraApi.get(`/api/me/assignments/${st.assignmentId}`, student)).questions ?? [];
    if (qs.length) {
      expect(qs.find((q: { id: string }) => q.id === 'q2').engine.audio).toEqual({ url: AUDIO.url });
      expect(JSON.stringify(qs)).not.toMatch(/packed lunch|transcript|required_points|half past eight/);
    }
    await enaraApi.post(`/api/me/assignments/${st.assignmentId}/attempts/${st.attemptId}/submit`, student, { answers: { q1: 'true', q2: 'They go to the musem at half past eight.' } });
    let review: any;
    await expect.poll(async () => { review = await enaraApi.get(`/api/grading/attempts/${st.attemptId}`, admin); return review.attempt.gradingStatus; }, { timeout: 60_000 }).toBe('needs_review');
    expect(review.items.find((i: any) => i.question.id === 'q1').answer).toMatchObject({ points: 1, grader: 'code' });
    expect(review.items.find((i: any) => i.question.id === 'q2').answer).toMatchObject({ flagged: true, flagReasons: ['model_unavailable'] });
  });

  test('the teacher scores the written answer (spelling not marked: it is listening) and releases: 6 of 6', async () => {
    const admin = await login('admin.a');
    const criterionScores = Object.entries({ point_1: 'p1', point_2: 'p1', accuracy_vs_source: 'p2', structure: 'p1' }).map(([criterionId, levelId]) => ({ criterionId, levelId }));
    const s = await enaraApi.put(`/api/grading/attempts/${st.attemptId}/answers/q2`, admin, { criterionScores });
    expect(s.answer).toMatchObject({ points: 5, grader: 'teacher' });
    await enaraApi.post(`/api/grading/attempts/${st.attemptId}/finalize`, admin, {});
    const after = await enaraApi.get(`/api/grading/attempts/${st.attemptId}`, admin);
    if (after.attempt.gradingStatus !== 'released') await enaraApi.post(`/api/grading/attempts/${st.attemptId}/release`, admin, {});
    const done = await enaraApi.get(`/api/grading/attempts/${st.attemptId}`, admin);
    expect(done.attempt).toMatchObject({ gradingStatus: 'released', totalPoints: 6, maxPoints: 6 });
  });
});

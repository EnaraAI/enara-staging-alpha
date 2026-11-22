// Assessment engine P2a on lms-test (22 Nov 2026): one real quiz graded by the engine with the live model, then the teacher's
// grading view. The school admin writes a quiz (true/false, English essay, maths steps), a seeded student submits, the engine
// grades; PNGs + a JSON of the grades (no secrets). Password from SEED_USER_PASSWORD, never printed.
import { writeFileSync, mkdirSync } from 'node:fs';
export async function engineShots(browser, SITE, PW) {
  mkdirSync('shots', { recursive: true });
  const login = async (email) => { const r = await fetch(`${SITE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) }); const j = await r.json(); if (!r.ok) throw new Error(`login ${email} ${r.status}`); return j; };
  const api = async (method, path, who, body) => { const r = await fetch(`${SITE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who.token}` }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t.slice(0, 300)}`); return j; };
  const out = { steps: [] };
  try {
    const admin = await login('ahmed.anwar@school.enara.app');
    const student = await login('farida.fahmy@school.enara.app');
    const mc = await api('GET', '/api/me/classes', student);
    const classId = mc.current && mc.current !== '__all__' ? mc.current : mc.classes?.[0]?.id;
    const studentId = student.user.studentId ?? student.user.id;
    out.steps.push({ classId: !!classId, studentId: !!studentId });
    const TITLE = `Engine check ${new Date().toISOString().slice(0, 16)}`;
    const a = await api('POST', '/api/assessments', admin, {
      title: TITLE, subject: 'English', assessmentKind: 'quiz', difficulty: 'Easy', duration: 20, status: 'active', lifecycle: 'published', maxAttempts: 1, answerReveal: 'after-submit',
      questions: [
        { id: 'q1', type: 'engine', text: 'The Sun is a star.', points: 1, engine: { type: 'true_false', language: 'en', answer_key: { value: true } } },
        { id: 'q2', type: 'engine', text: 'Write 4-5 sentences about your weekend.', engine: { type: 'essay', domain: 'language', language: 'en' } },
        { id: 'q3', type: 'engine', text: 'A rectangle is 6 cm long and 4 cm wide. What is its area? Show your steps.', engine: { type: 'math_steps', domain: 'math', language: 'en', answer_key: { final: { value: 24, unit: 'cm^2' }, solution: 'Area = length x width = 6 x 4 = 24 cm^2' } } },
      ],
    });
    const assessment = a.assessment ?? a;
    const asg = await api('POST', '/api/assignments', admin, { classId, studentIds: [studentId], assessmentId: assessment.id, title: TITLE, dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), maxAttempts: 1, releasePolicy: 'auto' });
    const assignmentId = (asg.assignment ?? asg).id;
    const started = await api('POST', `/api/me/assignments/${assignmentId}/attempts`, student, {});
    const attemptId = started.attempt.id;
    await api('POST', `/api/me/assignments/${assignmentId}/attempts/${attemptId}/submit`, student, { answers: {
      q1: 'true',
      q2: 'Last weekend I visit my grandmother in Alexandria. We eated fish near the sea and walked on the Corniche. In the evening my cousins and me played cards. I was very happy because the weather were nice.',
      q3: JSON.stringify({ steps: 'Area = length x width\n6 x 4 = 24', final: '24 cm2' }),
    } });
    let review;
    for (let i = 0; i < 60; i++) { review = await api('GET', `/api/grading/attempts/${attemptId}`, admin); if (!['submitted', 'grading', 'queued', 'pending'].includes(review.attempt.gradingStatus)) break; await new Promise((r) => setTimeout(r, 3000)); }
    out.attempt = { gradingStatus: review.attempt.gradingStatus, totalPoints: review.attempt.totalPoints, maxPoints: review.attempt.maxPoints };
    out.items = review.items.map((i) => ({ q: i.question.id, points: i.answer?.points, max: i.question.points, grader: i.answer?.grader, flagged: i.answer?.flagged, flagReasons: i.answer?.flagReasons, confidence: i.answer?.confidence, errorCodes: i.answer?.errorCodes, criteria: i.answer?.criteria ?? i.answer?.criterionScores, feedback: i.answer?.feedbackText ?? i.answer?.feedback }));
    // Teacher's grading view (school admin).
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    await ctx.addInitScript(([token, user]) => { try { localStorage.setItem('enara_token', token); localStorage.setItem('enara_user', JSON.stringify(user)); localStorage.setItem('enara_ui_role', 'admin'); } catch {} }, [admin.token, admin.user]);
    const page = await ctx.newPage();
    await page.goto(SITE, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => undefined);
    await page.getByRole('button', { name: 'Grading', exact: true }).first().click().catch((e) => out.steps.push({ nav: String(e).slice(0, 120) }));
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'shots/engine--queue.png' });
    const row = page.locator('tr', { hasText: TITLE }).first();
    await row.getByRole('button', { name: 'Open' }).click().catch((e) => out.steps.push({ open: String(e).slice(0, 120) }));
    await page.waitForTimeout(3500);
    await page.screenshot({ path: 'shots/engine--review.png', fullPage: true });
    await ctx.close();
  } catch (e) { out.error = String(e).slice(0, 400); }
  writeFileSync('shots/engine.json', JSON.stringify(out, null, 1));
  console.log('engine', JSON.stringify(out).slice(0, 1500));
}

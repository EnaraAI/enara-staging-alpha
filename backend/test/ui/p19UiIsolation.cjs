// P19 UI tenant isolation (Playwright, local only). Run against test/ui/journeyServer.ts
// (which seeds a second school whose every string carries "TB_"):
//   node test/ui/p19UiIsolation.cjs http://127.0.0.1:4173 <frontend-dist> <screenshot-dir>
// School A's student, teacher and workspace admin browse their pages; no DOM text and
// no API response may carry "TB_". Direct requests with school B's ids and forged
// client-side claims (localStorage role/institution) must change nothing server-side.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [base = 'http://127.0.0.1:4173', dist = '.', shots = '.'] = process.argv.slice(2);
const B = JSON.parse(fs.readFileSync(path.join(dist, '..', 'tenant-b-ids.json')));
const PW = 'ui-journey-password-1';
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };
const bodyText = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');

async function session(browser, card, email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const leaks = [];
  page.on('response', async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/')) return;
    try { const t = await r.text(); if (t.includes('TB_') || t.includes('ui-school-b')) leaks.push(`${r.request().method()} ${u.pathname} ${r.status()}`); } catch { /* body unavailable */ }
  });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(`^${card}`) }).click();
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', PW);
  await page.locator('form button[type=submit], button:has-text("Sign")').first().click();
  await page.waitForTimeout(3000);
  return { ctx, page, leaks };
}
async function visit(page, labels) {
  const seen = [];
  for (const label of labels) {
    const btn = page.getByRole('button', { name: label, exact: true }).first();
    if (!(await btn.count())) continue;
    await btn.click(); await page.waitForTimeout(2000);
    const t = await bodyText(page);
    if (t.includes('TB_')) seen.push(label);
  }
  return seen;
}
async function direct(page, paths) {
  return page.evaluate(async (ps) => {
    const token = localStorage.getItem('enara_token');
    const out = [];
    for (const p of ps) { const r = await fetch(p, { headers: { Authorization: `Bearer ${token}` } }); const t = await r.text(); out.push([p, r.status, t.includes('TB_') || t.includes('ui-school-b')]); }
    return out;
  }, paths);
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- Student A ----
    let s = await session(browser, 'Student', 'amira@ui.test');
    check('A student signed in', (await bodyText(s.page)).includes('Pick up where you left off'));
    let pages = await visit(s.page, ['Home', 'My learning', 'Assignments', 'Assessments', 'Results']);
    check('A student pages show no school-B text', pages.length === 0, pages.join(', '));
    let d = await direct(s.page, [`/api/me/courses/${B.courseId}`, `/api/me/courses/${B.courseId}/lessons/${B.lessonId}`, `/api/me/assignments/${B.assignmentId}`,
      `/api/me/assignments/${B.assignmentId}/attempts/${B.attemptId}/result`, `/api/me/courses?institutionId=ui-school-b`, `/api/me/assignments?institutionId=ui-school-b&studentId=${B.studentId}`]);
    check('A student direct requests for school-B ids are refused or empty', d.every(([, st, leak]) => !leak && (st >= 400 || st === 200)), JSON.stringify(d.filter(([, , l]) => l)));
    check('A student: refused statuses for B resources', d.slice(0, 4).every(([, st]) => [403, 404].includes(st)), d.slice(0, 4).map((x) => x[1]).join(','));
    // Forged client claims: pretend to be an ENARA admin of school B.
    await s.page.evaluate(() => {
      const u = JSON.parse(localStorage.getItem('enara_user') || '{}');
      localStorage.setItem('enara_user', JSON.stringify({ ...u, role: 'enara-admin', institutionId: 'ui-school-b' }));
      localStorage.setItem('enara_ui_role', 'enara-admin');
    });
    await s.page.reload({ waitUntil: 'networkidle' }); await s.page.waitForTimeout(3000);
    check('forged client role/institution shows no school-B text', !(await bodyText(s.page)).includes('TB_'));
    d = await direct(s.page, ['/api/students', '/api/course-instances', '/api/ai-controls/budgets/ui-school-b/status', `/api/teaching/classes/${B.classId}/roster`, '/api/integrations/institutions']);
    check('forged client claims are not honoured by the server (all refused)', d.every(([, st, leak]) => !leak && [401, 403, 404].includes(st)), d.map((x) => `${x[0]}=${x[1]}`).join(' '));
    check('no API response to the student carried school-B data', s.leaks.length === 0, s.leaks.join(' | '));
    await s.page.screenshot({ path: `${shots}/p19_ui_student_forged.png` });
    await s.ctx.close();

    // ---- Teacher A ----
    s = await session(browser, 'Administrator', 'teacher@ui.test');
    pages = await visit(s.page, ['Teaching Dashboard', 'Curriculum', 'Assignments', 'Grading', 'Class Insights', 'Learning Objectives', 'Class Assignments', 'Outcomes']);
    check('A teacher pages show no school-B text', pages.length === 0, pages.join(', '));
    d = await direct(s.page, [`/api/teaching/classes/${B.classId}/roster`, `/api/teaching/students/${B.studentId}/profile`, `/api/assessments/${B.assessmentId}`, `/api/curriculums/${B.curriculumId}`,
      `/api/grading/attempts/${B.attemptId}`, `/api/grading/queue?institutionId=ui-school-b`, `/api/teaching/overview?institutionId=ui-school-b`]);
    check('A teacher direct and tampered requests never return school-B data', d.every(([, , leak]) => !leak), JSON.stringify(d));
    check('A teacher: B resources refused', d.slice(0, 5).every(([, st]) => [403, 404].includes(st)), d.slice(0, 5).map((x) => x[1]).join(','));
    check('no API response to the teacher carried school-B data', s.leaks.length === 0, s.leaks.join(' | '));
    await s.ctx.close();

    // ---- Workspace admin A ----
    s = await session(browser, 'Administrator', 'admin@ui.test');
    pages = await visit(s.page, ['Dashboard', 'Students', 'Curriculum', 'Governance', 'AI Credits', 'School Insights', 'Teaching Dashboard']);
    check('A admin pages show no school-B text', pages.length === 0, pages.join(', '));
    d = await direct(s.page, [`/api/students/${B.studentId}`, `/api/course-instances/${B.classId}`, `/api/curriculums/${B.curriculumId}`, '/api/students?institutionId=ui-school-b&search=TB_', '/api/usage/report?institutionId=ui-school-b']);
    check('A admin direct and tampered requests never return school-B data', d.every(([, , leak]) => !leak), JSON.stringify(d));
    check('no API response to the admin carried school-B data', s.leaks.length === 0, s.leaks.join(' | '));
    await s.ctx.close();

    // ---- Positive control: school B's own student does see TB_ data ----
    s = await session(browser, 'Student', 'bilal@ui.test'.replace('ui.test', 'ui-b.test'));
    check('positive control: school B student sees its own TB_ data', (await bodyText(s.page)).includes('TB_') || s.leaks.length > 0);
    await s.ctx.close();
  } catch (e) {
    check('script', false, e.message.slice(0, 200));
  } finally {
    await browser.close();
    console.log(results.join('\n'));
    console.log(`P19 UI isolation: ${results.length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
})();

// P15 UI journey (Playwright, local only). Run against test/ui/journeyServer.ts
// on a fresh database:
//   npx tsx test/ui/journeyServer.ts <frontend-dist> 4173 &   (wait for READY)
//   node test/ui/p15UiJourney.cjs http://127.0.0.1:4173 <screenshot-dir>
// Exits non-zero on the first failed check. No AI key is configured on the
// harness; the tutor step checks the graceful "can't be reached" path.
const assert = require('assert');
const { chromium } = require('playwright');

const [base = 'http://127.0.0.1:4173', shots = '.'] = process.argv.slice(2);
const PW = 'ui-journey-password-1';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  assert.ok(ok, `${name} ${detail}`);
};

async function signIn(page, card, email) {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(`^${card}`) }).click();
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', PW);
  await page.locator('form button[type=submit], button:has-text("Sign")').first().click();
  await page.waitForTimeout(2500);
}
const bodyText = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

(async () => {
  const browser = await chromium.launch();
  try {
    // ---------------- Student ----------------
    const s = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    const denied = [];
    s.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
    s.on('response', (r) => r.url().includes('/api/') && [401, 403].includes(r.status()) && denied.push(`${new URL(r.url()).pathname} ${r.status()}`));
    await signIn(s, 'Student', 'amira@ui.test');
    let t = await bodyText(s);
    check('student dashboard loads', t.includes('Pick up where you left off'));
    check('published lesson reaches the student', t.includes('Adding fractions'));
    check('Due soon lists the class assignment', /Due soon.*Fractions quick check/.test(t));
    await s.screenshot({ path: `${shots}/ui_01_student_dashboard.png` });

    await s.getByText('Open lesson').first().click(); await s.waitForTimeout(1200);
    await s.getByRole('button', { name: /Start: Adding fractions/ }).click(); await s.waitForTimeout(1500);
    check('lesson content renders', (await bodyText(s)).includes('2/4 + 1/4 = 3/4'));
    await s.fill('input[placeholder="Message"], textarea[placeholder="Message"]', 'How do I add 1/2 and 1/4?');
    await s.getByRole('button', { name: 'Send' }).click(); await s.waitForTimeout(2500);
    t = await bodyText(s);
    check('tutor without a provider fails gracefully and keeps the question', t.includes("can't be reached right now") && t.includes('How do I add 1/2 and 1/4?'));
    await s.screenshot({ path: `${shots}/ui_02_lesson_tutor.png` });

    // Due soon → Assignments (through the dashboard button).
    await s.getByRole('button', { name: 'Home' }).first().click(); await s.waitForTimeout(1500);
    await s.getByRole('button', { name: /Open assignment/ }).first().click(); await s.waitForTimeout(1500);
    check('Due soon opens the Assignments page', (await bodyText(s)).includes('Fractions quick check'));
    await s.getByRole('button', { name: /Fractions quick check/ }).click(); await s.waitForTimeout(1200);
    await s.getByRole('button', { name: /^Start/ }).first().click(); await s.waitForTimeout(1200);
    check('answer keys are not on the attempt page', !(await bodyText(s)).includes('Use quarters.'));
    await s.getByText('3/4', { exact: true }).click();
    await s.getByText('2/8', { exact: true }).click();
    await s.getByRole('button', { name: 'Submit' }).click();
    await s.getByText('Submit your work?').waitFor();
    await s.getByRole('button', { name: 'Submit' }).last().click();
    await s.waitForTimeout(4000);
    t = await bodyText(s);
    check('submission received and graded without a teacher step', t.includes('Your work was received') && t.includes('1 / 2 points (50%)'));
    check('per-question marks shown', t.includes('Your answer: 3/4') && t.includes('Your answer: 2/8'));
    await s.screenshot({ path: `${shots}/ui_03_student_result.png`, fullPage: true });
    check('no page errors for the student', pageErrors.length === 0, pageErrors.join(' | '));
    check('no refused API calls for the student', denied.length === 0, denied.join(' | '));
    // P17: a reload keeps the session and shows the completed assignment as no longer due.
    await s.reload({ waitUntil: 'networkidle' }); await s.waitForTimeout(2000);
    t = await bodyText(s);
    check('student reload keeps the session', t.includes('Pick up where you left off'));
    check('submitted assignment leaves Due soon', !/Open assignment/.test(t));
    check('no refused API calls after the student reload', denied.length === 0, denied.join(' | '));
    await s.close();

    // ---------------- Teacher ----------------
    const tp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const tDenied = [];
    tp.on('response', (r) => r.url().includes('/api/') && [401, 403].includes(r.status()) && tDenied.push(`${new URL(r.url()).pathname} ${r.status()}`));
    await signIn(tp, 'Administrator', 'teacher@ui.test');
    t = await bodyText(tp);
    check('teacher lands on the Teaching dashboard', t.includes('Teaching dashboard'));
    check('teacher landing makes no refused calls', tDenied.length === 0, tDenied.join(' | '));
    for (const hidden of ['Governance', 'AI Credits', 'School Insights', 'Live Avatar Control']) {
      check(`teacher menu hides ${hidden}`, (await tp.getByRole('button', { name: hidden, exact: true }).count()) === 0);
    }
    check('teacher sees their class', t.includes('Fractions 6A'));
    check('P18-3: user badge shows the teacher role, not Admin', /Tariq Teacher\s*Teacher/i.test(t) && !/Tariq Teacher\s*Admin/i.test(t));
    await tp.screenshot({ path: `${shots}/ui_04_teacher_dashboard.png` });
    await tp.getByRole('button', { name: 'Grading', exact: true }).first().click(); await tp.waitForTimeout(2000);
    t = await bodyText(tp);
    check('teacher grading view shows the student and the released grade', t.includes('Amira Browser') && /released|Released/.test(t));
    await tp.screenshot({ path: `${shots}/ui_05_teacher_grading.png` });

    // P17 U1/D3: the shared Curriculum page works for a teacher without admin-only
    // calls, and the teacher can publish a lesson to their own class.
    const toasts = () => tp.locator('body').innerText().then((x) => /Admin access required|Could not load/i.test(x));
    await tp.getByRole('button', { name: 'Curriculum', exact: true }).first().click(); await tp.waitForTimeout(2000);
    t = await bodyText(tp);
    check('teacher Curriculum page lists the lesson', t.includes('Fractions'));
    check('teacher Curriculum page makes no refused calls', tDenied.length === 0, tDenied.join(' | '));
    check('teacher Curriculum page shows no error toasts', !(await toasts()));
    check('teacher Curriculum page hides Batches and Course Instances', (await tp.getByRole('button', { name: /^Batches$|^Course Instances$/ }).count()) === 0);
    check('header reads Teaching, not School admin', t.includes('Teaching') && !t.includes('School admin'));
    await tp.getByRole('button', { name: 'Publish to class' }).first().click(); await tp.waitForTimeout(1200);
    const dialog = tp.getByRole('dialog', { name: 'Publish to class' });
    check('publish dialog lists the teacher classes', (await dialog.innerText()).includes('Fractions 6B'));
    await dialog.locator('div', { hasText: /^Fractions 6B/ }).getByRole('button', { name: 'Publish' }).click(); await tp.waitForTimeout(1500);
    check('lesson published to the second class', /Fractions 6B\s*Published/.test(await dialog.innerText()));
    const token = await tp.evaluate(() => Object.values(localStorage).concat(Object.values(sessionStorage)).find((v) => /^ey/.test(v)));
    const classes = await (await fetch(`${base}/api/assignments/classes`, { headers: { Authorization: `Bearer ${token}` } })).json();
    check('server records the publish', classes.classes.some((c) => c.id === 'ui-cls2' && c.curriculumId));
    await dialog.getByRole('button', { name: 'Close' }).click();
    await tp.screenshot({ path: `${shots}/ui_06_teacher_publish.png` });

    await tp.getByRole('button', { name: 'Assignments', exact: true }).first().click(); await tp.waitForTimeout(2000);
    check('teacher Assessment Center makes no refused calls', tDenied.length === 0, tDenied.join(' | '));
    check('teacher Assessment Center shows no error toasts', !(await toasts()));

    // Reload: the teacher stays signed in and lands on the Teaching dashboard again.
    await tp.reload({ waitUntil: 'networkidle' }); await tp.waitForTimeout(2000);
    t = await bodyText(tp);
    check('teacher reload lands on the Teaching dashboard', t.includes('Teaching dashboard'));
    check('no refused calls after the teacher reload', tDenied.length === 0, tDenied.join(' | '));
    check('teacher menu still hides Students after reload', (await tp.getByRole('button', { name: 'Students', exact: true }).count()) === 0);
    await tp.close();

    // ---------------- Workspace admin ----------------
    const ap = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await signIn(ap, 'Administrator', 'admin@ui.test');
    for (const shown of ['Dashboard', 'Governance', 'AI Credits', 'School Insights', 'Teaching Dashboard']) {
      check(`admin menu keeps ${shown}`, (await ap.getByRole('button', { name: shown, exact: true }).count()) > 0);
    }
    await ap.getByRole('button', { name: 'Curriculum', exact: true }).first().click(); await ap.waitForTimeout(2000);
    check('admin Curriculum page keeps Batches and Course Instances', (await ap.getByRole('button', { name: /^Batches$|^Course Instances$/ }).count()) === 2);
    check('admin header reads School admin', (await bodyText(ap)).includes('School admin'));
    await ap.close();
  } finally {
    await browser.close();
    console.log(results.join('\n'));
    console.log(`UI checks: ${results.filter((r) => r.startsWith('PASS')).length} passed, ${results.filter((r) => r.startsWith('FAIL')).length} failed`);
  }
})().catch((e) => {
  console.error('UI JOURNEY FAILED:', e.message);
  process.exit(1);
});

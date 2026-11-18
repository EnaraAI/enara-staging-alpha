import { test, expect } from '@playwright/test';
import { enaraApi, enaraFrame, frameSession, login } from '../lib/enara';
import { moodleCli, moodleSession } from '../lib/moodle';
import { activityUrl } from '../lib/picker';
import { readState, saveState, shot } from '../lib/state';

// A seeded School A student (fake) placed in the LMS course's ENARA class by
// hand: a roster sync must never touch this enrollment.
const MANUAL_STUDENT = { id: 'LT-S-A05', name: 'Ehab Test' };
const STUDENT2 = 'Student2 Test';

async function courseContext() {
  const admin = await login('admin.a');
  const r = await enaraApi.get('/api/lms/contexts', admin);
  const list = (r.contexts ?? r) as any[];
  const ctx = list.find((c) => c.title === 'Enara Test Course');
  expect(ctx, `LMS course "Enara Test Course" in ${JSON.stringify(list.map((c) => c.title))}`).toBeTruthy();
  return { admin, ctx };
}

async function rosterSyncApi(contextId: string) {
  const { admin } = await courseContext();
  // "Sync roster now" allows one click per 30 s per course.
  for (let i = 0; i < 8; i++) {
    const r = await enaraApi.post(`/api/lms/contexts/${contextId}/roster/sync`, admin, {}, [200, 409, 429]).catch((e) => ({ error: String(e) }));
    if (r?.outcome) return r;
    await new Promise((res) => setTimeout(res, 6_000));
  }
  throw new Error('roster sync did not run');
}

async function teacherClassView(browser: any) {
  const s = readState();
  const t = await moodleSession(browser, 'teacher.test');
  await t.page.goto(activityUrl(s.activities.courseLink));
  const f = await enaraFrame(t.page);
  expect((await frameSession(f)).role).toBe('teacher');
  await expect(f.getByTestId('lms-class-roster')).toBeVisible({ timeout: 60_000 });
  return { ...t, f };
}

// Scenario 5 (Phase 4 + grade ledger): roster sync through NRPS, and a grade
// changed in the Moodle gradebook shown as "Changed in LMS" in ENARA.
test.describe.serial('5 · roster sync + grade changed in the LMS', () => {
  test('a manual ENARA enrollment in the course class (school admin)', async () => {
    const { admin, ctx } = await courseContext();
    saveState({ courseContext: { id: ctx.id, enaraClassId: ctx.enaraClassId } });
    const r = await enaraApi.post(`/api/multi-class/students/${MANUAL_STUDENT.id}/enrollments`, admin, { scope: 'class', targetId: ctx.enaraClassId }, [200, 201, 409]);
    expect(r).toBeTruthy();
  });

  test('student2 enrolled in Moodle → teacher "Sync roster now" → "Not started" in ENARA', async ({ browser }) => {
    moodleCli('enrol', { user: 'student2.test', course: 'ENARATEST', role: 'student' });
    const { page, context, f } = await teacherClassView(browser);
    await f.getByRole('button', { name: 'Sync roster now' }).click();
    const row = f.locator('tr').filter({ hasText: STUDENT2 });
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row.getByText('Not started')).toBeVisible();
    await expect(f.locator('tr').filter({ hasText: MANUAL_STUDENT.name })).toBeVisible();
    await shot(page, '05-roster-not-started');
    await context.close();
  });

  test('student2 unenrolled in Moodle → sync → inactive; the manual enrollment is untouched', async ({ browser }) => {
    const s = readState();
    moodleCli('unenrol', { user: 'student2.test', course: 'ENARATEST' });
    const r = await rosterSyncApi(s.courseContext.id);
    expect(r.outcome.status).toBe('ok');
    const { admin } = await courseContext();
    const roster = await enaraApi.get(`/api/lms/contexts/${s.courseContext.id}/roster`, admin);
    expect((roster.notStarted ?? []).map((x: any) => x.name)).not.toContain(STUDENT2);
    const view = roster.context ?? roster;
    expect(view.students?.inactive ?? 0).toBeGreaterThanOrEqual(1);
    const { page, context, f } = await teacherClassView(browser);
    await expect(f.locator('tr').filter({ hasText: MANUAL_STUDENT.name })).toBeVisible();
    await expect(f.locator('tr').filter({ hasText: STUDENT2 })).toHaveCount(0);
    await shot(page, '05-roster-after-unenrol');
    await context.close();
  });

  test('a grade changed in the Moodle gradebook → "Changed in LMS" in ENARA\'s Grade history', async ({ browser }) => {
    const s = readState();
    const set = moodleCli('set-grade', { course: 'ENARATEST', cmid: s.activities.quiz, user: 'student.test', grade: 40 });
    expect(set.finalgrade).toBe(40);
    // School admin "Re-sync grades": with the ledger on, ENARA first reads the LMS results.
    const admin = await login('admin.a');
    const resync = await enaraApi.post(`/api/lms/platforms/${s.schoolA.platformId}/grades/resync`, admin, {});
    expect(resync.lmsCheck, JSON.stringify(resync)).toBeTruthy();
    // The teacher opens the quiz from Moodle: Class assignments with that assignment open.
    const t = await moodleSession(browser, 'teacher.test');
    await t.page.goto(activityUrl(s.activities.quiz));
    const f = await enaraFrame(t.page);
    const row = f.locator('tr').filter({ hasText: 'Student Test' }).filter({ hasNotText: 'Student2' });
    await expect(row.getByText('Changed in LMS')).toBeVisible({ timeout: 60_000 });
    await row.getByRole('button', { name: 'Grade history' }).click();
    const dialog = f.getByRole('dialog', { name: 'Grade history' });
    await expect(dialog.getByText('Changed in LMS.')).toBeVisible();
    await shot(t.page, '05-roster-grade-history-changed-in-lms');
    // Moodle keeps the teacher's value.
    expect(moodleCli('grade', { course: 'ENARATEST', cmid: s.activities.quiz, user: 'student.test' }).finalgrade).toBe(40);
    await t.context.close();
  });
});

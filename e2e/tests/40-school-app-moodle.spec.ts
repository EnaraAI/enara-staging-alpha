import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';
import { moodleCli } from '../lib/moodle';
import { readState } from '../lib/state';

// Scenario 40: the parents school app's Moodle connector (client answer 1). Fake data on the test Moodle.
//   1. The school's Moodle admin creates a read-only web service and gives ENARA its token; ENARA checks it and never returns it.
//   2. A teacher posts in the course's Announcements forum; "Sync now" brings it in as an announcement for that course's ENARA class
//      (source: connector). A second sync does not duplicate it. Attendance: this test site has no Attendance plugin, so it is skipped.
//   3. Another school's admin cannot see or use School A's connection.
const RUN = Date.now();
const SUBJECT = `Moodle news ${RUN}`;
const st: { platform?: string; token?: string } = {};
const base = () => `/api/school-app/moodle/${st.platform}`;

test.describe.serial('40 · Parents school app: Moodle connector', () => {
  test('a read-only token is saved and checked; it is never returned', async () => {
    st.platform = readState().schoolA?.platformId;
    expect(st.platform, 'scenario 1 connects School A').toBeTruthy();
    const ws = moodleCli<{ token: string; functions: string[] }>('school-ws');
    expect(ws.functions).toContain('mod_forum_get_forum_discussions');
    st.token = ws.token;
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { announcements: true, attendance: true, notifications: true });
    await expect(enaraApi.put(`${base()}/token`, await login('admin.b'), { token: ws.token })).rejects.toThrow(/-> 404/);
    const saved = await enaraApi.put(`${base()}/token`, admin, { token: ws.token });
    expect(saved).toMatchObject({ switchOn: true, hasToken: true, enabled: false, check: { ok: true, code: 'ok', attendance: false } });
    expect(JSON.stringify(saved)).not.toContain(ws.token);
    const list = await enaraApi.get('/api/school-app/moodle', admin);
    expect(JSON.stringify(list)).not.toContain(ws.token);
    expect(list.connections.find((c: { platformId: string }) => c.platformId === st.platform)).toMatchObject({ hasToken: true });
    expect((await enaraApi.get('/api/school-app/moodle', await login('admin.b'))).connections.some((c: { platformId: string }) => c.platformId === st.platform)).toBe(false);
  });

  test('a Moodle Announcements post comes in once, for the course\'s ENARA class', async () => {
    const post = moodleCli<{ discussion: number; error?: string }>('news-post', { course: 'ENARATEST', subject: SUBJECT, message: 'Sports day on Thursday.' });
    expect(post.error, `news-post: ${post.error}`).toBeUndefined();
    const admin = await login('admin.a');
    expect(await enaraApi.put(base(), admin, { enabled: true })).toMatchObject({ enabled: true });
    const r1 = await enaraApi.post(`${base()}/run`, admin, {});
    expect(r1).toMatchObject({ code: 'ok' });
    expect(r1.announcements).toBeGreaterThanOrEqual(1);
    const anns = (await enaraApi.get('/api/school-app/announcements', admin)).announcements.filter((a: { title: string }) => a.title === SUBJECT);
    expect(anns).toHaveLength(1);
    expect(anns[0]).toMatchObject({ audience: 'group', body: 'Sports day on Thursday.', source: 'connector' });
    const r2 = await enaraApi.post(`${base()}/run`, admin, {});
    expect(r2.code).toBe('ok');
    expect((await enaraApi.get('/api/school-app/announcements', admin)).announcements.filter((a: { title: string }) => a.title === SUBJECT)).toHaveLength(1);
    await expect(enaraApi.post(`${base()}/run`, await login('admin.b'), {})).rejects.toThrow(/-> 404/);
  });
});

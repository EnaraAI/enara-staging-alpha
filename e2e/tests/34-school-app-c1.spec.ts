import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 34 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step c1): buses (stop times only; no live GPS).
//   1. School A imports a routes sheet (Arabic headers) and an assignments sheet; a stop that is not on the route is rejected.
//   2. The parent sees the child's morning and afternoon trips, stop times, and the supervisor (phone only once the school says
//      supervisors agreed to share it).
//   3. A delay notice for the morning trip reaches the parent (bus view and notification); a parent of a child on another route
//      gets nothing; School B cannot send one for School A.
const RUN = Date.now();
const ROUTE = `Route ${RUN}`, OTHER = `Other ${RUN}`;
const code = async (admin: string, studentId: string) => (await enaraApi.post(`/api/students/${studentId}/parent-codes`, await login(admin), {})).code as string;
const st: { a?: string; b?: string; parentA?: string; parentB?: string } = {};
const imp = async (section: string, csv: string, rejected = 0) => {
  const admin = await login('admin.a');
  const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section, csv });
  expect(p.counts.rejected, JSON.stringify(p.problems)).toBe(rejected);
  await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
  return p;
};

test.describe.serial('34 · Parents school app (c1): buses', () => {
  test('routes and assignments sheets; a wrong stop is rejected', async () => {
    const admin = await login('admin.a');
    expect((await enaraApi.put('/api/school-app/sections', admin, { buses: true, notifications: true })).sections.buses).toBe(true);
    await enaraApi.put('/api/school-app/buses/phones', admin, { busPhonesShared: false });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const ids = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students).map((s) => s.id);
    [st.a, st.b] = [ids[4], ids[5]];
    await imp('bus_routes', ['خط السير,رقم الحافلة,المشرف,هاتف المشرف,المحطة,موعد الصباح,موعد العودة',
      `${ROUTE},12,Mona,01000000001,Hegaz Square,6:45,14:30`, `${ROUTE},12,,,Nozha Street,7:00,14:15`,
      `${OTHER},7,Sara,01000000002,Maadi Gate,6:30,14:45`].join('\n'));
    const p = await imp('bus_assignments', ['Student ID,Route,Stop,Direction', `${st.a},${ROUTE},Nozha Street,both`, `${st.b},${OTHER},Maadi Gate,`, `${st.b},${ROUTE},No Such Stop,morning`].join('\n'), 1);
    expect(p.problems[0].message).toMatch(/not on route/);
    st.parentA = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.a', st.a!) })).token;
    st.parentB = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.a', st.b!) })).token;
  });

  test('the parent sees both trips with the stop times; the phone only once shared', async () => {
    const bus = await enaraApi.get(`/api/parents/school/learners/${st.a}/bus`, st.parentA!);
    expect(bus.trips.map((t: { direction: string; time: string; stop: string }) => [t.direction, t.time, t.stop])).toEqual([['morning', '07:00', 'Nozha Street'], ['afternoon', '14:15', 'Nozha Street']]);
    expect(bus.trips[0]).toMatchObject({ route: ROUTE, busNumber: '12', supervisor: 'Mona', supervisorPhone: null });
    expect(bus.trips[0].stops.find((s: { mine: boolean }) => s.mine).name).toBe('Nozha Street');
    await enaraApi.put('/api/school-app/buses/phones', await login('admin.a'), { busPhonesShared: true });
    expect((await enaraApi.get(`/api/parents/school/learners/${st.a}/bus`, st.parentA!)).trips[0].supervisorPhone).toBe('01000000001');
  });

  test('a delay notice reaches parents on that trip only; School B cannot send one', async () => {
    await expect(enaraApi.post('/api/school-app/buses/notices', await login('admin.b'), { route: ROUTE, kind: 'delay', direction: 'morning', minutes: 20 })).rejects.toThrow(/-> 404/);
    const n = await enaraApi.post('/api/school-app/buses/notices', await login('admin.a'), { route: ROUTE, kind: 'delay', direction: 'morning', minutes: 20, message: `Traffic ${RUN}` });
    expect(n.students).toBe(1);
    const bus = await enaraApi.get(`/api/parents/school/learners/${st.a}/bus`, st.parentA!);
    expect(bus.trips[0].notices[0]).toMatchObject({ kind: 'delay', minutes: 20, message: `Traffic ${RUN}` });
    expect(bus.trips[1].notices).toEqual([]);
    const notesA = await enaraApi.get('/api/parents/school/notifications', st.parentA!);
    expect(notesA.notifications.some((x: { kind: string; studentId: string }) => x.kind === 'bus_notice' && x.studentId === st.a)).toBe(true);
    const notesB = await enaraApi.get('/api/parents/school/notifications', st.parentB!);
    expect(notesB.notifications.some((x: { kind: string; title: string }) => x.kind === 'bus_notice' && x.title.includes(ROUTE))).toBe(false);
    const home = await enaraApi.get(`/api/parents/school/learners/${st.a}`, st.parentA!);
    expect(home.bus.trips[0].notice).toMatchObject({ kind: 'delay', minutes: 20 });
    await expect(enaraApi.get(`/api/parents/school/learners/${st.a}/bus`, st.parentB!)).rejects.toThrow(/-> 403/);
  });
});

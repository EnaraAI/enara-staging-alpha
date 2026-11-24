import { describe, expect, it } from 'vitest';
import { announcementRows, attendanceRows, moodleWs, statusOf, stripHtml } from '../../src/schoolApp/moodleSync';

// Parents school app: the Moodle connector's mapping (no network) and its client's limits.
const NOW = Date.parse('2026-11-24T10:00:00Z');
const s = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('announcements from a Moodle news forum', () => {
  it('recent discussions become announcements for the class group, with a stable external id; HTML is stripped', () => {
    const rows = announcementRows('plat1', 'Grade 5A', [
      { discussion: 11, name: 'Trip on Monday', message: '<p>Bring <b>lunch</b> &amp; water.</p>', created: s('2026-11-23T08:00:00Z') },
      { discussion: 12, name: 'Old news', message: 'x', created: s('2026-08-01T08:00:00Z') },
    ], NOW);
    expect(rows).toEqual([{ audience: 'group', audience_value: 'Grade 5A', title: 'Trip on Monday', body: 'Bring lunch & water.', publish: '2026-11-23', external_id: 'moodle:plat1:discussion:11' }]);
  });
  it('stripHtml keeps line breaks', () => {
    expect(stripHtml('<p>One</p><p>Two<br>Three</p>')).toBe('One\nTwo\nThree');
  });
});

describe('attendance from the Moodle Attendance plugin', () => {
  const statuses = [{ id: 1, acronym: 'P', description: 'Present' }, { id: 2, acronym: 'A', description: 'Absent' }, { id: 3, acronym: 'L', description: 'Late' }, { id: 4, acronym: 'E', description: 'Excused' }, { id: 5, acronym: 'X', description: 'غائب' }];
  it('maps acronyms and Arabic descriptions; unknown learners and statuses are skipped', () => {
    expect(statusOf(statuses[0])).toBe('present');
    expect(statusOf(statuses[4])).toBe('absent');
    expect(statusOf({ acronym: 'Z', description: 'Holiday' })).toBeNull();
  });
  it('one row per learner and session; two sessions on one day get period numbers; old and future sessions are left out', () => {
    const rows = attendanceRows([
      { id: 1, sessdate: s('2026-11-23T06:00:00Z'), statuses, attendance_log: [{ studentid: 7, statusid: 2, remarks: 'sick' }, { studentid: 99, statusid: 1 }] },
      { id: 2, sessdate: s('2026-11-23T09:00:00Z'), statuses, attendance_log: [{ studentid: 7, statusid: 1 }] },
      { id: 3, sessdate: s('2026-11-20T06:00:00Z'), statuses, attendance_log: [{ studentid: 7, statusid: 3 }] },
      { id: 4, sessdate: s('2026-10-01T06:00:00Z'), statuses, attendance_log: [{ studentid: 7, statusid: 2 }] },
      { id: 5, sessdate: s('2026-11-25T06:00:00Z'), statuses, attendance_log: [{ studentid: 7, statusid: 2 }] },
    ], (id) => (id === 7 ? 'STU-7' : undefined), NOW);
    expect(rows).toEqual([
      { date: '2026-11-20', student: 'STU-7', status: 'late' },
      { date: '2026-11-23', student: 'STU-7', status: 'absent', period: '1', note: 'sick' },
      { date: '2026-11-23', student: 'STU-7', status: 'present', period: '2' },
    ]);
  });
});

describe('the Moodle client', () => {
  it('calls only the allowed functions, posts the token in the body only, and never leaks it in an error', async () => {
    const calls: { url: string; body: string }[] = [];
    const fake = async (url: string, init: { body: string }) => { calls.push({ url, body: init.body }); return { ok: true, status: 200, text: async () => JSON.stringify({ exception: 'x', errorcode: 'invalidtoken', message: 'bad token abc123TOKENabc123TOKEN' }) }; };
    const ws = moodleWs('https://moodle.example', 'abc123TOKENabc123TOKEN', fake as never);
    await expect(ws.call('core_user_get_users' as never, {})).rejects.toThrow('function_not_allowed');
    const err = await ws.call('mod_forum_get_forums_by_courses', { courseids: [5] }).catch((e) => e);
    expect(err.code).toBe('invalidtoken');
    expect(String(err.message)).not.toContain('abc123TOKENabc123TOKEN');
    expect(calls[0].url).toBe('https://moodle.example/webservice/rest/server.php');
    expect(calls[0].body).toContain('courseids%5B0%5D=5');
  });
});

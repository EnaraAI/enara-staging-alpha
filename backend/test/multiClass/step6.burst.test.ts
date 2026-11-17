import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { badBatches, opCounts, runBurst, startBurstFixture, stopBurstFixture } from './burst.helpers';
import { ALL7 } from './step6.helpers';

// S3 (owner decision 2026-11-17): the lms-test burst with multi-class in
// effect (dual write, all seven step 5 reads, ENROLLMENT_MULTI_CLASS) and both
// archive switches, run locally (burst.helpers.ts). The multi-class kinds
// (add_extra_group, add_extra_class, remove_extra) run; the dry run reports
// their rows as valid extraMemberships, not conflicts, so every batch stays in
// sync. An invalid extra stops the burst.

let M: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let app: any; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(async () => {
  ({ M, app } = await startBurstFixture({
    ENROLLMENT_DUAL_WRITE: 'true', ENROLLMENT_SHADOW: 'true', ENROLLMENT_READ_FROM: ALL7, ENROLLMENT_MULTI_CLASS: 'true',
    ENROLLMENT_GROUP_ARCHIVE: 'true', ENROLLMENT_STUDENT_ARCHIVE: 'true',
  }));
}, 120_000);

afterAll(stopBurstFixture);

describe('lms-test burst with multi-class (local)', () => {
  it('runs the multi-class kinds with every check clean; extras are valid, not conflicts', async () => {
    const log = await runBurst(['--batches', '4', '--ops', '16', '--with-multi-class', '--with-archive', '--seed', '11']);
    expect({ stoppedAt: log.stoppedAt, bad: badBatches(log) }).toEqual({ stoppedAt: null, bad: [] });
    expect(log.multiClass).toBe(true);
    const counts = opCounts(log);
    console.log(`[burst multi-class] ops by kind: ${JSON.stringify(counts)}`);
    for (const k of ['add_extra_group', 'add_extra_class', 'remove_extra']) expect(Object.keys(counts)).toContain(k);
    const extras = log.batches.map((b: { consistency: { conflicts: number; extraMemberships: { valid: number; invalid: number } } }) => b.consistency);
    expect(extras.every((c: { conflicts: number; extraMemberships: { invalid: number } }) => c.conflicts === 0 && c.extraMemberships.invalid === 0)).toBe(true);
    expect(Math.max(...extras.map((c: { extraMemberships: { valid: number } }) => c.extraMemberships.valid))).toBeGreaterThan(0);
    // Every extra row the burst made carries the marker.
    expect(await M.ClassEnrollment.countDocuments({ extraVia: 'multi_class' })).toBeGreaterThan(0);
  }, 300_000);

  it('STOPS on an invalid extra (here: an extra group that was deleted)', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin.a@lms-test.example', password: 'Passw0rd!x' });
    const auth = `Bearer ${login.body.token}`;
    const g = await request(app).post('/api/batches').set('Authorization', auth).send({ name: 'Doomed group', academicYear: '2026' });
    const student = (await M.Student.findOne({ id: 'LT-S-A02' }).lean());
    expect(student.batchId).toBeTruthy();
    const add = await request(app).post('/api/multi-class/students/LT-S-A02/enrollments').set('Authorization', auth).send({ scope: 'group', targetId: g.body.id });
    expect(add.status).toBe(201);
    await M.Batch.deleteOne({ id: g.body.id }); // drift: the group disappears under the extra
    const log = await runBurst(['--batches', '2', '--ops', '1', '--skip', 'add,add_nogroup,move,leave_group,enroll,unenroll,temp_group,delete_student,restore_group,archive_student,restore_student,delete_permanent,add_extra_group,add_extra_class,remove_extra', '--seed', '3']);
    expect(log.stoppedAt).toBe(1);
    const c = log.batches[0].consistency;
    expect(c.inSync).toBe(false);
    expect(c.extraMemberships).toMatchObject({ invalid: 1, byReason: { targetMissing: 1 } });
    expect(log.batches[0].checks.join(' ')).toContain('invalid extra memberships: 1');
  }, 300_000);
});

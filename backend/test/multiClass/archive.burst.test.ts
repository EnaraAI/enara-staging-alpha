import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { badBatches, opCounts, runBurst, startBurstFixture, stopBurstFixture } from './burst.helpers';

// The lms-test churn burst (src/scripts/lmsTestBurst.ts) run end to end
// against a LOCAL app and an in-memory database (burst.helpers.ts). Shadow,
// dual write and both archive switches on, as they would be on lms-test for
// this check.

beforeAll(async () => {
  await startBurstFixture({ ENROLLMENT_DUAL_WRITE: 'true', ENROLLMENT_SHADOW: 'true', ENROLLMENT_GROUP_ARCHIVE: 'true', ENROLLMENT_STUDENT_ARCHIVE: 'true' });
}, 120_000);

afterAll(stopBurstFixture);

describe('lms-test burst with archiving (local)', () => {
  it('runs every kind, including the archive kinds, with every check clean', async () => {
    const log = await runBurst(['--batches', '4', '--ops', '14', '--with-archive', '--seed', '7']);
    expect({ stoppedAt: log.stoppedAt, bad: badBatches(log) }).toEqual({ stoppedAt: null, bad: [] });
    expect(log.archive).toEqual({ group: true, student: true });
    expect(log.multiClass).toBe(false); // multi-class off: no multi-class kinds
    const counts = opCounts(log);
    console.log(`[burst local] ops by kind: ${JSON.stringify(counts)}`);
    for (const k of ['temp_group', 'restore_group', 'archive_student', 'restore_student', 'delete_permanent']) expect(Object.keys(counts)).toContain(k);
    for (const f of Object.values(log.shadowAtEnd) as { mismatches: number; errors: number }[]) expect([f.mismatches, f.errors]).toEqual([0, 0]);
    // Seeded students are never archived or deleted.
    const { Student } = await import('../../src/models/Student');
    expect(await Student.countDocuments({ id: /^LT-S-A/, archivedAt: null })).toBe(12);
  }, 300_000);
});

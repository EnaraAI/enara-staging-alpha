import { describe, expect, it } from 'vitest';
import { RETENTION_DEFAULT_DAYS, retentionDays } from '../../src/schoolApp/retention';

// Parents school app: one retention setting per data type.
describe('retention settings', () => {
  it('defaults when nothing is set', () => {
    expect(retentionDays({})).toEqual(RETENTION_DEFAULT_DAYS);
    expect(retentionDays({}).chat).toBe(90);
  });
  it('the JSON setting changes only the types it names; a per-type variable wins', () => {
    const d = retentionDays({ SCHOOL_APP_RETENTION_DAYS: '{"chat":30,"attendance":400}', SCHOOL_APP_RETENTION_ATTENDANCE_DAYS: '500' });
    expect(d.chat).toBe(30);
    expect(d.attendance).toBe(500);
    expect(d.fees).toBe(RETENTION_DEFAULT_DAYS.fees);
  });
  it('bad values fall back to the default', () => {
    const d = retentionDays({ SCHOOL_APP_RETENTION_DAYS: 'not json', SCHOOL_APP_RETENTION_CHAT_DAYS: '-5', SCHOOL_APP_RETENTION_FEES_DAYS: 'abc' });
    expect(d.chat).toBe(90);
    expect(d.fees).toBe(RETENTION_DEFAULT_DAYS.fees);
  });
});

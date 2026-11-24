import { describe, expect, it } from 'vitest';
import { headline } from '../../src/schoolApp/emails';

// Parents school app (a4): the email headline per kind and language (announcement titles are the school's own text, as written).
describe('school notice email headline', () => {
  it('absence and lateness in English and Arabic, with the Cairo day', () => {
    expect(headline('absence', 'en', 'Omar', '2026-11-24', 'x')).toMatch(/^Omar was absent on Tuesday,? 24 Nov$/);
    expect(headline('late', 'en', 'Omar', '2026-11-24', 'x')).toMatch(/^Omar was late on Tuesday/);
    expect(headline('absence', 'ar', 'عمر', '2026-11-24', 'x')).toMatch(/^تغيّب عمر يوم الثلاثاء/);
    expect(headline('late', 'ar', 'عمر', '2026-11-24', 'x')).toMatch(/^تأخّر عمر يوم/);
  });
  it('announcements use the school title, capped at 200 characters', () => {
    expect(headline('announcement', 'ar', 'عمر', undefined, 'Open day')).toBe('Open day');
    expect(headline('announcement', 'en', 'Omar', undefined, 'x'.repeat(300))).toHaveLength(200);
  });
});

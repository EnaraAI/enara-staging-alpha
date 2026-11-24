import { describe, expect, it } from 'vitest';
import { checkRow, parseDirection, parsePhone, SECTION_OF } from '../../src/schoolApp/importSpec';
import { rowsFromCsv } from '../../src/schoolApp/importer';
import { headline } from '../../src/schoolApp/emails';

// Parents school app, step (c): the two bus sheets and the notice headline.
describe('bus sheets', () => {
  it('both bus sheets feed the buses section', () => {
    expect(SECTION_OF.bus_routes).toBe('buses');
    expect(SECTION_OF.bus_assignments).toBe('buses');
  });
  it('routes sheet with Arabic headers: times, phone with Arabic digits, map link must be https', () => {
    const { rows, missing } = rowsFromCsv('bus_routes', 'خط السير,رقم الحافلة,المشرف,هاتف المشرف,المحطة,موعد الصباح,موعد العودة,رابط الخريطة\nالخط 1,12,منى,٠١٠٠٠٠٠٠٠٠١,ميدان الحجاز,6:45 ص,2:30 م,https://maps.example/x\nالخط 1,12,,,شارع النزهة,7:00,,http://x');
    expect(missing).toEqual([]);
    expect(checkRow('bus_routes', rows[0]).row).toMatchObject({ route: 'الخط 1', supervisor_phone: '01000000001', morning: '06:45', afternoon: '14:30' });
    expect(checkRow('bus_routes', rows[1]).problems).toContain('map link must start with https://');
  });
  it('a stop needs a time; phones and directions are checked', () => {
    expect(checkRow('bus_routes', { route: 'R1', stop: 'A' }).problems).toContain('a stop needs a morning or an afternoon time');
    expect(parsePhone('+20 100 000 0001')).toBe('+201000000001');
    expect(parsePhone('call me')).toBeNull();
    expect(parseDirection('')).toBe('both');
    expect(parseDirection('ذهاب')).toBe('morning');
    expect(parseDirection('العودة')).toBe('afternoon');
    expect(parseDirection('sometimes')).toBeNull();
    expect(checkRow('bus_assignments', { student: 'S1', route: 'R1', stop: 'A', valid_from: '2026-12-01', valid_to: '2026-11-01' }).problems).toContain('valid to is before valid from');
  });
  it('notice headline in English and Arabic', () => {
    expect(headline('bus_notice', 'en', 'Omar', '2026-11-24', 'x', undefined, { busKind: 'delay', direction: 'morning', minutes: 20, routeName: 'Route 1' })).toBe('Bus Route 1: the morning trip is about 20 minutes late');
    expect(headline('bus_notice', 'ar', 'عمر', '2026-11-24', 'x', undefined, { busKind: 'cancel', direction: 'afternoon', routeName: 'الخط 1' })).toBe('الحافلة الخط 1: أُلغيت رحلة العودة اليوم');
  });
});

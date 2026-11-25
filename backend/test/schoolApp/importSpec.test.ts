import { describe, expect, it } from 'vitest';
import { checkRow, mapHeaders, parseDate, parseDay, parseStatus, parseTime } from '../../src/schoolApp/importSpec';
import { rowsFromCsv } from '../../src/schoolApp/importer';
import { announcementIsFor } from '../../src/schoolApp/audience';

// Parents school app (a): import checks that need no database, and who an announcement is for.
describe('headers: English or Arabic, any case and spacing', () => {
  it('maps the timetable template in both languages', () => {
    expect(mapHeaders('timetable', ['Class', 'Day', 'Period', 'Start', 'End', 'Subject', 'Teacher', 'Room'])).toEqual({ map: ['class', 'day', 'period', 'start', 'end', 'subject', 'teacher', 'room'], missing: [] });
    expect(mapHeaders('timetable', ['الفصل', 'اليوم', 'الحصة', 'من', 'إلى', 'المادة']).missing).toEqual([]);
  });
  it('names the missing required columns; unknown columns are ignored', () => {
    const r = mapHeaders('attendance', ['Date', 'Status', 'Colour']);
    expect(r.missing).toEqual(['student']);
    expect(r.map).toEqual(['date', 'status', null]);
  });
  it('a saved mapping (the school\'s own column names) wins; "" ignores a column', () => {
    const saved = { 'tarikh el youm': 'date', 'code': 'student', 'colour': '' };
    const r = mapHeaders('attendance', ['Tarikh el youm', 'Code', 'Status', 'Colour'], saved);
    expect(r).toEqual({ map: ['date', 'student', 'status', null], missing: [] });
    expect(mapHeaders('attendance', ['Date', 'X'], { x: 'not_a_column' }).map).toEqual(['date', null]);
    const { rows, missing } = rowsFromCsv('attendance', 'Tarikh el youm,Code,Status\n24/11/2026,S1,absent\n', saved);
    expect(missing).toEqual([]);
    expect(rows[0]).toMatchObject({ date: '24/11/2026', student: 'S1', status: 'absent' });
  });
});

describe('values', () => {
  it('days in English, Arabic or 0-6 (Sunday = 0)', () => {
    expect([parseDay('Sunday'), parseDay('thu'), parseDay('الخميس'), parseDay('الاثنين'), parseDay('٣'), parseDay('Funday')]).toEqual([0, 4, 4, 1, 3, null]);
  });
  it('times: 24 h, am/pm, Arabic ص/م and digits', () => {
    expect([parseTime('8:00'), parseTime('1:15 pm'), parseTime('١٢:٠٠ م'), parseTime('12:30 am'), parseTime('25:00'), parseTime('8')]).toEqual(['08:00', '13:15', '12:00', '00:30', null, null]);
  });
  it('dates: ISO or day first (Egypt); impossible dates rejected', () => {
    expect([parseDate('2026-11-24'), parseDate('24/11/2026'), parseDate('٢٤-١١-٢٠٢٦'), parseDate('31/02/2026'), parseDate('11/24/2026')]).toEqual(['2026-11-24', '2026-11-24', '2026-11-24', null, null]);
  });
  it('attendance status in English or Arabic', () => {
    expect([parseStatus('Absent'), parseStatus('غائب'), parseStatus('L'), parseStatus('بعذر'), parseStatus('sick')]).toEqual(['absent', 'absent', 'late', 'excused', null]);
  });
});

describe('row checks', () => {
  it('a good timetable row is normalised', () => {
    expect(checkRow('timetable', { class: '7B', day: 'Monday', period: '2', start: '8:45', end: '9:30', subject: 'Maths' }).row).toMatchObject({ day: '1', period: '2', start: '08:45', end: '09:30' });
  });
  it('end before start, bad period and empty required fields are reported together', () => {
    const r = checkRow('timetable', { class: '7B', day: 'Monday', period: '0', start: '10:00', end: '9:00', subject: 'Maths' });
    expect(r.row).toBeUndefined();
    expect(r.problems.join(' | ')).toMatch(/period "0".*end must be after start/);
    expect(checkRow('attendance', { date: '', student: 'S1', status: 'absent' }).problems).toEqual(['date is empty']);
  });
  it('an announcement for a grade, class or student needs a value; school does not', () => {
    expect(checkRow('announcements', { audience: 'grade', title: 'Trip', body: 'Friday' }).problems[0]).toMatch(/needs a value/);
    expect(checkRow('announcements', { audience: 'المدرسة', title: 'Holiday', body: 'Closed Thursday', publish: '01/12/2026' }).row).toMatchObject({ audience: 'school', publish: '2026-12-01' });
  });
});

describe('CSV', () => {
  it('Excel "CSV UTF-8" with a BOM, quoted commas and Arabic headers', () => {
    const { rows, missing } = rowsFromCsv('attendance', '﻿التاريخ,رقم الطالب,الحالة,ملاحظة\n24/11/2026,LT-S-A11,غائب,"fever, called home"\n');
    expect(missing).toEqual([]);
    expect(rows).toEqual([{ date: '24/11/2026', student: 'LT-S-A11', status: 'غائب', note: 'fever, called home' }]);
  });
});

describe('who an announcement is for', () => {
  const kid = { id: 'S1', grade: 'Grade 7', groupKey: '7b' };
  it('school: everyone; grade and class: only that one; student: only that child', () => {
    expect(announcementIsFor({ audience: 'school' }, kid)).toBe(true);
    expect(announcementIsFor({ audience: 'grade', audienceKey: 'grade 7' }, kid)).toBe(true);
    expect(announcementIsFor({ audience: 'grade', audienceKey: 'grade 8' }, kid)).toBe(false);
    expect(announcementIsFor({ audience: 'group', audienceKey: '7b' }, kid)).toBe(true);
    expect(announcementIsFor({ audience: 'group', audienceKey: '7a' }, kid)).toBe(false);
    expect(announcementIsFor({ audience: 'student', audienceValue: 'S2' }, kid)).toBe(false);
    expect(announcementIsFor({ audience: 'student', audienceValue: 'S1' }, kid)).toBe(true);
  });
});

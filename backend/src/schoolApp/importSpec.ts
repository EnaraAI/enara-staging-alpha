// Parents school app: what each section's import file (CSV, first row = headers) must contain. Pure: no database. Headers are matched
// in English or Arabic, case- and space-insensitive, so a school's own export can be used after a light rename (plan: templates per
// section; saved column mappings per school come later). A connector produces the same row objects and goes through the same checks.
import { SCHOOL_ATTENDANCE_STATUSES } from './models';

export type ImportSection = 'timetable' | 'attendance' | 'announcements';
export interface Column { key: string; required: boolean; aliases: string[] }

export const COLUMNS: Record<ImportSection, Column[]> = {
  timetable: [
    { key: 'class', required: true, aliases: ['class', 'group', 'section', 'الفصل', 'الصف والفصل', 'المجموعة'] },
    { key: 'day', required: true, aliases: ['day', 'اليوم'] },
    { key: 'period', required: true, aliases: ['period', 'lesson', 'الحصة'] },
    { key: 'start', required: true, aliases: ['start', 'from', 'start time', 'من', 'البداية'] },
    { key: 'end', required: true, aliases: ['end', 'to', 'end time', 'إلى', 'الى', 'النهاية'] },
    { key: 'subject', required: true, aliases: ['subject', 'المادة'] },
    { key: 'teacher', required: false, aliases: ['teacher', 'المعلم', 'المدرس'] },
    { key: 'room', required: false, aliases: ['room', 'القاعة', 'الفصل الدراسي', 'الغرفة'] },
  ],
  attendance: [
    { key: 'date', required: true, aliases: ['date', 'التاريخ'] },
    { key: 'student', required: true, aliases: ['student id', 'student', 'student email', 'id', 'رقم الطالب', 'الطالب', 'كود الطالب'] },
    { key: 'status', required: true, aliases: ['status', 'الحالة'] },
    { key: 'period', required: false, aliases: ['period', 'الحصة'] },
    { key: 'note', required: false, aliases: ['note', 'notes', 'ملاحظة', 'ملاحظات'] },
  ],
  announcements: [
    { key: 'audience', required: true, aliases: ['audience', 'to', 'الجمهور', 'إلى'] },
    { key: 'audience_value', required: false, aliases: ['audience value', 'grade', 'class', 'student', 'القيمة', 'الصف', 'الفصل'] },
    { key: 'title', required: true, aliases: ['title', 'subject', 'العنوان'] },
    { key: 'body', required: true, aliases: ['body', 'text', 'message', 'النص', 'الرسالة'] },
    { key: 'publish', required: false, aliases: ['publish', 'publish date', 'date', 'تاريخ النشر', 'النشر'] },
    { key: 'expires', required: false, aliases: ['expires', 'expiry', 'until', 'ينتهي', 'تاريخ الانتهاء'] },
  ],
};

export const MAX_ROWS = 5000;
export const norm = (s: unknown) => String(s ?? '').normalize('NFKC').replace(/[ً-ٟـ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
// Arabic-Indic and Persian digits to ASCII
export const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** Header row -> column key per index (null = ignored), or the missing required columns. */
export function mapHeaders(section: ImportSection, headers: string[]): { map: (string | null)[]; missing: string[] } {
  const cols = COLUMNS[section];
  const map = headers.map((h) => cols.find((c) => c.aliases.some((a) => norm(a) === norm(h)))?.key ?? null);
  const missing = cols.filter((c) => c.required && !map.includes(c.key)).map((c) => c.key);
  return { map, missing };
}

const DAYS: Record<string, number> = {
  sunday: 0, sun: 0, 'الأحد': 0, 'الاحد': 0, monday: 1, mon: 1, 'الإثنين': 1, 'الاثنين': 1, tuesday: 2, tue: 2, 'الثلاثاء': 2,
  wednesday: 3, wed: 3, 'الأربعاء': 3, 'الاربعاء': 3, thursday: 4, thu: 4, 'الخميس': 4, friday: 5, fri: 5, 'الجمعة': 5, saturday: 6, sat: 6, 'السبت': 6,
};
export function parseDay(v: string): number | null {
  const s = norm(v); if (s in DAYS) return DAYS[s];
  const n = Number(digits(s)); return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}
export function parseTime(v: string): string | null {
  const m = digits(norm(v)).match(/^(\d{1,2})[:.](\d{2})\s*(am|pm|ص|م)?$/); if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2]);
  if (m[3] === 'pm' || m[3] === 'م') { if (h < 12) h += 12; } else if ((m[3] === 'am' || m[3] === 'ص') && h === 12) h = 0;
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : null;
}
/** YYYY-MM-DD, DD/MM/YYYY or D-M-YYYY (Egyptian order: day first) -> YYYY-MM-DD */
export function parseDate(v: string): string | null {
  const s = digits(norm(v));
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; } else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) { d = +r[1]; m = +r[2]; y = +r[3]; } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}
const STATUS: Record<string, string> = { present: 'present', p: 'present', 'حاضر': 'present', absent: 'absent', a: 'absent', 'غائب': 'absent', 'غياب': 'absent',
  late: 'late', l: 'late', 'متأخر': 'late', 'تأخير': 'late', excused: 'excused', e: 'excused', 'بعذر': 'excused', 'غياب بعذر': 'excused', 'معذور': 'excused' };
export function parseStatus(v: string): string | null { const s = STATUS[norm(v)]; return s && (SCHOOL_ATTENDANCE_STATUSES as readonly string[]).includes(s) ? s : null; }
const AUD: Record<string, string> = { school: 'school', all: 'school', 'المدرسة': 'school', 'الكل': 'school', grade: 'grade', 'الصف': 'grade', 'المرحلة': 'grade',
  class: 'group', group: 'group', 'الفصل': 'group', student: 'student', 'طالب': 'student', 'الطالب': 'student' };
export const parseAudience = (v: string) => AUD[norm(v)] ?? null;

/** Field checks that need no database. Returns the cleaned row, or problems. */
export function checkRow(section: ImportSection, raw: Record<string, string>): { row?: Record<string, string>; problems: string[] } {
  const p: string[] = []; const out: Record<string, string> = {};
  for (const c of COLUMNS[section]) {
    const v = (raw[c.key] ?? '').trim();
    if (c.required && !v) p.push(`${c.key} is empty`);
    out[c.key] = v;
  }
  if (p.length) return { problems: p };
  if (section === 'timetable') {
    const day = parseDay(out.day); if (day === null) p.push(`day "${out.day}" not understood`); else out.day = String(day);
    const per = Number(digits(out.period)); if (!Number.isInteger(per) || per < 1 || per > 20) p.push(`period "${out.period}" must be 1-20`); else out.period = String(per);
    const s = parseTime(out.start), e = parseTime(out.end);
    if (!s) p.push(`start "${out.start}" is not a time`); if (!e) p.push(`end "${out.end}" is not a time`);
    if (s && e && s >= e) p.push('end must be after start');
    if (s) out.start = s; if (e) out.end = e;
  } else if (section === 'attendance') {
    const d = parseDate(out.date); if (!d) p.push(`date "${out.date}" not understood (use YYYY-MM-DD or DD/MM/YYYY)`); else out.date = d;
    const st = parseStatus(out.status); if (!st) p.push(`status "${out.status}" must be present, absent, late or excused`); else out.status = st;
    if (out.period) { const per = Number(digits(out.period)); if (!Number.isInteger(per) || per < 1 || per > 20) p.push(`period "${out.period}" must be 1-20`); else out.period = String(per); }
    if (out.note.length > 300) p.push('note longer than 300 characters');
  } else if (section === 'announcements') {
    const a = parseAudience(out.audience); if (!a) p.push(`audience "${out.audience}" must be school, grade, class or student`); else out.audience = a;
    if (a && a !== 'school' && !out.audience_value) p.push(`audience ${a} needs a value (which ${a})`);
    if (out.title.length > 160) p.push('title longer than 160 characters');
    if (out.body.length > 4000) p.push('text longer than 4,000 characters');
    if (out.publish) { const d = parseDate(out.publish); if (!d) p.push(`publish date "${out.publish}" not understood`); else out.publish = d; }
    if (out.expires) { const d = parseDate(out.expires); if (!d) p.push(`expiry date "${out.expires}" not understood`); else out.expires = d; }
  }
  return p.length ? { problems: p } : { row: out, problems: [] };
}

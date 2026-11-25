// Parents school app: what each section's import file (CSV, first row = headers) must contain. Pure: no database. Headers are matched
// in English or Arabic, case- and space-insensitive, so a school's own export can be used after a light rename (plan: templates per
// section; saved column mappings per school come later). A connector produces the same row objects and goes through the same checks.
import { SCHOOL_ATTENDANCE_STATUSES } from './models';

export type ImportSection = 'timetable' | 'attendance' | 'announcements' | 'fees' | 'bus_routes' | 'bus_assignments';
/** The parent-app section an import feeds (both bus sheets feed 'buses'). */
export const SECTION_OF: Record<ImportSection, 'timetable' | 'attendance' | 'announcements' | 'fees' | 'buses'> = { timetable: 'timetable', attendance: 'attendance', announcements: 'announcements', fees: 'fees', bus_routes: 'buses', bus_assignments: 'buses' };
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
    { key: 'external_id', required: false, aliases: ['external id'] }, // set by connectors only
  ],
  // Step (b): one row per instalment. The plan is named per student (for example "Tuition 2026-2027"); its total is the sum of its rows.
  fees: [
    { key: 'student', required: true, aliases: ['student id', 'student', 'student email', 'id', 'رقم الطالب', 'الطالب', 'كود الطالب'] },
    { key: 'student_name', required: false, aliases: ['student name', 'name', 'اسم الطالب', 'الاسم'] },
    { key: 'plan', required: true, aliases: ['plan', 'fee plan', 'fees', 'الخطة', 'البند', 'نوع الرسوم'] },
    { key: 'academic_year', required: false, aliases: ['academic year', 'year', 'العام الدراسي', 'السنة الدراسية'] },
    { key: 'number', required: true, aliases: ['instalment no.', 'instalment no', 'instalment', 'installment', 'installment no.', 'no.', 'رقم القسط', 'القسط'] },
    { key: 'amount', required: true, aliases: ['amount', 'amount (egp)', 'value', 'المبلغ', 'القيمة'] },
    { key: 'due_date', required: true, aliases: ['due date', 'due', 'تاريخ الاستحقاق', 'الاستحقاق'] },
    { key: 'status', required: false, aliases: ['status', 'الحالة'] },
    { key: 'paid_date', required: false, aliases: ['paid date', 'payment date', 'تاريخ الدفع', 'تاريخ السداد'] },
    { key: 'receipt_ref', required: false, aliases: ['receipt ref', 'receipt', 'receipt no.', 'reference', 'رقم الإيصال', 'الإيصال'] },
    { key: 'note', required: false, aliases: ['note', 'notes', 'ملاحظة', 'ملاحظات'] },
  ],
  // Step (c), sheet 1: one row per stop of a route (the route's details repeat on each row; the first filled value wins).
  bus_routes: [
    { key: 'route', required: true, aliases: ['route', 'route name', 'line', 'خط السير', 'الخط', 'المسار'] },
    { key: 'bus_number', required: false, aliases: ['bus number', 'bus no.', 'bus', 'رقم الحافلة', 'رقم الباص', 'الحافلة'] },
    { key: 'supervisor', required: false, aliases: ['supervisor', 'supervisor name', 'المشرف', 'اسم المشرف', 'المشرفة'] },
    { key: 'supervisor_phone', required: false, aliases: ['supervisor phone', 'phone', 'هاتف المشرف', 'رقم المشرف', 'الهاتف'] },
    { key: 'driver', required: false, aliases: ['driver', 'driver name', 'السائق', 'اسم السائق'] },
    { key: 'stop', required: true, aliases: ['stop', 'stop name', 'المحطة', 'نقطة التوقف'] },
    { key: 'stop_order', required: false, aliases: ['stop no.', 'stop order', 'order', 'الترتيب', 'رقم المحطة'] },
    { key: 'morning', required: false, aliases: ['morning', 'morning time', 'pick-up', 'pickup', 'الصباح', 'موعد الصباح', 'وقت الذهاب'] },
    { key: 'afternoon', required: false, aliases: ['afternoon', 'afternoon time', 'drop-off', 'dropoff', 'العودة', 'موعد العودة', 'وقت العودة'] },
    { key: 'map_link', required: false, aliases: ['map link', 'map', 'location', 'رابط الخريطة', 'الموقع'] },
  ],
  // Step (c), sheet 2: each child's route and stop.
  bus_assignments: [
    { key: 'student', required: true, aliases: ['student id', 'student', 'student email', 'id', 'رقم الطالب', 'الطالب', 'كود الطالب'] },
    { key: 'student_name', required: false, aliases: ['student name', 'name', 'اسم الطالب', 'الاسم'] },
    { key: 'route', required: true, aliases: ['route', 'route name', 'line', 'خط السير', 'الخط', 'المسار'] },
    { key: 'stop', required: true, aliases: ['stop', 'stop name', 'المحطة', 'نقطة التوقف'] },
    { key: 'direction', required: false, aliases: ['direction', 'trip', 'الاتجاه', 'الرحلة'] },
    { key: 'valid_from', required: false, aliases: ['valid from', 'from', 'start date', 'من تاريخ', 'بداية'] },
    { key: 'valid_to', required: false, aliases: ['valid to', 'to', 'end date', 'حتى تاريخ', 'نهاية'] },
  ],
};

export const MAX_ROWS = 5000;
export const norm = (s: unknown) => String(s ?? '').normalize('NFKC').replace(/[ً-ٟـ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
// Arabic-Indic and Persian digits to ASCII
export const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** Header row -> column key per index (null = ignored), or the missing required columns. */
/** `saved`: the school's own header names (normalised) -> column key, '' = ignore; it wins over the built-in names. */
export function mapHeaders(section: ImportSection, headers: string[], saved: Record<string, string> = {}): { map: (string | null)[]; missing: string[] } {
  const cols = COLUMNS[section];
  const keys = new Set(cols.map((c) => c.key));
  const map = headers.map((h) => {
    const s = saved[norm(h)];
    if (s === '') return null;
    if (s && keys.has(s)) return s;
    return cols.find((c) => c.aliases.some((a) => norm(a) === norm(h)))?.key ?? null;
  });
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
const FEE: Record<string, string> = { due: 'due', unpaid: 'due', pending: 'due', open: 'due', overdue: 'due', 'مستحق': 'due', 'غير مدفوع': 'due', 'متأخر': 'due', 'لم يدفع': 'due',
  paid: 'paid', 'مدفوع': 'paid', 'تم الدفع': 'paid', 'مسدد': 'paid', 'تم السداد': 'paid', waived: 'waived', exempt: 'waived', 'معفى': 'waived', 'إعفاء': 'waived', 'اعفاء': 'waived' };
/** Instalment status from a sheet; "overdue" in a sheet means due (ENARA works overdue out from the date). Empty = due. */
const DIR: Record<string, string> = { both: 'both', 'both ways': 'both', 'ذهاب وعودة': 'both', 'الاثنين': 'both', morning: 'morning', am: 'morning', 'ذهاب': 'morning', 'الصباح': 'morning',
  afternoon: 'afternoon', pm: 'afternoon', 'عودة': 'afternoon', 'العودة': 'afternoon' };
/** Trip direction; empty = both. */
export const parseDirection = (v: string) => (norm(v) ? DIR[norm(v)] ?? null : 'both');
/** An Egyptian or international phone number, kept as digits with an optional leading +; null when not a phone number. */
export function parsePhone(v: string): string | null { const s = digits(v).replace(/[\s\-().]/g, ''); return /^\+?\d{8,15}$/.test(s) ? s : null; }
export const parseFeeStatus = (v: string) => (norm(v) ? FEE[norm(v)] ?? null : 'due');
/** "1,250.50", "1250", "١٢٥٠ ج.م", "EGP 1,250" -> "1250.5"; null when not a non-negative amount. */
export function parseAmount(v: string): string | null {
  const s = digits(norm(v)).replace(/[٬,\s]/g, '').replace(/٫/g, '.').replace(/^(egp|le|ج\.?م\.?|جنيه)|(egp|le|ج\.?م\.?|جنيه)$/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s); return Number.isFinite(n) && n <= 10_000_000 ? String(n) : null;
}

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
  } else if (section === 'fees') {
    const n = Number(digits(out.number)); if (!Number.isInteger(n) || n < 1 || n > 60) p.push(`instalment number "${out.number}" must be 1-60`); else out.number = String(n);
    const a = parseAmount(out.amount); if (a === null) p.push(`amount "${out.amount}" is not an amount`); else out.amount = a;
    const d = parseDate(out.due_date); if (!d) p.push(`due date "${out.due_date}" not understood (use YYYY-MM-DD or DD/MM/YYYY)`); else out.due_date = d;
    const st = parseFeeStatus(out.status); if (!st) p.push(`status "${out.status}" must be due, paid or waived`); else out.status = st;
    if (out.paid_date) { const pd = parseDate(out.paid_date); if (!pd) p.push(`paid date "${out.paid_date}" not understood`); else out.paid_date = pd; }
    if (st === 'paid' && !out.paid_date) p.push('a paid instalment needs its paid date');
    if (out.plan.length > 120) p.push('plan name longer than 120 characters');
    if (out.receipt_ref.length > 80) p.push('receipt reference longer than 80 characters');
    if (out.note.length > 300) p.push('note longer than 300 characters');
  } else if (section === 'bus_routes') {
    for (const k of ['morning', 'afternoon'] as const) if (out[k]) { const tm = parseTime(out[k]); if (!tm) p.push(`${k} time "${out[k]}" is not a time`); else out[k] = tm; }
    if (!out.morning && !out.afternoon) p.push('a stop needs a morning or an afternoon time');
    if (out.supervisor_phone) { const ph = parsePhone(out.supervisor_phone); if (!ph) p.push(`phone "${out.supervisor_phone}" is not a phone number`); else out.supervisor_phone = ph; }
    if (out.stop_order) { const o = Number(digits(out.stop_order)); if (!Number.isInteger(o) || o < 1 || o > 100) p.push(`stop order "${out.stop_order}" must be 1-100`); else out.stop_order = String(o); }
    if (out.map_link && !/^https:\/\/[^\s]+$/.test(out.map_link)) p.push('map link must start with https://');
    if (out.route.length > 80 || out.stop.length > 120) p.push('route or stop name too long');
  } else if (section === 'bus_assignments') {
    const d = parseDirection(out.direction); if (!d) p.push(`direction "${out.direction}" must be both, morning or afternoon`); else out.direction = d;
    for (const k of ['valid_from', 'valid_to'] as const) if (out[k]) { const dt = parseDate(out[k]); if (!dt) p.push(`${k.replace('_', ' ')} "${out[k]}" not understood`); else out[k] = dt; }
    if (out.valid_from && out.valid_to && out.valid_from > out.valid_to) p.push('valid to is before valid from');
  }
  return p.length ? { problems: p } : { row: out, problems: [] };
}

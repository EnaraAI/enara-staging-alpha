import { createHash } from 'node:crypto';
import { norm } from '../../schoolApp/importSpec';
import { consentTextHash } from '../../schoolApp/consentHash';
import type { SchoolDef } from './content';

// Parents school app (a5): the school data for the seeded schools (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, section 6). Planned like the
// rest of the full seed: every row goes through seed_registry, so the full-seed remove clears it, and it is only ever written by
// the lms-test maintenance route. A separate random stream (the rest of the plan stays exactly as it was).
//   - Timetables: Sunday to Thursday, 6 periods, for every class of every school with parent access (the English school in English,
//     the Arabic school in Arabic, fusha).
//   - Attendance: 8 weeks of school days for every current student (mostly present; some absent, late, excused, with notes).
//   - Announcements: school-wide, per grade, per class, one for a single student, one expired, one scheduled, one withdrawn.
//   - In-app notifications for the linked parents: recent absences and lateness, and the school-wide announcement (older ones read).
//   - Fees (step b): a tuition plan of 3 instalments per current student (paid, overdue, due soon, waived), some receipts numbered, and a
//     bus fee plan for some; amounts in EGP. Display only: ENARA takes no payments.
//   - The import log (one confirmed import per section) and the school's sections turned on.
export interface SeedStudent { id: string; name: string; first: string; school: SchoolDef; group: string; archived: boolean }
export interface SeedLink { parentUserId: string; studentId: string; institutionId: string }
type Add = (model: 'SchoolTimetableEntry' | 'SchoolDailyAttendance' | 'SchoolAnnouncement' | 'SchoolImport' | 'ParentNotification' | 'SchoolInstalment' | 'SchoolBusRoute' | 'SchoolBusAssignment' | 'SchoolBusNotice' | 'SchoolRequest' | 'SchoolConsentForm' | 'SchoolConsent', key: string, doc: Record<string, unknown>) => void;

export const SCHOOL_APP_SECTIONS_ON = { timetable: true, announcements: true, attendance: true, notifications: true, fees: true, buses: true, requests: true, consents: true, chat: true };
export const schoolAppSeeded = (s: SchoolDef) => s.portal === 'free';

const sid = (p: string, key: string) => `${p}-${createHash('sha1').update(`enara-full-v1:school-app:${key}`).digest('hex').slice(0, 16)}`;
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const cairoDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const cairoWeekday = (d: Date) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' }).format(d));

const PERIODS: [string, string][] = [['08:00', '08:45'], ['08:50', '09:35'], ['09:40', '10:25'], ['10:50', '11:35'], ['11:40', '12:25'], ['12:30', '13:15']];
const SUBJECT_NAMES: Record<'en' | 'ar', Record<string, string>> = {
  en: { ENG: 'English', MATH: 'Mathematics', SCI: 'Science', ARB: 'Arabic', PE: 'Physical Education', ART: 'Art', SOC: 'Social Studies', REL: 'Religious Education', ICT: 'Computing' },
  ar: { ENG: 'اللغة الإنجليزية', MATH: 'الرياضيات', SCI: 'العلوم', ARB: 'اللغة العربية', PE: 'التربية الرياضية', ART: 'التربية الفنية', SOC: 'الدراسات الاجتماعية', REL: 'التربية الدينية', ICT: 'الحاسب الآلي' },
};
const TEACHERS: Record<'en' | 'ar', string[]> = {
  en: ['Ms Salma Fahmy', 'Mr Karim Naguib', 'Ms Dina Ezzat', 'Mr Tarek Mansour', 'Ms Rania Helmy', 'Mr Sherif Lotfy'],
  ar: ['أ. سلمى فهمي', 'أ. كريم نجيب', 'أ. دينا عزت', 'أ. طارق منصور', 'أ. رانيا حلمي', 'أ. شريف لطفي'],
};
const NOTES: Record<'en' | 'ar', { absent: string[]; late: string[]; excused: string[] }> = {
  en: { absent: ['', '', 'No message from home'], late: ['Arrived 08:20', 'Arrived 08:35 (traffic)', ''], excused: ['Medical certificate', 'Family event, approved'] },
  ar: { absent: ['', '', 'لم يصل إشعار من الأسرة'], late: ['وصل 08:20', 'وصل 08:35 (زحام)', ''], excused: ['شهادة طبية', 'ظرف عائلي، بموافقة المدرسة'] },
};

export function addSchoolAppSeed(input: { now: Date; add: Add; schools: SchoolDef[]; students: SeedStudent[]; links: SeedLink[]; groupName: (groupId: string) => string; adminOf: (schoolId: string) => string }) {
  const { now, add, schools, students, links } = input;
  const R = rng(20261202);
  const DAY = 86_400_000;
  const today = cairoDate(now);
  for (const school of schools.filter(schoolAppSeeded)) {
    const lang: 'en' | 'ar' = school.emailLanguage === 'ar' ? 'ar' : 'en';
    const S = school.id.replace('SCH-', '');
    const admin = input.adminOf(school.id);
    const importAt = (days: number) => new Date(now.getTime() - days * DAY - 3 * 3_600_000);
    const imp = (section: string, fileName: string, days: number, rows: number) => {
      const id = sid('simp', `${S}:${section}`);
      add('SchoolImport', `${S}:${section}`, { id, institutionId: school.id, section, fileName, status: 'confirmed', rows: [], counts: { new: rows, changed: 0, unchanged: 0, removed: 0, rejected: 0, total: rows }, problems: [],
        createdBy: admin, confirmedBy: admin, confirmedAt: importAt(days), createdAt: importAt(days), updatedAt: importAt(days) });
      return { kind: 'import', ref: id, at: importAt(days) };
    };

    // ---- timetables
    const groups = [...new Set(students.filter((s) => s.school.id === school.id).map((s) => s.group))];
    let ttRows = 0;
    const ttSource = imp('timetable', lang === 'ar' ? 'الجدول-الفصل-الأول.xlsx' : 'timetable-term-1.xlsx', 40, groups.length * 30);
    for (const g of groups) {
      const def = school.groups.find((x) => `GRP-${S}-${x.key}` === g);
      const subjects = [...(def?.subjects ?? ['ENG']), 'PE', 'ART', lang === 'ar' ? 'REL' : 'SOC', 'ICT'];
      for (let day = 0; day <= 4; day++) for (let p = 1; p <= 6; p++) {
        const subj = subjects[(day * 6 + p + groups.indexOf(g)) % subjects.length];
        const t = TEACHERS[lang][(subjects.indexOf(subj) + groups.indexOf(g)) % TEACHERS[lang].length];
        add('SchoolTimetableEntry', `${g}:${day}:${p}`, { id: sid('stt', `${g}:${day}:${p}`), institutionId: school.id, groupName: input.groupName(g), groupKey: norm(input.groupName(g)), day, period: p,
          start: PERIODS[p - 1][0], end: PERIODS[p - 1][1], subject: SUBJECT_NAMES[lang][subj], teacher: t, room: `${lang === 'ar' ? 'قاعة' : 'Room'} ${100 + groups.indexOf(g) * 10 + (p % 3)}`,
          source: ttSource, createdAt: ttSource.at, updatedAt: ttSource.at });
        ttRows++;
      }
    }
    void ttRows;

    // ---- attendance: 8 weeks of school days (Sunday–Thursday), up to today
    const attSource = imp('attendance', lang === 'ar' ? 'الحضور.xlsx' : 'attendance.xlsx', 1, 0);
    const recent: { studentId: string; date: string; status: 'absent' | 'late'; id: string }[] = [];
    for (let d = 56; d >= 0; d--) {
      const at = new Date(now.getTime() - d * DAY);
      if (cairoWeekday(at) > 4) continue;
      const date = cairoDate(at);
      for (const s of students.filter((x) => x.school.id === school.id && !x.archived)) {
        const r = R();
        const status = r < 0.04 ? 'absent' : r < 0.07 ? 'late' : r < 0.08 ? 'excused' : 'present';
        const notes = status === 'present' ? [''] : NOTES[lang][status];
        const note = notes[Math.floor(R() * notes.length)];
        const id = sid('sat', `${s.id}:${date}`);
        add('SchoolDailyAttendance', `${s.id}:${date}`, { id, institutionId: school.id, studentId: s.id, date, status, ...(note ? { note } : {}), source: { ...attSource, at: new Date(Math.min(now.getTime() - 60_000, at.getTime())) },
          createdAt: at, updatedAt: at });
        if ((status === 'absent' || status === 'late') && d <= 14) recent.push({ studentId: s.id, date, status, id });
      }
    }

    // ---- announcements
    const g0 = groups[0] ? input.groupName(groups[0]) : '';
    const g1 = groups[1] ? input.groupName(groups[1]) : g0;
    const one = students.find((s) => s.school.id === school.id && !s.archived);
    const ann = (key: string, a: { audience: string; audienceValue?: string; title: string; body: string; titleAr?: string; bodyAr?: string; publishDays: number; expiresDays?: number; withdrawnDays?: number }) => {
      const publishAt = new Date(now.getTime() - a.publishDays * DAY);
      const written = new Date(Math.min(publishAt.getTime(), now.getTime() - 3_600_000)); // a scheduled one was written before it publishes
      const doc = { id: sid('san', `${S}:${key}`), institutionId: school.id, audience: a.audience, ...(a.audienceValue ? { audienceValue: a.audienceValue, audienceKey: a.audience === 'student' ? undefined : norm(a.audienceValue) } : {}),
        title: a.title, body: a.body, lang: a.titleAr ? 'both' : lang, ...(a.titleAr ? { titleAr: a.titleAr, bodyAr: a.bodyAr } : {}), publishAt,
        ...(a.expiresDays !== undefined ? { expiresAt: new Date(now.getTime() + a.expiresDays * DAY) } : {}), ...(a.withdrawnDays !== undefined ? { withdrawnAt: new Date(now.getTime() - a.withdrawnDays * DAY) } : {}),
        createdBy: admin, source: { kind: 'screen', at: written }, createdAt: written, updatedAt: written };
      add('SchoolAnnouncement', `${S}:${key}`, doc);
      return doc;
    };
    const en = lang === 'en';
    const openDay = ann('open-day', en
      ? { audience: 'school', title: 'Parents’ open day on Thursday', body: 'Teachers will meet parents on Thursday from 10:00 to 13:00 in the main hall. No appointment is needed.', titleAr: 'يوم مفتوح لأولياء الأمور يوم الخميس', bodyAr: 'يلتقي المعلمون أولياء الأمور يوم الخميس من 10:00 إلى 13:00 في القاعة الرئيسية. لا حاجة إلى موعد مسبق.', publishDays: 2, expiresDays: 5 }
      : { audience: 'school', title: 'يوم مفتوح لأولياء الأمور يوم الخميس', body: 'يلتقي المعلمون أولياء الأمور يوم الخميس من الساعة العاشرة حتى الواحدة ظهرًا في القاعة الرئيسية. لا حاجة إلى موعد مسبق.', publishDays: 2, expiresDays: 5 });
    ann('term-exams', en
      ? { audience: 'school', title: 'Mid-term exam timetable', body: 'Mid-term exams start on 7 December. The timetable for each class is on the School tab.', publishDays: 6 }
      : { audience: 'school', title: 'جدول امتحانات منتصف الفصل', body: 'تبدأ امتحانات منتصف الفصل يوم 7 ديسمبر. جدول كل فصل موجود في تبويب المدرسة.', publishDays: 6 });
    if (g0) ann('grade-trip', en
      ? { audience: 'grade', audienceValue: g0, title: `${g0}: museum trip`, body: 'The class visits the Egyptian Museum next Monday. Please send a packed lunch and a water bottle.', publishDays: 3, expiresDays: 7 }
      : { audience: 'grade', audienceValue: g0, title: `${g0}: رحلة إلى المتحف`, body: 'يزور الفصل المتحف المصري يوم الإثنين القادم. يُرجى إرسال وجبة خفيفة وزجاجة ماء.', publishDays: 3, expiresDays: 7 });
    if (g1) ann('class-science', en
      ? { audience: 'group', audienceValue: g1, title: 'Science project due Sunday', body: 'Each student brings a small model of the water cycle. Materials from home are fine.', publishDays: 4, expiresDays: 4 }
      : { audience: 'group', audienceValue: g1, title: 'مشروع العلوم يوم الأحد', body: 'يُحضر كل طالب نموذجًا صغيرًا لدورة الماء. يمكن استخدام أدوات من المنزل.', publishDays: 4, expiresDays: 4 });
    if (one) ann('one-student', en
      ? { audience: 'student', audienceValue: one.id, title: `Reading award for ${one.first}`, body: `${one.first} finished the class reading list this month. Well done!`, publishDays: 1 }
      : { audience: 'student', audienceValue: one.id, title: `شهادة تقدير في القراءة لـ${one.first}`, body: `أنهى ${one.first} قائمة القراءة لهذا الشهر. أحسنت!`, publishDays: 1 });
    ann('expired', en ? { audience: 'school', title: 'Photo day', body: 'School photos were taken on Tuesday.', publishDays: 30, expiresDays: -20 } : { audience: 'school', title: 'يوم التصوير المدرسي', body: 'التُقطت الصور المدرسية يوم الثلاثاء.', publishDays: 30, expiresDays: -20 });
    ann('scheduled', en ? { audience: 'school', title: 'Winter break', body: 'The winter break starts on 24 January.', publishDays: -10 } : { audience: 'school', title: 'إجازة منتصف العام', body: 'تبدأ إجازة منتصف العام يوم 24 يناير.', publishDays: -10 });
    ann('withdrawn', en ? { audience: 'school', title: 'Bus timing change', body: 'Cancelled.', publishDays: 9, withdrawnDays: 8 } : { audience: 'school', title: 'تغيير مواعيد الحافلات', body: 'أُلغي.', publishDays: 9, withdrawnDays: 8 });

    // ---- in-app notifications for linked parents (recent absences and lateness; the open day)
    const schoolLinks = links.filter((l) => l.institutionId === school.id);
    for (const l of schoolLinks) {
      for (const r of recent.filter((x) => x.studentId === l.studentId)) {
        const at = new Date(`${r.date}T07:30:00Z`);
        const s = students.find((x) => x.id === r.studentId)!;
        add('ParentNotification', `${l.parentUserId}:${r.id}`, { id: sid('pn', `${l.parentUserId}:${r.id}`), parentUserId: l.parentUserId, studentId: r.studentId, institutionId: school.id, kind: r.status === 'late' ? 'late' : 'absence',
          refId: `${r.id}:${r.status}`, date: r.date, title: `${s.first} was ${r.status === 'late' ? 'late' : 'absent'} on ${r.date}`, body: 'From the school attendance register.',
          ...(r.date < cairoDate(new Date(now.getTime() - 3 * DAY)) ? { readAt: new Date(at.getTime() + 6 * 3_600_000) } : {}), createdAt: at });
      }
      add('ParentNotification', `${l.parentUserId}:${openDay.id}:${l.studentId}`, { id: sid('pn', `${l.parentUserId}:${openDay.id}:${l.studentId}`), parentUserId: l.parentUserId, studentId: l.studentId, institutionId: school.id, kind: 'announcement',
        refId: `${openDay.id}:${l.studentId}`, title: openDay.title, body: openDay.body.slice(0, 280), createdAt: openDay.publishAt });
    }
    // ---- fees (step b): tuition in 3 instalments; a bus plan for about a third. Relative dates so the states stay meaningful.
    const feeSource = imp('fees', lang === 'ar' ? 'المصروفات-2026-2027.xlsx' : 'fees-2026-2027.xlsx', 2, 0);
    const tuitionName = lang === 'ar' ? 'المصروفات الدراسية 2026-2027' : 'Tuition 2026-2027';
    const busName = lang === 'ar' ? 'اشتراك الحافلة 2026-2027' : 'School bus 2026-2027';
    const dayAt = (n: number) => cairoDate(new Date(now.getTime() + n * DAY));
    const busRiders = new Set<string>(); // a child with a bus fee plan always has a bus route (step c), and only those children
    for (const s of students.filter((x) => x.school.id === school.id && !x.archived)) {
      const base = (en ? 18_000 : 12_000) + Math.floor(R() * 4) * 1_500;
      const r = R();
      // instalment 2: 55 % paid, 30 % overdue, 15 % due in 7 days (a reminder goes out); instalment 3: later, 5 % waived
      const second = r < 0.55 ? 'paid' : r < 0.85 ? 'overdue' : 'soon';
      const rows = [
        { n: 1, due: dayAt(-70), status: 'paid', paid: dayAt(-72 + Math.floor(R() * 4)) },
        { n: 2, due: second === 'soon' ? dayAt(7) : dayAt(-10), status: second === 'paid' ? 'paid' : 'due', paid: second === 'paid' ? dayAt(-12 + Math.floor(R() * 3)) : undefined },
        { n: 3, due: dayAt(80), status: R() < 0.05 ? 'waived' : 'due', paid: undefined as string | undefined },
      ];
      for (const row of rows) {
        const key = `${s.id}:tuition:${row.n}`;
        add('SchoolInstalment', key, { id: sid('sin', key), institutionId: school.id, studentId: s.id, planName: tuitionName, planKey: norm(tuitionName), academicYear: '2026-2027', number: row.n,
          amount: base, currency: 'EGP', dueDate: row.due, status: row.status, ...(row.status === 'paid' ? { paidDate: row.paid, receiptRef: `${S}-R${1000 + Math.floor(R() * 9000)}` } : {}),
          ...(row.status === 'waived' ? { note: lang === 'ar' ? 'إعفاء الأخوة' : 'Sibling discount' } : {}),
          ...(row.n === 2 && second === 'soon' ? {} : row.n === 1 ? { reminders: ['d7', 'd1'] } : {}), source: feeSource, createdAt: feeSource.at, updatedAt: feeSource.at });
      }
      if (R() < 0.33) busRiders.add(s.id);
      if (busRiders.has(s.id)) for (const n of [1, 2]) {
        const key = `${s.id}:bus:${n}`;
        const paid = n === 1;
        add('SchoolInstalment', key, { id: sid('sin', key), institutionId: school.id, studentId: s.id, planName: busName, planKey: norm(busName), academicYear: '2026-2027', number: n,
          amount: 4_500, currency: 'EGP', dueDate: n === 1 ? dayAt(-60) : dayAt(30), status: paid ? 'paid' : 'due', ...(paid ? { paidDate: dayAt(-61), receiptRef: `${S}-B${100 + Math.floor(R() * 900)}` } : {}),
          source: feeSource, createdAt: feeSource.at, updatedAt: feeSource.at });
      }
    }
    // ---- buses (step c): 3 routes with 4-5 stops each; the children with a bus fee plan ride (about a third); one delay notice today.
    const busSource = imp('bus_routes', lang === 'ar' ? 'خطوط-الحافلات.xlsx' : 'bus-routes.xlsx', 20, 0);
    const AREAS = lang === 'ar'
      ? [['ميدان الحجاز', 'شارع النزهة', 'ميدان تريومف', 'شارع الثورة', 'بوابة المدرسة'], ['المعادي الجديدة', 'دجلة', 'كورنيش المعادي', 'شارع 9'], ['التجمع الخامس', 'شارع التسعين', 'الرحاب', 'مدينتي', 'بوابة المدرسة']]
      : [['Hegaz Square', 'Nozha Street', 'Triumph Square', 'Thawra Street', 'School gate'], ['New Maadi', 'Degla', 'Maadi Corniche', 'Street 9'], ['Fifth Settlement', '90th Street', 'Rehab', 'Madinaty', 'School gate']];
    const routeNames = lang === 'ar' ? ['الخط 1: مصر الجديدة', 'الخط 2: المعادي', 'الخط 3: التجمع'] : ['Route 1: Heliopolis', 'Route 2: Maadi', 'Route 3: New Cairo'];
    const sups = lang === 'ar' ? ['أ. منى سامي', 'أ. هالة فريد', 'أ. نهى عادل'] : ['Ms Mona Samy', 'Ms Hala Farid', 'Ms Noha Adel'];
    const routes = routeNames.map((name, ri) => {
      const stops = AREAS[ri].map((st, si) => {
        const m = 6 * 60 + 30 + si * 12, a = 14 * 60 + 15 + (AREAS[ri].length - 1 - si) * 12;
        const hm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
        return { name: st, morning: hm(m), afternoon: hm(a), order: si + 1 };
      });
      const routeKey = norm(name);
      add('SchoolBusRoute', `${S}:route:${ri}`, { id: sid('sbr', `${S}:${ri}`), institutionId: school.id, routeName: name, routeKey, busNumber: String(10 + ri * 7), supervisorName: sups[ri],
        supervisorPhone: `0100000${S.length}${ri}0${ri + 1}`.slice(0, 11), driverName: lang === 'ar' ? 'السائق' : undefined, stops, source: busSource, createdAt: busSource.at, updatedAt: busSource.at });
      return { routeKey, stops };
    });
    const assignSource = imp('bus_assignments', lang === 'ar' ? 'ركاب-الحافلات.xlsx' : 'bus-riders.xlsx', 20, 0);
    for (const s of students.filter((x) => x.school.id === school.id && !x.archived)) {
      if (!busRiders.has(s.id)) continue;
      const ri = Math.floor(R() * routes.length); const r = routes[ri];
      const stop = r.stops[Math.floor(R() * (r.stops.length - 1))];
      const dir = R() < 0.85 ? 'both' : R() < 0.5 ? 'morning' : 'afternoon';
      add('SchoolBusAssignment', `${s.id}:bus`, { id: sid('sba', s.id), institutionId: school.id, studentId: s.id, routeKey: r.routeKey, stopName: stop.name, direction: dir, validFrom: '2026-09-01', validTo: '2027-06-30', source: assignSource, createdAt: assignSource.at, updatedAt: assignSource.at });
    }
    add('SchoolBusNotice', `${S}:notice`, { id: sid('sbn', S), institutionId: school.id, routeKey: routes[1].routeKey, kind: 'delay', direction: 'afternoon', minutes: 15, message: lang === 'ar' ? 'زحام على الكورنيش.' : 'Traffic on the Corniche.', date: today, createdBy: admin, createdAt: new Date(now.getTime() - 30 * 60_000) });
    // ---- requests and consent (step d): requests in every status from linked parents; one school-wide trip form, answered by some.
    const linked = links.filter((l) => l.institutionId === school.id);
    const REQ = en
      ? [['certificate', 'An enrolment certificate in English for the embassy, please.'], ['teacher_meeting', 'Could we meet the class teacher about reading next week?'], ['early_leave', 'My child needs to leave at 12:00 on Thursday for a doctor’s appointment.'], ['other', 'Is there a lost-and-found box? A blue water bottle went missing.']]
      : [['certificate', 'أرجو إصدار شهادة قيد باللغة الإنجليزية لتقديمها إلى السفارة.'], ['teacher_meeting', 'نرجو تحديد موعد مع معلم الفصل لمناقشة مستوى القراءة الأسبوع القادم.'], ['early_leave', 'يحتاج طفلي إلى الانصراف الساعة الثانية عشرة يوم الخميس لموعد طبي.'], ['other', 'هل يوجد مكان للمفقودات؟ فُقدت زجاجة ماء زرقاء.']];
    const REPLY = en ? { in_progress: 'We are preparing it.', done: 'Ready at the office from Sunday.', refused: 'We need a written note signed by the doctor first.' } : { in_progress: 'جارٍ التجهيز.', done: 'جاهزة في الإدارة اعتبارًا من الأحد.', refused: 'نحتاج أولًا إلى خطاب موقّع من الطبيب.' };
    const STATUSES = ['new', 'in_progress', 'done', 'refused', 'done', 'new'] as const;
    linked.slice(0, 12).forEach((l, i) => {
      const [type, details] = REQ[i % REQ.length]; const status = STATUSES[i % STATUSES.length];
      const created = new Date(now.getTime() - (2 + i) * DAY);
      const history: { at: Date; by: string; status: string; note?: string }[] = [{ at: created, by: 'parent', status: 'new' }];
      if (status !== 'new') history.push({ at: new Date(created.getTime() + 20 * 3_600_000), by: 'school', status, note: REPLY[status] });
      add('SchoolRequest', `${S}:req:${i}`, { id: sid('srq', `${S}:${i}`), institutionId: school.id, studentId: l.studentId, parentUserId: l.parentUserId, type, details, status,
        ...(status !== 'new' ? { reply: REPLY[status] } : {}), history, via: 'screen', createdAt: created, updatedAt: history[history.length - 1].at });
    });
    const formDoc = en
      ? { title: 'Science museum trip', body: 'The school visits the Child Museum on Thursday 3 December, 9:00 to 13:00, by school bus with teachers. Please answer by 1 December.', titleAr: 'رحلة إلى متحف الطفل', bodyAr: 'تزور المدرسة متحف الطفل يوم الخميس 3 ديسمبر من التاسعة حتى الواحدة، بحافلة المدرسة مع المعلمين. يُرجى الرد قبل 1 ديسمبر.' }
      : { title: 'رحلة إلى متحف الطفل', body: 'تزور المدرسة متحف الطفل يوم الخميس 3 ديسمبر من التاسعة حتى الواحدة، بحافلة المدرسة مع المعلمين. يُرجى الرد قبل 1 ديسمبر.' };
    const options = [{ key: 'agree', label: en ? 'I agree' : 'أوافق', labelAr: 'أوافق' }, { key: 'decline', label: en ? 'I do not agree' : 'لا أوافق', labelAr: 'لا أوافق' }];
    const form = { ...formDoc, options, deadline: cairoDate(new Date(now.getTime() + 7 * DAY)) };
    const formId = sid('scf', S); const formAt = new Date(now.getTime() - 3 * DAY); const textHash = consentTextHash(form);
    add('SchoolConsentForm', `${S}:form`, { id: formId, institutionId: school.id, ...form, audience: 'school', textHash, createdBy: admin, createdAt: formAt, updatedAt: formAt });
    linked.forEach((l, i) => {
      if (i % 3 === 2) return; // about a third have not answered
      const at = new Date(formAt.getTime() + (1 + i) * 3_600_000);
      add('SchoolConsent', `${S}:consent:${i}`, { id: sid('scs', `${S}:${l.studentId}:${l.parentUserId}`), formId, institutionId: school.id, studentId: l.studentId, parentUserId: l.parentUserId, choice: i % 7 === 4 ? 'decline' : 'agree', textHash, device: 'Mozilla/5.0 (iPhone)', at });
    });
    void today;
  }
}

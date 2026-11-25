// The family account (owner "go" 25 Nov 2026; plan FAMILY_ACCOUNT_PLAN): one parent with three children at Al Nour International
// School, every child in 5 subjects, about 8 weeks of history. Built with the full-seed planner (same shapes as the rest of lms-test's
// data), on its own random stream and its own registry batch, then shaped so every parent screen and chart has something to show:
// marks with a clear direction per subject (one improving, one steady, one going down), a mark waiting for the teacher, weekly practice,
// an attendance pattern, fees in different states, the bus with the home pickup point. Nothing in it reads as made up.
import { createHash } from 'crypto';
import { buildPlan, oid, type FullSeedPlan, type PlannedDoc, type PlannedFamily } from './plan';
import { FAMILY_SCHOOL, SUBJECTS, type SubjectKey } from './content';

export const FAMILY_BATCH = 'family-v1';
export const FAMILY_PARENT_EMAIL = 'mona.hassan@alnour.school.enara.app';
const S = FAMILY_SCHOOL.id.replace('SCH-', '');
const DAY = 86_400_000;

// Marks per child and subject for assignments 1-4 (oldest first); assignment 5 is open, one subject per child waits for the teacher.
const MARKS: Record<string, Record<SubjectKey, number[]>> = {
  Youssef: { MATH: [58, 66, 74, 82], ENG: [80, 78, 83, 81], ARB: [88, 80, 72, 65], SCI: [62, 65, 71, 76], SOC: [70, 72, 69, 71] },
  Laila: { ENG: [64, 70, 79, 86], MATH: [90, 88, 92, 89], SCI: [84, 77, 70, 63], ARB: [76, 78, 75, 77], SOC: [55, 63, 68, 75] },
  Omar: { SCI: [50, 59, 66, 74], MATH: [82, 74, 67, 58], ENG: [78, 80, 77, 79], ARB: [61, 67, 72, 80], SOC: [85, 79, 72, 66] },
};
const WAITING: Record<string, [SubjectKey, number]> = { Youssef: ['SCI', 77], Laila: ['ENG', 88], Omar: ['MATH', 60] };
// Practice minutes per week, oldest of 8 weeks first (Laila above the 90-minute goal most weeks, Omar well below).
const PRACTICE: Record<string, number[]> = { Youssef: [30, 45, 40, 55, 35, 60, 50, 40], Laila: [60, 75, 90, 80, 95, 85, 100, 70], Omar: [20, 15, 30, 25, 10, 35, 20, 15] };

export const FAMILY: PlannedFamily = {
  family: 'Hassan',
  parent: { first: 'Mona', last: 'Hassan', sex: 'f', email: FAMILY_PARENT_EMAIL },
  kids: [
    { first: 'Youssef', sex: 'm', group: 'G3', ability: 0.74 },
    { first: 'Laila', sex: 'f', group: 'G6', ability: 0.84 }, // under 0.85: the planner puts stronger learners in a second grade's class too
    { first: 'Omar', sex: 'm', group: 'G9', ability: 0.66 },
  ],
  mark: (first, subject, assignment) => {
    if (assignment <= 4) { const m = MARKS[first]?.[subject]?.[assignment - 1]; return m === undefined ? null : { score: m, waiting: false }; }
    const w = WAITING[first];
    return w && w[0] === subject ? { score: w[1], waiting: true } : null;
  },
};

const cairoDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const hid = (p: string, key: string) => `${p}-${createHash('sha1').update(`enara-family-v1:${key}`).digest('hex').slice(0, 16)}`;

export function buildFamilyPlan(now: Date): FullSeedPlan {
  const plan = buildPlan(now, { schools: [FAMILY_SCHOOL], seed: 20261125, emailDomain: 'alnour.school.enara.app', family: FAMILY });
  const docs = plan.docs;
  const add = (model: PlannedDoc['model'], key: string, doc: Record<string, unknown>) => docs.push({ model, key, doc: { _id: oid(`${model}:${key}`), ...doc } });
  const kids = FAMILY.kids.map((k) => {
    const st = docs.find((d) => d.model === 'Student' && d.doc.name === `${k.first} ${FAMILY.family}`)!;
    const u = docs.find((d) => d.model === 'User' && d.doc.studentId === st.doc.id)!;
    return { ...k, id: String(st.doc.id), userId: String(u.doc._id) };
  });
  const parent = docs.find((d) => d.model === 'User' && d.doc.email === FAMILY_PARENT_EMAIL)!;
  const parentId = String(parent.doc._id);
  const adminId = String(docs.find((d) => d.model === 'User' && d.key === `${S}.admin`)!.doc._id);

  // ---- practice: tutor sessions spread over 8 weeks (Sunday, Monday, Wednesday afternoons), the planned minutes each week
  const today = cairoDate(now);
  const weekStart = (() => { const d = new Date(`${today}T12:00:00Z`); return new Date(d.getTime() - ((d.getUTCDay() + 1) % 7) * DAY); })();
  const subjects: SubjectKey[] = ['MATH', 'ENG', 'SCI', 'ARB', 'SOC'];
  for (const k of kids) {
    PRACTICE[k.first].forEach((minutes, wi) => {
      const ws = new Date(weekStart.getTime() - (7 - wi) * 7 * DAY);
      const parts = minutes <= 20 ? [minutes] : minutes <= 45 ? [Math.round(minutes / 2), minutes - Math.round(minutes / 2)] : [Math.round(minutes / 3), Math.round(minutes / 3), minutes - 2 * Math.round(minutes / 3)];
      parts.forEach((m, pi) => {
        const start = new Date(ws.getTime() + [1, 2, 4][pi] * DAY + 15 * 3_600_000 + pi * 7 * 60_000); // 17:xx Cairo
        if (start.getTime() > now.getTime() - 3_600_000) return; // not in the future
        const subj = subjects[(wi + pi) % subjects.length]; const sub = SUBJECTS[subj]; const chat = sub.chats[(wi + pi) % sub.chats.length];
        const sid = `TS-${k.id}-w${wi}-${pi}`; const cls = `CLS-${S}-${k.group}-${subj}`;
        const turns = chat.turns.length * 2; const step = Math.max(1, Math.floor((m * 60_000) / (turns - 1)));
        const msgs = chat.turns.flatMap(([q, a], ti) => [
          { role: 'user', text: q, timestamp: new Date(start.getTime() + ti * 2 * step) },
          { role: 'ai', text: a, timestamp: new Date(start.getTime() + (ti * 2 + 1) * step), meta: { intent: 'direct_model', version: 'deepseek', teachingMethod: 'socratic' } },
        ]);
        const last = msgs[msgs.length - 1].timestamp;
        add('TutorSession', sid, { id: sid, studentId: k.id, institutionId: FAMILY_SCHOOL.id, title: chat.title, courseId: subj, classId: cls, curriculumId: `CUR-${S}-${subj}`, teachingMethod: 'socratic', messageCount: msgs.length, mode: 'chat', lastMessageAt: last, origin: 'live', createdAt: start, updatedAt: last });
        msgs.forEach((x, mi) => add('TutorMessage', `${sid}:${mi}`, { id: `m-${oid(`${sid}:${mi}`).slice(0, 12)}`, sessionId: sid, studentId: k.id, institutionId: FAMILY_SCHOOL.id, ...x, createdAt: x.timestamp, updatedAt: x.timestamp }));
        add('LearningEvent', `${sid}:q`, { id: `lev-${oid(`lev:${sid}`)}`, institutionId: FAMILY_SCHOOL.id, studentId: k.id, actorId: k.userId, type: 'tutor_question', source: 'tutor_chat', verified: false, conceptIds: [], subject: sub.subject, topic: chat.title, refs: { courseId: subj, sessionId: sid }, at: start, recordedAt: start, objectiveIds: [], schemaVersion: 1 });
      });
    });
  }

  // ---- attendance: mostly present; Omar misses or is late on Sundays; Laila one absence and one excused day; Youssef late twice
  for (const k of kids) {
    const rows = docs.filter((d) => d.model === 'SchoolDailyAttendance' && d.doc.studentId === k.id).sort((a, b) => String(a.doc.date).localeCompare(String(b.doc.date)));
    for (const r of rows) { r.doc.status = 'present'; delete r.doc.note; }
    const set = (r: PlannedDoc | undefined, status: string, note?: string) => { if (!r) return; r.doc.status = status; if (note) r.doc.note = note; };
    const recent = rows.slice(-30);
    if (k.first === 'Omar') {
      const sundays = recent.filter((r) => weekday(String(r.doc.date)) === 0).reverse(); // newest first
      set(sundays[0], 'absent'); set(sundays[1], 'late', 'Arrived 08:35 (traffic)'); set(sundays[2], 'absent', 'No message from home'); set(sundays[3], 'late', 'Arrived 08:20'); set(sundays[4], 'absent');
      set(recent.filter((r) => weekday(String(r.doc.date)) === 2).reverse()[1], 'late', 'Arrived 08:20');
    } else if (k.first === 'Laila') {
      set(recent[recent.length - 9], 'absent'); set(recent[recent.length - 21], 'excused', 'Medical certificate');
    } else {
      const mondays = recent.filter((r) => weekday(String(r.doc.date)) === 1).reverse();
      set(mondays[0], 'late', 'Arrived 08:20'); set(mondays[2], 'late', 'Arrived 08:35 (traffic)');
    }
  }
  // The absence / lateness notices follow the attendance above (only the recent ones, as the school app sends them).
  for (let i = docs.length - 1; i >= 0; i--) {
    const d = docs[i];
    if (d.model === 'ParentNotification' && d.doc.parentUserId === parentId && (d.doc.kind === 'absence' || d.doc.kind === 'late')) docs.splice(i, 1);
  }
  for (const k of kids) {
    for (const r of docs.filter((d) => d.model === 'SchoolDailyAttendance' && d.doc.studentId === k.id && (d.doc.status === 'absent' || d.doc.status === 'late'))) {
      const date = String(r.doc.date); if (Date.parse(`${date}T00:00:00Z`) < now.getTime() - 15 * DAY) continue;
      const late = r.doc.status === 'late';
      const at = new Date(Date.parse(`${date}T07:30:00Z`));
      add('ParentNotification', `${parentId}:${r.doc.id}`, { id: hid('pn', `${parentId}:${r.doc.id}`), parentUserId: parentId, studentId: k.id, institutionId: FAMILY_SCHOOL.id, kind: late ? 'late' : 'absence', date, refId: r.doc.id,
        title: late ? `${k.first} arrived late` : `${k.first} was absent`, body: late ? `${k.first} was marked late on ${date}.` : `${k.first} was absent on ${date}.`, ...(Date.parse(`${date}T00:00:00Z`) < now.getTime() - 5 * DAY ? { readAt: new Date(at.getTime() + 3_600_000) } : {}), createdAt: at, updatedAt: at });
    }
  }

  // ---- fees: instalment 2 is paid for Laila, due in 7 days for Youssef, overdue for Omar
  const dayAt = (n: number) => cairoDate(new Date(now.getTime() + n * DAY));
  for (const k of kids) {
    const second = docs.find((d) => d.model === 'SchoolInstalment' && d.key === `${k.id}:tuition:2`);
    if (!second) continue;
    if (k.first === 'Laila') Object.assign(second.doc, { status: 'paid', dueDate: dayAt(-10), paidDate: dayAt(-12), receiptRef: `${S}-R${4100 + kids.indexOf(k)}` });
    else { Object.assign(second.doc, { status: 'due', dueDate: k.first === 'Youssef' ? dayAt(7) : dayAt(-10) }); delete second.doc.paidDate; delete second.doc.receiptRef; }
    const third = docs.find((d) => d.model === 'SchoolInstalment' && d.key === `${k.id}:tuition:3`);
    if (third && third.doc.status === 'waived') { third.doc.status = 'due'; delete third.doc.note; }
  }

  // ---- the bus: all three ride route 1, picked up at home (door to door), the home confirmed by the school
  const route = docs.find((d) => d.model === 'SchoolBusRoute' && d.key === `${S}:route:0`)!;
  const routeKey = String(route.doc.routeKey);
  const stop = (route.doc.stops as { name: string }[])[1].name;
  for (const k of kids) {
    const existing = docs.find((d) => d.model === 'SchoolBusAssignment' && d.key === `${k.id}:bus`);
    if (existing) Object.assign(existing.doc, { routeKey, stopName: stop, direction: 'both' });
    else add('SchoolBusAssignment', `${k.id}:bus`, { id: hid('sba', k.id), institutionId: FAMILY_SCHOOL.id, studentId: k.id, routeKey, stopName: stop, direction: 'both', validFrom: '2026-09-01', validTo: '2027-06-30', source: { kind: 'import', ref: 'bus-riders', at: new Date(now.getTime() - 20 * DAY) }, createdAt: new Date(now.getTime() - 20 * DAY), updatedAt: new Date(now.getTime() - 20 * DAY) });
    const confirmed = new Date(now.getTime() - 12 * DAY);
    add('BusHome', k.id, { id: hid('bhm', k.id), institutionId: FAMILY_SCHOOL.id, studentId: k.id, lat: 30.0913, lng: 31.3302, note: 'Villa 14, Nozha Street; the gate on the side street', confirmedAt: confirmed, confirmedBy: adminId, pending: null, order: 3, createdAt: confirmed, updatedAt: confirmed });
  }
  add('BusLiveSettings', FAMILY_SCHOOL.id, { institutionId: FAMILY_SCHOOL.id, enabled: true, windows: [{ from: '06:00', to: '09:30' }, { from: '12:30', to: '17:00' }], routesOff: [], homesRoutes: [routeKey], updatedBy: adminId, createdAt: new Date(now.getTime() - 14 * DAY), updatedAt: new Date(now.getTime() - 14 * DAY) });

  // ---- school items for the parent: the trip consent still to answer, and one open request to the office
  for (let i = docs.length - 1; i >= 0; i--) if (docs[i].model === 'SchoolConsent' && docs[i].doc.parentUserId === parentId) docs.splice(i, 1);
  for (let i = docs.length - 1; i >= 0; i--) if (docs[i].model === 'SchoolRequest' && docs[i].doc.parentUserId === parentId) docs.splice(i, 1);
  const reqAt = new Date(now.getTime() - 2 * DAY);
  add('SchoolRequest', `${S}:family:req`, { id: hid('srq', 'family:req'), institutionId: FAMILY_SCHOOL.id, studentId: kids[2].id, parentUserId: parentId, type: 'teacher_meeting', details: 'I would like to meet Omar\'s Maths teacher about his last two marks.', preferredDate: dayAt(5), status: 'in_progress', via: 'screen',
    history: [{ at: reqAt, by: 'parent', status: 'new' }, { at: new Date(reqAt.getTime() + 20 * 3_600_000), by: 'school', status: 'in_progress', note: 'We are arranging a time with Mr Karim.' }], reply: 'We are arranging a time with Mr Karim.', createdAt: reqAt, updatedAt: new Date(reqAt.getTime() + 20 * 3_600_000) });
  return plan;
}

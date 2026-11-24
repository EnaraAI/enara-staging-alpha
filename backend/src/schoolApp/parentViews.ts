import { AppError } from '../middleware/errorHandler';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import type { LearnerContext } from '../parents/service';
import { ParentNotification, SchoolAnnouncement, SchoolDailyAttendance, SchoolTimetableEntry } from './models';
import { schoolSections } from './sections';
import { announcementFilter, whoIs } from './audience';
import type { Section } from './flags';
import { feesSummary } from './fees';

// Parents school app (a): what a parent sees for ONE child. Every function takes the LearnerContext from parents/service.requireLearner
// (active link, child still at the link's school, school parent access on), so a parent can only ever read their own child's data.
// Each answer names its source and when it was last updated (the screens and, later, the chatbot show it).
const cairoDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const cairoDay = (d = new Date()) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' }).format(d));
const schoolOf = (ctx: LearnerContext) => ctx.link.institutionId ?? ctx.student.institutionId;

async function gate(ctx: LearnerContext, s: Section) {
  const sections = await schoolSections(schoolOf(ctx));
  if (!sections[s]) throw new AppError('This section is not available for this school', 404, 'SECTION_OFF');
  return sections;
}
const sourceOf = (rows: { source?: { kind?: string; at?: Date }; updatedAt?: Date }[], label: string) => {
  const at = rows.reduce<Date | null>((m, r) => { const t = r.source?.at ?? r.updatedAt; return t && (!m || t > m) ? t : m; }, null);
  return { label, updatedAt: at ? at.toISOString() : null, kind: rows[0]?.source?.kind ?? null };
};

export async function schoolOverview(ctx: LearnerContext, now = new Date()) {
  const sections = await schoolSections(schoolOf(ctx));
  const who = await whoIs(ctx.student.id);
  const today = cairoDate(now), day = cairoDay(now);
  const out: Record<string, unknown> = { sections, today };
  if (sections.attendance) {
    const t = await SchoolDailyAttendance.find({ institutionId: schoolOf(ctx), studentId: ctx.student.id, date: today }).sort({ period: 1 }).lean();
    out.attendanceToday = t.length ? (t.some((r) => r.status === 'absent') ? 'absent' : t.some((r) => r.status === 'late') ? 'late' : t.every((r) => r.status === 'excused') ? 'excused' : 'present') : null;
  }
  if (sections.timetable && who?.groupKey) {
    const rows = await SchoolTimetableEntry.find({ institutionId: schoolOf(ctx), groupKey: who.groupKey, day }).sort({ period: 1 }).lean();
    out.todayClasses = rows.map((r) => ({ period: r.period, start: r.start, end: r.end, subject: r.subject }));
  }
  if (sections.announcements && who) out.announcementsCount = await SchoolAnnouncement.countDocuments(announcementFilter({ ...who, institutionId: schoolOf(ctx) }, now));
  if (sections.fees) { const f = await feesSummary(ctx, now); if (f) out.fees = f; }
  if (sections.notifications) out.unreadNotifications = await ParentNotification.countDocuments({ parentUserId: ctx.link.parentUserId, studentId: ctx.student.id, readAt: { $exists: false } });
  return out;
}

export async function timetable(ctx: LearnerContext) {
  await gate(ctx, 'timetable');
  const who = await whoIs(ctx.student.id);
  const rows = who?.groupKey ? await SchoolTimetableEntry.find({ institutionId: schoolOf(ctx), groupKey: who.groupKey }).sort({ day: 1, period: 1 }).lean() : [];
  return {
    group: rows[0]?.groupName ?? null,
    days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, periods: rows.filter((r) => r.day === d).map((r) => ({ period: r.period, start: r.start, end: r.end, subject: r.subject, teacher: r.teacher ?? null, room: r.room ?? null })) })).filter((d) => d.periods.length),
    source: sourceOf(rows, 'timetable'),
  };
}

export async function attendance(ctx: LearnerContext, month?: unknown, now = new Date()) {
  await gate(ctx, 'attendance');
  const m = typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) ? month : cairoDate(now).slice(0, 7);
  const rows = await SchoolDailyAttendance.find({ institutionId: schoolOf(ctx), studentId: ctx.student.id, date: { $gte: `${m}-01`, $lte: `${m}-31` } }).sort({ date: 1, period: 1 }).lean();
  const counts = { present: 0, absent: 0, late: 0, excused: 0 } as Record<string, number>;
  for (const r of rows) counts[r.status]++;
  return { month: m, records: rows.map((r) => ({ date: r.date, period: r.period ?? null, status: r.status, note: r.note ?? null })), counts, source: sourceOf(rows, 'attendance') };
}

export async function announcements(ctx: LearnerContext, now = new Date()) {
  await gate(ctx, 'announcements');
  const who = await whoIs(ctx.student.id);
  if (!who) return { announcements: [], source: sourceOf([], 'announcements') };
  const rows = await SchoolAnnouncement.find(announcementFilter({ ...who, institutionId: schoolOf(ctx) }, now)).sort({ publishAt: -1 }).limit(100).lean();
  return {
    announcements: rows.map((a) => ({ id: a.id, title: a.title, body: a.body, titleAr: a.titleAr ?? null, bodyAr: a.bodyAr ?? null, audience: a.audience, publishAt: a.publishAt, expiresAt: a.expiresAt ?? null })),
    source: sourceOf(rows, 'announcements'),
  };
}

/** The parent's notifications, only for children they still have an active link to. */
export async function notifications(parentUserId: string) {
  const live = (await ParentLearnerLink.find({ parentUserId, status: 'active' }).select('studentId').lean()).map((l) => l.studentId);
  const rows = await ParentNotification.find({ parentUserId, studentId: { $in: live } }).sort({ createdAt: -1 }).limit(100).lean();
  return { notifications: rows.map((n) => ({ id: n.id, studentId: n.studentId, kind: n.kind, date: n.date ?? null, refId: n.refId ?? null, title: n.title, body: n.body, read: !!n.readAt, createdAt: n.createdAt })), unread: rows.filter((n) => !n.readAt).length };
}
export async function markRead(parentUserId: string, ids: unknown) {
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
  const r = await ParentNotification.updateMany({ parentUserId, ...(list.length ? { id: { $in: list } } : {}), readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  return { marked: r.modifiedCount };
}

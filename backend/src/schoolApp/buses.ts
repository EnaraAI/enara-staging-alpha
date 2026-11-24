import { AppError } from '../middleware/errorHandler';
import { Institution } from '../models/Institution';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { Student } from '../models/Student';
import { recordAudit } from '../services/auditTrail';
import type { LearnerContext } from '../parents/service';
import { ParentNotification, SchoolBusAssignment, SchoolBusNotice, SchoolBusRoute } from './models';
import { newId, schoolSections, sectionOn } from './sections';
import { emailSchoolNotices, type NoticeDoc } from './emails';
import { norm } from './importSpec';

// Parents school app, step (c): buses. Routes with stops and times, each child's stop, and the school's delay / cancel notices for today.
// Stop times only: no live GPS in this phase. The supervisor's phone is shown only when the school confirms supervisors agreed to share
// it with parents (busPhonesShared; plan question 3).
const cairoDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
type Actor = { id: string; role: string; institutionId?: string };
const scope = (actor: Actor, institutionId?: string) => {
  const id = actor.role === 'enara-admin' ? institutionId : actor.institutionId;
  if (!id || (actor.role !== 'enara-admin' && actor.role !== 'admin')) throw new AppError('Access denied', 403, 'FORBIDDEN');
  return id;
};
export async function busPhonesShared(institutionId: string | undefined) {
  if (!institutionId) return false;
  return (await Institution.findOne({ id: institutionId }).select('schoolApp.busPhonesShared').lean())?.schoolApp?.busPhonesShared === true;
}
const valid = (a: { validFrom?: string; validTo?: string }, today: string) => (!a.validFrom || a.validFrom <= today) && (!a.validTo || a.validTo >= today);

export async function busForParent(ctx: LearnerContext, now = new Date()) {
  const school = ctx.link.institutionId ?? ctx.student.institutionId;
  if (!(await schoolSections(school)).buses) throw new AppError('This section is not available for this school', 404, 'SECTION_OFF');
  const today = cairoDate(now);
  const assignments = (await SchoolBusAssignment.find({ institutionId: school, studentId: ctx.student.id }).lean()).filter((a) => valid(a, today));
  const routes = new Map((await SchoolBusRoute.find({ institutionId: school, routeKey: { $in: [...new Set(assignments.map((a) => a.routeKey))] } }).lean()).map((r) => [r.routeKey, r]));
  const phones = await busPhonesShared(school);
  const notices = await SchoolBusNotice.find({ institutionId: school, routeKey: { $in: [...routes.keys()] }, date: today, withdrawnAt: { $exists: false } }).sort({ createdAt: -1 }).lean();
  const trips = (['morning', 'afternoon'] as const).map((dir) => {
    const a = assignments.find((x) => x.direction === dir) ?? assignments.find((x) => x.direction === 'both');
    const r = a ? routes.get(a.routeKey) : undefined;
    if (!a || !r) return null;
    const stop = r.stops.find((s) => norm(s.name) === norm(a.stopName));
    return {
      direction: dir, route: r.routeName, busNumber: r.busNumber ?? null, stop: a.stopName, time: (dir === 'morning' ? stop?.morning : stop?.afternoon) ?? null, mapLink: stop?.mapLink ?? null,
      supervisor: r.supervisorName ?? null, supervisorPhone: phones ? r.supervisorPhone ?? null : null, driver: r.driverName ?? null,
      stops: r.stops.map((s) => ({ name: s.name, time: (dir === 'morning' ? s.morning : s.afternoon) ?? null, mine: norm(s.name) === norm(a.stopName) })),
      notices: notices.filter((n) => n.routeKey === r.routeKey && n.direction === dir).map((n) => ({ kind: n.kind, minutes: n.minutes ?? null, message: n.message ?? null, at: n.createdAt })),
    };
  }).filter(Boolean);
  const all = [...assignments, ...routes.values()] as { source?: { kind?: string; at?: Date } }[];
  const at = all.reduce<Date | null>((m, x) => (x.source?.at && (!m || x.source.at > m) ? x.source.at : m), null);
  return { today, trips, source: { label: 'buses', updatedAt: at ? at.toISOString() : null, kind: all[0]?.source?.kind ?? null } };
}

/** Home card: today's times and any notice. Null when off or the child has no bus. */
export async function busSummary(ctx: LearnerContext, now = new Date()) {
  try {
    const b = await busForParent(ctx, now);
    if (!b.trips.length) return null;
    return { trips: b.trips.map((t) => ({ direction: t!.direction, time: t!.time, stop: t!.stop, notice: t!.notices[0] ?? null })) };
  } catch { return null; }
}

export async function busesForAdmin(actor: Actor, institutionId?: string, now = new Date()) {
  const school = scope(actor, institutionId);
  const today = cairoDate(now);
  const routes = await SchoolBusRoute.find({ institutionId: school }).sort({ routeName: 1 }).lean();
  const assignments = await SchoolBusAssignment.find({ institutionId: school }).select('routeKey studentId').lean();
  const notices = await SchoolBusNotice.find({ institutionId: school, date: today }).sort({ createdAt: -1 }).lean();
  return {
    busPhonesShared: await busPhonesShared(school),
    routes: routes.map((r) => ({ routeKey: r.routeKey, routeName: r.routeName, busNumber: r.busNumber ?? null, supervisor: r.supervisorName ?? null, stops: r.stops.length,
      students: new Set(assignments.filter((a) => a.routeKey === r.routeKey).map((a) => a.studentId)).size })),
    noticesToday: notices.map((n) => ({ id: n.id, routeKey: n.routeKey, kind: n.kind, direction: n.direction, minutes: n.minutes ?? null, message: n.message ?? null, withdrawn: !!n.withdrawnAt, at: n.createdAt })),
  };
}

/** The school sends a delay or cancel notice for a route's trip today: in-app (and email) to parents of children on that trip. Audited. */
export async function sendBusNotice(actor: Actor, body: Record<string, unknown>, now = new Date()) {
  const school = scope(actor, typeof body.institutionId === 'string' ? body.institutionId : undefined);
  const route = await SchoolBusRoute.findOne({ institutionId: school, routeKey: norm(body.route) }).lean();
  if (!route) throw new AppError('Route not found', 404, 'NOT_FOUND');
  if (!(await sectionOn(school, 'buses'))) throw new AppError('The buses section is off for this school', 409, 'SECTION_OFF');
  const kind = body.kind === 'cancel' ? 'cancel' : body.kind === 'delay' ? 'delay' : null;
  if (!kind) throw new AppError("kind must be 'delay' or 'cancel'", 400, 'VALIDATION_ERROR');
  const direction = body.direction === 'afternoon' ? 'afternoon' : body.direction === 'morning' ? 'morning' : null;
  if (!direction) throw new AppError("direction must be 'morning' or 'afternoon'", 400, 'VALIDATION_ERROR');
  const minutes = kind === 'delay' ? Number(body.minutes) : undefined;
  if (kind === 'delay' && (!Number.isInteger(minutes) || minutes! < 1 || minutes! > 600)) throw new AppError('minutes must be 1-600', 400, 'VALIDATION_ERROR');
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 300) : '';
  const today = cairoDate(now);
  const notice = await SchoolBusNotice.create({ id: newId('sbn'), institutionId: school, routeKey: route.routeKey, kind, direction, minutes, message: message || undefined, date: today, createdBy: actor.id });
  await recordAudit('school_app_bus_notice_sent', actor, { institutionId: school, type: 'school_bus_notice', id: notice.id }, { route: route.routeKey, kind, direction, minutes });
  // Parents of children on that trip today.
  const students = (await SchoolBusAssignment.find({ institutionId: school, routeKey: route.routeKey, direction: { $in: [direction, 'both'] } }).lean()).filter((a) => valid(a, today)).map((a) => a.studentId);
  let notified = 0;
  if ((await schoolSections(school)).notifications && students.length) {
    const links = await ParentLearnerLink.find({ studentId: { $in: students }, status: 'active' }).select('parentUserId studentId').lean();
    const names = new Map((await Student.find({ id: { $in: students } }).select('id name').lean()).map((s) => [s.id, String(s.name || '').split(/\s+/)[0]]));
    const title = kind === 'cancel' ? `Bus ${route.routeName}: the ${direction} trip is cancelled today` : `Bus ${route.routeName}: the ${direction} trip is about ${minutes} minutes late`;
    const docs: NoticeDoc[] = links.map((l) => ({ parentUserId: l.parentUserId, studentId: l.studentId, institutionId: school, kind: 'bus_notice', refId: `${notice.id}:${l.studentId}`, date: today, title, body: message, minutes, busKind: kind, direction, routeName: route.routeName, childName: names.get(l.studentId) }));
    try { await ParentNotification.insertMany(docs.map((d) => ({ id: newId('pn'), ...d })), { ordered: false }); } catch (e) { if ((e as { code?: number }).code !== 11000) throw e; }
    await emailSchoolNotices(docs);
    notified = docs.length;
  }
  return { id: notice.id, students: students.length, notified };
}

export async function withdrawBusNotice(actor: Actor, id: string) {
  const n = await SchoolBusNotice.findOne({ id });
  if (!n || n.institutionId !== scope(actor, n?.institutionId)) throw new AppError('Notice not found', 404, 'NOT_FOUND');
  n.withdrawnAt = new Date(); await n.save();
  await recordAudit('school_app_bus_notice_withdrawn', actor, { institutionId: n.institutionId, type: 'school_bus_notice', id: n.id }, {});
  return { id: n.id, withdrawn: true };
}

export async function setBusPhonesShared(actor: Actor, institutionId: string, value: unknown) {
  const school = scope(actor, institutionId);
  if (typeof value !== 'boolean') throw new AppError('busPhonesShared must be true or false', 400, 'VALIDATION_ERROR');
  const inst = await Institution.findOne({ id: school });
  if (!inst) throw new AppError('Institution not found', 404, 'NOT_FOUND');
  const before = inst.schoolApp?.busPhonesShared === true;
  inst.schoolApp = { ...(inst.schoolApp ?? {}), busPhonesShared: value, updatedAt: new Date(), updatedBy: actor.id };
  inst.markModified('schoolApp'); await inst.save();
  await recordAudit('school_app_bus_phones_changed', actor, { institutionId: school, type: 'institution', id: school }, { from: before, to: value });
  return { institutionId: school, busPhonesShared: value };
}

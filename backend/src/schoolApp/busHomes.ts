import { Schema, model, type Document } from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../services/auditTrail';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { ParentProfile } from '../models/ParentProfile';
import { Student } from '../models/Student';
import type { LearnerContext } from '../parents/service';
import { ParentNotification, SchoolBusAssignment, SchoolBusRoute } from './models';
import { newId, schoolSections } from './sections';
import { BusLiveSettings, busLiveSiteOn, etaMinutes } from './busLive';

// Door to door (owner "go" 25 Nov 2026): on a route the school marks "door to door", each child's home is their stop.
// - The parent sets the home (a map pin and a short note); the school confirms it before the bus uses it. The school can also set
//   or fix it. Only the confirmed home is used; a parent's change waits as "pending".
// - The school orders the homes on the route. During a trip the supervisor sees the next home (child's first name and the note),
//   taps Picked up / Dropped off / Not riding today; the parent is told. "The bus is about 5 minutes away" goes once per trip.
// - Who sees a home: its own parents, the school admin, and the supervisor of the route during a running trip. Never other parents.
//   A home is deleted when the child is no longer on any route of the school.

export interface IBusHome extends Document {
  id: string; institutionId: string; studentId: string;
  lat?: number; lng?: number; note?: string; confirmedAt?: Date; confirmedBy?: string;
  pending?: { lat: number; lng: number; note?: string; by: string; at: Date } | null;
  order: number;
}
const homeSchema = new Schema<IBusHome>({
  id: { type: String, required: true, unique: true },
  institutionId: { type: String, required: true, index: true },
  studentId: { type: String, required: true },
  lat: Number, lng: Number, note: { type: String, maxlength: 160 }, confirmedAt: Date, confirmedBy: String,
  pending: { type: { lat: Number, lng: Number, note: String, by: String, at: Date, _id: false }, default: null },
  order: { type: Number, default: 0 },
}, { timestamps: true });
homeSchema.index({ institutionId: 1, studentId: 1 }, { unique: true });
export const BusHome = model<IBusHome>('BusHome', homeSchema, 'school_bus_homes');

/** What happened at each home during a trip (and the one "5 minutes away" notice). */
export interface IBusTripStop extends Document { tripId: string; institutionId: string; studentId: string; status?: 'picked' | 'dropped' | 'absent'; at?: Date; nearNotifiedAt?: Date }
const tripStopSchema = new Schema<IBusTripStop>({
  tripId: { type: String, required: true }, institutionId: { type: String, required: true }, studentId: { type: String, required: true },
  status: { type: String, enum: ['picked', 'dropped', 'absent'] }, at: Date, nearNotifiedAt: Date,
}, { timestamps: true });
tripStopSchema.index({ tripId: 1, studentId: 1 }, { unique: true });
export const BusTripStop = model<IBusTripStop>('BusTripStop', tripStopSchema, 'school_bus_trip_stops');

type Actor = { id: string; role: string; institutionId?: string };
const scope = (actor: Actor, institutionId?: unknown) => {
  const id = actor.role === 'enara-admin' && typeof institutionId === 'string' ? institutionId : actor.institutionId;
  if (!id || (actor.role !== 'enara-admin' && actor.role !== 'admin')) throw new AppError('Access denied', 403, 'FORBIDDEN');
  return id;
};
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const note = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 160) : '');
const cairoDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const cairoHm = (d: Date, lang: 'en' | 'ar') => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
const valid = (a: { validFrom?: string; validTo?: string }, today: string) => (!a.validFrom || a.validFrom <= today) && (!a.validTo || a.validTo >= today);

export async function doorToDoorRoutes(institutionId: string): Promise<string[]> {
  return (await BusLiveSettings.findOne({ institutionId }).select('homesRoutes').lean())?.homesRoutes ?? [];
}
/** The child's assignment today for a direction, and whether that route is door to door. */
async function childRoute(institutionId: string, studentId: string, now = new Date()) {
  const today = cairoDate(now);
  const list = (await SchoolBusAssignment.find({ institutionId, studentId }).lean()).filter((a) => valid(a, today));
  const d2d = await doorToDoorRoutes(institutionId);
  return { list, d2d, onD2d: list.find((a) => d2d.includes(a.routeKey)) ?? null };
}

// ---- parents ------------------------------------------------------------------------------------------------------------------
const homeView = (h: { lat?: number; lng?: number; note?: string; confirmedAt?: Date; pending?: IBusHome['pending'] } | null) => ({
  confirmed: h && h.lat !== undefined && h.lng !== undefined && h.confirmedAt ? { lat: h.lat, lng: h.lng, note: h.note ?? '', at: h.confirmedAt } : null,
  pending: h?.pending ? { lat: h.pending.lat, lng: h.pending.lng, note: h.pending.note ?? '', at: h.pending.at } : null,
});

export async function homeForParent(ctx: LearnerContext) {
  const school = ctx.link.institutionId ?? ctx.student.institutionId;
  if (!school || !busLiveSiteOn() || !(await schoolSections(school)).buses) return { enabled: false, home: homeView(null) };
  const r = await childRoute(school, ctx.student.id);
  const h = await BusHome.findOne({ institutionId: school, studentId: ctx.student.id }).lean();
  return { enabled: !!r.onD2d, canEdit: ctx.link.role !== 'view', home: homeView(h) };
}

/** The parent sets or moves the pickup point: it waits for the school's confirmation. */
export async function setHomeByParent(ctx: LearnerContext, body: Record<string, unknown>) {
  const school = ctx.link.institutionId ?? ctx.student.institutionId;
  if (!school || !busLiveSiteOn() || !(await schoolSections(school)).buses) throw new AppError('This section is not available for this school', 404, 'SECTION_OFF');
  if (ctx.link.role === 'view') throw new AppError('Only a main or full guardian can set the pickup point', 403, 'PARENT_ACCESS_DENIED');
  if (!(await childRoute(school, ctx.student.id)).onD2d) throw new AppError('The school does not pick up from homes on this child’s route', 409, 'NOT_DOOR_TO_DOOR');
  const lat = num(body.lat, -90, 90); const lng = num(body.lng, -180, 180);
  if (lat === null || lng === null) throw new AppError('lat and lng are required', 400, 'VALIDATION_ERROR');
  const pending = { lat, lng, note: note(body.note), by: ctx.link.parentUserId, at: new Date() };
  await BusHome.updateOne({ institutionId: school, studentId: ctx.student.id }, { $set: { pending }, $setOnInsert: { id: newId('bhm'), order: 999 } }, { upsert: true });
  await recordAudit('bus_home_set_by_parent', { id: ctx.link.parentUserId, role: 'parent' }, { institutionId: school, type: 'bus_home', id: ctx.student.id }, {});
  return homeView(await BusHome.findOne({ institutionId: school, studentId: ctx.student.id }).lean());
}

export async function cancelPendingByParent(ctx: LearnerContext) {
  const school = ctx.link.institutionId ?? ctx.student.institutionId;
  if (ctx.link.role === 'view') throw new AppError('Only a main or full guardian can change the pickup point', 403, 'PARENT_ACCESS_DENIED');
  await BusHome.updateOne({ institutionId: school, studentId: ctx.student.id }, { $set: { pending: null } });
  return homeView(await BusHome.findOne({ institutionId: school, studentId: ctx.student.id }).lean());
}

// ---- school admin -------------------------------------------------------------------------------------------------------------
/** Door-to-door routes, each with its children (in order), their confirmed home and any pending change. Cleans homes of children off every route. */
export async function homesForAdmin(actor: Actor, institutionId?: unknown, now = new Date()) {
  const school = scope(actor, institutionId);
  const today = cairoDate(now);
  const d2d = await doorToDoorRoutes(school);
  const assignments = (await SchoolBusAssignment.find({ institutionId: school }).lean()).filter((a) => valid(a, today));
  const onAny = new Set(assignments.map((a) => a.studentId));
  const homes = await BusHome.find({ institutionId: school }).lean();
  const gone = homes.filter((h) => !onAny.has(h.studentId)).map((h) => h.id);
  if (gone.length) await BusHome.deleteMany({ id: { $in: gone } }); // the child left every route: the home is deleted
  const names = new Map((await Student.find({ id: { $in: [...onAny] } }).select('id name').lean()).map((s) => [s.id, String(s.name || '')]));
  const byStudent = new Map(homes.filter((h) => onAny.has(h.studentId)).map((h) => [h.studentId, h]));
  const routes = await SchoolBusRoute.find({ institutionId: school }).select('routeKey routeName').sort({ routeName: 1 }).lean();
  return {
    routes: routes.map((r) => {
      const kids = [...new Set(assignments.filter((a) => a.routeKey === r.routeKey).map((a) => a.studentId))];
      const rows = kids.map((id) => { const h = byStudent.get(id) ?? null; return { studentId: id, name: names.get(id) ?? id, order: h?.order ?? 999, ...homeView(h) }; })
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      return { routeKey: r.routeKey, routeName: r.routeName, doorToDoor: d2d.includes(r.routeKey), children: rows };
    }),
  };
}

export async function setDoorToDoor(actor: Actor, body: Record<string, unknown>) {
  const school = scope(actor, body.institutionId);
  const routeKey = String(body.routeKey ?? '').trim().toLowerCase();
  if (!(await SchoolBusRoute.exists({ institutionId: school, routeKey }))) throw new AppError('Route not found', 404, 'NOT_FOUND');
  if (typeof body.on !== 'boolean') throw new AppError('on must be true or false', 400, 'VALIDATION_ERROR');
  const list = new Set(await doorToDoorRoutes(school));
  if (body.on) list.add(routeKey); else list.delete(routeKey);
  await BusLiveSettings.updateOne({ institutionId: school }, { $set: { homesRoutes: [...list] } }, { upsert: true });
  await recordAudit('bus_route_door_to_door_changed', actor, { institutionId: school, type: 'bus_route', id: routeKey }, { on: body.on });
  return { routeKey, doorToDoor: body.on };
}

/** The school sets (and so confirms) a home, confirms the parent's pending point, or turns it down. */
export async function schoolHome(actor: Actor, studentId: string, body: Record<string, unknown>) {
  const school = scope(actor, body.institutionId);
  if (!(await Student.exists({ id: studentId, institutionId: school }))) throw new AppError('Student not found', 404, 'NOT_FOUND');
  const h = await BusHome.findOne({ institutionId: school, studentId });
  const action = body.action;
  if (action === 'confirm') {
    if (!h?.pending) throw new AppError('Nothing is waiting for confirmation', 409, 'NOTHING_PENDING');
    h.lat = h.pending.lat; h.lng = h.pending.lng; h.note = h.pending.note; h.confirmedAt = new Date(); h.confirmedBy = actor.id; h.pending = null;
    await h.save();
  } else if (action === 'reject') {
    if (!h?.pending) throw new AppError('Nothing is waiting for confirmation', 409, 'NOTHING_PENDING');
    h.pending = null; await h.save();
  } else if (action === 'set') {
    const lat = num(body.lat, -90, 90); const lng = num(body.lng, -180, 180);
    if (lat === null || lng === null) throw new AppError('lat and lng are required', 400, 'VALIDATION_ERROR');
    await BusHome.updateOne({ institutionId: school, studentId }, { $set: { lat, lng, ...(body.note !== undefined ? { note: note(body.note) } : {}), confirmedAt: new Date(), confirmedBy: actor.id, pending: null }, $setOnInsert: { id: newId('bhm'), order: 999 } }, { upsert: true });
  } else if (action === 'delete') {
    await BusHome.deleteOne({ institutionId: school, studentId });
  } else throw new AppError("action must be 'set', 'confirm', 'reject' or 'delete'", 400, 'VALIDATION_ERROR');
  await recordAudit(`bus_home_${action}`, actor, { institutionId: school, type: 'bus_home', id: studentId }, {});
  return homeView(await BusHome.findOne({ institutionId: school, studentId }).lean());
}

export async function setHomesOrder(actor: Actor, body: Record<string, unknown>) {
  const school = scope(actor, body.institutionId);
  if (!Array.isArray(body.studentIds) || body.studentIds.length > 300) throw new AppError('studentIds must be a list', 400, 'VALIDATION_ERROR');
  const ids = body.studentIds.map(String);
  for (let i = 0; i < ids.length; i++) {
    await BusHome.updateOne({ institutionId: school, studentId: ids[i] }, { $set: { order: i + 1 }, $setOnInsert: { id: newId('bhm') } }, { upsert: true });
  }
  return { ordered: ids.length };
}

// ---- trips: the supervisor's list and taps, the parent's notices ---------------------------------------------------------------
/** The homes of a running door-to-door trip, in order, with what happened at each (for the supervisor). */
export async function tripHomes(trip: { id: string; institutionId: string; routeKey: string; direction: 'morning' | 'afternoon' }, now = new Date()) {
  if (!(await doorToDoorRoutes(trip.institutionId)).includes(trip.routeKey)) return null;
  const today = cairoDate(now);
  const kids = (await SchoolBusAssignment.find({ institutionId: trip.institutionId, routeKey: trip.routeKey, direction: { $in: [trip.direction, 'both'] } }).lean()).filter((a) => valid(a, today)).map((a) => a.studentId);
  const homes = await BusHome.find({ institutionId: trip.institutionId, studentId: { $in: kids }, confirmedAt: { $exists: true } }).sort({ order: 1 }).lean();
  const names = new Map((await Student.find({ id: { $in: kids } }).select('id name').lean()).map((s) => [s.id, String(s.name || '').trim().split(/\s+/)[0]]));
  const stops = new Map((await BusTripStop.find({ tripId: trip.id }).lean()).map((s) => [s.studentId, s]));
  return homes.filter((h) => h.lat !== undefined && h.lng !== undefined).map((h) => ({ studentId: h.studentId, firstName: names.get(h.studentId) ?? '', note: h.note ?? '', lat: h.lat!, lng: h.lng!, status: stops.get(h.studentId)?.status ?? null, at: stops.get(h.studentId)?.at ?? null }));
}

const TEXT = {
  picked: { en: (n: string, t: string) => `${n} was picked up at ${t}`, ar: (n: string, t: string) => `تم استلام ${n} الساعة ${t}` },
  dropped: { en: (n: string, t: string) => `${n} was dropped off at home at ${t}`, ar: (n: string, t: string) => `وصل ${n} إلى البيت الساعة ${t}` },
  absent: { en: (n: string) => `${n} was marked as not riding the bus today`, ar: (n: string) => `سُجّل أن ${n} لن يركب الحافلة اليوم` },
  near: { en: (n: string) => `The bus is about 5 minutes away from ${n}’s home`, ar: (n: string) => `الحافلة على بُعد 5 دقائق تقريبًا من بيت ${n}` },
};
/** In-app notice to every parent of the child, in each parent's language (no email: these are minute-by-minute). */
async function tellParents(institutionId: string, studentId: string, refId: string, text: (lang: 'en' | 'ar', first: string) => string, now = new Date()) {
  const links = await ParentLearnerLink.find({ studentId, status: 'active' }).select('parentUserId').lean();
  if (!links.length || !(await schoolSections(institutionId)).notifications) return 0;
  const first = String((await Student.findOne({ id: studentId }).select('name').lean())?.name || '').trim().split(/\s+/)[0];
  const langs = new Map((await ParentProfile.find({ userId: { $in: links.map((l) => l.parentUserId) } }).select('userId language').lean()).map((p) => [p.userId, p.language === 'ar' ? 'ar' : 'en'] as const));
  const docs = links.map((l) => { const lang = langs.get(l.parentUserId) ?? 'en'; return { id: newId('pn'), parentUserId: l.parentUserId, studentId, institutionId, kind: 'bus_notice' as const, refId, date: cairoDate(now), title: text(lang, first), body: '' }; });
  try { await ParentNotification.insertMany(docs, { ordered: false }); } catch (e) { if ((e as { code?: number }).code !== 11000) throw e; }
  return docs.length;
}

/** The supervisor taps Picked up / Dropped off / Not riding today for a child of the running trip. */
export async function markStop(trip: { id: string; institutionId: string; routeKey: string; direction: 'morning' | 'afternoon' }, supervisorId: string, body: Record<string, unknown>, now = new Date()) {
  const homes = await tripHomes(trip, now);
  if (!homes) throw new AppError('This route is not door to door', 409, 'NOT_DOOR_TO_DOOR');
  const studentId = String(body.studentId ?? '');
  if (!homes.some((h) => h.studentId === studentId)) throw new AppError('This child is not on this trip', 404, 'NOT_FOUND');
  const status = body.status === 'absent' ? 'absent' : body.status === 'done' ? (trip.direction === 'morning' ? 'picked' : 'dropped') : null;
  if (!status) throw new AppError("status must be 'done' or 'absent'", 400, 'VALIDATION_ERROR');
  await BusTripStop.updateOne({ tripId: trip.id, studentId }, { $set: { institutionId: trip.institutionId, status, at: now } }, { upsert: true });
  await recordAudit(`bus_child_${status}`, { id: supervisorId, role: 'bus_supervisor' }, { institutionId: trip.institutionId, type: 'bus_trip', id: trip.id }, { studentId });
  await tellParents(trip.institutionId, studentId, `${trip.id}:${studentId}:${status}`, (lang, n) => (status === 'absent' ? TEXT.absent[lang](n) : TEXT[status][lang](n, cairoHm(now, lang))), now);
  return { studentId, status, at: now };
}

/** After each position: the next home not yet done; if the bus is about 5 minutes away, tell its parents once per trip. */
export async function nearNotice(trip: { id: string; institutionId: string; routeKey: string; direction: 'morning' | 'afternoon' }, bus: { lat: number; lng: number; speed?: number }, now = new Date()) {
  const homes = await tripHomes(trip, now);
  const next = homes?.find((h) => !h.status);
  if (!next || etaMinutes(bus, next) > 5) return null;
  const r = await BusTripStop.updateOne({ tripId: trip.id, studentId: next.studentId, nearNotifiedAt: { $exists: false } }, { $set: { institutionId: trip.institutionId, nearNotifiedAt: now } }, { upsert: false });
  if (!r.modifiedCount) {
    try { await BusTripStop.create({ tripId: trip.id, institutionId: trip.institutionId, studentId: next.studentId, nearNotifiedAt: now }); } catch { return null; } // already told (unique)
  }
  await tellParents(trip.institutionId, next.studentId, `${trip.id}:${next.studentId}:near`, (lang, n) => TEXT.near[lang](n), now);
  return next.studentId;
}

/** For the parent's live map on a door-to-door route: the child's confirmed home, the estimate through the homes before it, the status. */
export async function liveHomeFor(school: string, studentId: string, trip: { id: string; institutionId: string; routeKey: string; direction: 'morning' | 'afternoon' }, bus: { lat: number; lng: number; speed?: number } | null, now = new Date()) {
  const homes = await tripHomes(trip, now);
  if (!homes) return null;
  const i = homes.findIndex((h) => h.studentId === studentId);
  if (i < 0) return { home: null, etaMin: null, status: null, at: null };
  const mine = homes[i];
  let eta: number | null = null;
  if (bus && !mine.status) {
    const before = homes.slice(0, i).filter((h) => !h.status);
    let from = bus; let total = 0;
    for (const h of [...before, mine]) { total += etaMinutes({ ...from, speed: bus.speed }, h); from = h; }
    eta = total + before.length; // about a minute at each home before
  }
  return { home: { lat: mine.lat, lng: mine.lng }, etaMin: eta, status: mine.status, at: mine.at };
}


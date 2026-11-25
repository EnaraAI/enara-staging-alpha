import { createHash, randomInt } from 'crypto';
import jwt from 'jsonwebtoken';
import { Schema, model, type Document } from 'mongoose';
import { getConfig } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../services/auditTrail';
import type { LearnerContext } from '../parents/service';
import { SchoolBusAssignment, SchoolBusRoute } from './models';
import { newId, schoolSections } from './sections';
import { norm } from './importSpec';
import { sendBusNoticeFor } from './buses';
import { liveHomeFor, markStop, nearNotice, tripHomes } from './busHomes';

// Live bus map (docs: scratchpad BUS_LIVE_MAP_PLAN.md, owner "go" 25 Nov 2026: option 1, the supervisor's phone).
// - The school adds bus supervisors, assigns routes and prints a one-time sign-in code (like parent codes; no password).
//   The phone keeps a signed token (typ 'bus-supervisor', never accepted as an ENARA session); "sign out all devices" bumps a version.
// - A supervisor starts a trip for an assigned route and direction, inside the school's trip hours; the phone sends its position.
//   Only the LATEST position is kept, in its own collection, deleted when the trip ends (and by a 6-hour TTL as a safety net).
//   A trip ends by itself after 2 hours. Trip history keeps who and when, never positions.
// - A parent sees the bus only while a trip runs, and only for the route and direction their child is assigned to today.
// Site switch SCHOOL_APP_BUS_LIVE_ENABLED (default off) and the school's own switch (default off) both have to be on, with the buses section.

export const busLiveSiteOn = () => /^(true|1|yes)$/i.test((process.env.SCHOOL_APP_BUS_LIVE_ENABLED ?? '').trim());
const TRIP_MAX_MS = 2 * 60 * 60 * 1000;
const STALE_MS = 2 * 60 * 1000;
const CODE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const DEFAULT_WINDOWS = [{ from: '06:00', to: '09:30' }, { from: '12:30', to: '17:00' }];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const cairoHm = (d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const cairoDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// ---- models -------------------------------------------------------------------------------------------------------------------
export interface IBusLiveSettings extends Document { institutionId: string; enabled: boolean; windows: { from: string; to: string }[]; routesOff: string[]; homesRoutes?: string[]; updatedBy?: string }
const settingsSchema = new Schema<IBusLiveSettings>({
  institutionId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  windows: { type: [{ from: String, to: String, _id: false }], default: undefined },
  routesOff: { type: [String], default: [] },
  homesRoutes: { type: [String], default: [] }, // door to door (busHomes.ts)
  updatedBy: String,
}, { timestamps: true });
export const BusLiveSettings = model<IBusLiveSettings>('BusLiveSettings', settingsSchema, 'school_bus_live_settings');

export interface IBusSupervisor extends Document {
  id: string; institutionId: string; name: string; phone?: string; routeKeys: string[]; active: boolean; tokenVersion: number;
  codeHash?: string; codeHint?: string; codeExpiresAt?: Date; lastSignInAt?: Date; createdBy: string;
}
const supervisorSchema = new Schema<IBusSupervisor>({
  id: { type: String, required: true, unique: true },
  institutionId: { type: String, required: true, index: true },
  name: { type: String, required: true, maxlength: 80 }, phone: { type: String, maxlength: 30 },
  routeKeys: { type: [String], default: [] }, active: { type: Boolean, default: true }, tokenVersion: { type: Number, default: 0 },
  codeHash: { type: String, index: true, sparse: true }, codeHint: String, codeExpiresAt: Date, lastSignInAt: Date, createdBy: { type: String, required: true },
}, { timestamps: true });
export const BusSupervisor = model<IBusSupervisor>('BusSupervisor', supervisorSchema, 'school_bus_supervisors');

export interface IBusTrip extends Document {
  id: string; institutionId: string; routeKey: string; direction: 'morning' | 'afternoon'; supervisorId: string; date: string;
  startedAt: Date; endedAt?: Date; endReason?: 'ended' | 'auto' | 'admin' | 'off'; endedBy?: string; lastAt?: Date;
}
const tripSchema = new Schema<IBusTrip>({
  id: { type: String, required: true, unique: true },
  institutionId: { type: String, required: true, index: true },
  routeKey: { type: String, required: true }, direction: { type: String, enum: ['morning', 'afternoon'], required: true },
  supervisorId: { type: String, required: true }, date: { type: String, required: true },
  startedAt: { type: Date, required: true }, endedAt: Date, endReason: String, endedBy: String, lastAt: Date,
}, { timestamps: true });
tripSchema.index({ institutionId: 1, routeKey: 1, direction: 1, endedAt: 1 });
export const BusTrip = model<IBusTrip>('BusTrip', tripSchema, 'school_bus_trips');

/** The latest position of a running trip. One document per trip; deleted when the trip ends; TTL 6 h as a safety net. */
export interface IBusLivePosition extends Document { tripId: string; institutionId: string; lat: number; lng: number; accuracy?: number; speed?: number; heading?: number; at: Date }
const positionSchema = new Schema<IBusLivePosition>({
  tripId: { type: String, required: true, unique: true }, institutionId: { type: String, required: true },
  lat: { type: Number, required: true }, lng: { type: Number, required: true }, accuracy: Number, speed: Number, heading: Number,
  at: { type: Date, required: true },
});
positionSchema.index({ at: 1 }, { expireAfterSeconds: 6 * 60 * 60 });
export const BusLivePosition = model<IBusLivePosition>('BusLivePosition', positionSchema, 'school_bus_live_positions');

/** Map pins for stops (kept apart from the bus sheet, so a new import keeps them). */
export interface IBusStopPin extends Document { institutionId: string; routeKey: string; stopKey: string; lat: number; lng: number }
const pinSchema = new Schema<IBusStopPin>({
  institutionId: { type: String, required: true }, routeKey: { type: String, required: true }, stopKey: { type: String, required: true },
  lat: { type: Number, required: true }, lng: { type: Number, required: true },
}, { timestamps: true });
pinSchema.index({ institutionId: 1, routeKey: 1, stopKey: 1 }, { unique: true });
export const BusStopPin = model<IBusStopPin>('BusStopPin', pinSchema, 'school_bus_stop_pins');

// ---- helpers ------------------------------------------------------------------------------------------------------------------
type Actor = { id: string; role: string; institutionId?: string };
const scope = (actor: Actor, institutionId?: unknown) => {
  const id = actor.role === 'enara-admin' && typeof institutionId === 'string' ? institutionId : actor.institutionId;
  if (!id || (actor.role !== 'enara-admin' && actor.role !== 'admin')) throw new AppError('Access denied', 403, 'FORBIDDEN');
  return id;
};
const requireSite = () => { if (!busLiveSiteOn()) throw new AppError('Route not found', 404, 'NOT_FOUND'); };
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function settingsOf(institutionId: string) {
  const s = await BusLiveSettings.findOne({ institutionId }).lean();
  return { enabled: !!s?.enabled, windows: s?.windows?.length ? s.windows : DEFAULT_WINDOWS, routesOff: s?.routesOff ?? [] };
}
export const inWindow = (windows: { from: string; to: string }[], now = new Date()) => { const hm = cairoHm(now); return windows.some((w) => w.from <= hm && hm < w.to); };
async function liveOnFor(institutionId: string, routeKey: string) {
  if (!busLiveSiteOn() || !(await schoolSections(institutionId)).buses) return false;
  const s = await settingsOf(institutionId);
  return s.enabled && !s.routesOff.includes(routeKey);
}

/** Ends a trip and deletes its position. */
async function endTrip(trip: { id: string; institutionId: string }, reason: 'ended' | 'auto' | 'admin' | 'off', by: string, at = new Date()) {
  await BusTrip.updateOne({ id: trip.id, endedAt: { $exists: false } }, { $set: { endedAt: at, endReason: reason, endedBy: by } });
  await BusLivePosition.deleteOne({ tripId: trip.id });
}
/** Running trips (ends the ones past 2 hours on the way). */
async function runningTrips(filter: Record<string, unknown>, now = new Date()) {
  const trips = await BusTrip.find({ ...filter, endedAt: { $exists: false } }).lean();
  const live: typeof trips = [];
  for (const t of trips) {
    if (now.getTime() - new Date(t.startedAt).getTime() > TRIP_MAX_MS) await endTrip(t, 'auto', 'system', now);
    else live.push(t);
  }
  return live;
}

// Codes: BUS-XXXX-XXXX from an alphabet without look-alikes; stored as a hash; shown once.
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 8 }, () => ALPHA[randomInt(ALPHA.length)]).join('');
export const normalizeBusCode = (input: unknown) => { const raw = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^BUS/, ''); return /^[A-Z0-9]{8}$/.test(raw) ? raw : null; };
const hashBusCode = (n: string) => createHash('sha256').update(`bus-supervisor:${n}`).digest('hex');
const INVALID = 'Code not valid or expired';

const TOKEN_TYP = 'bus-supervisor';
export function signSupervisorToken(s: { id: string; institutionId: string; tokenVersion: number }) {
  return jwt.sign({ typ: TOKEN_TYP, sid: s.id, iid: s.institutionId, v: s.tokenVersion }, getConfig().jwtSecret, { expiresIn: '180d', audience: 'enara-bus' });
}
export async function supervisorFromToken(token: string | undefined) {
  if (!token) throw new AppError('Sign in with the code from your school', 401, 'UNAUTHORIZED');
  let p: { typ?: string; sid?: string; iid?: string; v?: number };
  try { p = jwt.verify(token, getConfig().jwtSecret, { audience: 'enara-bus' }) as typeof p; } catch { throw new AppError('Sign in with the code from your school', 401, 'UNAUTHORIZED'); }
  if (p.typ !== TOKEN_TYP || !p.sid) throw new AppError('Sign in with the code from your school', 401, 'UNAUTHORIZED');
  const s = await BusSupervisor.findOne({ id: p.sid }).lean();
  if (!s || !s.active || s.tokenVersion !== p.v || s.institutionId !== p.iid) throw new AppError('Signed out by the school. Ask for a new code.', 401, 'UNAUTHORIZED');
  return s;
}

// ---- school admin -------------------------------------------------------------------------------------------------------------
export async function adminView(actor: Actor, institutionId?: unknown, now = new Date()) {
  requireSite();
  const school = scope(actor, institutionId);
  const [settings, routes, sups, pins, running, history] = await Promise.all([
    settingsOf(school),
    SchoolBusRoute.find({ institutionId: school }).sort({ routeName: 1 }).lean(),
    BusSupervisor.find({ institutionId: school, active: true }).sort({ name: 1 }).lean(),
    BusStopPin.find({ institutionId: school }).lean(),
    runningTrips({ institutionId: school }, now),
    BusTrip.find({ institutionId: school }).sort({ startedAt: -1 }).limit(30).lean(),
  ]);
  const positions = new Map((await BusLivePosition.find({ tripId: { $in: running.map((t) => t.id) } }).lean()).map((p) => [p.tripId, p]));
  const supName = new Map((await BusSupervisor.find({ institutionId: school }).select('id name').lean()).map((s) => [s.id, s.name]));
  const routeName = new Map(routes.map((r) => [r.routeKey, r.routeName]));
  return {
    siteOn: true, sectionOn: (await schoolSections(school)).buses, ...settings, defaultWindows: DEFAULT_WINDOWS, inWindowNow: inWindow(settings.windows, now),
    routes: routes.map((r) => ({
      routeKey: r.routeKey, routeName: r.routeName, busNumber: r.busNumber ?? null, liveOn: !settings.routesOff.includes(r.routeKey),
      sheetSupervisor: r.supervisorName ? { name: r.supervisorName, phone: r.supervisorPhone ?? null } : null,
      stops: r.stops.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((s) => { const p = pins.find((x) => x.routeKey === r.routeKey && x.stopKey === norm(s.name)); return { name: s.name, lat: p?.lat ?? null, lng: p?.lng ?? null }; }),
    })),
    supervisors: sups.map((s) => ({ id: s.id, name: s.name, phone: s.phone ?? null, routeKeys: s.routeKeys, hasCode: !!s.codeHash && !!s.codeExpiresAt && s.codeExpiresAt > now, codeHint: s.codeHint ?? null, lastSignInAt: s.lastSignInAt ?? null })),
    running: running.map((t) => { const p = positions.get(t.id); return { id: t.id, routeKey: t.routeKey, routeName: routeName.get(t.routeKey) ?? t.routeKey, direction: t.direction, supervisor: supName.get(t.supervisorId) ?? '', startedAt: t.startedAt, position: p ? { lat: p.lat, lng: p.lng, at: p.at } : null }; }),
    history: history.map((t) => ({ id: t.id, routeName: routeName.get(t.routeKey) ?? t.routeKey, direction: t.direction, supervisor: supName.get(t.supervisorId) ?? '', startedAt: t.startedAt, endedAt: t.endedAt ?? null, endReason: t.endReason ?? null })),
  };
}

export async function saveSettings(actor: Actor, body: Record<string, unknown>) {
  requireSite();
  const school = scope(actor, body.institutionId);
  const before = await settingsOf(school);
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : before.enabled;
  let windows = before.windows;
  if (body.windows !== undefined) {
    if (!Array.isArray(body.windows) || body.windows.length < 1 || body.windows.length > 4) throw new AppError('Give 1 to 4 trip windows', 400, 'VALIDATION_ERROR');
    windows = body.windows.map((w) => { const f = str((w as { from?: unknown }).from, 5); const t = str((w as { to?: unknown }).to, 5); if (!HM.test(f) || !HM.test(t) || f >= t) throw new AppError('Each window needs a start before its end (HH:MM)', 400, 'VALIDATION_ERROR'); return { from: f, to: t }; });
  }
  let routesOff = before.routesOff;
  if (body.routesOff !== undefined) {
    if (!Array.isArray(body.routesOff)) throw new AppError('routesOff must be a list', 400, 'VALIDATION_ERROR');
    routesOff = [...new Set(body.routesOff.map((r) => norm(r)).filter(Boolean))].slice(0, 500);
  }
  await BusLiveSettings.updateOne({ institutionId: school }, { $set: { enabled, windows, routesOff, updatedBy: actor.id } }, { upsert: true });
  // Switching off (school or a route) ends the trips it covers right away: no position is shared after that.
  const running = await runningTrips({ institutionId: school });
  for (const t of running) if (!enabled || routesOff.includes(t.routeKey)) await endTrip(t, 'off', actor.id);
  await recordAudit('bus_live_settings_changed', actor, { institutionId: school, type: 'bus_live_settings', id: school }, { from: before, to: { enabled, windows, routesOff } });
  return { enabled, windows, routesOff };
}

async function routeKeysOf(school: string, input: unknown) {
  if (!Array.isArray(input)) throw new AppError('routeKeys must be a list', 400, 'VALIDATION_ERROR');
  const keys = [...new Set(input.map((r) => norm(r)).filter(Boolean))];
  const found = new Set((await SchoolBusRoute.find({ institutionId: school, routeKey: { $in: keys } }).select('routeKey').lean()).map((r) => r.routeKey));
  const missing = keys.filter((k) => !found.has(k));
  if (missing.length) throw new AppError(`Unknown route: ${missing.join(', ')}`, 400, 'VALIDATION_ERROR');
  return keys;
}

export async function addSupervisor(actor: Actor, body: Record<string, unknown>) {
  requireSite();
  const school = scope(actor, body.institutionId);
  const name = str(body.name, 80);
  if (name.length < 2) throw new AppError('A name is required', 400, 'VALIDATION_ERROR');
  const phone = str(body.phone, 30) || undefined;
  const routeKeys = await routeKeysOf(school, body.routeKeys ?? []);
  const s = await BusSupervisor.create({ id: newId('bsv'), institutionId: school, name, phone, routeKeys, createdBy: actor.id });
  await recordAudit('bus_supervisor_added', actor, { institutionId: school, type: 'bus_supervisor', id: s.id }, { routes: routeKeys });
  return { id: s.id, name, phone: phone ?? null, routeKeys };
}

async function ownSupervisor(actor: Actor, id: string, institutionId?: unknown) {
  const school = scope(actor, institutionId);
  const s = await BusSupervisor.findOne({ id, institutionId: school, active: true });
  if (!s) throw new AppError('Supervisor not found', 404, 'NOT_FOUND');
  return s;
}

export async function updateSupervisor(actor: Actor, id: string, body: Record<string, unknown>) {
  requireSite();
  const s = await ownSupervisor(actor, id, body.institutionId);
  if (body.name !== undefined) { const name = str(body.name, 80); if (name.length < 2) throw new AppError('A name is required', 400, 'VALIDATION_ERROR'); s.name = name; }
  if (body.phone !== undefined) s.phone = str(body.phone, 30) || undefined;
  if (body.routeKeys !== undefined) s.routeKeys = await routeKeysOf(s.institutionId, body.routeKeys);
  await s.save();
  // A route taken away ends that supervisor's trip on it.
  for (const t of await runningTrips({ institutionId: s.institutionId, supervisorId: s.id })) if (!s.routeKeys.includes(t.routeKey)) await endTrip(t, 'admin', actor.id);
  await recordAudit('bus_supervisor_updated', actor, { institutionId: s.institutionId, type: 'bus_supervisor', id: s.id }, { routes: s.routeKeys });
  return { id: s.id, name: s.name, phone: s.phone ?? null, routeKeys: s.routeKeys };
}

/** Removes a supervisor: every device is signed out and their running trips end. */
export async function removeSupervisor(actor: Actor, id: string, institutionId?: unknown) {
  requireSite();
  const s = await ownSupervisor(actor, id, institutionId);
  s.active = false; s.tokenVersion += 1; s.codeHash = undefined; s.codeExpiresAt = undefined; await s.save();
  for (const t of await runningTrips({ institutionId: s.institutionId, supervisorId: s.id })) await endTrip(t, 'admin', actor.id);
  await recordAudit('bus_supervisor_removed', actor, { institutionId: s.institutionId, type: 'bus_supervisor', id: s.id }, {});
  return { id: s.id, removed: true };
}

/** A new one-time sign-in code (valid 14 days, works once). Shown once; only its hash is kept. */
export async function newSupervisorCode(actor: Actor, id: string, institutionId?: unknown) {
  requireSite();
  const s = await ownSupervisor(actor, id, institutionId);
  let code = genCode();
  for (let i = 0; i < 5 && (await BusSupervisor.exists({ codeHash: hashBusCode(code) })); i++) code = genCode();
  s.codeHash = hashBusCode(code); s.codeHint = code.slice(-2); s.codeExpiresAt = new Date(Date.now() + CODE_TTL_MS); await s.save();
  await recordAudit('bus_supervisor_code_created', actor, { institutionId: s.institutionId, type: 'bus_supervisor', id: s.id }, {});
  return { code: `BUS-${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: s.codeExpiresAt };
}

export async function signOutSupervisor(actor: Actor, id: string, institutionId?: unknown) {
  requireSite();
  const s = await ownSupervisor(actor, id, institutionId);
  s.tokenVersion += 1; await s.save();
  for (const t of await runningTrips({ institutionId: s.institutionId, supervisorId: s.id })) await endTrip(t, 'admin', actor.id);
  await recordAudit('bus_supervisor_signed_out', actor, { institutionId: s.institutionId, type: 'bus_supervisor', id: s.id }, {});
  return { id: s.id, signedOut: true };
}

export async function setStopPin(actor: Actor, body: Record<string, unknown>) {
  requireSite();
  const school = scope(actor, body.institutionId);
  const route = await SchoolBusRoute.findOne({ institutionId: school, routeKey: norm(body.routeKey) }).lean();
  if (!route) throw new AppError('Route not found', 404, 'NOT_FOUND');
  const stop = route.stops.find((s) => norm(s.name) === norm(body.stopName));
  if (!stop) throw new AppError('Stop not found on this route', 404, 'NOT_FOUND');
  const key = { institutionId: school, routeKey: route.routeKey, stopKey: norm(stop.name) };
  if (body.lat === null || body.lng === null) { await BusStopPin.deleteOne(key); return { ...key, lat: null, lng: null }; }
  const lat = num(body.lat, -90, 90); const lng = num(body.lng, -180, 180);
  if (lat === null || lng === null) throw new AppError('lat and lng are required', 400, 'VALIDATION_ERROR');
  await BusStopPin.updateOne(key, { $set: { lat, lng } }, { upsert: true });
  await recordAudit('bus_stop_pinned', actor, { institutionId: school, type: 'bus_route', id: route.routeKey }, { stop: stop.name });
  return { ...key, lat, lng };
}

export async function adminEndTrip(actor: Actor, tripId: string, institutionId?: unknown) {
  requireSite();
  const school = scope(actor, institutionId);
  const t = await BusTrip.findOne({ id: tripId, institutionId: school }).lean();
  if (!t) throw new AppError('Trip not found', 404, 'NOT_FOUND');
  await endTrip(t, 'admin', actor.id);
  await recordAudit('bus_trip_stopped_by_school', actor, { institutionId: school, type: 'bus_trip', id: t.id }, {});
  return { id: t.id, ended: true };
}

// ---- the supervisor's phone ---------------------------------------------------------------------------------------------------
export async function redeemSupervisorCode(input: unknown) {
  requireSite();
  const n = normalizeBusCode(input);
  const s = n ? await BusSupervisor.findOne({ codeHash: hashBusCode(n), active: true }) : null;
  if (!s || !s.codeExpiresAt || s.codeExpiresAt <= new Date()) throw new AppError(INVALID, 400, 'INVALID_CODE');
  s.codeHash = undefined; s.codeExpiresAt = undefined; s.lastSignInAt = new Date(); await s.save(); // works once
  await recordAudit('bus_supervisor_signed_in', { id: s.id, role: 'bus_supervisor' }, { institutionId: s.institutionId, type: 'bus_supervisor', id: s.id }, {});
  return { token: signSupervisorToken(s), ...(await supervisorHome(s)) };
}

type Sup = { id: string; institutionId: string; name: string; routeKeys: string[] };
export async function supervisorHome(s: Sup, now = new Date()) {
  const settings = await settingsOf(s.institutionId);
  const routes = await SchoolBusRoute.find({ institutionId: s.institutionId, routeKey: { $in: s.routeKeys } }).lean();
  const running = await runningTrips({ institutionId: s.institutionId, supervisorId: s.id }, now);
  const sectionOn = busLiveSiteOn() && (await schoolSections(s.institutionId)).buses;
  return {
    supervisor: { name: s.name },
    liveOn: sectionOn && settings.enabled, windows: settings.windows, inWindowNow: inWindow(settings.windows, now),
    routes: routes.map((r) => ({ routeKey: r.routeKey, routeName: r.routeName, busNumber: r.busNumber ?? null, liveOn: !settings.routesOff.includes(r.routeKey), stops: r.stops.length })),
    trip: running[0] ? { id: running[0].id, routeKey: running[0].routeKey, direction: running[0].direction, startedAt: running[0].startedAt, endsBy: new Date(new Date(running[0].startedAt).getTime() + TRIP_MAX_MS), homes: await tripHomes(running[0], now) } : null,
  };
}

export async function startTrip(s: Sup, body: Record<string, unknown>, now = new Date()) {
  requireSite();
  const routeKey = norm(body.routeKey);
  const direction = body.direction === 'afternoon' ? 'afternoon' : body.direction === 'morning' ? 'morning' : null;
  if (!direction) throw new AppError("direction must be 'morning' or 'afternoon'", 400, 'VALIDATION_ERROR');
  if (!s.routeKeys.includes(routeKey)) throw new AppError('This route is not assigned to you', 403, 'FORBIDDEN');
  if (!(await liveOnFor(s.institutionId, routeKey))) throw new AppError('The live bus map is switched off for this route', 409, 'LIVE_OFF');
  const settings = await settingsOf(s.institutionId);
  if (!inWindow(settings.windows, now)) throw new AppError('Trips can only start during the school’s trip hours', 409, 'OUTSIDE_HOURS');
  const mine = await runningTrips({ institutionId: s.institutionId, supervisorId: s.id }, now);
  const same = mine.find((t) => t.routeKey === routeKey && t.direction === direction);
  if (same) return { id: same.id, routeKey, direction, startedAt: same.startedAt, resumed: true };
  for (const t of mine) await endTrip(t, 'ended', s.id, now); // one trip at a time per supervisor
  const other = await runningTrips({ institutionId: s.institutionId, routeKey, direction }, now);
  if (other.length) throw new AppError('Another supervisor is already sharing this trip', 409, 'TRIP_RUNNING');
  const trip = await BusTrip.create({ id: newId('btr'), institutionId: s.institutionId, routeKey, direction, supervisorId: s.id, date: cairoDate(now), startedAt: now });
  await recordAudit('bus_trip_started', { id: s.id, role: 'bus_supervisor' }, { institutionId: s.institutionId, type: 'bus_trip', id: trip.id }, { route: routeKey, direction });
  return { id: trip.id, routeKey, direction, startedAt: trip.startedAt, resumed: false };
}

async function myRunningTrip(s: Sup, tripId: string, now = new Date()) {
  const t = (await runningTrips({ id: tripId, institutionId: s.institutionId, supervisorId: s.id }, now))[0];
  if (!t) throw new AppError('This trip has ended', 409, 'TRIP_ENDED');
  return t;
}

export async function sendPosition(s: Sup, tripId: string, body: Record<string, unknown>, now = new Date()) {
  const t = await myRunningTrip(s, tripId, now);
  if (!(await liveOnFor(s.institutionId, t.routeKey))) { await endTrip(t, 'off', 'system', now); throw new AppError('The live bus map was switched off', 409, 'LIVE_OFF'); }
  const lat = num(body.lat, -90, 90); const lng = num(body.lng, -180, 180);
  if (lat === null || lng === null) throw new AppError('lat and lng are required', 400, 'VALIDATION_ERROR');
  const accuracy = num(body.accuracy, 0, 100000) ?? undefined; const speed = num(body.speed, 0, 100) ?? undefined; const heading = num(body.heading, 0, 360) ?? undefined;
  await BusLivePosition.updateOne({ tripId: t.id }, { $set: { institutionId: t.institutionId, lat, lng, accuracy, speed, heading, at: now } }, { upsert: true });
  await BusTrip.updateOne({ id: t.id }, { $set: { lastAt: now } });
  try { await nearNotice(t, { lat, lng, speed }, now); } catch { /* the position is saved; the notice is best effort */ }
  return { ok: true, at: now };
}

export async function supervisorEndTrip(s: Sup, tripId: string) {
  const t = await BusTrip.findOne({ id: tripId, institutionId: s.institutionId, supervisorId: s.id }).lean();
  if (!t) throw new AppError('Trip not found', 404, 'NOT_FOUND');
  await endTrip(t, 'ended', s.id);
  await recordAudit('bus_trip_ended', { id: s.id, role: 'bus_supervisor' }, { institutionId: s.institutionId, type: 'bus_trip', id: t.id }, {});
  return { id: t.id, ended: true };
}

/** Door to door: Picked up / Dropped off / Not riding today for a child of the running trip. */
export async function supervisorStop(s: Sup, tripId: string, body: Record<string, unknown>) {
  const t = await myRunningTrip(s, tripId);
  return markStop(t, s.id, body);
}

/** "Running late" / "Trip cancelled" from the phone: the same notices (and parent notifications) as the school's. */
export async function supervisorNotice(s: Sup, tripId: string, body: Record<string, unknown>) {
  const t = await myRunningTrip(s, tripId);
  return sendBusNoticeFor(t.institutionId, { id: s.id, role: 'bus_supervisor' }, { route: t.routeKey, direction: t.direction, kind: body.kind, minutes: body.minutes, message: body.message });
}

// ---- parents ------------------------------------------------------------------------------------------------------------------
const R = 6371000;
const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
/** A rough arrival estimate: road distance taken as 1.4 × the straight line, at the bus's speed (or 20 km/h in town). */
export const etaMinutes = (bus: { lat: number; lng: number; speed?: number | null }, stop: { lat: number; lng: number }) => {
  const d = meters(bus, stop) * 1.4;
  const v = bus.speed && bus.speed > 2 ? Math.min(bus.speed, 16) : 20 / 3.6;
  return Math.max(1, Math.round(d / v / 60));
};

/** One child's live bus: for each of today's trips (morning / afternoon) that is running now. Nothing outside a running trip. */
export async function liveForParent(ctx: LearnerContext, now = new Date()) {
  const school = ctx.link.institutionId ?? ctx.student.institutionId;
  if (!school || !busLiveSiteOn() || !(await schoolSections(school)).buses) return { on: false, trips: [] };
  const settings = await settingsOf(school);
  if (!settings.enabled) return { on: false, trips: [] };
  const today = cairoDate(now);
  const assignments = (await SchoolBusAssignment.find({ institutionId: school, studentId: ctx.student.id }).lean())
    .filter((a) => (!a.validFrom || a.validFrom <= today) && (!a.validTo || a.validTo >= today) && !settings.routesOff.includes(a.routeKey));
  const out: unknown[] = [];
  for (const dir of ['morning', 'afternoon'] as const) {
    const a = assignments.find((x) => x.direction === dir) ?? assignments.find((x) => x.direction === 'both');
    if (!a) continue;
    const trip = (await runningTrips({ institutionId: school, routeKey: a.routeKey, direction: dir }, now))[0];
    if (!trip) continue;
    const p = await BusLivePosition.findOne({ tripId: trip.id }).lean();
    const pin = await BusStopPin.findOne({ institutionId: school, routeKey: a.routeKey, stopKey: norm(a.stopName) }).lean();
    const stale = !p || now.getTime() - new Date(p.at).getTime() > STALE_MS;
    const d2d = await liveHomeFor(school, ctx.student.id, trip, p && !stale ? { lat: p.lat, lng: p.lng, speed: p.speed } : null, now);
    if (d2d) {
      out.push({
        direction: dir, tripId: trip.id, startedAt: trip.startedAt, doorToDoor: true,
        bus: p ? { lat: p.lat, lng: p.lng, at: p.at, heading: p.heading ?? null } : null, stale,
        stop: { name: 'home', lat: d2d.home?.lat ?? null, lng: d2d.home?.lng ?? null }, etaMin: d2d.etaMin, childStatus: d2d.status, childStatusAt: d2d.at,
      });
      continue;
    }
    out.push({
      direction: dir, tripId: trip.id, startedAt: trip.startedAt,
      bus: p ? { lat: p.lat, lng: p.lng, at: p.at, heading: p.heading ?? null } : null, stale,
      stop: pin ? { name: a.stopName, lat: pin.lat, lng: pin.lng } : { name: a.stopName, lat: null, lng: null },
      etaMin: p && pin && !stale ? etaMinutes(p, pin) : null,
    });
  }
  return { on: true, trips: out };
}

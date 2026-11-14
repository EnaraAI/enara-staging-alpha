import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { signAccessToken, verifyAccessToken } from '../auth/jwt';
import { DEMO_LIMITS, DEMO_SESSION_PREFIX, DEMO_TEMPLATE_ID, isDemoSessionInstitution, type DemoRole } from '../config/demo';
import { AppError } from '../middleware/errorHandler';
import { DemoSession } from '../models/DemoSession';
import { Institution } from '../models/Institution';
import { BudgetCounter, OrgBudget } from '../models/OrgBudget';
import { User } from '../models/User';
import { logger, serializeError } from '../utils/logging';

// Partner demo sessions. Each one-click sign-in gets its own school, copied
// from the demo template (Enara admins build and edit the template like any
// school). Every copied record gets new ids, its own accounts and the
// template's dates moved forward to today, so a session always looks fresh.
// The session's school is deleted when the browser closes (no check-in for
// DEMO_LIMITS.idleMs), when it is 4 h old, or when the visitor ends it.

// Never copied from the template: spend and usage records, limits, keys,
// tokens, audit and sign-in history, live calls, and settings created fresh.
const NOT_COPIED = new Set([
  'AiCall', 'AiControl', 'AlertEvent', 'ApiKey', 'AuditEvent', 'AvatarSession', 'BudgetCounter', 'BudgetReservation',
  'CommercialPlan', 'DemoSession', 'HybridAnchorSet', 'HybridShadowResult', 'Institution', 'Invitation', 'OrgBudget',
  'PasswordReset', 'PriceCatalogRow', 'ReminderLog', 'SignInEvent', 'UsageEvent', 'UsageLedger',
]);
// Kept when a session is wiped: what it spent (budgets and reports count it).
const KEPT_ON_PURGE = new Set(['AiCall', 'UsageLedger', 'BudgetCounter', 'BudgetReservation', 'AlertEvent', 'AuditEvent', 'DemoSession', 'PriceCatalogRow', 'HybridAnchorSet']);

// Fixed template accounts (their emails carry the template id, so each copy
// gets its own addresses).
export const DEMO_TEMPLATE_EMAILS: Record<DemoRole, string> = {
  student: `student@${DEMO_TEMPLATE_ID}.demo.enara.test`,
  teacher: `teacher@${DEMO_TEMPLATE_ID}.demo.enara.test`,
  admin: `admin@${DEMO_TEMPLATE_ID}.demo.enara.test`,
};

const schoolModels = () =>
  mongoose.modelNames()
    .map((name) => mongoose.model(name))
    .filter((m) => Boolean(m.schema.path('institutionId')));

const hashIp = (ip: string) => crypto.createHash('sha256').update(`demo:${ip}`).digest('hex');

type Plain = Record<string, unknown>;

// Copies the template school into `inst`. Returns the copied user ids by email.
export async function copyTemplateSchool(inst: string, now = new Date()): Promise<Map<string, string>> {
  const models = schoolModels().filter((m) => !NOT_COPIED.has(m.modelName));
  const docs = new Map<string, Plain[]>();
  for (const m of models) {
    const rows = (await m.collection.find({ institutionId: DEMO_TEMPLATE_ID }).toArray()) as Plain[];
    if (rows.length) docs.set(m.modelName, rows);
  }
  if (!docs.get('User')?.length) throw new AppError('The demo is not ready yet', 503, 'DEMO_NOT_READY');

  // New ids for every record, and the newest template date as the anchor
  // that maps to "now".
  const sfx = crypto.randomBytes(3).toString('hex');
  const exact = new Map<string, string>();
  const objectIds = new Map<string, Types.ObjectId>();
  let anchor = 0;
  const newId = (old: string) => (old.includes(DEMO_TEMPLATE_ID) ? old.split(DEMO_TEMPLATE_ID).join(inst) : `${old}-${sfx}`);
  const scanDates = (v: unknown): void => {
    if (v instanceof Date) anchor = Math.max(anchor, v.getTime() <= now.getTime() ? v.getTime() : 0);
    else if (Array.isArray(v)) v.forEach(scanDates);
    else if (v && typeof v === 'object' && !(v instanceof Types.ObjectId) && !Buffer.isBuffer(v)) Object.values(v).forEach(scanDates);
  };
  for (const rows of docs.values()) {
    for (const d of rows) {
      if (d._id instanceof Types.ObjectId) {
        const fresh = new Types.ObjectId();
        objectIds.set(d._id.toHexString(), fresh);
        exact.set(d._id.toHexString(), fresh.toHexString());
      }
      if (typeof d.id === 'string' && d.id) exact.set(d.id, newId(d.id));
      scanDates(d);
    }
  }
  const shift = anchor ? now.getTime() - anchor : 0;
  // Ids inside longer strings (keys such as `msg:<session>:<message>`).
  const embedded = [...exact.entries()].filter(([old]) => old.length >= 8).sort((a, b) => b[0].length - a[0].length);
  const mapString = (s: string): string => {
    const hit = exact.get(s);
    if (hit !== undefined) return hit;
    let out = s;
    if (out.length > 8) for (const [old, fresh] of embedded) if (out.includes(old)) out = out.split(old).join(fresh);
    return out.includes(DEMO_TEMPLATE_ID) ? out.split(DEMO_TEMPLATE_ID).join(inst) : out;
  };
  const map = (v: unknown): unknown => {
    if (typeof v === 'string') return mapString(v);
    if (v instanceof Types.ObjectId) return objectIds.get(v.toHexString()) ?? v;
    if (v instanceof Date) return new Date(v.getTime() + shift);
    if (Array.isArray(v)) return v.map(map);
    if (v && typeof v === 'object' && !Buffer.isBuffer(v)) return Object.fromEntries(Object.entries(v as Plain).map(([k, x]) => [mapString(k), map(x)]));
    return v;
  };

  const users = new Map<string, string>();
  for (const [name, rows] of docs) {
    const model = mongoose.model(name);
    const copies = rows.map((d) => {
      const c = map(d) as Plain;
      c.institutionId = inst;
      // Each demo is its own school: its records are that school's real
      // activity (dashboards hide 'demo_seed' sample rows by default).
      if (model.schema.path('origin')) c.origin = 'live';
      if (name === 'User') {
        c.status = 'active';
        users.set(String(c.email), (c._id as Types.ObjectId).toHexString());
      }
      return c;
    });
    await model.collection.insertMany(copies, { ordered: false });
  }
  return users;
}

// Deletes everything a session school holds, except its spend records.
export async function purgeDemoSchool(inst: string): Promise<number> {
  if (!isDemoSessionInstitution(inst)) throw new Error(`refusing to purge ${inst}: not a demo session school`);
  let removed = 0;
  for (const m of schoolModels()) {
    if (KEPT_ON_PURGE.has(m.modelName)) continue;
    removed += (await m.collection.deleteMany({ institutionId: inst })).deletedCount ?? 0;
  }
  removed += (await Institution.deleteMany({ id: inst })).deletedCount ?? 0;
  return removed;
}

function demoBudget(inst: string) {
  const cap = DEMO_LIMITS.sessionCapUsd;
  return {
    institutionId: inst,
    enforcementEnabled: true,
    dailyCapUsd: cap,
    monthlyCapUsd: cap,
    perUserDailyCapUsd: cap,
    gradingAllowanceUsd: Math.min(5, cap),
    intendedTools: ['anthropic:*', 'elevenlabs:tts', 'elevenlabs:stt', 'elevenlabs:speaking_exam_stt', 'anam:avatar_session'],
    maxReservationUsdPerCall: { 'anam:avatar_session': 1, 'elevenlabs:stt': 0.1, 'elevenlabs:speaking_exam_stt': 0.1, 'orchestrator:tutor_chat': 0.1, 'ingestion_engine:curriculum_ingestion': 0.5 },
  };
}

function tokenFor(user: { _id: Types.ObjectId; email: string; role: string; studentId?: string; institutionId?: string; tokenVersion?: number }) {
  return signAccessToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role as never,
    studentId: user.studentId,
    institutionId: user.institutionId,
    tokenVersion: user.tokenVersion ?? 0,
  } as never);
}

export async function demoSpendThisMonth(now: Date): Promise<number> {
  const c = await BudgetCounter.findById(`demo_spend:${now.toISOString().slice(0, 7)}`).select('committedMicros').lean();
  return Math.max(0, Number((c as { committedMicros?: number } | null)?.committedMicros ?? 0)) / 1_000_000;
}

export async function startDemoSession(role: DemoRole, ip: string, now = new Date()) {
  void sweepDemoSessions({ now, limit: 5 }).catch((error) => logger.warn('demo_sweep_failed', { error: serializeError(error) }));
  const ipHash = hashIp(ip || 'unknown');
  const recent = await DemoSession.countDocuments({ ipHash, createdAt: { $gte: new Date(now.getTime() - 24 * 3600_000) } });
  if (recent >= DEMO_LIMITS.sessionsPerIpPerDay) {
    throw new AppError(`You can start ${DEMO_LIMITS.sessionsPerIpPerDay} demo sessions a day. Please come back tomorrow.`, 429, 'DEMO_LIMIT');
  }
  if ((await demoSpendThisMonth(now)) >= DEMO_LIMITS.monthlyCapUsd) {
    throw new AppError('The demo is fully booked this month. Please contact Enara for a guided demo.', 503, 'DEMO_FULL');
  }
  const inst = `${DEMO_SESSION_PREFIX}${crypto.randomBytes(5).toString('hex')}`;
  const id = `demo-${crypto.randomBytes(8).toString('hex')}`;
  const created = await DemoSession.create({
    id, institutionId: inst, ipHash, users: {}, status: 'active', createdAt: now, lastSeenAt: now,
    expiresAt: new Date(now.getTime() + DEMO_LIMITS.maxSessionMs),
  });
  try {
    // The template's feature switches and learner settings come along.
    const template = await Institution.findOne({ id: DEMO_TEMPLATE_ID }).select('features learningSettings').lean();
    await Institution.create({ id: inst, name: 'Enara Demo School', ...(template?.features ? { features: template.features } : {}), ...(template?.learningSettings ? { learningSettings: template.learningSettings } : {}) });
    await OrgBudget.create(demoBudget(inst));
    const users = await copyTemplateSchool(inst, now);
    const byRole = Object.fromEntries(
      (Object.keys(DEMO_TEMPLATE_EMAILS) as DemoRole[]).map((r) => [r, users.get(DEMO_TEMPLATE_EMAILS[r].split(DEMO_TEMPLATE_ID).join(inst))]),
    ) as Record<DemoRole, string | undefined>;
    if (!byRole[role]) throw new AppError('The demo is not ready yet', 503, 'DEMO_NOT_READY');
    await DemoSession.updateOne({ id }, { $set: { users: byRole } });
    const user = await User.findById(byRole[role]).lean();
    if (!user) throw new AppError('The demo is not ready yet', 503, 'DEMO_NOT_READY');
    logger.info('demo_session_started', { session: id, institutionId: inst, role });
    return { sessionId: id, role, token: tokenFor(user as never), expiresAt: created.expiresAt, user: sessionUser(user) };
  } catch (error) {
    await endDemoSession(id, 'closed').catch(() => undefined);
    throw error;
  }
}

// What the browser keeps about the signed-in account (as /api/auth/login returns).
const sessionUser = (u: { email: string; name?: string; role: string; studentId?: string; institutionId?: string }) => ({
  // The product tour shows once per role in each demo.
  email: u.email, name: u.name, role: u.role, studentId: u.studentId, institutionId: u.institutionId, tourPending: !(u as { tourCompletedAt?: Date }).tourCompletedAt,
});

async function activeSessionFor(institutionId: string | undefined) {
  if (!isDemoSessionInstitution(institutionId)) throw new AppError('Not a demo session', 403, 'NOT_DEMO');
  const session = await DemoSession.findOne({ institutionId, status: 'active' });
  if (!session) throw new AppError('This demo session has ended. Start a new one from the demo page.', 410, 'DEMO_ENDED');
  return session;
}

export async function switchDemoRole(institutionId: string | undefined, role: DemoRole) {
  const session = await activeSessionFor(institutionId);
  const user = session.users?.[role] ? await User.findById(session.users[role]).lean() : null;
  if (!user) throw new AppError('That role is not available in this demo', 404, 'NOT_FOUND');
  session.lastSeenAt = new Date();
  await session.save();
  return { role, token: tokenFor(user as never), user: sessionUser(user) };
}

export async function demoHeartbeat(institutionId: string | undefined) {
  const session = await activeSessionFor(institutionId);
  // Open sessions keep the others tidy: closed ones are wiped within minutes.
  void sweepDemoSessions({ limit: 5 }).catch((error) => logger.warn('demo_sweep_failed', { error: serializeError(error) }));
  const now = new Date();
  if (now > session.expiresAt) {
    await endDemoSession(session.id, 'expired');
    throw new AppError('This demo session has ended. Start a new one from the demo page.', 410, 'DEMO_ENDED');
  }
  await DemoSession.updateOne({ id: session.id }, { $set: { lastSeenAt: now } });
  return { expiresAt: session.expiresAt };
}

// Ends a session from its token (sent with the page's last request when the
// browser closes, which can't carry headers).
export async function endDemoSessionByToken(token: string) {
  let institutionId: string | undefined;
  try {
    const user = await User.findById(verifyAccessToken(token).subject).select('institutionId').lean();
    institutionId = user?.institutionId;
  } catch {
    return;
  }
  if (!isDemoSessionInstitution(institutionId)) return;
  const session = await DemoSession.findOne({ institutionId, status: 'active' }).select('id').lean();
  if (session) await endDemoSession(session.id, 'closed');
}

export async function endDemoSession(id: string, reason: 'closed' | 'idle' | 'expired' | 'replaced') {
  const session = await DemoSession.findOneAndUpdate({ id }, { $set: { status: 'ended', endedAt: new Date(), endReason: reason } }, { new: true }).lean();
  if (!session) return;
  const removed = await purgeDemoSchool(session.institutionId);
  logger.info('demo_session_ended', { session: id, institutionId: session.institutionId, reason, removed });
}

// Ends idle and expired sessions, and wipes ended ones whose school is still there.
export async function sweepDemoSessions(opts: { now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const stale = await DemoSession.find({
    status: 'active',
    $or: [{ lastSeenAt: { $lt: new Date(now.getTime() - DEMO_LIMITS.idleMs) } }, { expiresAt: { $lt: now } }],
  }).limit(opts.limit ?? 50).lean();
  for (const s of stale) await endDemoSession(s.id, s.expiresAt < now ? 'expired' : 'idle');
  const leftovers = await DemoSession.find({ status: 'ended', endedAt: { $gte: new Date(now.getTime() - 7 * 86400_000) } }).select('institutionId').limit(opts.limit ?? 50).lean();
  for (const s of leftovers) {
    if (await Institution.exists({ id: s.institutionId })) await purgeDemoSchool(s.institutionId);
  }
  return { ended: stale.length };
}

// For Enara admins building the template: a token for one template account.
export async function templateToken(role: DemoRole, studentNumber?: number) {
  // Students 2-6 of the template class, to add their work too.
  const email = role === 'student' && studentNumber && studentNumber > 1 ? `student${studentNumber}@${DEMO_TEMPLATE_ID}.demo.enara.test` : DEMO_TEMPLATE_EMAILS[role];
  const user = await User.findOne({ email, institutionId: DEMO_TEMPLATE_ID }).lean();
  if (!user) throw new AppError('Build the demo template first', 404, 'NOT_FOUND');
  return { role, token: tokenFor(user as never) };
}

export async function demoStatus(now = new Date()) {
  const [ready, active, spent] = await Promise.all([
    User.exists({ email: DEMO_TEMPLATE_EMAILS.student, institutionId: DEMO_TEMPLATE_ID }),
    DemoSession.countDocuments({ status: 'active' }),
    demoSpendThisMonth(now),
  ]);
  return { ready: Boolean(ready), activeSessions: active, spentThisMonthUsd: Math.round(spent * 100) / 100, monthlyCapUsd: DEMO_LIMITS.monthlyCapUsd, full: spent >= DEMO_LIMITS.monthlyCapUsd };
}

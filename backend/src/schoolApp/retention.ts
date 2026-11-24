import { logger, serializeError } from '../utils/logging';
import { ParentNotification, SchoolBusAssignment, SchoolBusNotice, SchoolChatLog, SchoolConsent, SchoolDailyAttendance, SchoolImport, SchoolInstalment, SchoolRequest } from './models';
import { receiptStore } from './fees';

// Parents school app: how long each kind of school data is kept, one setting per data type (days). Read at run time from
//   SCHOOL_APP_RETENTION_DAYS   JSON, for example {"attendance":730,"chat":90}  (only the types given change)
//   SCHOOL_APP_RETENTION_<TYPE>_DAYS   one type, for example SCHOOL_APP_RETENTION_CHAT_DAYS=60  (wins over the JSON)
// 0 or unset falls back to the default. The daily job deletes what is older. Student erasure (studentErasure.ts) removes a child's rows
// at once, whatever these settings say.
export const RETENTION_TYPES = ['attendance', 'fees', 'buses', 'consents', 'requests', 'chat', 'notifications', 'imports'] as const;
export type RetentionType = (typeof RETENTION_TYPES)[number];
export const RETENTION_DEFAULT_DAYS: Record<RetentionType, number> = { attendance: 730, fees: 1825, buses: 365, consents: 1095, requests: 730, chat: 90, notifications: 365, imports: 90 };

export function retentionDays(env: NodeJS.ProcessEnv = process.env): Record<RetentionType, number> {
  let json: Record<string, unknown> = {};
  try { json = env.SCHOOL_APP_RETENTION_DAYS ? JSON.parse(env.SCHOOL_APP_RETENTION_DAYS) : {}; } catch { logger.warn('school_app_retention_setting_unreadable', {}); }
  const pick = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 36_500 ? Math.round(n) : null; };
  return Object.fromEntries(RETENTION_TYPES.map((t) => [t, pick(env[`SCHOOL_APP_RETENTION_${t.toUpperCase()}_DAYS`]) ?? pick(json[t]) ?? RETENTION_DEFAULT_DAYS[t]])) as Record<RetentionType, number>;
}

const cairoDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** The daily clean-up: deletes school app rows older than their setting. Returns the counts. */
export async function runRetention(now = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Record<string, number>> {
  const days = retentionDays(env);
  const before = (t: RetentionType) => new Date(now.getTime() - days[t] * 86_400_000);
  const out: Record<string, number> = {};
  const run = async (name: string, fn: () => Promise<number>) => { try { out[name] = await fn(); } catch (error) { out[name] = -1; logger.error('school_app_retention_failed', { name, error: serializeError(error) }); } };
  await run('attendance', async () => (await SchoolDailyAttendance.deleteMany({ date: { $lt: cairoDate(before('attendance')) } })).deletedCount);
  await run('fees', async () => {
    const old = await SchoolInstalment.find({ dueDate: { $lt: cairoDate(before('fees')) } }).select('id receiptKey').lean();
    for (const o of old) if (o.receiptKey) await receiptStore.remove(o.receiptKey).catch(() => undefined);
    return (await SchoolInstalment.deleteMany({ id: { $in: old.map((o) => o.id) } })).deletedCount;
  });
  await run('busNotices', async () => (await SchoolBusNotice.deleteMany({ createdAt: { $lt: before('buses') } })).deletedCount);
  await run('busAssignments', async () => (await SchoolBusAssignment.deleteMany({ validTo: { $lt: cairoDate(before('buses')) } })).deletedCount);
  await run('consents', async () => (await SchoolConsent.deleteMany({ at: { $lt: before('consents') } })).deletedCount);
  await run('requests', async () => (await SchoolRequest.deleteMany({ updatedAt: { $lt: before('requests') }, status: { $in: ['done', 'refused'] } })).deletedCount);
  await run('chat', async () => (await SchoolChatLog.deleteMany({ createdAt: { $lt: before('chat') } })).deletedCount);
  await run('notifications', async () => (await ParentNotification.deleteMany({ createdAt: { $lt: before('notifications') } })).deletedCount);
  await run('imports', async () => (await SchoolImport.deleteMany({ createdAt: { $lt: before('imports') } })).deletedCount);
  return out;
}

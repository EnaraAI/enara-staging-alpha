import type { NextFunction, Request, Response } from 'express';
import { getConfig, type LmsDrainTrigger } from '../../../config/env';
import { logger, serializeError } from '../../../utils/logging';
import { LmsContext } from '../models';
import { tryLock } from './locks';
import { drainGradeJobs, passbackOn, pushNow, type DrainFilter } from './outbox';

// Grade delivery layers on Vercel Hobby (plan §5), each switched by
// LMS_DRAIN_TRIGGERS (default inline,piggyback,targeted,daily) and all inert
// unless LMS_GRADE_PASSBACK_ENABLED (and LMS_LTI_ENABLED) are on:
//   inline     right after the response: waitUntil(push the new job), with
//              quick retries in the same process;
//   piggyback  any API request may start a background drain of up to 20 due
//              jobs, at most once a minute across all instances (lms_locks);
//   targeted   a teacher opening a class flushes that class's jobs; a
//              learner's (or teacher's) LTI launch flushes theirs;
//   daily      the daily cron drains everything due (bounded);
//   cron       the protected /api/cron/lms-drain route, for a future
//              per-minute scheduler (configuration only).
// Background work goes through waitUntil so it outlives the response; it is
// never awaited by the request and never throws into it.

const PIGGYBACK_LOCK = 'lms-grade-drain';
const PIGGYBACK_EVERY_MS = 60_000;
const inFlight = new Set<Promise<unknown>>();
let lastPiggyback = 0;

export function triggerOn(trigger: LmsDrainTrigger): boolean {
  return passbackOn() && getConfig().lms.drainTriggers.includes(trigger);
}

/** Runs a task after (or alongside) the response; Vercel keeps the function alive for it. */
export function runInBackground(name: string, task: () => Promise<unknown>): void {
  const p: Promise<unknown> = task()
    .catch((error) => logger.warn('lms_background_failed', { task: name, error: serializeError(error) }))
    .finally(() => inFlight.delete(p));
  inFlight.add(p);
  import('@vercel/functions').then(({ waitUntil }) => waitUntil(p)).catch(() => undefined);
}

/** Layer (a): push jobs that were just queued. */
export function scheduleInlinePush(jobIds: string[]): void {
  if (!jobIds.length || !triggerOn('inline')) return;
  runInBackground('inline_push', () => pushNow(jobIds));
}

/** Layer (d): flush one learner's or one course's (or one ENARA class's) due jobs. */
export function scheduleTargetedFlush(target: { lmsUserId?: string; contextId?: string; enaraClassId?: string; institutionId?: string }): void {
  if (!triggerOn('targeted')) return;
  runInBackground('targeted_flush', async () => {
    let filter: DrainFilter;
    if (target.lmsUserId) filter = { lmsUserId: target.lmsUserId };
    else if (target.contextId) filter = { contextIds: [target.contextId] };
    else if (target.enaraClassId && target.institutionId) {
      const contexts = await LmsContext.find({ enaraClassId: target.enaraClassId, institutionId: target.institutionId }).select('id').limit(20).lean();
      if (!contexts.length) return;
      filter = { contextIds: contexts.map((c) => c.id), institutionId: target.institutionId };
    } else return;
    await drainGradeJobs({ filter, limit: 20, trigger: 'targeted' });
  });
}

/** Layer (c): piggyback on incoming API requests. Cheap when off: one flag check. */
export function piggybackDrain(_req: Request, _res: Response, next: NextFunction): void {
  next();
  if (!triggerOn('piggyback')) return;
  const now = Date.now();
  if (now - lastPiggyback < PIGGYBACK_EVERY_MS) return;
  lastPiggyback = now;
  runInBackground('piggyback_drain', async () => {
    if (!(await tryLock(PIGGYBACK_LOCK, PIGGYBACK_EVERY_MS))) return;
    await drainGradeJobs({ limit: 20, trigger: 'piggyback' });
  });
}

/** Layer (e): the daily cron (also the protected per-minute route when 'cron' is on). */
export async function scheduledDrain(trigger: 'daily' | 'cron') {
  if (!triggerOn(trigger)) return { skipped: true };
  return drainGradeJobs({ limit: trigger === 'daily' ? 200 : 50, budgetMs: trigger === 'daily' ? 40_000 : 25_000, trigger });
}

/** Tests only: wait for every background task started so far. */
export async function settleLmsBackgroundForTests(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

/** Tests only. */
export function resetPiggybackForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  lastPiggyback = 0;
}

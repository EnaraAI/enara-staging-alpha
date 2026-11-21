// Warm-up ping (owner, 21 Nov 2026; speed plan step 7 as changed): when a learner opens the tutor page or the live avatar, one tiny request
// (1 output token) goes to the model server in the background, so a server that went idle starts waking before the learner's first
// message. At most one ping per window for all of lms-test (a shared timestamp in the database), never on the learner's path (the route
// answers at once; the ping runs after the response). Only while DeepSeek is the provider. Named-only switch dsWarmup. Never keeps a server
// warm on a schedule, and never changes a Modal or Vercel setting.
import mongoose from 'mongoose';
import { waitUntil } from '@vercel/functions';
import type { NextFunction, Request, Response } from 'express';
import { engineV2 } from './engineV2';
import { deepseekClient, deepseekReady, tutorModel } from './llmProvider';
import { meteredMessage } from './aiGateway';
import { logger } from '../utils/logging';

export const warmupOn = (): boolean => engineV2('dsWarmup') && deepseekReady();
/** Minutes between pings (TUTOR_LLM_WARM_MIN, 1-30, default 4). */
export const warmEveryMs = (): number => { const n = Number(process.env.TUTOR_LLM_WARM_MIN); return (Number.isInteger(n) && n >= 1 && n <= 30 ? n : 4) * 60_000; };

/** Claim the next ping slot (true once per window across all server instances). */
export async function claimSlot(now = new Date(), coll = () => mongoose.connection.collection<{ _id: string; at: Date }>('llm_warmup')): Promise<boolean> {
  try {
    const r = await coll().findOneAndUpdate({ _id: 'deepseek', at: { $lt: new Date(now.getTime() - warmEveryMs()) } }, { $set: { at: now } }, { upsert: true });
    return r !== undefined; // updated an old slot, or created the first one
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false; // a recent ping exists (the upsert hit the existing _id)
    throw e;
  }
}

/** The tiny request itself: 1 output token, metered like any AI call (feature tutor_warmup). */
export async function pingModel(timeoutMs = 120_000): Promise<{ ms: number; ok: boolean }> {
  const t = Date.now();
  try {
    await meteredMessage({ feature: 'tutor_warmup', modelName: tutorModel()!, bound: { inputTokens: 20, outputTokens: 1 } }, () =>
      deepseekClient(timeoutMs).messages.create({ model: tutorModel()!, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }));
    return { ms: Date.now() - t, ok: true };
  } catch (e) {
    logger.warn('llm_warmup_failed', { status: (e as { status?: number }).status ?? null });
    return { ms: Date.now() - t, ok: false };
  }
}

/** Called after the learner's request has been answered. */
export async function warmUp(): Promise<{ sent: boolean; ms?: number }> {
  if (!warmupOn()) return { sent: false };
  if (!(await claimSlot().catch(() => false))) return { sent: false };
  const r = await pingModel();
  logger.info('llm_warmup', { ms: r.ms, ok: r.ok });
  return { sent: true, ms: r.ms };
}

/** Express middleware for the requests a page makes when it opens (tutor sessions, kids speaking info, avatar session): starts a
 * warm-up in the background and lets the request go on at once. */
export function warmOnOpen(_req: Request, _res: Response, next: NextFunction): void {
  if (warmupOn()) waitUntil(warmUp().then(() => undefined, () => undefined));
  next();
}

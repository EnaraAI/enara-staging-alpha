import mongoose, { Schema } from 'mongoose';
import type { IncrementResponse, Options, Store } from 'express-rate-limit';
import { logger, serializeError } from '../utils/logging';
import { dbUnavailable, isDbDownError, isDbUnavailableError, markDbUnavailable } from '../config/dbAvailability';

// Rate-limit counters shared by every serverless instance. One document per
// limiter and client; MongoDB deletes it once the window has passed.
interface RateLimitDoc {
  _id: string;
  hits: number;
  resetAt: Date;
}

const rateLimitSchema = new Schema<RateLimitDoc>(
  { _id: String, hits: Number, resetAt: Date },
  { collection: 'rate_limits', versionKey: false },
);
rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });
const RateLimit = mongoose.models.RateLimit || mongoose.model<RateLimitDoc>('RateLimit', rateLimitSchema);

export class MongoRateLimitStore implements Store {
  private windowMs = 60_000;
  // Used only while the database is not connected (startup, tests without a DB).
  private fallback = new Map<string, { hits: number; resetAt: number }>();

  constructor(readonly prefix: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private id(key: string) {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = Date.now();
    // While the database is known to be unreachable, count locally rather than
    // wait on it again before the request is even routed (P20).
    if (mongoose.connection.readyState !== 1 || dbUnavailable()) return this.incrementLocally(key, now);
    const resetAt = new Date(now + this.windowMs);
    try {
      return await this.incrementShared(key, now, resetAt);
    } catch (error) {
      if (isDbUnavailableError(error)) {
        if (isDbDownError(error)) markDbUnavailable();
        return this.incrementLocally(key, now);
      }
      // Callers decide whether to allow (passOnStoreError); never silently.
      logger.error('rate_limit_store_failed', { limiter: this.prefix, error: serializeError(error) });
      throw error;
    }
  }

  private async incrementShared(key: string, now: number, resetAt: Date): Promise<IncrementResponse> {
    // Start a new window when the old one has passed, otherwise count one more hit.
    const doc = (await RateLimit.findOneAndUpdate(
      { _id: this.id(key) },
      [
        {
          $set: {
            hits: { $cond: [{ $gt: ['$resetAt', new Date(now)] }, { $add: ['$hits', 1] }, 1] },
            resetAt: { $cond: [{ $gt: ['$resetAt', new Date(now)] }, '$resetAt', resetAt] },
          },
        },
      ],
      { upsert: true, new: true, lean: true },
    )) as RateLimitDoc | null;
    return { totalHits: doc?.hits ?? 1, resetTime: doc?.resetAt ?? resetAt };
  }

  async decrement(key: string): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const entry = this.fallback.get(key);
      if (entry) entry.hits = Math.max(0, entry.hits - 1);
      return;
    }
    await RateLimit.updateOne({ _id: this.id(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key: string): Promise<void> {
    this.fallback.delete(key);
    if (mongoose.connection.readyState === 1) await RateLimit.deleteOne({ _id: this.id(key) });
  }

  private incrementLocally(key: string, now: number): IncrementResponse {
    let entry = this.fallback.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { hits: 0, resetAt: now + this.windowMs };
      this.fallback.set(key, entry);
    }
    entry.hits += 1;
    return { totalHits: entry.hits, resetTime: new Date(entry.resetAt) };
  }
}

// Speed (lms-speed-5): the two general /api limits (300/min per user, 3000/min per address) ran two
// sequential database writes before every request. This store counts each hit in memory at once and
// adds the hits to the same shared document in the background, at most about once a second per key
// (one write carries all the hits since the last one). The limit is checked against the shared total
// last read plus this instance's hits not yet written, so it still holds across instances, a moment
// late. Requests never wait for the database here. Logins and the other strict limits keep
// MongoRateLimitStore.
const SYNC_EVERY_MS = 1_000;
const SYNC_AT_PENDING = 25;

interface BatchedEntry { shared: number; pending: number; resetAt: number; lastSync: number; syncing: boolean }

export class BatchedRateLimitStore implements Store {
  private windowMs = 60_000;
  private entries = new Map<string, BatchedEntry>();
  private lastPrune = Date.now();

  constructor(readonly prefix: string, private readonly syncEveryMs = SYNC_EVERY_MS) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private id(key: string) {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = Date.now();
    this.prune(now);
    let e = this.entries.get(key);
    if (!e || e.resetAt <= now) {
      e = { shared: 0, pending: 0, resetAt: now + this.windowMs, lastSync: 0, syncing: false };
      this.entries.set(key, e);
    }
    e.pending += 1;
    const totalHits = e.shared + e.pending;
    if (!e.syncing && (now - e.lastSync >= this.syncEveryMs || e.pending >= SYNC_AT_PENDING)) void this.sync(key, e);
    return { totalHits, resetTime: new Date(e.resetAt) };
  }

  // Adds this instance's unwritten hits to the shared document and reads back the shared total.
  private async sync(key: string, e: BatchedEntry): Promise<void> {
    if (mongoose.connection.readyState !== 1 || dbUnavailable()) return;
    const n = e.pending;
    if (n <= 0) return;
    e.syncing = true;
    const now = Date.now();
    const resetAt = new Date(now + this.windowMs);
    let written = false;
    try {
      const doc = (await RateLimit.findOneAndUpdate(
        { _id: this.id(key) },
        [
          {
            $set: {
              hits: { $cond: [{ $gt: ['$resetAt', new Date(now)] }, { $add: ['$hits', n] }, n] },
              resetAt: { $cond: [{ $gt: ['$resetAt', new Date(now)] }, '$resetAt', resetAt] },
            },
          },
        ],
        { upsert: true, new: true, lean: true },
      )) as RateLimitDoc | null;
      e.pending -= n;
      e.shared = (doc?.hits ?? n);
      e.resetAt = (doc?.resetAt ?? resetAt).getTime();
      written = true;
    } catch (error) {
      if (isDbUnavailableError(error)) {
        if (isDbDownError(error)) markDbUnavailable();
      } else {
        logger.error('rate_limit_store_failed', { limiter: this.prefix, error: serializeError(error) });
      }
    } finally {
      e.lastSync = Date.now();
      e.syncing = false;
    }
    // Hits that arrived meanwhile: write them now if there are many (or the interval is up), else with the next hit.
    if (written && e.pending > 0 && this.entries.get(key) === e && (e.pending >= SYNC_AT_PENDING || this.syncEveryMs === 0)) void this.sync(key, e);
  }

  async decrement(key: string): Promise<void> {
    const e = this.entries.get(key);
    if (!e) return;
    if (e.pending > 0) e.pending -= 1;
    else if (mongoose.connection.readyState === 1) {
      e.shared = Math.max(0, e.shared - 1);
      await RateLimit.updateOne({ _id: this.id(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } });
    }
  }

  async resetKey(key: string): Promise<void> {
    this.entries.delete(key);
    if (mongoose.connection.readyState === 1) await RateLimit.deleteOne({ _id: this.id(key) });
  }

  // Drops keys whose window has passed (memory stays bounded by the active clients).
  private prune(now: number): void {
    if (now - this.lastPrune < this.windowMs) return;
    this.lastPrune = now;
    for (const [k, e] of this.entries) if (e.resetAt <= now && !e.syncing) this.entries.delete(k);
  }
}

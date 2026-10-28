import mongoose, { Schema } from 'mongoose';
import type { IncrementResponse, Options, Store } from 'express-rate-limit';
import { logger, serializeError } from '../utils/logging';

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
    if (mongoose.connection.readyState !== 1) return this.incrementLocally(key, now);
    const resetAt = new Date(now + this.windowMs);
    try {
      return await this.incrementShared(key, now, resetAt);
    } catch (error) {
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

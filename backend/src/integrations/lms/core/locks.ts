import { randomUUID } from 'crypto';
import { LmsLock } from '../models';

// Named expiring locks in MongoDB (lms_locks). tryLock succeeds for exactly one
// caller until the lock expires, across all serverless instances; used to run
// the piggyback drain at most once a minute.
export async function tryLock(name: string, ttlMs: number, owner: string = randomUUID()): Promise<boolean> {
  const now = new Date();
  try {
    const doc = await LmsLock.findOneAndUpdate(
      { _id: name, lockedUntil: { $lte: now } },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs), owner } },
      { upsert: true, new: true },
    ).lean();
    return doc?.owner === owner;
  } catch (error) {
    // The lock exists and is still held: the upsert hit the unique _id.
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function releaseLock(name: string, owner: string): Promise<void> {
  await LmsLock.deleteOne({ _id: name, owner });
}

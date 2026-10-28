import mongoose, { Schema } from 'mongoose';
import { logger, serializeError } from '../utils/logging';

// Database migrations: each runs once, in order, and is recorded in the
// `migrations` collection. A lock document stops two instances running them
// at the same time. Migrations must be idempotent (safe to re-run after a
// crash) and must not delete data without explicit approval.

export interface Migration {
  id: string;
  description: string;
  up: () => Promise<void>;
}

interface MigrationRecord {
  _id: string;
  description?: string;
  appliedAt?: Date;
  lockedUntil?: Date;
}

const migrationSchema = new Schema<MigrationRecord>(
  { _id: String, description: String, appliedAt: Date, lockedUntil: Date },
  { collection: 'migrations', versionKey: false },
);
const MigrationModel = mongoose.models.Migration || mongoose.model<MigrationRecord>('Migration', migrationSchema);

const LOCK_ID = '__lock__';
const LOCK_MS = 5 * 60 * 1000;

async function acquireLock(): Promise<boolean> {
  const now = new Date();
  try {
    const lock = await MigrationModel.findOneAndUpdate(
      { _id: LOCK_ID, $or: [{ lockedUntil: { $lt: now } }, { lockedUntil: { $exists: false } }] },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
      { upsert: true, new: true },
    );
    return Boolean(lock);
  } catch (error) {
    // Duplicate key: another instance holds the lock.
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

async function releaseLock() {
  await MigrationModel.updateOne({ _id: LOCK_ID }, { $set: { lockedUntil: new Date(0) } });
}

export async function pendingMigrations(migrations: Migration[]): Promise<Migration[]> {
  const applied = new Set(
    (await MigrationModel.find({ appliedAt: { $exists: true } }).select('_id').lean()).map((m) => String(m._id)),
  );
  return migrations.filter((m) => !applied.has(m.id));
}

// Runs pending migrations. Returns the ids applied; [] if none were pending
// or another instance is running them.
export async function runMigrations(migrations: Migration[]): Promise<string[]> {
  if (!(await pendingMigrations(migrations)).length) return [];
  if (!(await acquireLock())) {
    logger.info('migrations_locked_elsewhere');
    return [];
  }
  const applied: string[] = [];
  try {
    for (const migration of await pendingMigrations(migrations)) {
      const started = Date.now();
      logger.info('migration_start', { id: migration.id });
      await migration.up();
      await MigrationModel.updateOne(
        { _id: migration.id },
        { $set: { description: migration.description, appliedAt: new Date() } },
        { upsert: true },
      );
      applied.push(migration.id);
      logger.info('migration_done', { id: migration.id, durationMs: Date.now() - started });
    }
  } catch (error) {
    logger.error('migration_failed', { error: serializeError(error) });
    throw error;
  } finally {
    await releaseLock();
  }
  return applied;
}

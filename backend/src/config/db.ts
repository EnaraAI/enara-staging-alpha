import mongoose from 'mongoose';
import { getConfig } from './env';
import { logger, serializeError } from '../utils/logging';

// Opens the Mongo connection. Also used to reconnect after an idle
// disconnect (staging), so the staging database check runs every time.
export async function openMongo(): Promise<void> {
  const { mongoUri } = getConfig();

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10_000,
  });
  // Staging: the connected database must be the staging one (checked again
  // after connecting, before anything is served).
  if (getConfig().stagingMode) {
    const { STAGING_DB_NAME } = await import('./stagingGuard');
    if (mongoose.connection.db?.databaseName !== STAGING_DB_NAME) {
      await mongoose.disconnect();
      throw new Error(`Staging isolation check failed: connected database is not ${STAGING_DB_NAME}`);
    }
  }
  logger.info('mongodb_connected');
}

export async function connectDB(): Promise<void> {
  await openMongo();

  // Apply pending migrations on start-up (one instance at a time; the others skip).
  if (process.env.NODE_ENV !== 'test' && process.env.RUN_MIGRATIONS_ON_START !== 'false') {
    const { MIGRATIONS } = await import('../migrations');
    const { runMigrations } = await import('../migrations/runner');
    await runMigrations(MIGRATIONS).catch((error) =>
      logger.error('migrations_on_start_failed', { error: serializeError(error) }),
    );
  }
}

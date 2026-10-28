import { Pool } from 'pg';
import { getConfig } from './env';
import { logger } from '../utils/logging';
import { withRetry } from '../utils/retry';

let pool: Pool | undefined;

export function getPostgresPool(): Pool {
  if (pool) return pool;

  const config = getConfig();
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required for PostgreSQL operations');
  }

  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSslRejectUnauthorized
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });

  return pool;
}

export async function connectPostgres(): Promise<void> {
  const config = getConfig();
  if (!config.databaseUrl) {
    if (config.isProduction) {
      throw new Error('DATABASE_URL is required in production');
    }
    logger.warn('postgres_disabled_no_database_url');
    return;
  }

  const pg = getPostgresPool();
  // Render (and similar platforms) can briefly reset the very first outbound
  // connection a fresh container makes while its networking finishes
  // initializing -- surfaces here as ECONNRESET. Retrying with backoff
  // avoids a hard crash-loop over what's usually a 1-2 second cold-start
  // blip, without masking a genuinely wrong/unreachable DATABASE_URL (which
  // will still exhaust all retries and throw).
  await withRetry('postgres_connect', () => pg.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS ingestion_jobs (
      id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      school_id             TEXT NOT NULL,
      course_id             TEXT NOT NULL,
      instructor_id         TEXT NOT NULL,
      asset_id              TEXT,
      event_id              VARCHAR(100) NOT NULL UNIQUE,
      s3_key                TEXT NOT NULL,
      modality              VARCHAR(20) NOT NULL,
      engine_job_id         TEXT,
      status                VARCHAR(30) NOT NULL DEFAULT 'submitted',
      chunk_count           INT,
      language              VARCHAR(20),
      error_message         TEXT,
      created_by_user_id    TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE ingestion_jobs ALTER COLUMN school_id TYPE TEXT USING school_id::TEXT;
    ALTER TABLE ingestion_jobs ALTER COLUMN course_id TYPE TEXT USING course_id::TEXT;
    ALTER TABLE ingestion_jobs ALTER COLUMN instructor_id TYPE TEXT USING instructor_id::TEXT;
    ALTER TABLE ingestion_jobs ALTER COLUMN asset_id TYPE TEXT USING asset_id::TEXT;
    ALTER TABLE ingestion_jobs ALTER COLUMN engine_job_id TYPE TEXT USING engine_job_id::TEXT;
    ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;

    CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_event_id ON ingestion_jobs(event_id);
    CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_school_event ON ingestion_jobs(school_id, event_id);
    CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_school_course ON ingestion_jobs(school_id, course_id);
  `));
  logger.info('postgres_connected');
}

export async function closePostgres(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}

import { randomUUID } from 'crypto';
import { getConfig } from '../config/env';
import { getPostgresPool } from '../config/postgres';
import { AppError } from '../middleware/errorHandler';
import { fetchWithTimeout, readJson } from '../utils/httpClient';
import { signEmpty, signLegacyPayload } from '../utils/hmac';
import { toEngineUuid } from '../utils/engineIds';
import { getRequiredId, getRequiredString } from '../utils/validation';
import { meteredCall } from './aiGateway';

const TERMINAL_STATUSES = new Set(['completed', 'partially_completed', 'failed']);
const ALLOWED_STATUSES = new Set([
  'submitted',
  'queued',
  'running',
  'processing',
  'completed',
  'partially_completed',
  'failed',
]);

export interface IngestionSubmission {
  schoolId: string;
  courseId: string;
  instructorId: string;
  assetId: string;
  s3Key: string;
  modality: 'document' | 'audio';
  fileName?: string;
  fileSize?: number;
  createdByUserId?: string;
}

export interface IngestionJobRecord {
  event_id: string;
  school_id: string;
  course_id: string;
  instructor_id: string;
  asset_id?: string;
  s3_key: string;
  modality: string;
  engine_job_id?: string;
  status: string;
  chunk_count?: number;
  language?: string;
  error_message?: string;
  created_by_user_id?: string;
  created_at?: string;
  updated_at?: string;
}

function engineBaseUrl(): string {
  const config = getConfig();
  if (!config.aiEngineUrl) {
    throw new AppError('AI ingestion engine is not configured', 503, 'AI_ENGINE_UNAVAILABLE');
  }
  return config.aiEngineUrl.replace(/\/+$/, '');
}

function validateSubmission(input: IngestionSubmission): IngestionSubmission {
  const source = input as unknown as Record<string, unknown>;
  return {
    schoolId: getRequiredId(source, 'schoolId'),
    courseId: getRequiredId(source, 'courseId'),
    instructorId: getRequiredId(source, 'instructorId'),
    assetId: getRequiredId(source, 'assetId'),
    s3Key: getRequiredString(source, 's3Key', { max: 1024 }),
    modality: input.modality === 'audio' ? 'audio' : 'document',
    fileName: input.fileName,
    fileSize: input.fileSize,
    createdByUserId: input.createdByUserId,
  };
}

async function setJobStatus(eventId: string, status: string, error?: string): Promise<void> {
  await getPostgresPool().query(
    `UPDATE ingestion_jobs
       SET status = $1, error_message = $2, updated_at = NOW()
     WHERE event_id = $3`,
    [status, error ?? null, eventId]
  );
}

export async function submitFileToEngine(
  params: IngestionSubmission
): Promise<{ eventId: string; ingestionId: string }> {
  const submission = validateSubmission(params);
  // Documents safety gate (P2): no unscanned file goes to the engine.
  const { isDocumentSafetyRequired } = await import('./documentSafety');
  if (await isDocumentSafetyRequired(submission.schoolId)) {
    throw new AppError('This school processes files only through Documents', 409, 'DOCUMENT_SAFETY_GATE');
  }
  const eventId = randomUUID();

  await getPostgresPool().query(
    `INSERT INTO ingestion_jobs
      (event_id, school_id, course_id, instructor_id, asset_id, s3_key, modality, status, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', $8)
     ON CONFLICT (event_id) DO NOTHING`,
    [
      eventId,
      submission.schoolId,
      submission.courseId,
      submission.instructorId,
      submission.assetId,
      submission.s3Key,
      submission.modality,
      submission.createdByUserId ?? null,
    ]
  );

  const body = JSON.stringify({
    event_id: eventId,
    institution_id: toEngineUuid(submission.schoolId),
    course_id: toEngineUuid(submission.courseId),
    instructor_id: toEngineUuid(submission.instructorId),
    asset_id: toEngineUuid(submission.assetId),
    s3_key: submission.s3Key,
    file_name: submission.fileName,
    file_size: submission.fileSize,
    modality: submission.modality,
  });

  let ingestionId = '';
  try {
    // Metered once per submission (key from the event id). The engine reports
    // no usage, so the row records usage as unknown.
    const response = await meteredCall(
      {
        feature: 'curriculum_ingestion',
        provider: 'ingestion_engine',
        modelName: `ingestion-engine:${submission.modality}`,
        institutionId: submission.schoolId,
        refs: { uploadId: submission.assetId },
      },
      () =>
        fetchWithTimeout(
          `${engineBaseUrl()}/ingest`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Enara-Signature': signLegacyPayload(body),
            },
            body,
          },
          getConfig().aiEngineTimeoutMs
        ),
      { operationKey: `ingest:${eventId}`, failed: (r) => (r.ok ? undefined : `http_${r.status}`) }
    );

    if (!response.ok) {
      await setJobStatus(eventId, 'failed', `AI engine returned ${response.status}`);
      throw new AppError('AI ingestion engine rejected the upload', 502, 'AI_ENGINE_REJECTED');
    }

    const data = await readJson<{ ingestion_id?: string }>(response);
    ingestionId = data.ingestion_id || '';
    if (!ingestionId) {
      await setJobStatus(eventId, 'failed', 'Missing ingestion_id from AI engine');
      throw new AppError('AI ingestion engine returned an invalid response', 502, 'AI_ENGINE_INVALID_RESPONSE');
    }

    await getPostgresPool().query(
      `UPDATE ingestion_jobs
         SET engine_job_id = $1,
             status = CASE WHEN status = 'submitted' THEN 'queued' ELSE status END,
             updated_at = NOW()
       WHERE event_id = $2`,
      [ingestionId, eventId]
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    await setJobStatus(eventId, 'failed', 'AI engine request failed');
    throw new AppError('AI ingestion engine request failed', 502, 'AI_ENGINE_FAILURE');
  }

  return { eventId, ingestionId };
}

export async function updateIngestionJob(payload: {
  event_id: string;
  status: string;
  chunk_count?: number;
  language?: string;
  error?: string;
}): Promise<void> {
  if (!ALLOWED_STATUSES.has(payload.status)) {
    throw new AppError('Invalid ingestion status', 400, 'INVALID_INGESTION_STATUS');
  }

  const current = await getIngestionJobByEventId(payload.event_id);
  if (!current) {
    throw new AppError('Ingestion job not found', 404, 'INGESTION_JOB_NOT_FOUND');
  }

  if (TERMINAL_STATUSES.has(current.status) && current.status !== payload.status) {
    throw new AppError('Invalid ingestion state transition', 409, 'INVALID_STATE_TRANSITION');
  }

  await getPostgresPool().query(
    `UPDATE ingestion_jobs SET
       status        = $1,
       chunk_count   = COALESCE($2, chunk_count),
       language      = COALESCE($3, language),
       error_message = COALESCE($4, error_message),
       updated_at    = NOW()
     WHERE event_id = $5`,
    [
      payload.status,
      payload.chunk_count ?? null,
      payload.language ?? null,
      payload.error ?? null,
      payload.event_id,
    ]
  );
}

export async function getIngestionJobByEventId(
  eventId: string
): Promise<IngestionJobRecord | null> {
  const result = await getPostgresPool().query(
    `SELECT event_id, school_id, course_id, instructor_id, asset_id, s3_key, modality,
            engine_job_id, status, chunk_count, language, error_message, created_by_user_id,
            created_at, updated_at
       FROM ingestion_jobs
      WHERE event_id = $1`,
    [eventId]
  );
  return (result.rows[0] as IngestionJobRecord | undefined) || null;
}

export async function pollEngineStatus(eventId: string): Promise<unknown> {
  const response = await fetchWithTimeout(
    `${engineBaseUrl()}/ingest/status/${encodeURIComponent(eventId)}`,
    {
      headers: { 'X-Enara-Signature': signEmpty() },
    },
    getConfig().aiEngineTimeoutMs
  );

  if (!response.ok) throw new AppError('AI ingestion status request failed', 502, 'AI_ENGINE_FAILURE');
  return readJson<unknown>(response);
}

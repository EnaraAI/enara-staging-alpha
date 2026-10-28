import { Router, Response } from 'express';
import { authenticateUserOrApiKey, AuthRequest, requireRole } from '../middleware/auth.middleware';
import { requireIngestionSignature } from '../middleware/ingestionAuth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import {
  getIngestionJobByEventId,
  pollEngineStatus,
  submitFileToEngine,
  updateIngestionJob,
} from '../services/ingestionService';
import { currentUser, hasSameInstitution } from '../auth/authorization';
import {
  ensurePlainObject,
  getOptionalNumber,
  getOptionalString,
  getRequiredId,
  getRequiredString,
  rejectMongoOperators,
} from '../utils/validation';

const router = Router();

function assertCanReadIngestionJob(req: AuthRequest, job: { school_id: string; created_by_user_id?: string }) {
  const user = currentUser(req);
  if (user.role === 'enara-admin') return;
  if (job.created_by_user_id && job.created_by_user_id === user.id) return;
  if (hasSameInstitution(req, { institutionId: job.school_id })) return;
  throw new AppError('Ingestion job not found', 404, 'INGESTION_JOB_NOT_FOUND');
}

router.post(
  '/submit',
  requireIngestionSignature(),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = ensurePlainObject(req.body);
    rejectMongoOperators(body);

    const result = await submitFileToEngine({
      schoolId: getRequiredId(body, 'schoolId'),
      courseId: getRequiredId(body, 'courseId'),
      instructorId: getRequiredId(body, 'instructorId'),
      assetId: getRequiredId(body, 'assetId'),
      s3Key: getRequiredString(body, 's3Key', { max: 1024 }),
      modality: body.modality === 'audio' ? 'audio' : 'document',
      fileName: getOptionalString(body, 'fileName', { max: 255 }),
      fileSize: getOptionalNumber(body, 'fileSize', { min: 1, max: 50 * 1024 * 1024 }),
      createdByUserId: getOptionalString(body, 'createdByUserId', { max: 128 }),
    });

    res.status(202).json({ success: true, data: result });
  })
);

router.post(
  '/callback',
  requireIngestionSignature({ allowLegacy: true }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = ensurePlainObject(req.body);
    rejectMongoOperators(body);

    const eventId = getRequiredId(body, 'event_id');
    await updateIngestionJob({
      event_id: eventId,
      status: getOptionalString(body, 'status', { max: 30 }) || 'processing',
      chunk_count: getOptionalNumber(body, 'chunk_count', { min: 0 }),
      language: getOptionalString(body, 'language', { max: 20 }),
      error: getOptionalString(body, 'error', { max: 2000 }),
    });

    res.json({ received: true });
  })
);

router.get(
  '/status/:eventId',
  authenticateUserOrApiKey('ingestion:read'),
  requireRole('teacher', 'admin', 'enara-admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const eventId = getRequiredId(req.params, 'eventId');
    const job = await getIngestionJobByEventId(eventId);
    if (!job) throw new AppError('Ingestion job not found', 404, 'INGESTION_JOB_NOT_FOUND');
    assertCanReadIngestionJob(req, job);

    let engineStatus: unknown;
    try {
      engineStatus = await pollEngineStatus(eventId);
    } catch {
      engineStatus = null;
    }

    res.json({
      success: true,
      data: {
        ...job,
        engineStatus,
      },
    });
  })
);

export default router;

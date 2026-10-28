import { Router, Response } from 'express';
import multer from 'multer';
import { uploadToS3 } from '../services/s3Service';
import { submitFileToEngine } from '../services/ingestionService';
import { isDocumentSafetyRequired } from '../services/documentSafety';
import { authenticateUserOrApiKey, AuthRequest, requireRole } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { CourseInstance } from '../models/CourseInstance';
import { COURSE_UPLOAD_ROLES } from '../auth/roles';
import { currentUser, hasSameInstitution } from '../auth/authorization';
import { getOptionalId, getRequiredId, rejectMongoOperators } from '../utils/validation';
import { MAX_UPLOAD_BYTES, toEngineContentType, validateUploadFile } from '../utils/uploadSecurity';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

async function resolveAuthorizedCourseUpload(req: AuthRequest, courseId: string) {
  const user = currentUser(req);
  const course = await CourseInstance.findOne({
    $or: [{ id: courseId }, { courseId }],
  });
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');

  if (user.role === 'enara-admin') return course;

  if (!hasSameInstitution(req, course)) {
    throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
  }

  if (user.role === 'teacher' && !course.instructorIds.includes(user.id)) {
    throw new AppError('Course upload permission required', 403, 'UPLOAD_FORBIDDEN');
  }

  return course;
}

router.post(
  '/course/:courseId',
  authenticateUserOrApiKey('curriculum:ingest'),
  requireRole(...COURSE_UPLOAD_ROLES),
  upload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    rejectMongoOperators(req.body);
    const courseId = getRequiredId(req.params, 'courseId');
    const course = await resolveAuthorizedCourseUpload(req, courseId);
    // Documents safety gate (P2): such schools upload through Documents, where
    // files are attested and scanned before anything processes them.
    if (await isDocumentSafetyRequired(course.institutionId || req.user?.institutionId)) {
      throw new AppError('Upload this file from Documents, where it is checked before processing', 409, 'DOCUMENT_SAFETY_GATE');
    }
    const uploadInfo = validateUploadFile(req.file as Express.Multer.File);
    const engineContentType = toEngineContentType(uploadInfo);

    const requestedSchoolId = getOptionalId(req.body, 'schoolId') || getOptionalId(req.body, 'institutionId');
    const resolvedInstitutionId = course.institutionId || req.user?.institutionId || requestedSchoolId;
    if (!resolvedInstitutionId) {
      throw new AppError('Course institution scope is required', 400, 'INSTITUTION_SCOPE_REQUIRED');
    }
    if (requestedSchoolId && requestedSchoolId !== resolvedInstitutionId) {
      throw new AppError('Upload institution does not match course', 403, 'TENANT_SCOPE_VIOLATION');
    }
    if (req.user?.role !== 'enara-admin' && req.user?.institutionId !== resolvedInstitutionId) {
      throw new AppError('Upload institution does not match requester', 403, 'TENANT_SCOPE_VIOLATION');
    }

    const s3Key = await uploadToS3(
      (req.file as Express.Multer.File).buffer,
      uploadInfo.safeFileName,
      course.courseId,
      engineContentType
    );

    const result = await submitFileToEngine({
      schoolId: resolvedInstitutionId,
      courseId: course.courseId,
      instructorId: req.user!.id,
      assetId: course.id,
      s3Key,
      modality: uploadInfo.modality,
      fileName: uploadInfo.safeFileName,
      fileSize: (req.file as Express.Multer.File).size,
      createdByUserId: req.user!.id,
    });

    res.status(202).json({
      success: true,
      s3Key,
      eventId: result.eventId,
      ingestionId: result.ingestionId,
    });
  })
);

export default router;

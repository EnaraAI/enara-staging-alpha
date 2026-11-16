import { Response } from 'express';
import { Student, IStudent } from '../models/Student';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { assertSameInstitution, scopedFilter } from '../auth/authorization';
import { getRequiredId } from '../utils/validation';
import { validateImageUpload } from '../utils/uploadSecurity';
import { saveUpload, deleteUpload } from '../services/uploadStorage';
import { storedUploadName } from '../services/uploadAccess';
import { logger, serializeError } from '../utils/logging';

// Student profile photos. A school admin sets a photo directly; a student's own
// upload waits (pendingPhoto*) until a school admin of that school approves it.

type PhotoFields = Pick<IStudent, 'id' | 'name' | 'avatar' | 'photoUrl' | 'pendingPhotoUrl' | 'pendingPhotoAt'>;

export const photoView = (s: PhotoFields) => ({
  id: s.id,
  name: s.name,
  avatar: s.avatar,
  photoUrl: s.photoUrl ?? null,
  pendingPhotoUrl: s.pendingPhotoUrl ?? null,
  pendingPhotoAt: s.pendingPhotoAt ?? null,
});

async function storePhoto(institutionId: string | undefined, file: Express.Multer.File | undefined) {
  const info = validateImageUpload(file);
  const key = storedUploadName(institutionId, info.safeFileName);
  await saveUpload(key, file!.buffer, info.contentType);
  return { key, url: `/uploads/${key}` };
}

function discard(key: string | undefined) {
  if (!key) return;
  deleteUpload(key).catch((error) => logger.warn('student_photo_delete_failed', { error: serializeError(error) }));
}

// Admin: the student by id, in the admin's own school (another school's: 403).
async function studentForAdmin(req: AuthRequest) {
  const id = getRequiredId(req.params, 'id');
  const student = await Student.findOne({ id });
  if (!student) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  assertSameInstitution(req, student);
  return student;
}

// PUT /api/students/:id/photo (multipart "photo") — takes effect immediately.
export const setStudentPhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await studentForAdmin(req);
  const stored = await storePhoto(student.institutionId, req.file);
  const previous = student.photoKey;
  student.photoUrl = stored.url;
  student.photoKey = stored.key;
  await student.save();
  discard(previous);
  res.json(photoView(student));
});

// GET /api/students/photos/pending — photos students uploaded, awaiting approval.
export const listPendingPhotos = asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = await Student.find(scopedFilter(req, { pendingPhotoUrl: { $exists: true, $ne: null } }))
    .sort({ pendingPhotoAt: 1 })
    .limit(200);
  res.json(rows.map(photoView));
});

// POST /api/students/:id/photo/approve — the pending photo becomes the profile photo.
export const approvePendingPhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await studentForAdmin(req);
  if (!student.pendingPhotoUrl) throw new AppError('No photo is waiting for approval', 409, 'NO_PENDING_PHOTO');
  const previous = student.photoKey;
  student.photoUrl = student.pendingPhotoUrl;
  student.photoKey = student.pendingPhotoKey;
  student.pendingPhotoUrl = undefined;
  student.pendingPhotoKey = undefined;
  student.pendingPhotoAt = undefined;
  await student.save();
  discard(previous);
  res.json(photoView(student));
});

// POST /api/students/:id/photo/reject — the pending photo is discarded.
export const rejectPendingPhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await studentForAdmin(req);
  if (!student.pendingPhotoUrl) throw new AppError('No photo is waiting for approval', 409, 'NO_PENDING_PHOTO');
  const key = student.pendingPhotoKey;
  student.pendingPhotoUrl = undefined;
  student.pendingPhotoKey = undefined;
  student.pendingPhotoAt = undefined;
  await student.save();
  discard(key);
  res.json(photoView(student));
});

// POST /api/me/photo (multipart "photo") — a student's own new photo, pending approval.
export const uploadMyPhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await Student.findOne({ id: req.user!.studentId });
  if (!student) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
  const stored = await storePhoto(student.institutionId, req.file);
  const previous = student.pendingPhotoKey;
  student.pendingPhotoUrl = stored.url;
  student.pendingPhotoKey = stored.key;
  student.pendingPhotoAt = new Date();
  await student.save();
  discard(previous);
  res.status(202).json({ photoUrl: student.photoUrl ?? null, photoPending: true });
});

// What a student sees of their own record: the approved photo only, and
// whether a new one is waiting.
export function ownStudentView<T extends Record<string, unknown>>(plain: T) {
  const { pendingPhotoUrl, pendingPhotoKey, pendingPhotoAt, photoKey, ...rest } = plain;
  void pendingPhotoKey; void pendingPhotoAt; void photoKey;
  return { ...rest, photoPending: Boolean(pendingPhotoUrl) };
}

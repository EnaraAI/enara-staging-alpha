import path from 'path';
import { AppError } from '../middleware/errorHandler';
import { MAX_UPLOAD_BYTES, directUploadContentType, sanitizeFileName } from '../utils/uploadSecurity';
import { ownerFromName, schoolSlug, storedUploadName } from './uploadAccess';
import { createDirectUploadUrl, deleteUpload, isRemoteUploadStorage, readUpload } from './uploadStorage';

// Direct document uploads. Vercel refuses request bodies over 4.5 MB, so files
// go from the browser straight to storage with a short-lived signed PUT URL,
// then the API reads them back and runs the same checks as a normal upload.

export async function issueDirectUpload(institutionId: string | undefined, fileName: unknown, size: unknown) {
  if (!isRemoteUploadStorage()) throw new AppError('Direct upload storage is not configured', 503, 'UPLOAD_STORAGE_UNAVAILABLE');
  const safeFileName = sanitizeFileName(String(fileName || ''));
  const contentType = directUploadContentType(safeFileName);
  if (!contentType) throw new AppError('Upload a PDF, Word, PowerPoint or text file', 415, 'UPLOAD_TYPE_NOT_ALLOWED');
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_UPLOAD_BYTES) {
    throw new AppError(`File must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller`, 413, 'UPLOAD_SIZE_NOT_ALLOWED');
  }
  const storedName = storedUploadName(institutionId, safeFileName);
  const uploadUrl = await createDirectUploadUrl(storedName, contentType);
  return { uploadUrl, storedName, contentType };
}

// The uploaded object as a multer-style file. Only names issued to this school
// are accepted; anything else is refused without being read.
export async function claimDirectUpload(institutionId: string | undefined, storedNameRaw: unknown, fileName: unknown) {
  const storedName = path.basename(String(storedNameRaw || ''));
  if (!storedName || ownerFromName(storedName) !== schoolSlug(institutionId)) {
    throw new AppError('Unknown upload', 400, 'VALIDATION_ERROR');
  }
  const contentType = directUploadContentType(storedName);
  if (!contentType) throw new AppError('Unknown upload', 400, 'VALIDATION_ERROR');
  const stored = await readUpload(storedName);
  if (!stored) throw new AppError('The file was not uploaded', 400, 'UPLOAD_REQUIRED');
  if (stored.body.length > MAX_UPLOAD_BYTES) {
    await deleteUpload(storedName);
    throw new AppError('File size is not allowed', 413, 'UPLOAD_SIZE_NOT_ALLOWED');
  }
  const named = sanitizeFileName(String(fileName || ''));
  const originalname = named && path.extname(named).toLowerCase() === path.extname(storedName).toLowerCase() ? named : storedName;
  return { storedName, file: { originalname, mimetype: contentType, size: stored.body.length, buffer: stored.body } };
}

// Removes a claimed object that failed validation, so rejected files are not kept.
export async function discardDirectUpload(storedName: string) {
  await deleteUpload(storedName).catch(() => undefined);
}

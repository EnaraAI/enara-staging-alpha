import path from 'path';
import { randomUUID } from 'crypto';
import { AppError } from '../middleware/errorHandler';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

type UploadKind = 'document' | 'audio' | 'video';

export interface AllowedUploadType {
  extension: string;
  mimeTypes: string[];
  kind: UploadKind;
}

const ALLOWED_TYPES: Record<string, AllowedUploadType> = {
  '.pdf': { extension: '.pdf', mimeTypes: ['application/pdf'], kind: 'document' },
  '.txt': { extension: '.txt', mimeTypes: ['text/plain'], kind: 'document' },
  '.docx': {
    extension: '.docx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    kind: 'document',
  },
  '.pptx': {
    extension: '.pptx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    kind: 'document',
  },
  '.mp3': { extension: '.mp3', mimeTypes: ['audio/mpeg', 'audio/mp3'], kind: 'audio' },
  '.wav': { extension: '.wav', mimeTypes: ['audio/wav', 'audio/x-wav'], kind: 'audio' },
  '.ogg': { extension: '.ogg', mimeTypes: ['audio/ogg'], kind: 'audio' },
  '.flac': { extension: '.flac', mimeTypes: ['audio/flac', 'audio/x-flac'], kind: 'audio' },
  '.aac': { extension: '.aac', mimeTypes: ['audio/aac'], kind: 'audio' },
  '.m4a': { extension: '.m4a', mimeTypes: ['audio/mp4', 'audio/x-m4a'], kind: 'audio' },
  '.mp4': { extension: '.mp4', mimeTypes: ['video/mp4'], kind: 'video' },
};

export interface ValidatedUpload {
  safeFileName: string;
  extension: string;
  contentType: string;
  modality: 'document' | 'audio';
}

// Lesson videos go straight from the browser to R2 (compressed there first).
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const VIDEO_TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm' };

export function isVideoFileName(name: string): boolean {
  return path.extname(name).toLowerCase() in VIDEO_TYPES;
}

export function hasVideoSignature(extension: string, head: Buffer): boolean {
  if (extension === '.mp4') return head.subarray(4, 8).toString() === 'ftyp';
  if (extension === '.webm') return head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return false;
}

export function sanitizeFileName(originalName: string): string {
  const base = path.basename(originalName || 'upload');
  const ext = path.extname(base).toLowerCase();
  const stem = path.basename(base, ext).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return `${stem || 'upload'}${ext}`;
}

function hasAllowedSignature(extension: string, buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  if (extension === '.pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (extension === '.docx' || extension === '.pptx') {
    return buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }
  if (extension === '.mp3') {
    return buffer.subarray(0, 3).toString() === 'ID3' || buffer[0] === 0xff;
  }
  if (extension === '.wav') return buffer.subarray(0, 4).toString() === 'RIFF';
  if (extension === '.ogg') return buffer.subarray(0, 4).toString() === 'OggS';
  if (extension === '.flac') return buffer.subarray(0, 4).toString() === 'fLaC';
  if (extension === '.mp4' || extension === '.m4a') {
    return buffer.subarray(4, 8).toString() === 'ftyp';
  }
  if (extension === '.txt') {
    return !buffer.subarray(0, Math.min(buffer.length, 512)).includes(0);
  }
  if (extension === '.aac') return true;
  return false;
}

export function validateUploadFile(file: {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}): ValidatedUpload {
  if (!file) throw new AppError('No file uploaded', 400, 'UPLOAD_REQUIRED');
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new AppError('File size is not allowed', 413, 'UPLOAD_SIZE_NOT_ALLOWED');
  }

  const safeFileName = sanitizeFileName(file.originalname);
  const extension = path.extname(safeFileName).toLowerCase();
  const type = ALLOWED_TYPES[extension];
  if (!type) {
    throw new AppError('File type is not allowed', 415, 'UPLOAD_TYPE_NOT_ALLOWED');
  }

  const contentType = (file.mimetype || '').toLowerCase();
  if (!type.mimeTypes.includes(contentType)) {
    throw new AppError('File content type is not allowed', 415, 'UPLOAD_MIME_NOT_ALLOWED');
  }

  if (!hasAllowedSignature(extension, file.buffer)) {
    throw new AppError('File content does not match the declared type', 415, 'UPLOAD_SIGNATURE_MISMATCH');
  }

  return {
    safeFileName,
    extension,
    contentType,
    modality: type.kind === 'audio' ? 'audio' : 'document',
  };
}

// Content-Types the AI engine accepts at download time (BACKEND_API.md §5). Anything else
// is a permanent InvalidFileType failure, so reject before uploading to S3.
const ENGINE_CONTENT_TYPES: Record<ValidatedUpload['modality'], string[]> = {
  document: ['application/pdf'],
  audio: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/flac',
    'audio/aac',
    'audio/mp4',
    'audio/x-m4a',
  ],
};

export function toEngineContentType(upload: ValidatedUpload): string {
  const contentType = upload.contentType === 'audio/x-flac' ? 'audio/flac' : upload.contentType;
  if (!ENGINE_CONTENT_TYPES[upload.modality].includes(contentType)) {
    throw new AppError(
      'Only PDF documents and supported audio files can be ingested',
      415,
      'UPLOAD_NOT_INGESTIBLE'
    );
  }
  return contentType;
}

export function buildStorageKey(prefix: string, safeFileName: string): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9/_:-]/g, '_').replace(/\/+/g, '/');
  return `${safePrefix.replace(/\/$/, '')}/${randomUUID()}-${safeFileName}`;
}

export function isAllowedUploadExtension(fileName: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, path.extname(fileName).toLowerCase());
}

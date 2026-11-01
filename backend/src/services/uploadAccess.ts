import path from 'path';
import { randomUUID } from 'crypto';
import { CurriculumFileJob } from '../models/CurriculumChunk';
import { Curriculum } from '../models/Curriculum';
import { isVideoFileName } from '../utils/uploadSecurity';

// Who owns an uploaded file, and may its original be downloaded? (P22,
// owner decisions of 2026-11-01: malware scanning is deferred; nobody, staff
// included, gets the original of a file that has not been scanned clean.)
//
// Ownership: new files are stored as `<institution>~<uuid>-<name>`, so the
// R2 key (`uploads/<institution>~...`) is scoped to the school. Older files
// without the prefix are owned by their document record, or by the single
// school whose curriculum lists them; anything else has no known owner and
// gets no link.

const SCHOOL_PREFIX = /^([A-Za-z0-9_-]{1,80})~[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

// Content with no school (legacy platform-wide curricula) is owned by 'global'.
export function schoolSlug(institutionId: string | undefined | null): string {
  return (institutionId || 'global').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

// Stored name for a new upload, scoped to its school.
export function storedUploadName(institutionId: string | undefined, safeFileName: string): string {
  return `${schoolSlug(institutionId)}~${randomUUID()}-${safeFileName}`;
}

export function ownerFromName(name: string): string | null {
  return SCHOOL_PREFIX.exec(path.basename(name))?.[1] ?? null;
}

export type DownloadEligibility =
  | { downloadable: true; reason: 'scanned_clean' | 'media' }
  | { downloadable: false; reason: 'not_scanned' | 'pending' | 'deferred' | 'failed' | 'infected' | 'removed' | 'unknown_file' };

export function eligibilityOf(job: { scanStatus?: string; status?: string; deletedAt?: Date | null } | null | undefined, name: string): DownloadEligibility {
  if (job) {
    if (job.status === 'removed' || job.deletedAt) return { downloadable: false, reason: 'removed' };
    switch (job.scanStatus) {
      case 'clean': return { downloadable: true, reason: 'scanned_clean' };
      case 'infected': return { downloadable: false, reason: 'infected' };
      case 'failed': return { downloadable: false, reason: 'failed' };
      case 'deferred': return { downloadable: false, reason: 'deferred' };
      case 'pending': case 'unavailable': return { downloadable: false, reason: 'pending' };
      default: return { downloadable: false, reason: 'not_scanned' };
    }
  }
  // Lesson videos are media for playback (type and magic bytes checked on
  // upload), not documents; listed as an owner decision in the report.
  if (isVideoFileName(name)) return { downloadable: true, reason: 'media' };
  return { downloadable: false, reason: 'not_scanned' };
}

export interface UploadInfo { owner: string | null; eligibility: DownloadEligibility }

// One lookup for every /uploads/ path in a response or request.
export async function resolveUploads(paths: string[]): Promise<Map<string, UploadInfo>> {
  const plain = [...new Set(paths.filter((p) => typeof p === 'string' && p.startsWith('/uploads/')))];
  const out = new Map<string, UploadInfo>();
  if (!plain.length) return out;
  const jobs = await CurriculumFileJob.find({ fileUrl: { $in: plain } }).select('fileUrl institutionId scanStatus status deletedAt').lean();
  const jobByUrl = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) {
    const prev = jobByUrl.get(j.fileUrl);
    // The same stored path is never reused; if it were, the strictest record wins.
    if (!prev || !eligibilityOf(j, j.fileUrl).downloadable) jobByUrl.set(j.fileUrl, j);
  }
  const needOwner = plain.filter((p) => !ownerFromName(p) && !jobByUrl.has(p));
  const listed = new Map<string, Set<string>>();
  if (needOwner.length) {
    const curricula = await Curriculum.find({ 'chapters.uploads': { $in: needOwner } }).select('institutionId chapters.uploads').lean();
    for (const c of curricula) for (const ch of c.chapters ?? []) for (const u of ch.uploads ?? []) {
      if (!needOwner.includes(u)) continue;
      if (!listed.has(u)) listed.set(u, new Set());
      listed.get(u)!.add(schoolSlug(c.institutionId));
    }
  }
  for (const p of plain) {
    const job = jobByUrl.get(p);
    const prefixed = ownerFromName(p);
    const fromList = listed.get(p);
    const owner = prefixed ?? (job ? schoolSlug(job.institutionId) : fromList && fromList.size === 1 ? [...fromList][0] : null);
    out.set(p, { owner, eligibility: eligibilityOf(job, p) });
  }
  return out;
}

export async function resolveUpload(p: string): Promise<UploadInfo> {
  return (await resolveUploads([p])).get(p) ?? { owner: null, eligibility: { downloadable: false, reason: 'unknown_file' } };
}

// Keeps only /uploads/ paths that belong to this school (other strings stay).
// Used wherever a client sends upload paths back (curriculum create/update),
// so another school's file can never be attached, signed or deleted.
export async function ownUploadsOnly(institutionId: string | undefined, values: string[], alreadyListed: Set<string> = new Set()): Promise<string[]> {
  const uploads = values.filter((v) => typeof v === 'string' && v.startsWith('/uploads/'));
  if (!uploads.length) return values;
  const info = await resolveUploads(uploads);
  const mine = schoolSlug(institutionId);
  return values.filter((v) => !v.startsWith('/uploads/') || alreadyListed.has(v) || info.get(v)?.owner === mine);
}

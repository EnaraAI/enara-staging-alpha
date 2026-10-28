import { AppError } from '../middleware/errorHandler';
import type { AuthRequest } from '../middleware/auth.middleware';
import { CurriculumFileJob } from '../models/CurriculumChunk';
import { documentsForChat } from './educatorChat';
import { isFeatureEnabled } from './featureFlags';

// Source-linked generation (P4.1). A teacher may name the documents a draft
// is built from. The choice only narrows: the documents must be in the
// caller's read scope, in this curriculum, and cleared for AI use (in a gated
// school: rights attested and genuinely scanned clean). Each failure is
// reported distinctly and nothing is sent to the AI.
export const MAX_SOURCE_UPLOADS = 10;

const STATE_MESSAGES: Record<string, [string, string]> = {
  awaiting_scan: ['is waiting for a malware scan, so it cannot be used yet', 'SOURCE_AWAITING_SCAN'],
  scan_unavailable: ['has not been scanned (no scanner is configured), so it cannot be used yet', 'SOURCE_SCAN_UNAVAILABLE'],
  scan_failed: ['could not be scanned, so it cannot be used', 'SOURCE_SCAN_FAILED'],
  rejected: ['was blocked by the malware scan', 'SOURCE_BLOCKED'],
  no_text: ['has no readable text (for example a scanned PDF without text)', 'SOURCE_NO_TEXT'],
  unsupported: ['is not a file type ENARA can read', 'SOURCE_UNSUPPORTED'],
  needs_attestation: ['needs a rights confirmation before it can be used', 'SOURCE_RIGHTS_REQUIRED'],
  queued: ['is still being processed', 'SOURCE_PROCESSING'],
  extracting: ['is still being processed', 'SOURCE_PROCESSING'],
};

export async function resolveGenerationSources(req: AuthRequest, curriculum: { id: string; institutionId?: string }, raw: unknown): Promise<string[] | undefined> {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_SOURCE_UPLOADS || raw.some((x) => typeof x !== 'string' || x.length > 80)) {
    throw new AppError(`Choose 1 to ${MAX_SOURCE_UPLOADS} documents`, 400, 'VALIDATION_ERROR');
  }
  if (!(await isFeatureEnabled(curriculum.institutionId, 'connected_workflow_enabled'))) throw new AppError('Source-linked drafts are not enabled for this school', 403, 'FEATURE_DISABLED');
  const ids = [...new Set(raw as string[])];
  const docs = await documentsForChat(req, ids);
  const found = new Map(docs.map((d) => [d.uploadId, d]));
  for (const id of ids) {
    const d = found.get(id);
    if (d && d.curriculumId === curriculum.id) continue;
    if (!d) {
      // Removed by its owner or by retention: say so, but only within scope.
      const gone = await CurriculumFileJob.findOne({ id, institutionId: curriculum.institutionId, curriculumId: curriculum.id, status: 'removed' }).select('id').lean();
      if (gone && (await documentsForChatScopeIncludes(req, curriculum.id))) throw new AppError('This document has expired or was deleted', 410, 'SOURCE_EXPIRED');
    }
    throw new AppError('Document not found', 404, 'NOT_FOUND');
  }
  const blocked = docs.find((d) => !d.eligible);
  if (blocked) {
    const [why, code] = STATE_MESSAGES[blocked.state] ?? ['is not ready to use yet', 'SOURCE_NOT_READY'];
    throw new AppError(`"${blocked.fileName}" ${why}.`, 409, code);
  }
  return ids;
}

// Whether the caller may read this curriculum at all (for the expired notice).
async function documentsForChatScopeIncludes(req: AuthRequest, curriculumId: string) {
  const { curriculumScope } = await import('../controllers/curriculum.controller');
  const { Curriculum } = await import('../models/Curriculum');
  return Boolean(await Curriculum.exists(await curriculumScope(req, { id: curriculumId }, 'read')));
}

// A draft item with no server-validated source is labelled so the teacher
// must correct or acknowledge it before publishing.
export const NO_SUPPORTING_SOURCE = 'no_supporting_source' as const;

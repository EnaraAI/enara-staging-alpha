import { logger, serializeError } from '../../../utils/logging';
import { LmsAuditLog, type ILmsAuditLog } from '../models';

// Writes one lms_audit_log row. IDs and codes only: values must be short
// strings, numbers or booleans, and keys that usually hold personal data are
// dropped. Never throws; an audit failure is logged and the caller continues.
const PII_KEY = /(email|name|given|family|phone|address|comment|text|message|token|secret|password)/i;
const MAX_VALUE = 200;
const MAX_KEYS = 20;

export function sanitizeRefIds(refIds: Record<string, unknown> = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(refIds)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    // An identifier key (contextId, lmsUserIds, ...) is kept even when its
    // name happens to contain a word above (conTEXTId); its value is an ID.
    const idKey = /[a-z](Id|Ids)$/.test(k) && !/(email|name|phone|token|secret|password)/i.test(k);
    if (!idKey && PII_KEY.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, MAX_VALUE);
  }
  return out;
}

export interface LmsAuditInput {
  event: string;
  outcome: ILmsAuditLog['outcome'];
  institutionId?: string;
  platformId?: string;
  actor?: string;
  refIds?: Record<string, unknown>;
  code?: string;
}

export async function writeLmsAudit(input: LmsAuditInput): Promise<void> {
  try {
    await LmsAuditLog.create({
      event: input.event.slice(0, 80),
      outcome: input.outcome,
      institutionId: input.institutionId,
      platformId: input.platformId,
      actor: input.actor?.slice(0, 80),
      refIds: sanitizeRefIds(input.refIds),
      code: input.code?.slice(0, 80),
    });
  } catch (error) {
    logger.error('lms_audit_write_failed', { event: input.event, error: serializeError(error) });
  }
}

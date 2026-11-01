import mongoose from 'mongoose';
import { AuditEvent } from '../models/AuditEvent';
import { AlertEvent } from '../models/AlertEvent';
import { logger, serializeError } from '../utils/logging';
import { getCallContext } from '../utils/callContext';

// Privileged-action audit trail and persisted alerts (P22).

type Actor = { id?: string; role?: string } | undefined;

export async function recordAudit(action: string, actor: Actor, target: { institutionId?: string; type?: string; id?: string }, detail?: Record<string, unknown>): Promise<void> {
  const row = { at: new Date(), action, actorId: actor?.id, actorRole: actor?.role, institutionId: target.institutionId, targetType: target.type, targetId: target.id, detail, requestId: getCallContext()?.requestId };
  logger.info('audit', { action, actorId: row.actorId, institutionId: row.institutionId, targetType: row.targetType, targetId: row.targetId });
  if (mongoose.connection.readyState !== 1) return;
  try {
    await AuditEvent.create(row);
  } catch (error) {
    logger.error('audit_write_failed', { action, error: serializeError(error) });
  }
}

const ALERT_WINDOW_MS = 10 * 60 * 1000;

// One stored alert per kind/scope per 10-minute window (dedupeKey), so a
// storm of the same failure is one row, not thousands.
export async function recordAlert(kind: string, severity: 'info' | 'warning' | 'critical', detail: Record<string, unknown> = {}, institutionId?: string): Promise<void> {
  const bucket = Math.floor(Date.now() / ALERT_WINDOW_MS);
  const dedupeKey = `${kind}:${institutionId ?? '-'}:${String(detail.scope ?? '')}:${bucket}`;
  (severity === 'critical' ? logger.error : logger.warn)('alert', { kind, severity, institutionId, delivery: 'not_configured', ...detail });
  if (mongoose.connection.readyState !== 1) return;
  try {
    await AlertEvent.updateOne({ dedupeKey }, { $setOnInsert: { at: new Date(), kind, severity, institutionId, detail, delivery: 'not_configured', dedupeKey } }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) logger.error('alert_write_failed', { kind, error: serializeError(error) });
  }
}

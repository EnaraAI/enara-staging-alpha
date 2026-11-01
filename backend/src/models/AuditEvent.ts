import { Schema, model, Document } from 'mongoose';

// Append-only audit trail of privileged actions (P22). Never holds secrets,
// signed links, student answers or free text a person typed: only who did
// what to which record, and the changed setting names/values.
export interface IAuditEvent extends Document {
  at: Date;
  action: string;
  actorId?: string;
  actorRole?: string;
  institutionId?: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  requestId?: string;
}

const auditSchema = new Schema<IAuditEvent>(
  {
    at: { type: Date, required: true, default: () => new Date() },
    action: { type: String, required: true },
    actorId: String,
    actorRole: String,
    institutionId: String,
    targetType: String,
    targetId: String,
    detail: { type: Schema.Types.Mixed },
    requestId: String,
  },
  { collection: 'audit_events', versionKey: false },
);
// Retention (owner decision 2026-11-01, OD-5): one month, removed by MongoDB
// (not by the application, which never updates or deletes audit rows).
export const AUDIT_RETENTION_DAYS = 30;
auditSchema.index({ at: 1 }, { expireAfterSeconds: AUDIT_RETENTION_DAYS * 86400, name: 'retention_30d' });
auditSchema.index({ institutionId: 1, at: -1 });
auditSchema.index({ action: 1, at: -1 });

// Append-only: the application never updates or deletes audit rows.
const refuse = function () { throw new Error('audit_events is append-only'); };
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace'] as const) {
  auditSchema.pre(op as any, refuse);
}

export const AuditEvent = model<IAuditEvent>('AuditEvent', auditSchema);

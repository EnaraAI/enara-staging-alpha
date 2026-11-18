import { Schema, model, models, type Model } from 'mongoose';
import { newId } from './common';

// lms_audit_log: every registration, launch (and launch failure), roster diff
// summary and grade push (Spec §8). IDs and codes only, never personal data.
// institutionId is optional only here: a launch from an unknown platform has
// no school yet. Hobby keeps runtime logs for 1 hour, so this is the record.
export interface ILmsAuditLog {
  id: string;
  institutionId?: string;
  platformId?: string;
  event: string;
  outcome: 'ok' | 'warn' | 'fail';
  actor?: string;
  refIds: Record<string, string | number | boolean>;
  code?: string;
  createdAt: Date;
}

const auditSchema = new Schema<ILmsAuditLog>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmsa') },
    institutionId: { type: String, index: true },
    platformId: String,
    event: { type: String, required: true },
    outcome: { type: String, enum: ['ok', 'warn', 'fail'], required: true },
    actor: String,
    refIds: { type: Schema.Types.Mixed, default: {} },
    code: String,
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'lms_audit_log', versionKey: false },
);
auditSchema.index({ institutionId: 1, createdAt: -1 });
auditSchema.index({ outcome: 1, createdAt: -1 });
// LMS email digests read one event over the last day or week.
auditSchema.index({ event: 1, createdAt: 1 });

export const LmsAuditLog = (models.LmsAuditLog as Model<ILmsAuditLog>) || model<ILmsAuditLog>('LmsAuditLog', auditSchema);

import { Schema, model, Document } from 'mongoose';

// Persisted operational alerts (P22). No alert sink (email, Slack, paging)
// is configured in this repository, so every row says delivery
// 'not_configured': nobody has been notified until an operator reads them.
export interface IAlertEvent extends Document {
  at: Date;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  institutionId?: string;
  detail?: Record<string, unknown>;
  delivery: 'not_configured' | 'sent' | 'failed';
  dedupeKey?: string;
}

const alertSchema = new Schema<IAlertEvent>(
  {
    at: { type: Date, required: true, default: () => new Date() },
    kind: { type: String, required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
    institutionId: String,
    detail: { type: Schema.Types.Mixed },
    delivery: { type: String, enum: ['not_configured', 'sent', 'failed'], default: 'not_configured' },
    dedupeKey: String,
  },
  { collection: 'alert_events', versionKey: false },
);
// Retention (owner decision 2026-11-01, OD-5): one month.
export const ALERT_RETENTION_DAYS = 30;
alertSchema.index({ at: 1 }, { expireAfterSeconds: ALERT_RETENTION_DAYS * 86400, name: 'retention_30d' });
alertSchema.index({ kind: 1, at: -1 });
alertSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

export const AlertEvent = model<IAlertEvent>('AlertEvent', alertSchema);

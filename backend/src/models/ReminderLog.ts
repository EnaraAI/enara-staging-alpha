import { Schema, model, Document } from 'mongoose';
import { dataLogRetentionDays } from '../config/retention';

// Proactive emails that were sent (or would have been, in a dry run), so a
// student isn't reminded more than once every few days.
export interface IReminderLog extends Document {
  kind: 'student_reminder' | 'weekly_summary' | 'assignment_published' | 'results_released';
  recipientKey: string;
  to: string;
  subject: string;
  sent: boolean;
  createdAt: Date;
}

const reminderLogSchema = new Schema<IReminderLog>(
  {
    kind: { type: String, enum: ['student_reminder', 'weekly_summary', 'assignment_published', 'results_released'], required: true },
    recipientKey: { type: String, required: true, index: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    sent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Holds email addresses and subjects: kept DATA_LOG_RETENTION_DAYS (PDPL P5,
// default 30; it was 90). Migration 2026-11-17-pdpl-data-log-retention moves
// the existing TTL index to the setting.
export const REMINDER_LOG_RETENTION_DAYS = dataLogRetentionDays();
reminderLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: REMINDER_LOG_RETENTION_DAYS * 86400 });

export const ReminderLog = model<IReminderLog>('ReminderLog', reminderLogSchema);

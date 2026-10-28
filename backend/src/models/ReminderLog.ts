import { Schema, model, Document } from 'mongoose';

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

reminderLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ReminderLog = model<IReminderLog>('ReminderLog', reminderLogSchema);

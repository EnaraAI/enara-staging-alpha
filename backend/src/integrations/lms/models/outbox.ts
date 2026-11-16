import { Schema, model, models, type Model } from 'mongoose';
import { newId, requiredOrg } from './common';

// lms_grade_sync_jobs: the grade outbox (Spec §4, plan §5). A job is claimed
// atomically pending -> processing with a lease; an expired lease returns it
// to pending. Retries stay `pending` with a later nextAttemptAt; after the
// long schedule is exhausted the job is `dead` (admin can retry).
//
// Subject-neutral: `levelLabel`/`levelScheme` are set only when the activity
// has a level (e.g. CEFR for language courses); other subjects leave them empty.
export type GradeJobStatus = 'pending' | 'processing' | 'sent' | 'dead';

export interface ILmsGradeSyncJob {
  id: string;
  idempotencyKey: string;
  institutionId: string;
  platformId: string;
  contextId: string;
  lineItemRef: string;
  lmsUserId: string;
  enaraAttemptId: string;
  scoreGiven: number;
  scoreMaximum: number;
  levelScheme?: string;
  levelLabel?: string;
  comment?: string;
  activityProgress: 'Initialized' | 'Started' | 'InProgress' | 'Submitted' | 'Completed';
  gradingProgress: 'FullyGraded' | 'Pending' | 'PendingManual' | 'Failed' | 'NotReady';
  /** AGS Score.timestamp; increases on every push for the same user and line item. */
  scoreTimestamp: Date;
  status: GradeJobStatus;
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil?: Date;
  leaseOwner?: string;
  lastError?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<ILmsGradeSyncJob>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmsj') },
    idempotencyKey: { type: String, required: true, unique: true },
    institutionId: requiredOrg,
    platformId: { type: String, required: true },
    contextId: { type: String, required: true },
    lineItemRef: { type: String, required: true },
    lmsUserId: { type: String, required: true },
    enaraAttemptId: { type: String, required: true },
    scoreGiven: { type: Number, required: true, min: 0 },
    scoreMaximum: { type: Number, required: true, min: 0 },
    levelScheme: String,
    levelLabel: String,
    comment: { type: String, maxlength: 2000 },
    activityProgress: { type: String, enum: ['Initialized', 'Started', 'InProgress', 'Submitted', 'Completed'], default: 'Completed' },
    gradingProgress: { type: String, enum: ['FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady'], default: 'FullyGraded' },
    scoreTimestamp: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'processing', 'sent', 'dead'], default: 'pending' },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, required: true, default: () => new Date() },
    leaseUntil: Date,
    leaseOwner: String,
    lastError: { type: String, maxlength: 500 },
    sentAt: Date,
  },
  { collection: 'lms_grade_sync_jobs', versionKey: false, timestamps: true },
);
jobSchema.index({ status: 1, nextAttemptAt: 1 });
jobSchema.index({ status: 1, leaseUntil: 1 });
jobSchema.index({ institutionId: 1, contextId: 1, status: 1 });
jobSchema.index({ lmsUserId: 1, status: 1 });

// lms_locks: named, expiring locks (e.g. "drain once a minute across instances").
// Tool-wide; not tied to one school.
export interface ILmsLock {
  _id: string;
  lockedUntil: Date;
  owner: string;
}

const lockSchema = new Schema<ILmsLock>(
  { _id: { type: String, required: true }, lockedUntil: { type: Date, required: true }, owner: { type: String, required: true } },
  { collection: 'lms_locks', versionKey: false },
);

export const LmsGradeSyncJob = (models.LmsGradeSyncJob as Model<ILmsGradeSyncJob>) || model<ILmsGradeSyncJob>('LmsGradeSyncJob', jobSchema);
export const LmsLock = (models.LmsLock as Model<ILmsLock>) || model<ILmsLock>('LmsLock', lockSchema);

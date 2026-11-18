import { randomUUID } from 'crypto';
import { Schema, model, models, type Model } from 'mongoose';

// Grade ledger (owner decision 4, 2026-11-18; docs/lms/GRADE_LEDGER_NOTES.md).
// Behind GRADE_LEDGER_ENABLED (default off). Three collections:
//
//   grade_ledger      APPEND-ONLY. One entry per change of an attempt's result
//                     (submitted, auto graded, teacher scored / override /
//                     correction, released, regraded, LMS change detected,
//                     the teacher's keep-LMS / keep-ENARA decision): who, why,
//                     old value -> new value, when.
//   grade_sync_log    APPEND-ONLY. One row per try to send a result to an LMS
//                     (what was sent, when, sent / retried / failed / dead and
//                     the error code), linked to the lms_grade_sync_jobs row
//                     and the ledger entry.
//   grade_lms_slots   Mutable state per LMS gradebook cell (resource link +
//                     LMS user): "LMS value differs" holds the cell (no
//                     automatic sends) until the teacher decides.
//
// Append-only is enforced here: every Mongoose update / replace / delete on
// the two ledgers throws, and saving an existing document throws. The only
// writer allowed to change rows is PDPL permanent deletion
// (services/gradeLedger.ts anonymiseGradeLedger, called from
// services/studentErasure.ts), which works on the raw collection; a test
// greps the source so no other file does.

export const LEDGER_REASONS = [
  'submitted',
  'newer_attempt',
  'auto_graded',
  'grading_exception',
  'teacher_scored',
  'teacher_override',
  'teacher_finalized',
  'teacher_correction',
  'released',
  'regrade_requested',
  'regrade_after_grader_fix',
  'lms_change_detected',
  'lms_change_reverted',
  'kept_lms_value',
  'kept_enara_value',
] as const;
export type LedgerReason = (typeof LEDGER_REASONS)[number];

/** A result as the ledger records it. `status` is the grading status (or the attempt status). */
export interface LedgerValue {
  points?: number | null;
  maxPoints?: number | null;
  /** ENARA's percentage (attempt.score). */
  percent?: number | null;
  status?: string | null;
  /** LMS values: the gradebook's own scale (e.g. 66.67 / 100) and its fraction. */
  fraction?: number | null;
}

export interface ILedgerLms {
  platformId?: string;
  contextId?: string;
  resourceLinkId?: string;
  lmsUserId?: string;
  jobId?: string;
}

export interface IGradeLedgerEntry {
  id: string;
  institutionId: string;
  assignmentId?: string;
  attemptId: string;
  /** 1-based, per student per assignment, by start time. */
  attemptNumber?: number;
  studentId: string;
  reason: LedgerReason;
  /** 'system', 'student', or the teacher's / admin's user ID. */
  actor: string;
  from?: LedgerValue | null;
  to?: LedgerValue | null;
  questionId?: string;
  /** Free text the teacher wrote (correction reason). Dropped on PDPL deletion. */
  note?: string;
  lms?: ILedgerLms;
  backfilled?: boolean;
  anonymised?: boolean;
  at: Date;
  createdAt?: Date;
}

export const SYNC_RESULTS = ['sent', 'retried', 'failed', 'dead'] as const;
export type SyncResult = (typeof SYNC_RESULTS)[number];

export interface IGradeSyncLog {
  id: string;
  institutionId: string;
  platformId: string;
  contextId?: string;
  resourceLinkId?: string;
  lmsUserId?: string;
  /** lms_grade_sync_jobs.id */
  jobId?: string;
  attemptId: string;
  assignmentId?: string;
  studentId?: string;
  ledgerEntryId?: string;
  /** What was sent (no names: the comment is kept as a hash and its first words). */
  sent: {
    scoreGiven?: number;
    scoreMaximum?: number;
    gradingProgress?: string;
    activityProgress?: string;
    commentHash?: string;
    commentShort?: string;
    scoreTimestamp?: Date;
  };
  result: SyncResult;
  errorCode?: string;
  tries?: number;
  nextAttemptAt?: Date;
  reason?: string;
  backfilled?: boolean;
  anonymised?: boolean;
  at: Date;
}

export type SlotStatus = 'differs' | 'resolved';

export interface IGradeLmsSlot {
  id: string;
  institutionId: string;
  platformId: string;
  contextId: string;
  resourceLinkId: string;
  lmsUserId: string;
  studentId?: string;
  assignmentId?: string;
  attemptId?: string;
  status?: SlotStatus;
  /** What the LMS showed and what ENARA had sent, when the difference was found. */
  lmsValue?: { scoreGiven?: number | null; scoreMaximum?: number | null; fraction?: number | null };
  enaraValue?: { scoreGiven?: number | null; scoreMaximum?: number | null; fraction?: number | null; gradingProgress?: string };
  detectedAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: 'kept_lms_value' | 'kept_enara_value' | 'lms_matches_again';
  /** After "Keep LMS value": the value both sides now agree on (compared on later checks). */
  agreedFraction?: number | null;
  agreedAt?: Date;
  lastCheckedAt?: Date;
  lastCheckError?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const valueSchema = new Schema<LedgerValue>(
  { points: Number, maxPoints: Number, percent: Number, status: String, fraction: Number },
  { _id: false },
);

const entrySchema = new Schema<IGradeLedgerEntry>(
  {
    id: { type: String, required: true, unique: true, default: () => `gl_${randomUUID().replace(/-/g, '')}` },
    institutionId: { type: String, required: true },
    assignmentId: String,
    attemptId: { type: String, required: true },
    attemptNumber: Number,
    studentId: { type: String, required: true },
    reason: { type: String, required: true, enum: LEDGER_REASONS },
    actor: { type: String, required: true, maxlength: 80 },
    from: { type: valueSchema, default: null },
    to: { type: valueSchema, default: null },
    questionId: String,
    note: { type: String, maxlength: 500 },
    lms: { type: new Schema<ILedgerLms>({ platformId: String, contextId: String, resourceLinkId: String, lmsUserId: String, jobId: String }, { _id: false }), default: undefined },
    backfilled: { type: Boolean, default: undefined },
    anonymised: { type: Boolean, default: undefined },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { collection: 'grade_ledger', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);
entrySchema.index({ attemptId: 1, at: 1 });
entrySchema.index({ institutionId: 1, assignmentId: 1, studentId: 1, at: 1 });
entrySchema.index({ studentId: 1 });

const syncSchema = new Schema<IGradeSyncLog>(
  {
    id: { type: String, required: true, unique: true, default: () => `gsl_${randomUUID().replace(/-/g, '')}` },
    institutionId: { type: String, required: true },
    platformId: { type: String, required: true },
    contextId: String,
    resourceLinkId: String,
    lmsUserId: String,
    jobId: String,
    attemptId: { type: String, required: true },
    assignmentId: String,
    studentId: String,
    ledgerEntryId: String,
    sent: {
      type: new Schema(
        { scoreGiven: Number, scoreMaximum: Number, gradingProgress: String, activityProgress: String, commentHash: String, commentShort: { type: String, maxlength: 80 }, scoreTimestamp: Date },
        { _id: false },
      ),
      default: () => ({}),
    },
    result: { type: String, required: true, enum: SYNC_RESULTS },
    errorCode: { type: String, maxlength: 80 },
    tries: Number,
    nextAttemptAt: Date,
    reason: { type: String, maxlength: 40 },
    backfilled: { type: Boolean, default: undefined },
    anonymised: { type: Boolean, default: undefined },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { collection: 'grade_sync_log', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);
syncSchema.index({ attemptId: 1, at: 1 });
syncSchema.index({ resourceLinkId: 1, lmsUserId: 1, at: -1 });
syncSchema.index({ jobId: 1 });
syncSchema.index({ studentId: 1 });

const slotValue = { scoreGiven: Number, scoreMaximum: Number, fraction: Number };
const slotSchema = new Schema<IGradeLmsSlot>(
  {
    id: { type: String, required: true, unique: true, default: () => `gls_${randomUUID().replace(/-/g, '')}` },
    institutionId: { type: String, required: true },
    platformId: { type: String, required: true },
    contextId: { type: String, required: true },
    resourceLinkId: { type: String, required: true },
    lmsUserId: { type: String, required: true },
    studentId: String,
    assignmentId: String,
    attemptId: String,
    status: { type: String, enum: ['differs', 'resolved'] },
    lmsValue: { type: new Schema(slotValue, { _id: false }), default: undefined },
    enaraValue: { type: new Schema({ ...slotValue, gradingProgress: String }, { _id: false }), default: undefined },
    detectedAt: Date,
    resolvedAt: Date,
    resolvedBy: String,
    resolution: { type: String, enum: ['kept_lms_value', 'kept_enara_value', 'lms_matches_again'] },
    agreedFraction: Number,
    agreedAt: Date,
    lastCheckedAt: Date,
    lastCheckError: { type: String, maxlength: 80 },
  },
  { collection: 'grade_lms_slots', versionKey: false, timestamps: true },
);
slotSchema.index({ resourceLinkId: 1, lmsUserId: 1 }, { unique: true });
slotSchema.index({ institutionId: 1, assignmentId: 1, studentId: 1 });
slotSchema.index({ status: 1 });

// ------------------------------------------------- append-only enforcement

export class AppendOnlyError extends Error {
  constructor(collection: string, op: string) {
    super(`${collection} is append-only: ${op} is not allowed`);
    this.name = 'AppendOnlyError';
  }
}

const BLOCKED_QUERY_OPS = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const;

function appendOnly(schema: Schema, collection: string) {
  for (const op of BLOCKED_QUERY_OPS) {
    schema.pre(op as 'updateOne', function block() {
      throw new AppendOnlyError(collection, op);
    });
  }
  // Document-level: deleting, or saving a change to an existing row.
  schema.pre('deleteOne', { document: true, query: false }, function block() {
    throw new AppendOnlyError(collection, 'deleteOne');
  });
  schema.pre('save', function block() {
    if (!this.isNew) throw new AppendOnlyError(collection, 'save');
  });
  schema.pre('bulkWrite', function block(next: (err?: Error) => void, ops: unknown[]) {
    const bad = (ops ?? []).find((o) => !(o && typeof o === 'object' && 'insertOne' in (o as object)));
    if (bad) throw new AppendOnlyError(collection, 'bulkWrite');
    next();
  });
}
appendOnly(entrySchema, 'grade_ledger');
appendOnly(syncSchema, 'grade_sync_log');

export const GradeLedgerEntry = (models.GradeLedgerEntry as Model<IGradeLedgerEntry>) || model<IGradeLedgerEntry>('GradeLedgerEntry', entrySchema);
export const GradeSyncLog = (models.GradeSyncLog as Model<IGradeSyncLog>) || model<IGradeSyncLog>('GradeSyncLog', syncSchema);
export const GradeLmsSlot = (models.GradeLmsSlot as Model<IGradeLmsSlot>) || model<IGradeLmsSlot>('GradeLmsSlot', slotSchema);

export const GRADE_LEDGER_MODELS = [GradeLedgerEntry, GradeSyncLog, GradeLmsSlot] as const;

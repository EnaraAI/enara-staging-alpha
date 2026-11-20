import { Schema, model, Document } from 'mongoose';

// Learner memory phase 1 (docs/tutor/LEARNER_MEMORY_PLAN.md, owner "go" 20 Nov 2026): an error the learner made on a released assessment,
// to work on in the tutor. One row per (learner, objective, error code). Written by code from graded evidence only, never by the model.
// No question text, answer or learner text is stored: only ids, codes and the question's own error label (school content).
// Status: open -> resolved after two independent rights in a row in later sessions; any wrong answer on it reopens it.
// A teacher can dismiss a row. Deleted with the learner (studentErasure).
export interface IErrorSource { kind: 'assignment_attempt' | 'practice_attempt'; attemptId: string; assessmentId: string; assignmentId?: string; questionId: string; at: Date }
export interface IErrorToWorkOn extends Document {
  id: string;
  institutionId?: string;
  studentId: string;
  courseId?: string;
  curriculumId?: string;
  objectiveId: string;
  /** The error type: a distractor category or diagnosis code, or 'unknown'. */
  errorCode: string;
  /** The question's own label for the error (from the school's item authoring), at most 120 characters. */
  errorLabel?: string;
  sources: IErrorSource[];
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  status: 'open' | 'resolved' | 'dismissed';
  /** Independent rights in a row, counted at most once per later session or attempt. */
  rightStreak: number;
  /** Session / attempt keys already counted (so one session counts once). */
  countedKeys: string[];
  resolvedAt?: Date;
  statusHistory: { at: Date; by?: string; from?: string; to: string; reason?: string }[];
}

const SourceSchema = new Schema<IErrorSource>({ kind: { type: String, enum: ['assignment_attempt', 'practice_attempt'], required: true }, attemptId: { type: String, required: true }, assessmentId: { type: String, required: true }, assignmentId: String, questionId: { type: String, required: true }, at: { type: Date, required: true } }, { _id: false });
const schema = new Schema<IErrorToWorkOn>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    studentId: { type: String, required: true },
    courseId: String,
    curriculumId: String,
    objectiveId: { type: String, required: true },
    errorCode: { type: String, required: true },
    errorLabel: { type: String, maxlength: 120 },
    sources: { type: [SourceSchema], default: [] },
    occurrences: { type: Number, default: 1 },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    rightStreak: { type: Number, default: 0 },
    countedKeys: { type: [String], default: [] },
    resolvedAt: Date,
    statusHistory: { type: [{ at: Date, by: String, from: String, to: String, reason: String }], default: [] },
  },
  { timestamps: true },
);
schema.index({ studentId: 1, objectiveId: 1, errorCode: 1 }, { unique: true });
schema.index({ institutionId: 1, studentId: 1, status: 1 });

// Which released attempts were already turned into errors (one row per learner).
export interface IErrorSync extends Document { studentId: string; institutionId?: string; attemptIds: string[]; updatedAt?: Date }
const syncSchema = new Schema<IErrorSync>({ studentId: { type: String, required: true, unique: true }, institutionId: String, attemptIds: { type: [String], default: [] } }, { timestamps: true });

export const ErrorToWorkOn = model<IErrorToWorkOn>('ErrorToWorkOn', schema, 'errors_to_work_on');
export const ErrorToWorkOnSync = model<IErrorSync>('ErrorToWorkOnSync', syncSchema, 'errors_to_work_on_sync');

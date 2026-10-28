import { Schema, model, Document } from 'mongoose';

// An adaptive diagnostic: the server picks one question at a time for a set of
// objectives, grades each answer, and stops when it has enough evidence or a
// limit is reached. The answer key never leaves the server.
export interface IDiagnosticResponse {
  assessmentId: string;
  questionId: string;
  objectiveIds: string[];
  difficulty?: number;
  answer: string;
  correct: boolean;
  servedAt: Date;
  answeredAt: Date;
}

export interface IDiagnosticSession extends Document {
  id: string;
  institutionId?: string;
  studentId: string;
  courseId: string;
  curriculumId?: string;
  objectiveIds: string[];
  status: 'in_progress' | 'completed' | 'expired' | 'cancelled';
  currentItem?: { assessmentId: string; questionId: string; objectiveId: string; servedAt: Date } | null;
  responses: IDiagnosticResponse[];
  questionsAnswered: number;
  maxQuestions: number;
  maxMinutes: number;
  startedAt: Date;
  completedAt?: Date;
  stopReason?: 'max_questions' | 'max_duration' | 'enough_evidence' | 'pool_exhausted' | 'student_ended' | 'cancelled';
  algorithmVersion: string;
  // One row per selection: which objective and why (explainability).
  decisions: { at: Date; objectiveId: string; questionId: string; reason: string }[];
}

const diagnosticSchema = new Schema<IDiagnosticSession>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    studentId: { type: String, required: true },
    courseId: { type: String, required: true },
    curriculumId: String,
    objectiveIds: { type: [String], default: [] },
    status: { type: String, enum: ['in_progress', 'completed', 'expired', 'cancelled'], default: 'in_progress' },
    currentItem: {
      type: { assessmentId: String, questionId: String, objectiveId: String, servedAt: Date, _id: false },
      default: null,
    },
    responses: {
      type: [
        {
          assessmentId: String,
          questionId: String,
          objectiveIds: [String],
          difficulty: Number,
          answer: String,
          correct: Boolean,
          servedAt: Date,
          answeredAt: Date,
          _id: false,
        },
      ],
      default: [],
    },
    questionsAnswered: { type: Number, default: 0 },
    maxQuestions: { type: Number, default: 12 },
    maxMinutes: { type: Number, default: 30 },
    startedAt: { type: Date, required: true },
    completedAt: Date,
    stopReason: String,
    algorithmVersion: { type: String, required: true },
    decisions: { type: [{ at: Date, objectiveId: String, questionId: String, reason: String, _id: false }], default: [] },
  },
  { collection: 'diagnostic_sessions', versionKey: false, timestamps: true },
);

diagnosticSchema.index({ studentId: 1, courseId: 1 }, { unique: true, partialFilterExpression: { status: 'in_progress' }, name: 'one_open_diagnostic' });
diagnosticSchema.index({ institutionId: 1, startedAt: -1 });
diagnosticSchema.index({ studentId: 1, startedAt: -1 });

export const DiagnosticSession = model<IDiagnosticSession>('DiagnosticSession', diagnosticSchema);

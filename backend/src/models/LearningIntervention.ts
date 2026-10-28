import { Schema, model, Document } from 'mongoose';

// Links a learning gap to an activity and follows it to an independent
// reassessment. Completing the activity does not change mastery; only the
// reassessment's evidence does.
export const EDUCATOR_ACTIONS = ['revisit_lesson', 'prerequisite_practice', 'targeted_exercise', 'check_in', 'tutor_support', 'spaced_review', 'reassessment'] as const;
export type InterventionType = 'ai_tutoring' | 'guided_practice' | 'review' | 'teacher_assigned' | (typeof EDUCATOR_ACTIONS)[number];

export interface ILearningIntervention extends Document {
  id: string;
  institutionId?: string;
  studentId: string;
  // Every type except check_in is about an objective.
  objectiveId?: string;
  courseId?: string;
  interventionType: InterventionType;
  // Educator actions (Phase 3): why, who follows up, by when, and what it uses.
  rationale?: string;
  ownerId?: string;
  dueAt?: Date;
  lessonId?: string;
  assignmentId?: string;
  outcomeNote?: string;
  strategyId?: string;
  status: 'recommended' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  assignedBy: 'system' | 'teacher' | 'student';
  assignedByUserId?: string;
  note?: string;
  sourceEvidenceIds: string[];
  tutorSessionIds: string[];
  // Mastery when it started and after the reassessment.
  baseline?: { masteryStatus: string; masteryEstimate: number | null; evidenceStrength: string; at: Date };
  reassessmentDiagnosticId?: string;
  outcome?: { masteryStatus: string; masteryEstimate: number | null; evidenceStrength: string; at: Date; improved: boolean };
  startedAt?: Date;
  completedAt?: Date;
  reassessedAt?: Date;
  history: { at: Date; by?: string; from?: string; to: string; note?: string }[];
}

const masterySnapshot = { masteryStatus: String, masteryEstimate: Number, evidenceStrength: String, at: Date };

const schema = new Schema<ILearningIntervention>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    studentId: { type: String, required: true },
    objectiveId: String,
    courseId: String,
    interventionType: { type: String, enum: ['ai_tutoring', 'guided_practice', 'review', 'teacher_assigned', ...EDUCATOR_ACTIONS], required: true },
    rationale: String,
    ownerId: String,
    dueAt: Date,
    lessonId: String,
    assignmentId: String,
    outcomeNote: String,
    strategyId: String,
    status: { type: String, enum: ['recommended', 'assigned', 'in_progress', 'completed', 'cancelled'], default: 'assigned' },
    assignedBy: { type: String, enum: ['system', 'teacher', 'student'], required: true },
    assignedByUserId: String,
    note: String,
    sourceEvidenceIds: { type: [String], default: [] },
    tutorSessionIds: { type: [String], default: [] },
    baseline: masterySnapshot,
    reassessmentDiagnosticId: String,
    outcome: { ...masterySnapshot, improved: Boolean },
    startedAt: Date,
    completedAt: Date,
    reassessedAt: Date,
    history: { type: [{ at: Date, by: String, from: String, to: String, note: String, _id: false }], default: [] },
  },
  { collection: 'learning_interventions', versionKey: false, timestamps: true },
);

// One active intervention per student and objective.
schema.index(
  { studentId: 1, objectiveId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['recommended', 'assigned', 'in_progress'] } }, name: 'one_active_intervention' },
);
schema.index({ institutionId: 1, status: 1, updatedAt: -1 });
schema.index({ reassessmentDiagnosticId: 1 });
schema.index({ institutionId: 1, ownerId: 1, status: 1 });

export const LearningIntervention = model<ILearningIntervention>('LearningIntervention', schema);

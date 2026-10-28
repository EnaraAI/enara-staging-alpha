import { Schema, model, Document } from 'mongoose';

// A learning objective in a curriculum: the unit the knowledge model tracks.
// Prerequisites point at other objectives in the same curriculum (no cycles).
// Objectives are archived, never deleted, once evidence may refer to them.
export const OBJECTIVE_STATUSES = ['draft', 'approved', 'archived'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export interface IObjectiveRevision {
  version: number;
  changedBy?: string;
  changedAt: Date;
  // Field names that changed in this version.
  fields: string[];
  note?: string;
}

export interface ILearningObjective extends Document {
  id: string;
  institutionId: string;
  curriculumId: string;
  courseId?: string;
  subjectId?: string;
  lessonIds: string[];
  code: string;
  title: string;
  description: string;
  // Language of title/description; `translations` holds the other language.
  language: 'en' | 'ar';
  translations?: { en?: { title?: string; description?: string }; ar?: { title?: string; description?: string } };
  difficultyLevel?: number;
  prerequisiteObjectiveIds: string[];
  estimatedLearningMinutes?: number;
  status: ObjectiveStatus;
  version: number;
  // Where the objective came from: a person, or an AI proposal awaiting review.
  origin: 'teacher' | 'ai';
  extraction?: {
    method: string;
    model?: string;
    extractedAt: Date;
    sourceLessonIds: string[];
    curriculumUpdatedAt?: Date;
  };
  approvedBy?: string;
  approvedAt?: Date;
  createdBy?: string;
  history: IObjectiveRevision[];
  createdAt: Date;
  updatedAt: Date;
}

const textPair = { title: String, description: String };

const objectiveSchema = new Schema<ILearningObjective>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true },
    curriculumId: { type: String, required: true },
    courseId: String,
    subjectId: String,
    lessonIds: { type: [String], default: [] },
    code: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    translations: { en: textPair, ar: textPair },
    difficultyLevel: { type: Number, min: 1, max: 5 },
    prerequisiteObjectiveIds: { type: [String], default: [] },
    estimatedLearningMinutes: { type: Number, min: 1, max: 6000 },
    status: { type: String, enum: OBJECTIVE_STATUSES, default: 'draft' },
    version: { type: Number, default: 1 },
    origin: { type: String, enum: ['teacher', 'ai'], default: 'teacher' },
    extraction: {
      method: String,
      model: String,
      extractedAt: Date,
      sourceLessonIds: [String],
      curriculumUpdatedAt: Date,
    },
    approvedBy: String,
    approvedAt: Date,
    createdBy: String,
    history: {
      type: [{ version: Number, changedBy: String, changedAt: Date, fields: [String], note: String, _id: false }],
      default: [],
    },
  },
  { collection: 'learning_objectives', timestamps: true, versionKey: false },
);

objectiveSchema.index({ institutionId: 1, curriculumId: 1, code: 1 }, { unique: true });
objectiveSchema.index({ institutionId: 1, curriculumId: 1, status: 1 });
objectiveSchema.index({ institutionId: 1, lessonIds: 1 });

export const LearningObjective = model<ILearningObjective>('LearningObjective', objectiveSchema);

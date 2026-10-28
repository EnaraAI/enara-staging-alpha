import { Schema, model, Document } from 'mongoose';

// A rubric criterion for an open response: performance levels with points.
export interface IRubricCriterion {
  id: string;
  title: string;
  description?: string;
  maxPoints: number;
  levels: { id: string; label: string; points: number; description?: string }[];
  objectiveIds?: string[];
}

export type QuestionType = 'multiple-choice' | 'true-false' | 'short-answer' | 'open-response';

export interface IQuestion {
  id: string;
  type: QuestionType;
  text: string;
  topic?: string;
  options?: string[];
  // Required for auto-graded types; open responses use a rubric instead.
  correctAnswer?: string | number;
  explanation: string;
  modelAnswer?: string;
  // Points for this question (default 1). For open responses, the rubric total.
  points?: number;
  rubric?: { criteria: IRubricCriterion[] };
  // Where the question came from; AI drafts must be reviewed before publishing.
  source?: 'manual' | 'ai';
  // Course passages the question is based on (checked to exist).
  sources?: { chunkId: string; uploadId?: string; fileName: string; page?: number | null; section?: string }[];
  // Source-linked drafts (P4.1): set when the draft was built from chosen documents.
  sourceStatus?: 'supported' | 'no_supporting_source';
  // Learning objectives this question gives evidence for, and its difficulty (1-5).
  objectiveIds?: string[];
  difficulty?: number;
  // Wrong options that signal a known misconception (never sent to students).
  distractors?: { option: string; category: string; description: string }[];
}

export interface IAssessment extends Document {
  id: string;
  title: string;
  institutionId?: string;
  subject: string;
  duration: number;
  questions: IQuestion[];
  status: 'upcoming' | 'active' | 'completed' | 'pending' | 'in-progress';
  dueDate: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  curriculumId?: string;
  batchId?: string;
  studentId?: string;
  instructions?: string;
  // How many times a student may submit. Default 1.
  maxAttempts: number;
  // When students see correct answers and explanations:
  // 'after-submit' once they have no attempts left, 'after-close' once the
  // assessment is completed or past its due date, 'never' not at all.
  answerReveal: 'after-submit' | 'after-close' | 'never';
  // Phase 3 authoring lifecycle. Students only ever see published versions.
  lifecycle: 'draft' | 'published' | 'archived';
  // Latest published version (0 = never published).
  publishedVersion: number;
  // The working copy differs from the latest published version.
  hasUnpublishedChanges: boolean;
  createdBy?: string;
  updatedBy?: string;
  language?: string;
  // Demo/live separation (P1): seeded demo data is 'demo_seed'.
  origin?: 'live' | 'demo_seed';
}

const questionSchema = new Schema<IQuestion>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['multiple-choice', 'true-false', 'short-answer', 'open-response'],
      required: true,
    },
    text: { type: String, required: true },
    topic: String,
    options: [String],
    correctAnswer: Schema.Types.Mixed,
    explanation: { type: String, default: '' },
    modelAnswer: String,
    points: { type: Number, min: 0, max: 100 },
    rubric: {
      type: {
        criteria: [
          {
            id: String,
            title: String,
            description: String,
            maxPoints: Number,
            levels: [{ id: String, label: String, points: Number, description: String, _id: false }],
            objectiveIds: { type: [String], default: undefined },
            _id: false,
          },
        ],
      },
      default: undefined,
      _id: false,
    },
    source: { type: String, enum: ['manual', 'ai'] },
    sources: { type: [{ chunkId: String, uploadId: String, fileName: String, page: Number, section: String, _id: false }], default: undefined },
    sourceStatus: { type: String, enum: ['supported', 'no_supporting_source'] },
    objectiveIds: { type: [String], default: undefined },
    difficulty: { type: Number, min: 1, max: 5 },
    distractors: { type: [{ option: String, category: String, description: String, _id: false }], default: undefined },
  },
  { _id: false }
);

const assessmentSchema = new Schema<IAssessment>(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    institutionId: { type: String, index: true },
    subject: { type: String, required: true },
    duration: { type: Number, default: 30 },
    questions: { type: [questionSchema], default: [] },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed', 'pending', 'in-progress'],
      default: 'upcoming',
    },
    dueDate: { type: String, default: '' },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      default: 'Medium',
    },
    curriculumId: String,
    batchId: { type: String, index: true },
    studentId: { type: String, index: true },
    instructions: String,
    maxAttempts: { type: Number, default: 1, min: 1, max: 10 },
    answerReveal: { type: String, enum: ['after-submit', 'after-close', 'never'], default: 'after-submit' },
    lifecycle: { type: String, enum: ['draft', 'published', 'archived'], default: 'published' },
    publishedVersion: { type: Number, default: 0 },
    hasUnpublishedChanges: { type: Boolean, default: false },
    createdBy: String,
    updatedBy: String,
    language: String,
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
  },
  { timestamps: true }
);

assessmentSchema.index({ institutionId: 1, batchId: 1, status: 1 });
assessmentSchema.index({ institutionId: 1, studentId: 1, status: 1 });
assessmentSchema.index({ institutionId: 1, curriculumId: 1, lifecycle: 1 });

export const Assessment = model<IAssessment>('Assessment', assessmentSchema);

// Immutable snapshot of a published assessment. Attempts record the version
// they were taken against, and grading always uses that snapshot.
export interface IAssessmentVersion extends Document {
  assessmentId: string;
  institutionId?: string;
  version: number;
  title: string;
  subject: string;
  instructions?: string;
  duration: number;
  questions: IQuestion[];
  totalPoints: number;
  publishedBy?: string;
  publishedAt: Date;
}

const versionSchema = new Schema<IAssessmentVersion>(
  {
    assessmentId: { type: String, required: true },
    institutionId: String,
    version: { type: Number, required: true },
    title: { type: String, required: true },
    subject: { type: String, default: '' },
    instructions: String,
    duration: { type: Number, default: 30 },
    questions: { type: [questionSchema], default: [] },
    totalPoints: { type: Number, default: 0 },
    publishedBy: String,
    publishedAt: { type: Date, default: Date.now },
  },
  { collection: 'assessment_versions', versionKey: false },
);
versionSchema.index({ assessmentId: 1, version: 1 }, { unique: true });

export const AssessmentVersion = model<IAssessmentVersion>('AssessmentVersion', versionSchema);

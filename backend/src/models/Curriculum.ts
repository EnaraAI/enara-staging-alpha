import { Schema, model, Document } from 'mongoose';

// A short practice quiz at the end of a lesson (the knowledge check). Students
// see the answers after checking, so it is practice only, never graded.
export interface IChapterQuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number; // index into options
  explanation?: string;
}

export interface IChapter {
  id: string;
  title: string;
  uploads: string[];
  description?: string;
  enaraSectionId?: string;
  quiz?: { questions: IChapterQuizQuestion[] };
}

export interface ICurriculum extends Document {
  id: string;
  name: string;
  institutionId?: string;
  courseName: string;
  type: string;
  level: string;
  languages: string[];
  summary: string;
  description: string;
  lastUpdated: string;
  subjectsCount: number;
  assignedBatches: string[];
  chapters: IChapter[];
  status: 'draft' | 'deployed';
  deploymentLink?: string;
  /** Enara AI orchestrator course UUID this curriculum maps to (see GET /courses). */
  enaraCourseId?: string;
  // Author (P1): teachers may edit only what they created.
  createdBy?: string;
  origin?: 'live' | 'demo_seed';
}

const quizQuestionSchema = new Schema<IChapterQuizQuestion>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    options: { type: [String], default: [] },
    correctAnswer: { type: Number, required: true },
    explanation: { type: String, default: '' },
  },
  { _id: false }
);

const chapterSchema = new Schema<IChapter>(
  {
    id: { type: String, required: true },
    title: { type: String, default: '' },
    uploads: { type: [String], default: [] },
    description: { type: String, default: '' },
    enaraSectionId: { type: String },
    quiz: { type: new Schema({ questions: { type: [quizQuestionSchema], default: [] } }, { _id: false }), default: undefined },
  },
  { _id: false }
);

const curriculumSchema = new Schema<ICurriculum>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    institutionId: { type: String, index: true },
    courseName: { type: String, default: '' },
    type: { type: String, default: 'National' },
    level: { type: String, default: '' },
    languages: { type: [String], default: ['English'] },
    summary: { type: String, required: true },
    description: { type: String, default: '' },
    lastUpdated: { type: String, required: true },
    subjectsCount: { type: Number, default: 0 },
    assignedBatches: { type: [String], default: [] },
    chapters: { type: [chapterSchema], default: [] },
    status: { type: String, enum: ['draft', 'deployed'], default: 'draft' },
    deploymentLink: { type: String },
    enaraCourseId: { type: String },
    createdBy: { type: String, index: true },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
  },
  { timestamps: true }
);

curriculumSchema.index({ institutionId: 1, status: 1 });
curriculumSchema.index({ institutionId: 1, updatedAt: -1 });

export const Curriculum = model<ICurriculum>('Curriculum', curriculumSchema);

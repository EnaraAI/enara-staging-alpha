import { Schema, model, Document } from 'mongoose';

export interface IChapter {
  id: string;
  title: string;
  uploads: string[];
  description?: string;
  enaraSectionId?: string;
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

const chapterSchema = new Schema<IChapter>(
  {
    id: { type: String, required: true },
    title: { type: String, default: '' },
    uploads: { type: [String], default: [] },
    description: { type: String, default: '' },
    enaraSectionId: { type: String },
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

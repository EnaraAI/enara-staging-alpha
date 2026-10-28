import { Schema, model, Document } from 'mongoose';

export interface ILessonPlanSection {
  id: string;
  kind: string;
  title: string;
  content: string;
  durationMinutes?: number;
  sources?: { chunkId: string; uploadId?: string; fileName: string; page?: number | null; section?: string }[];
  sourceStatus?: 'supported' | 'no_supporting_source';
  // 'ai' until a teacher edits it.
  origin?: 'ai' | 'teacher';
}

// A teacher's lesson plan. Drafts are edited freely; saving keeps a version.
// Linked to a curriculum lesson but never changes the lesson itself.
export interface ILessonPlan extends Document {
  id: string;
  institutionId?: string;
  curriculumId: string;
  lessonId?: string;
  objectiveIds: string[];
  title: string;
  durationMinutes: number;
  learnerLevel: string;
  language: 'en' | 'ar';
  goals?: string;
  preferences?: string;
  sections: ILessonPlanSection[];
  status: 'draft' | 'saved' | 'archived';
  version: number;
  versions: { version: number; title: string; sections: ILessonPlanSection[]; savedAt: Date; savedBy: string }[];
  generatedBy?: string;
  createdBy: string;
  updatedAt: Date;
}

const sectionSchema = {
  id: String,
  kind: String,
  title: String,
  content: String,
  durationMinutes: Number,
  sources: { type: [{ chunkId: String, uploadId: String, fileName: String, page: Number, section: String, _id: false }], default: undefined },
  sourceStatus: { type: String, enum: ['supported', 'no_supporting_source'] },
  origin: { type: String, enum: ['ai', 'teacher'] },
  _id: false,
};

const schema = new Schema<ILessonPlan>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    curriculumId: { type: String, required: true },
    lessonId: String,
    objectiveIds: { type: [String], default: [] },
    title: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    learnerLevel: { type: String, default: '' },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    goals: String,
    preferences: String,
    sections: { type: [sectionSchema], default: [] },
    status: { type: String, enum: ['draft', 'saved', 'archived'], default: 'draft' },
    version: { type: Number, default: 0 },
    versions: { type: [{ version: Number, title: String, sections: [sectionSchema], savedAt: Date, savedBy: String, _id: false }], default: [] },
    generatedBy: String,
    createdBy: { type: String, required: true },
  },
  { collection: 'lesson_plans', timestamps: true, versionKey: false },
);
schema.index({ institutionId: 1, createdBy: 1, updatedAt: -1 });
schema.index({ institutionId: 1, curriculumId: 1, lessonId: 1 });

export const LessonPlan = model<ILessonPlan>('LessonPlan', schema);

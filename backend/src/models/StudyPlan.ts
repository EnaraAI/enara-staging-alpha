import { Schema, model, Document } from 'mongoose';

export type StudyItemKind =
  | 'assignment'
  | 'teacher_action'
  | 'review_feedback'
  | 'practise'
  | 'review_prerequisite'
  | 'reassess'
  | 'review_due'
  | 'learn_next'
  | 'continue_intervention';

export interface IStudyItem {
  // Stable identity of what the item is about, so replanning never duplicates.
  key: string;
  kind: StudyItemKind;
  title: string;
  rationale: string;
  evidenceIds: string[];
  objectiveId?: string;
  assignmentId?: string;
  attemptId?: string;
  interventionId?: string;
  lessonId?: string;
  courseId?: string;
  priority: number;
  dueAt?: Date;
  // Only when known from the assignment (its time limit).
  effortMinutes?: number;
  status: 'todo' | 'done' | 'dismissed';
  source: 'assignment' | 'teacher' | 'result' | 'recommendation';
  addedAt: Date;
  updatedAt: Date;
}

// A student's study plan: the current items plus a history of each replan.
// Marking an item done records it; only evaluated work becomes evidence.
export interface IStudyPlan extends Document {
  id: string;
  studentId: string;
  institutionId?: string;
  goal?: string;
  version: number;
  items: IStudyItem[];
  history: { version: number; at: Date; trigger: string; added: string[]; removed: string[] }[];
  plannedAt: Date;
  algorithmVersion: string;
}

const itemSchema = new Schema<IStudyItem>(
  {
    key: { type: String, required: true },
    kind: { type: String, required: true },
    title: String,
    rationale: String,
    evidenceIds: { type: [String], default: [] },
    objectiveId: String,
    assignmentId: String,
    attemptId: String,
    interventionId: String,
    lessonId: String,
    courseId: String,
    priority: Number,
    dueAt: Date,
    effortMinutes: Number,
    status: { type: String, enum: ['todo', 'done', 'dismissed'], default: 'todo' },
    source: String,
    addedAt: Date,
    updatedAt: Date,
  },
  { _id: false },
);

const schema = new Schema<IStudyPlan>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, unique: true },
    institutionId: String,
    goal: String,
    version: { type: Number, default: 0 },
    items: { type: [itemSchema], default: [] },
    history: { type: [{ version: Number, at: Date, trigger: String, added: [String], removed: [String], _id: false }], default: [] },
    plannedAt: Date,
    algorithmVersion: String,
  },
  { collection: 'study_plans', versionKey: false, timestamps: true },
);

export const StudyPlan = model<IStudyPlan>('StudyPlan', schema);

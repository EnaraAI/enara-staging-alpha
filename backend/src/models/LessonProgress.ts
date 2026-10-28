import { Schema, model, Document } from 'mongoose';

export interface ILessonProgress extends Document {
  studentId: string;
  institutionId?: string;
  courseId: string;
  lessonId: string;
  status: 'completed' | 'active' | 'locked';
  completedAt?: Date;
}

const lessonProgressSchema = new Schema<ILessonProgress>(
  {
    studentId: { type: String, required: true, index: true },
    institutionId: { type: String, index: true },
    courseId: { type: String, required: true, index: true },
    lessonId: { type: String, required: true },
    status: {
      type: String,
      enum: ['completed', 'active', 'locked'],
      default: 'completed',
    },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

lessonProgressSchema.index({ studentId: 1, courseId: 1, lessonId: 1 }, { unique: true });
lessonProgressSchema.index({ institutionId: 1, courseId: 1 });

export const LessonProgress = model<ILessonProgress>('LessonProgress', lessonProgressSchema);

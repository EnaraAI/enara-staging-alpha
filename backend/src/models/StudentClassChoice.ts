import { Schema, model, models, type Model } from 'mongoose';

// Multi-class step 6 (Q2): the class a student in several classes used last,
// or 'all' ("All my classes"). One row per student. Written only while
// ENROLLMENT_MULTI_CLASS is in effect, and only for students in 2+ classes;
// the collection appears on the first write, so no migration is needed.
export interface IStudentClassChoice {
  studentId: string;
  institutionId: string;
  /** A CourseInstance id, or 'all'. */
  classId: string;
  usedAt: Date;
}

const choiceSchema = new Schema<IStudentClassChoice>(
  {
    studentId: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true },
    classId: { type: String, required: true },
    usedAt: { type: Date, required: true },
  },
  { collection: 'student_class_choices', versionKey: false },
);

export const StudentClassChoice =
  (models.StudentClassChoice as Model<IStudentClassChoice>) || model<IStudentClassChoice>('StudentClassChoice', choiceSchema);

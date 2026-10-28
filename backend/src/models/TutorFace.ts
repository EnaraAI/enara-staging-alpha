import { Schema, model, Document } from 'mongoose';

// The face (Anam avatar) a school's live tutor uses: one default per school,
// optionally a different one per course.
export interface ITutorFace extends Document {
  institutionId: string;
  // Empty for the school's default.
  courseId: string;
  avatarId: string;
  name: string;
  imageUrl?: string;
  gender?: 'woman' | 'man';
  updatedBy?: string;
}

const tutorFaceSchema = new Schema<ITutorFace>(
  {
    institutionId: { type: String, required: true },
    courseId: { type: String, default: '' },
    avatarId: { type: String, required: true },
    name: { type: String, required: true },
    imageUrl: String,
    gender: { type: String, enum: ['woman', 'man'] },
    updatedBy: String,
  },
  { timestamps: true }
);

tutorFaceSchema.index({ institutionId: 1, courseId: 1 }, { unique: true });

export const TutorFace = model<ITutorFace>('TutorFace', tutorFaceSchema);

// Faces a school offers its students to choose from (empty: all faces).
export interface ITutorFaceOptions extends Document {
  institutionId: string;
  avatarIds: string[];
  updatedBy?: string;
}

const tutorFaceOptionsSchema = new Schema<ITutorFaceOptions>(
  {
    institutionId: { type: String, required: true, unique: true },
    avatarIds: { type: [String], default: [] },
    updatedBy: String,
  },
  { timestamps: true }
);

export const TutorFaceOptions = model<ITutorFaceOptions>('TutorFaceOptions', tutorFaceOptionsSchema);

// The tutor a student picked for themselves; wins over the school's choices.
export interface IStudentTutorChoice extends Document {
  studentId: string;
  avatarId: string;
  name: string;
  imageUrl?: string;
  gender?: 'woman' | 'man';
}

const studentTutorChoiceSchema = new Schema<IStudentTutorChoice>(
  {
    studentId: { type: String, required: true, unique: true },
    avatarId: { type: String, required: true },
    name: { type: String, required: true },
    imageUrl: String,
    gender: { type: String, enum: ['woman', 'man'] },
  },
  { timestamps: true }
);

export const StudentTutorChoice = model<IStudentTutorChoice>('StudentTutorChoice', studentTutorChoiceSchema);

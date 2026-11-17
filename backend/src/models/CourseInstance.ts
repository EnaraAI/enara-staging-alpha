import { Schema, model, Document } from 'mongoose';
import { COURSE_VISIBILITIES, CourseVisibility } from '../services/courseVisibility';

export interface ICourseInstance extends Document {
  id: string;
  courseId: string;
  courseName: string;
  institutionId?: string;
  visibility: CourseVisibility;
  isDemo: boolean;
  academicYear: string;
  batchId: string;
  curriculumId?: string;
  groupId?: string;
  studentIds: string[];
  instructorIds: string[];
  // Demo/live separation (P1): seeded demo data is 'demo_seed'.
  origin?: 'live' | 'demo_seed';
  // Multi-class step 6 (ENROLLMENT_GROUP_ARCHIVE): set while the class is
  // archived (visibility is then 'archived'; the previous one is kept).
  archivedAt?: Date;
  archivedBy?: string;
  archive?: ClassArchiveRecord;
}

export interface ClassArchiveRecord {
  /** Explicit members (studentIds) removed by the archive. */
  memberIds: string[];
  enrollmentIds: string[];
  visibility: CourseVisibility;
}

const courseInstanceSchema = new Schema<ICourseInstance>(
  {
    id: { type: String, required: true, unique: true, index: true },
    courseId: { type: String, required: true },
    courseName: { type: String, required: true },
    institutionId: { type: String, index: true },
    visibility: {
      type: String,
      enum: COURSE_VISIBILITIES,
      default: 'internal',
      index: true,
    },
    isDemo: { type: Boolean, default: false, index: true },
    academicYear: { type: String, required: true },
    batchId: { type: String, required: true, index: true },
    curriculumId: { type: String },
    groupId: { type: String },
    studentIds: { type: [String], default: [] },
    instructorIds: { type: [String], default: [] },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
    archivedAt: { type: Date },
    archivedBy: { type: String },
    archive: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

courseInstanceSchema.index({ institutionId: 1, courseId: 1 });
courseInstanceSchema.index({ institutionId: 1, batchId: 1 });
courseInstanceSchema.index({ institutionId: 1, visibility: 1, isDemo: 1, batchId: 1 });
courseInstanceSchema.index({ instructorIds: 1 });

export const CourseInstance = model<ICourseInstance>('CourseInstance', courseInstanceSchema);

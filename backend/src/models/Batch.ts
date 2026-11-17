import { LEARNER_AGE_BANDS, type LearnerAgeBand } from './learnerAgeBand';
import { Schema, model, Document } from 'mongoose';

export interface IBatch extends Document {
  id: string;
  name: string;
  studentCount: number;
  institutionId?: string;
  curriculumId?: string;
  academicYear: string;
  groupId?: string;
  origin?: 'live' | 'demo_seed';
  // Class-level trusted learner age band (see Student.learnerAgeBand).
  learnerAgeBand?: LearnerAgeBand;
  // Multi-class step 6 (ENROLLMENT_GROUP_ARCHIVE): set while the group is
  // archived. `archive` records the members and enrollments the archive ended.
  archivedAt?: Date;
  archivedBy?: string;
  archive?: GroupArchiveRecord;
}

export interface GroupArchiveRecord {
  /** Every member at archive time (old field or active group enrollment). */
  memberIds: string[];
  /** Members whose Student.batchId pointed here and was cleared. */
  fieldMemberIds: string[];
  enrollmentIds: string[];
  studentCount: number;
}

const batchSchema = new Schema<IBatch>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    studentCount: { type: Number, default: 0 },
    institutionId: { type: String, index: true },
    curriculumId: { type: String, index: true },
    academicYear: { type: String, required: true },
    groupId: { type: String },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
    learnerAgeBand: { type: String, enum: LEARNER_AGE_BANDS, select: false },
    archivedAt: { type: Date },
    archivedBy: { type: String },
    archive: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

batchSchema.index({ institutionId: 1, name: 1 });

export const Batch = model<IBatch>('Batch', batchSchema);

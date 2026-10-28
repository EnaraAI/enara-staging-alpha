import { Schema, model, Document } from 'mongoose';

export const ATTENDANCE_SESSION_STATUSES = ['draft', 'submitted'] as const;
export type AttendanceSessionStatus = (typeof ATTENDANCE_SESSION_STATUSES)[number];

export interface IAttendanceSession extends Document {
  id: string;
  institutionId?: string;
  courseInstanceId: string;
  batchId: string;
  teacherId: string;
  attendanceDate: string;
  status: AttendanceSessionStatus;
  submittedAt?: Date;
}

const attendanceSessionSchema = new Schema<IAttendanceSession>(
  {
    id: { type: String, required: true, unique: true, index: true },
    institutionId: { type: String, index: true },
    courseInstanceId: { type: String, required: true, index: true },
    batchId: { type: String, required: true },
    teacherId: { type: String, required: true, index: true },
    attendanceDate: { type: String, required: true },
    status: {
      type: String,
      enum: ATTENDANCE_SESSION_STATUSES,
      default: 'draft',
    },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

attendanceSessionSchema.index(
  { institutionId: 1, courseInstanceId: 1, attendanceDate: 1 },
  { unique: true }
);

export const AttendanceSession = model<IAttendanceSession>(
  'AttendanceSession',
  attendanceSessionSchema
);

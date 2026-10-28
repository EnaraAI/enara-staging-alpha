import { Schema, model, Document } from 'mongoose';

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface IAttendanceRecord extends Document {
  id: string;
  attendanceSessionId: string;
  studentId: string;
  status: AttendanceStatus;
  publicNote?: string;
  teacherInternalNote?: string;
  markedBy: string;
  markedAt: Date;
}

const attendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    id: { type: String, required: true, unique: true, index: true },
    attendanceSessionId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      required: true,
    },
    publicNote: { type: String },
    teacherInternalNote: { type: String },
    markedBy: { type: String, required: true },
    markedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

attendanceRecordSchema.index({ attendanceSessionId: 1, studentId: 1 }, { unique: true });

export const AttendanceRecord = model<IAttendanceRecord>(
  'AttendanceRecord',
  attendanceRecordSchema
);

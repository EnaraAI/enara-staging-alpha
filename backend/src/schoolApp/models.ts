import { Schema, model, type Document } from 'mongoose';

// Parents school app, step (a). Every record belongs to one school (institutionId) and says where it came from (source: an Excel/CSV
// import id, a screen, or later a connector), so a parent screen and the chatbot can say "from the timetable sheet updated 20 Nov".
// ENARA displays school data; the school's own system stays the system of record.
export interface Source { kind: 'import' | 'screen' | 'connector' | 'seed'; ref?: string; at: Date }
const sourceSchema = { kind: { type: String, enum: ['import', 'screen', 'connector', 'seed'], required: true }, ref: String, at: { type: Date, required: true }, _id: false };

// ---- timetable: one row per class (group), day and period
export interface ISchoolTimetableEntry extends Document {
  id: string; institutionId: string; groupName: string; groupKey: string; day: number; period: number; start: string; end: string;
  subject: string; teacher?: string; room?: string; source: Source;
}
const timetableSchema = new Schema<ISchoolTimetableEntry>({
  id: { type: String, required: true, unique: true },
  institutionId: { type: String, required: true, index: true },
  groupName: { type: String, required: true },
  groupKey: { type: String, required: true }, // normalised group name (matches Batch.name normalised)
  day: { type: Number, required: true, min: 0, max: 6 }, // 0 = Sunday
  period: { type: Number, required: true, min: 1, max: 20 },
  start: { type: String, required: true }, end: { type: String, required: true }, // HH:MM
  subject: { type: String, required: true, maxlength: 120 },
  teacher: { type: String, maxlength: 120 }, room: { type: String, maxlength: 60 },
  source: { type: sourceSchema, required: true },
}, { timestamps: true });
timetableSchema.index({ institutionId: 1, groupKey: 1, day: 1, period: 1 }, { unique: true });
export const SchoolTimetableEntry = model<ISchoolTimetableEntry>('SchoolTimetableEntry', timetableSchema, 'school_timetable');

// ---- daily attendance (the school's own register; separate from ENARA's per-session teacher attendance)
export const SCHOOL_ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'] as const;
export type SchoolAttendanceStatus = (typeof SCHOOL_ATTENDANCE_STATUSES)[number];
export interface ISchoolDailyAttendance extends Document {
  id: string; institutionId: string; studentId: string; date: string; status: SchoolAttendanceStatus; period?: number; note?: string; source: Source;
}
const attendanceSchema = new Schema<ISchoolDailyAttendance>({
  id: { type: String, required: true, unique: true },
  institutionId: { type: String, required: true, index: true },
  studentId: { type: String, required: true, index: true },
  date: { type: String, required: true }, // YYYY-MM-DD (Cairo)
  status: { type: String, enum: SCHOOL_ATTENDANCE_STATUSES, required: true },
  period: { type: Number, min: 1, max: 20 },
  note: { type: String, maxlength: 300 },
  source: { type: sourceSchema, required: true },
}, { timestamps: true });
attendanceSchema.index({ institutionId: 1, studentId: 1, date: 1, period: 1 }, { unique: true });
export const SchoolDailyAttendance = model<ISchoolDailyAttendance>('SchoolDailyAttendance', attendanceSchema, 'school_attendance');

// ---- announcements
export const AUDIENCES = ['school', 'grade', 'group', 'student'] as const;
export type Audience = (typeof AUDIENCES)[number];
export interface ISchoolAnnouncement extends Document {
  id: string; institutionId: string; audience: Audience; audienceValue?: string; audienceKey?: string;
  title: string; body: string; lang: 'ar' | 'en' | 'both'; titleAr?: string; bodyAr?: string;
  publishAt: Date; expiresAt?: Date; createdBy?: string; source: Source; withdrawnAt?: Date;
}
const announcementSchema = new Schema<ISchoolAnnouncement>({
  id: { type: String, required: true, unique: true },
  institutionId: { type: String, required: true, index: true },
  audience: { type: String, enum: AUDIENCES, required: true },
  audienceValue: { type: String, maxlength: 120 }, // grade label, group name or student id
  audienceKey: { type: String }, // normalised audienceValue
  title: { type: String, required: true, maxlength: 160 },
  body: { type: String, required: true, maxlength: 4000 },
  lang: { type: String, enum: ['ar', 'en', 'both'], default: 'both' },
  titleAr: { type: String, maxlength: 160 }, bodyAr: { type: String, maxlength: 4000 },
  publishAt: { type: Date, required: true, index: true }, expiresAt: { type: Date },
  createdBy: String, withdrawnAt: Date,
  source: { type: sourceSchema, required: true },
}, { timestamps: true });
announcementSchema.index({ institutionId: 1, publishAt: -1 });
export const SchoolAnnouncement = model<ISchoolAnnouncement>('SchoolAnnouncement', announcementSchema, 'school_announcements');

// ---- imports (preview, confirm, undo)
export interface ISchoolImport extends Document {
  id: string; institutionId: string; section: string; fileName?: string; status: 'preview' | 'confirmed' | 'undone' | 'expired';
  rows: Record<string, string>[]; counts: Record<string, number>; problems: { row: number; message: string }[];
  createdBy: string; confirmedBy?: string; confirmedAt?: Date; undoneAt?: Date;
  // what the confirm wrote, so undo can restore it: ids inserted, and previous versions of rows it replaced
  written?: { inserted: string[]; replaced: Record<string, unknown>[] };
}
const importSchema = new Schema<ISchoolImport>({
  id: { type: String, required: true, unique: true },
  institutionId: { type: String, required: true, index: true },
  section: { type: String, required: true },
  fileName: { type: String, maxlength: 200 },
  status: { type: String, enum: ['preview', 'confirmed', 'undone', 'expired'], required: true },
  rows: { type: Schema.Types.Mixed, default: [] },
  counts: { type: Schema.Types.Mixed, default: {} },
  problems: { type: [{ row: Number, message: String, _id: false }], default: [] },
  createdBy: { type: String, required: true }, confirmedBy: String, confirmedAt: Date, undoneAt: Date,
  written: { type: Schema.Types.Mixed },
}, { timestamps: true });
export const SchoolImport = model<ISchoolImport>('SchoolImport', importSchema, 'school_imports');

// ---- in-app notifications for parents
export interface IParentNotification extends Document {
  id: string; parentUserId: string; studentId?: string; institutionId?: string; kind: 'absence' | 'late' | 'announcement';
  title: string; body: string; refId?: string; date?: string; readAt?: Date; createdAt: Date;
}
const notificationSchema = new Schema<IParentNotification>({
  id: { type: String, required: true, unique: true },
  parentUserId: { type: String, required: true, index: true },
  studentId: { type: String, index: true }, institutionId: String,
  kind: { type: String, enum: ['absence', 'late', 'announcement'], required: true },
  title: { type: String, required: true, maxlength: 200 }, body: { type: String, maxlength: 600 },
  refId: String, date: String, readAt: Date, // date: the attendance day (YYYY-MM-DD, Cairo) for absence / late
}, { timestamps: { createdAt: true, updatedAt: false } });
notificationSchema.index({ parentUserId: 1, createdAt: -1 });
notificationSchema.index({ parentUserId: 1, kind: 1, refId: 1 }, { unique: true, partialFilterExpression: { refId: { $type: 'string' } } });
export const ParentNotification = model<IParentNotification>('ParentNotification', notificationSchema, 'parent_notifications');

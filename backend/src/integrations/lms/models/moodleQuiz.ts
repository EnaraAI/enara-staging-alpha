import { Schema, model, models, type Model } from 'mongoose';

// Errors to work on from Moodle's own quizzes (docs/tutor/MOODLE_QUIZ_IMPORT_PLAN.md v2, owner "You build it", 20 Nov 2026).
// Three collections, nothing existing changed:
//  - lms_moodle_quiz_settings: one row per LMS connection: the school's read-only Moodle web-service token (encrypted with
//    LMS_KEK, aad "lms_moodle_quiz_settings:<platformId>", never returned or logged), the school's on/off switch and the last check/run.
//  - lms_moodle_quiz_maps: which ENARA objective a Moodle quiz (optionally a question slot) practises. Set by the school's admin.
//  - lms_moodle_quiz_seen: finished Moodle attempts already turned into errors (ids only: connection, Moodle attempt id), 13-month TTL.
// No question text, answer or Moodle user name is stored anywhere.

export interface ILmsMoodleQuizSettings {
  platformId: string;
  institutionId: string;
  tokenEnc?: string;
  enabled: boolean;
  lastCheckAt?: Date;
  lastCheckOk?: boolean;
  lastCheckCode?: string;
  lastRunAt?: Date;
  lastRun?: { quizzes: number; attempts: number; wrong: number; right: number; skipped: number; errors: number };
  updatedBy?: string;
}
const settingsSchema = new Schema<ILmsMoodleQuizSettings>(
  {
    platformId: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true, index: true },
    tokenEnc: { type: String, select: false },
    enabled: { type: Boolean, default: false },
    lastCheckAt: Date,
    lastCheckOk: Boolean,
    lastCheckCode: { type: String, maxlength: 60 },
    lastRunAt: Date,
    lastRun: { quizzes: Number, attempts: Number, wrong: Number, right: Number, skipped: Number, errors: Number },
    updatedBy: String,
  },
  { timestamps: true, collection: 'lms_moodle_quiz_settings' },
);

export interface ILmsMoodleQuizMap {
  platformId: string;
  institutionId: string;
  /** Moodle quiz instance id (mod_quiz_get_quizzes_by_courses "id"). */
  quizId: string;
  /** Moodle course id (the LTI context id). */
  courseExternalId: string;
  /** The quiz's own name in Moodle (school content), for the mapping screen. */
  quizName?: string;
  /** The ENARA objective (LearningObjective.id) the whole quiz practises. */
  objectiveId?: string;
  /** Optional per question slot. */
  slotObjectives: { slot: number; objectiveId: string }[];
  updatedBy?: string;
}
const mapSchema = new Schema<ILmsMoodleQuizMap>(
  {
    platformId: { type: String, required: true },
    institutionId: { type: String, required: true },
    quizId: { type: String, required: true },
    courseExternalId: { type: String, required: true },
    quizName: { type: String, maxlength: 120 },
    objectiveId: String,
    slotObjectives: { type: [{ _id: false, slot: { type: Number, required: true }, objectiveId: { type: String, required: true } }], default: [] },
    updatedBy: String,
  },
  { timestamps: true, collection: 'lms_moodle_quiz_maps' },
);
mapSchema.index({ platformId: 1, quizId: 1 }, { unique: true });

export interface ILmsMoodleQuizSeen { key: string; platformId: string; at: Date }
const seenSchema = new Schema<ILmsMoodleQuizSeen>(
  {
    key: { type: String, required: true, unique: true },
    platformId: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { collection: 'lms_moodle_quiz_seen' },
);
seenSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });

export const LmsMoodleQuizSettings = (models.LmsMoodleQuizSettings as Model<ILmsMoodleQuizSettings>) || model<ILmsMoodleQuizSettings>('LmsMoodleQuizSettings', settingsSchema);
export const LmsMoodleQuizMap = (models.LmsMoodleQuizMap as Model<ILmsMoodleQuizMap>) || model<ILmsMoodleQuizMap>('LmsMoodleQuizMap', mapSchema);
export const LmsMoodleQuizSeen = (models.LmsMoodleQuizSeen as Model<ILmsMoodleQuizSeen>) || model<ILmsMoodleQuizSeen>('LmsMoodleQuizSeen', seenSchema);

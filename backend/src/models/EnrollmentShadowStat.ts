import { Schema, model, models, type Model } from 'mongoose';

// Multi-class step 4 (shadow reads). Daily counters per feature: how many
// requests compared the old answer with the enrollment answer, and how many
// differed. Counts only: no student or class IDs are stored here (mismatch IDs
// go to the logs). Read by `npm run enrollment:shadow-report`.
export const SHADOW_FEATURES = ['class_roster', 'student_classes', 'analytics_course', 'pedagogy_roster'] as const;
export type ShadowFeature = (typeof SHADOW_FEATURES)[number];

export interface IEnrollmentShadowStat {
  day: string; // YYYY-MM-DD (UTC)
  feature: ShadowFeature;
  checks: number;
  mismatches: number;
  errors: number;
  updatedAt?: Date;
}

const schema = new Schema<IEnrollmentShadowStat>(
  {
    day: { type: String, required: true },
    feature: { type: String, enum: SHADOW_FEATURES, required: true },
    checks: { type: Number, default: 0 },
    mismatches: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
  },
  { collection: 'enrollment_shadow_stats', timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
);
// No index: a handful of rows per day. Two concurrent first writes of a day can
// create two rows for the same (day, feature); the report sums them.

export const EnrollmentShadowStat: Model<IEnrollmentShadowStat> =
  (models.EnrollmentShadowStat as Model<IEnrollmentShadowStat>) || model<IEnrollmentShadowStat>('EnrollmentShadowStat', schema);

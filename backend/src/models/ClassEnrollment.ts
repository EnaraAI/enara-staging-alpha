import { randomUUID } from 'crypto';
import { Schema, model, models, type Model } from 'mongoose';

// Multi-class enrollment (docs/multi-class/PLAN.md). One row = one student's
// membership of one group (Batch, scope 'group') or one class (CourseInstance,
// scope 'class'). Replaces Student.batchId and CourseInstance.studentIds in
// steps: until step 5 those fields stay the source of truth and nothing reads
// this collection for real answers.
//
// Membership rule (unchanged from today): student S is in class C when S has
// an active 'class' enrollment in C, or an active 'group' enrollment in C's group.
export const ENROLLMENT_SCOPES = ['group', 'class'] as const;
export type EnrollmentScope = (typeof ENROLLMENT_SCOPES)[number];
export const ENROLLMENT_STATUSES = ['active', 'inactive', 'removed'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
export const ENROLLMENT_SOURCES = ['manual', 'lms', 'google'] as const;
export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number];
export const ENROLLMENT_ROLES = ['learner'] as const;
export type EnrollmentRole = (typeof ENROLLMENT_ROLES)[number];
export const ENROLLMENT_MIGRATED_FROM = ['student.batchId', 'courseInstance.studentIds'] as const;
export type EnrollmentMigratedFrom = (typeof ENROLLMENT_MIGRATED_FROM)[number];
// Multi-class step 6: set on a row the multi-class service added (an extra
// group or class the old fields cannot express), so the consistency check
// (enrollmentBackfill.planBackfill) can tell it from drift.
export const ENROLLMENT_EXTRA_VIA = ['multi_class'] as const;
export type EnrollmentExtraVia = (typeof ENROLLMENT_EXTRA_VIA)[number];

export interface IClassEnrollment {
  id: string;
  institutionId: string;
  studentId: string;
  scope: EnrollmentScope;
  /** Batch id (scope 'group') or CourseInstance id (scope 'class'). */
  targetId: string;
  role: EnrollmentRole;
  status: EnrollmentStatus;
  source: EnrollmentSource;
  /** Set only on rows created by the backfill, so it can be undone exactly. */
  migratedFrom?: EnrollmentMigratedFrom;
  /**
   * Set when the multi-class service (re)activated the row as an extra
   * membership; cleared when another writer (the dual write) reactivates it.
   */
  extraVia?: EnrollmentExtraVia;
  /** lms_contexts.id when source is 'lms'. */
  lmsContextId?: string;
  startedAt: Date;
  endedAt?: Date;
  createdBy?: string;
  endedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const enrollmentSchema = new Schema<IClassEnrollment>(
  {
    id: { type: String, required: true, unique: true, default: () => `enr_${randomUUID().replace(/-/g, '')}` },
    institutionId: { type: String, required: true },
    studentId: { type: String, required: true },
    scope: { type: String, enum: ENROLLMENT_SCOPES, required: true },
    targetId: { type: String, required: true },
    role: { type: String, enum: ENROLLMENT_ROLES, default: 'learner' },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'active' },
    source: { type: String, enum: ENROLLMENT_SOURCES, required: true },
    migratedFrom: { type: String, enum: ENROLLMENT_MIGRATED_FROM },
    extraVia: { type: String, enum: ENROLLMENT_EXTRA_VIA },
    lmsContextId: String,
    startedAt: { type: Date, required: true, default: () => new Date() },
    endedAt: Date,
    createdBy: String,
    endedBy: String,
  },
  { collection: 'class_enrollments', versionKey: false, timestamps: true },
);
// A re-join reactivates the same row (history: dates + audit), so one row per
// (student, scope, target).
enrollmentSchema.index({ studentId: 1, scope: 1, targetId: 1 }, { unique: true, name: 'one_enrollment_per_target' });
enrollmentSchema.index({ institutionId: 1, scope: 1, targetId: 1, status: 1 }, { name: 'roster' });
enrollmentSchema.index({ studentId: 1, status: 1 }, { name: 'student_classes' });
enrollmentSchema.index({ migratedFrom: 1 }, { sparse: true, name: 'backfilled' });

export const ClassEnrollment =
  (models.ClassEnrollment as Model<IClassEnrollment>) || model<IClassEnrollment>('ClassEnrollment', enrollmentSchema);

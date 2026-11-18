import { Schema, model, Document } from 'mongoose';

// Parents P1 (PARENT_SETTINGS_ENABLED): parent usage, IDs and dates only (D10).
//
// parent_usage_events: one row per parent, school, day and event name, with a
// count (a screen opened 30 times in a day is one row with count 30). No
// content, no names, no addresses. Kept 13 months (TTL on `at`, D10).
//   kind login:   a parent signed in (any method) or resumed a device session
//   kind screen:  home, progress, activity, controls, report, account
//   kind feature: share_report, controls_changed, link_child, guardian_role
// studentId is set for learner-scoped events (PDPL erasure deletes them).
//
// parent_usage_daily: the nightly rollup, one row per school and Cairo day:
// distinct active parents, logins, linked parents that day, and counts per
// screen and feature. Kept 13 months as well.
export const USAGE_RETENTION_DAYS = 396; // 13 months
export const USAGE_KINDS = ['login', 'screen', 'feature'] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export interface IParentUsageEvent extends Document {
  key: string;
  parentUserId: string;
  institutionId: string;
  studentId?: string;
  kind: UsageKind;
  name: string;
  day: string;
  count: number;
  at: Date;
  lastAt: Date;
}

const eventSchema = new Schema<IParentUsageEvent>(
  {
    key: { type: String, required: true, unique: true },
    parentUserId: { type: String, required: true, index: true },
    institutionId: { type: String, required: true },
    studentId: { type: String, index: true },
    kind: { type: String, enum: USAGE_KINDS, required: true },
    name: { type: String, required: true, maxlength: 40 },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    at: { type: Date, required: true },
    lastAt: { type: Date, required: true },
  },
  { collection: 'parent_usage_events', versionKey: false },
);
eventSchema.index({ institutionId: 1, day: 1 });
eventSchema.index({ at: 1 }, { expireAfterSeconds: USAGE_RETENTION_DAYS * 86400 });

export const ParentUsageEvent = model<IParentUsageEvent>('ParentUsageEvent', eventSchema);

export interface IParentUsageDaily extends Document {
  institutionId: string;
  day: string;
  activeParents: number;
  logins: number;
  linkedParents: number;
  screens: Record<string, number>;
  features: Record<string, number>;
  at: Date;
}

const dailySchema = new Schema<IParentUsageDaily>(
  {
    institutionId: { type: String, required: true },
    day: { type: String, required: true },
    activeParents: { type: Number, default: 0 },
    logins: { type: Number, default: 0 },
    linkedParents: { type: Number, default: 0 },
    screens: { type: Schema.Types.Mixed, default: {} },
    features: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, required: true },
  },
  { collection: 'parent_usage_daily', versionKey: false },
);
dailySchema.index({ institutionId: 1, day: 1 }, { unique: true });
dailySchema.index({ at: 1 }, { expireAfterSeconds: USAGE_RETENTION_DAYS * 86400 });

export const ParentUsageDaily = model<IParentUsageDaily>('ParentUsageDaily', dailySchema);

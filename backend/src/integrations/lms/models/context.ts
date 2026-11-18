import { Schema, model, models, type Model } from 'mongoose';
import { newId, requiredOrg } from './common';

// lms_contexts: an LMS course. On the first launch it gets its own ENARA class
// (CourseInstance, enaraClassId) and its own group (Batch, enaraGroupId)
// (docs/multi-class/PLAN.md §3). Learners join the class through
// class_enrollments (scope 'class', source 'lms', lmsContextId = this id).
export interface ILmsContext {
  id: string;
  platformId: string;
  institutionId: string;
  externalContextId: string;
  title?: string;
  label?: string;
  /** ENARA CourseInstance id. */
  enaraClassId?: string;
  /** ENARA Batch id (the class's own group). */
  enaraGroupId?: string;
  nrpsUrl?: string;
  agsLineItemsUrl?: string;
  /** AGS scopes the last launch's endpoint claim granted (Phase 3: what the token may ask for, and whether line items may be created). */
  agsScopes?: string[];
  /** Phase 4: when the roster was last read from the LMS in full (NRPS) and applied. */
  lastRosterSyncAt?: Date;
  /** Phase 4: the last sync attempt's outcome (IDs, counts and codes only). */
  rosterSync?: ILmsRosterSyncState;
  /** Phase 4: one sync at a time per course (lease, across instances). */
  rosterSyncLeaseUntil?: Date;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export interface ILmsRosterSyncState {
  lastAttemptAt?: Date;
  /** What started it: launch (teacher launch, 24 h), nightly, manual ("Sync roster now"), cron. */
  trigger?: string;
  /** ok | partial (more to do next run) | failed */
  outcome?: 'ok' | 'partial' | 'failed';
  members?: number;
  pages?: number;
  added?: number;
  reactivated?: number;
  removed?: number;
  unchanged?: number;
  conflicts?: number;
  refused?: number;
  deferred?: number;
  instructorsAdded?: number;
  instructorsRemoved?: number;
  lastErrorCode?: string;
  lastErrorAt?: Date;
}

const contextSchema = new Schema<ILmsContext>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmsc') },
    platformId: { type: String, required: true },
    institutionId: requiredOrg,
    externalContextId: { type: String, required: true },
    title: String,
    label: String,
    enaraClassId: { type: String, index: true },
    enaraGroupId: String,
    nrpsUrl: String,
    agsLineItemsUrl: String,
    agsScopes: { type: [String], default: undefined },
    lastRosterSyncAt: Date,
    rosterSync: { type: Schema.Types.Mixed },
    rosterSyncLeaseUntil: Date,
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { collection: 'lms_contexts', versionKey: false, timestamps: true },
);
contextSchema.index({ platformId: 1, externalContextId: 1 }, { unique: true });
// Phase 4: the nightly sync takes the courses synced longest ago first.
contextSchema.index({ status: 1, lastRosterSyncAt: 1 });

// lms_users: identity is (platform, sub), never email (Spec §4, §8).
export interface ILmsUser {
  id: string;
  platformId: string;
  institutionId: string;
  externalUserId: string;
  enaraUserId?: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  lastLaunchAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<ILmsUser>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmsu') },
    platformId: { type: String, required: true },
    institutionId: requiredOrg,
    externalUserId: { type: String, required: true },
    enaraUserId: String,
    email: String,
    givenName: String,
    familyName: String,
    lastLaunchAt: Date,
  },
  { collection: 'lms_users', versionKey: false, timestamps: true },
);
userSchema.index({ platformId: 1, externalUserId: 1 }, { unique: true });
userSchema.index({ institutionId: 1, enaraUserId: 1 });

// lms_enrollments: a user's membership in a context.
// Phase 4 (roster sync): 'invited' = listed by the LMS roster (NRPS) but has
// never opened ENARA from this course ("not started"); the first launch makes
// it 'active' (firstLaunchAt). 'inactive' = gone from the LMS roster or
// Inactive there (endedAt); history, grades and the account are kept.
export interface ILmsEnrollment {
  id: string;
  contextId: string;
  lmsUserId: string;
  institutionId: string;
  ltiRoles: string[];
  enaraRole: 'student' | 'teacher' | 'admin' | 'observer';
  status: 'invited' | 'active' | 'inactive' | 'deleted';
  source: 'launch' | 'nrps' | 'google_api';
  /** First launch from this course (Phase 4). Rows created by a launch before Phase 4 have none but source 'launch'. */
  firstLaunchAt?: Date;
  /** Last roster sync that listed this member as active. */
  lastSeenAt?: Date;
  /** When a roster sync ended the membership. */
  endedAt?: Date;
  /** Staff: the LMS (a launch or a sync) added them to the class's instructors; a sync removes only these. */
  addedInstructor?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const enrollmentSchema = new Schema<ILmsEnrollment>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmse') },
    contextId: { type: String, required: true },
    lmsUserId: { type: String, required: true, index: true },
    institutionId: requiredOrg,
    ltiRoles: { type: [String], default: [] },
    enaraRole: { type: String, enum: ['student', 'teacher', 'admin', 'observer'], required: true },
    status: { type: String, enum: ['invited', 'active', 'inactive', 'deleted'], default: 'active' },
    source: { type: String, enum: ['launch', 'nrps', 'google_api'], required: true },
    firstLaunchAt: Date,
    lastSeenAt: Date,
    endedAt: Date,
    addedInstructor: Boolean,
  },
  { collection: 'lms_enrollments', versionKey: false, timestamps: true },
);
enrollmentSchema.index({ contextId: 1, lmsUserId: 1 }, { unique: true });
enrollmentSchema.index({ contextId: 1, status: 1 });

// lms_resource_links: a placement in the LMS, mapped to an ENARA activity.
// scoringPolicy unset = the default for the activity kind (best for practice,
// latest for assessments); a teacher can set it per link.
//
// Phase 3 binding (until Phase 2's picker): the activity's LTI custom
// parameter enara_assessment=<id> or enara_assignment=<id> names the ENARA
// work. It is checked against the launch's school, and the work is given to
// the LMS course's own ENARA class as an assignment (enaraActivityId), so the
// course's students can open it and its attempts are graded as usual.
// enaraSource* records what the LMS asked for.
export interface ILmsResourceLink {
  id: string;
  contextId: string;
  institutionId: string;
  externalResourceLinkId: string;
  /** The ENARA Assignment this link opens and grades (in the LMS course's class). */
  enaraActivityId?: string;
  activityKind?: 'assessment' | 'practice' | 'lesson';
  enaraSourceType?: 'assessment' | 'assignment';
  enaraSourceId?: string;
  boundAt?: Date;
  lineItemUrl?: string;
  customParams?: Record<string, string>;
  presentation: 'iframe' | 'window';
  scoringPolicy?: 'best' | 'latest';
  /** Phase 3 follow-up: the activity's title in the LMS (launch claim resource_link.title). */
  title?: string;
  /** Phase 3 follow-up: the last (non-preview) launch of this activity. */
  lastLaunchAt?: Date;
  /**
   * Phase 3 follow-up: the LMS answered 404/410 for this link's line item
   * during a grade send ("LMS activity may have been deleted"). Cleared by the
   * next launch of the activity (it exists then). While set, no grade job is
   * queued or sent for the link.
   */
  lineItemGoneAt?: Date;
  lineItemGoneStatus?: number;
  createdAt: Date;
  updatedAt: Date;
}

const resourceLinkSchema = new Schema<ILmsResourceLink>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmsr') },
    contextId: { type: String, required: true },
    institutionId: requiredOrg,
    externalResourceLinkId: { type: String, required: true },
    enaraActivityId: String,
    activityKind: { type: String, enum: ['assessment', 'practice', 'lesson'] },
    enaraSourceType: { type: String, enum: ['assessment', 'assignment'] },
    enaraSourceId: String,
    boundAt: Date,
    lineItemUrl: String,
    customParams: { type: Schema.Types.Mixed },
    presentation: { type: String, enum: ['iframe', 'window'], default: 'iframe' },
    scoringPolicy: { type: String, enum: ['best', 'latest'] },
    title: { type: String, maxlength: 200 },
    lastLaunchAt: Date,
    lineItemGoneAt: Date,
    lineItemGoneStatus: Number,
  },
  { collection: 'lms_resource_links', versionKey: false, timestamps: true },
);
resourceLinkSchema.index({ contextId: 1, externalResourceLinkId: 1 }, { unique: true });
// Phase 3: from a graded attempt (its assignment) to the LMS placements that report it.
resourceLinkSchema.index({ institutionId: 1, enaraActivityId: 1 });

// lms_line_items: a gradebook column. resourceId = ENARA activity id, so a
// line item can be found again.
export interface ILmsLineItem {
  id: string;
  contextId: string;
  institutionId: string;
  resourceLinkId?: string;
  externalLineItemUrl: string;
  scoreMaximum: number;
  label?: string;
  tag?: string;
  resourceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<ILmsLineItem>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmsl') },
    contextId: { type: String, required: true },
    institutionId: requiredOrg,
    resourceLinkId: String,
    externalLineItemUrl: { type: String, required: true },
    scoreMaximum: { type: Number, required: true, min: 0 },
    label: String,
    tag: String,
    resourceId: String,
  },
  { collection: 'lms_line_items', versionKey: false, timestamps: true },
);
lineItemSchema.index({ contextId: 1, externalLineItemUrl: 1 }, { unique: true });
lineItemSchema.index({ contextId: 1, resourceId: 1 });

export const LmsContext = (models.LmsContext as Model<ILmsContext>) || model<ILmsContext>('LmsContext', contextSchema);
export const LmsUser = (models.LmsUser as Model<ILmsUser>) || model<ILmsUser>('LmsUser', userSchema);
export const LmsEnrollment = (models.LmsEnrollment as Model<ILmsEnrollment>) || model<ILmsEnrollment>('LmsEnrollment', enrollmentSchema);
export const LmsResourceLink = (models.LmsResourceLink as Model<ILmsResourceLink>) || model<ILmsResourceLink>('LmsResourceLink', resourceLinkSchema);
export const LmsLineItem = (models.LmsLineItem as Model<ILmsLineItem>) || model<ILmsLineItem>('LmsLineItem', lineItemSchema);

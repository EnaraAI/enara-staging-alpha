import { Schema, model, Document } from 'mongoose';

// Parents Portal: one parent account <-> one learner (Student.id).
//   role   owner: first parent linked; manages guardians and billing.
//          full: reads everything, changes controls, shares the summary.
//          view: reads everything, changes nothing.
//   status pending: exists but grants nothing; active: the parent sees
//          everything for every age (user decision, 16 Nov 2026);
//          ended: access is over and grants nothing. The row is kept for
//          history (owner decision D8, 18 Nov 2026), with endedAt/endReason.
//          Rows are never deleted, except by PDPL permanent deletion of the
//          student (services/studentErasure.ts). Existing rows keep their
//          status (no migration needed: a row without endedAt is not ended).
// Links are created by redeeming a code a school admin issued
// (ParentLinkCode), so they are active on confirm for every age.
export const PARENT_LINK_ROLES = ['owner', 'full', 'view'] as const;
export type ParentLinkRole = (typeof PARENT_LINK_ROLES)[number];
export const PARENT_LINK_STATUSES = ['pending', 'active', 'ended'] as const;
export type ParentLinkStatus = (typeof PARENT_LINK_STATUSES)[number];
// Why a link ended (P0 item 2). See parents/linkLifecycle.ts for who sets each.
export const PARENT_LINK_END_REASONS = ['archived', 'deleted', 'left_school', 'lms_left_all_classes', 'unlinked_by_school', 'unlinked_by_parent'] as const;
export type ParentLinkEndReason = (typeof PARENT_LINK_END_REASONS)[number];

export interface ParentControls {
  weeklyGoalMin: number;
  dailyLimitMin: number;
  focus: 'conversation' | 'school' | 'exam' | 'reading';
  reminders: boolean;
  liveAvatar: boolean;
  microphone: boolean;
  camera: boolean;
  // 13+: a parent's change is a suggestion until the learner accepts it.
  learnerAccepted?: boolean;
  updatedAt?: Date;
}

export interface IParentLearnerLink extends Document {
  id: string;
  parentUserId: string;
  studentId: string;
  institutionId?: string;
  role: ParentLinkRole;
  status: ParentLinkStatus;
  codeId?: string;
  // Kids: parental consent (SPEC §2). The consent email/step is a stub for now.
  consent?: 'not_required' | 'pending' | 'captured';
  // 13+: when the learner was told a parent is linked (in-app notice + email stub).
  learnerNotifiedAt?: Date;
  learnerNoticeReadAt?: Date;
  controls?: ParentControls;
  // status 'ended' only: when, why and by whom (an ID, or 'system:...').
  endedAt?: Date;
  endReason?: ParentLinkEndReason;
  endedBy?: string;
  createdAt?: Date;
}

const linkSchema = new Schema<IParentLearnerLink>(
  {
    id: { type: String, required: true, unique: true },
    parentUserId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    institutionId: { type: String, index: true },
    role: { type: String, enum: PARENT_LINK_ROLES, required: true, default: 'full' },
    status: { type: String, enum: PARENT_LINK_STATUSES, required: true, default: 'active' },
    codeId: String,
    consent: { type: String, enum: ['not_required', 'pending', 'captured'] },
    learnerNotifiedAt: Date,
    learnerNoticeReadAt: Date,
    controls: { type: Schema.Types.Mixed },
    endedAt: Date,
    endReason: { type: String, enum: PARENT_LINK_END_REASONS },
    endedBy: String,
  },
  { collection: 'parent_learner_links', versionKey: false, timestamps: true },
);
linkSchema.index({ parentUserId: 1, studentId: 1 }, { unique: true });

export const ParentLearnerLink = model<IParentLearnerLink>('ParentLearnerLink', linkSchema);

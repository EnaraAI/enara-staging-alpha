import { Schema, model, Document } from 'mongoose';

// Parents Portal: one parent account <-> one learner (Student.id).
//   role   owner: first parent linked; manages guardians and billing.
//          full: reads everything, changes controls, shares the summary.
//          view: reads everything, changes nothing.
//   status pending: exists but grants nothing; active: the parent sees
//          everything for every age (user decision, 16 Nov 2026).
// Links are created by redeeming a code a school admin issued
// (ParentLinkCode), so they are active on confirm for every age.
export const PARENT_LINK_ROLES = ['owner', 'full', 'view'] as const;
export type ParentLinkRole = (typeof PARENT_LINK_ROLES)[number];
export const PARENT_LINK_STATUSES = ['pending', 'active'] as const;
export type ParentLinkStatus = (typeof PARENT_LINK_STATUSES)[number];

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
  },
  { collection: 'parent_learner_links', versionKey: false, timestamps: true },
);
linkSchema.index({ parentUserId: 1, studentId: 1 }, { unique: true });

export const ParentLearnerLink = model<IParentLearnerLink>('ParentLearnerLink', linkSchema);

import { Schema, model, Document } from 'mongoose';

export interface IInstitution extends Document {
  id: string;
  name: string;
  lmsSystem?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: 'active' | 'suspended';
  createdBy?: string;
  // The school's IANA time zone (e.g. 'Africa/Cairo'). Optional: unset means
  // the default in services/institutionTimeZone.ts (Africa/Cairo for now).
  // LMS Phase 2b: the picker's due dates are entered and shown in this zone.
  timeZone?: string;
  // LMS step 2 (self-serve onboarding): ISO 3166-1 alpha-2 country code, and
  // the language of the school's LMS emails (owner decision D1: 'ar' by
  // default for Egyptian schools). Optional: unset means English emails.
  country?: string;
  emailLanguage?: 'ar' | 'en';
  // Feature flags for this school (see services/featureFlags.ts). Missing = off.
  features?: Map<string, boolean>;
  // Parents P1 (PARENT_SETTINGS_ENABLED): parent access for this school, set by
  // an ENARA admin only. Unset = 'free' (D1). 'off' hides this school's
  // children from their parents (links are kept, not ended). Read through
  // parents/schoolAccess.ts only.
  // Parents school app (docs/lms/PARENTS_SCHOOL_APP_PLAN.md): the sections this school turned on for its parents (read through
  // schoolApp/sections.ts; each also needs its SCHOOL_APP_*_ENABLED site switch). Unset = all off.
  schoolApp?: { sections?: { timetable?: boolean; announcements?: boolean; attendance?: boolean; notifications?: boolean; fees?: boolean; buses?: boolean }; feesVisibleTo?: 'all' | 'owner'; busPhonesShared?: boolean; updatedAt?: Date; updatedBy?: string };
  parentPortal?: {
    access?: 'off' | 'free'; updatedAt?: Date; updatedBy?: string;
    // Parents P2 (PARENT_CODE_TOOLS_ENABLED), set by the school admin: how long
    // link codes last (1-60 days, unset = 7) and whether teachers may issue
    // codes for their own classes (unset = no, D3).
    codeTtlDays?: number; teachersMayIssueCodes?: boolean;
    // Parents P3 (PARENT_GRADES_AFTER_REVIEW_ENABLED): when parents see a result.
    // Unset = 'after_release' (D7). A result an assignment releases automatically
    // counts as released (owner decision 3).
    showResults?: 'immediately' | 'after_release';
    // Parents P4 (PARENT_EMAILS_ENABLED): which parent emails this school sends.
    // Unset = the D11 defaults: link confirmed on, weekly summary on (a parent
    // can opt out), new results off, link ended on.
    emails?: { linkConfirmed?: boolean; weeklySummary?: boolean; newResults?: boolean; linkEnded?: boolean };
    // Parents P5 (PARENT_CSV_INVITES_ENABLED): the school allows CSV invitations (unset = no).
    csvInvites?: boolean;
  };
  // P2: documents are deleted retentionDays after pilotEndsAt (default 180).
  documentRetention?: { pilotEndsAt?: Date; retentionDays?: number };
  // School limits for learning-intelligence activities (set by school admins).
  learningSettings?: {
    diagnosticMaxQuestions?: number;
    diagnosticMaxMinutes?: number;
    // How far recommendations may depart from the curriculum order.
    pathwayMode?: 'strict_sequence' | 'teacher_controlled' | 'adaptive';
    // Rollout stage C: results visible to staff only.
    shadowMode?: boolean;
    // Adult education school: every student is taught as an adult (all
    // teaching methods open, no game-style motivation), whatever the
    // grade on their profile.
    adultLearners?: boolean;
  };
}

const institutionSchema = new Schema<IInstitution>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    lmsSystem: String,
    contactName: String,
    contactEmail: String,
    contactPhone: String,
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    createdBy: String,
    timeZone: { type: String, maxlength: 60 },
    country: { type: String, maxlength: 2 },
    emailLanguage: { type: String, enum: ['ar', 'en'] },
    features: { type: Map, of: Boolean, default: undefined },
    parentPortal: { type: { access: { type: String, enum: ['off', 'free'] }, updatedAt: Date, updatedBy: String, codeTtlDays: { type: Number, min: 1, max: 60 }, teachersMayIssueCodes: Boolean, showResults: { type: String, enum: ['immediately', 'after_release'] }, emails: { type: { linkConfirmed: Boolean, weeklySummary: Boolean, newResults: Boolean, linkEnded: Boolean, _id: false }, default: undefined }, csvInvites: Boolean, _id: false }, default: undefined },
    schoolApp: { type: { sections: { type: { timetable: Boolean, announcements: Boolean, attendance: Boolean, notifications: Boolean, fees: Boolean, buses: Boolean, _id: false }, default: undefined }, feesVisibleTo: { type: String, enum: ['all', 'owner'] }, busPhonesShared: Boolean, updatedAt: Date, updatedBy: String, _id: false }, default: undefined },
    documentRetention: { type: { pilotEndsAt: Date, retentionDays: { type: Number, min: 1, max: 3650 }, _id: false }, default: undefined },
    learningSettings: {
      diagnosticMaxQuestions: { type: Number, min: 3, max: 30 },
      diagnosticMaxMinutes: { type: Number, min: 5, max: 120 },
      pathwayMode: { type: String, enum: ['strict_sequence', 'teacher_controlled', 'adaptive'] },
      shadowMode: Boolean,
      adultLearners: Boolean,
    },
  },
  { timestamps: true }
);

export const Institution = model<IInstitution>('Institution', institutionSchema);

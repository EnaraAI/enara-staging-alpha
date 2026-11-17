import { Schema, model, models, type Model } from 'mongoose';

// lms_org_settings (Phase 1a): per-school LMS licence settings and the seat
// state (plan §6). One seat = one distinct student in the school. Over the
// limit: the launch is allowed, the school admin is alerted and the school is
// flagged for billing. `hardCap` (default off) refuses new students instead.
// Only ENARA admins change seatLimit and hardCap.
export interface ILmsOrgSettings {
  institutionId: string;
  /** Unset = no limit (nothing is counted against it). */
  seatLimit?: number;
  hardCap: boolean;
  overLimit: boolean;
  /** Set the first time the school went over its limit; cleared only by an ENARA admin. */
  billingFlaggedAt?: Date;
  /** Last seat alert sent to the school's admins (at most one a day). */
  lastAlertAt?: Date;
  /** Seats counted at the last check. */
  seatsUsed?: number;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orgSettingsSchema = new Schema<ILmsOrgSettings>(
  {
    institutionId: { type: String, required: true, unique: true },
    seatLimit: { type: Number, min: 0, max: 1_000_000 },
    hardCap: { type: Boolean, default: false },
    overLimit: { type: Boolean, default: false },
    billingFlaggedAt: Date,
    lastAlertAt: Date,
    seatsUsed: { type: Number, min: 0 },
    updatedBy: String,
  },
  { collection: 'lms_org_settings', versionKey: false, timestamps: true },
);
orgSettingsSchema.index({ overLimit: 1 });

export const LmsOrgSettings =
  (models.LmsOrgSettings as Model<ILmsOrgSettings>) || model<ILmsOrgSettings>('LmsOrgSettings', orgSettingsSchema);

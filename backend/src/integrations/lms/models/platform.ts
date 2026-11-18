import { Schema, model, models, type Model } from 'mongoose';
import { isKnownVendor } from '../presets';
import { newId, requiredOrg } from './common';

// lms_platforms (Spec §4): one row per LMS instance (issuer + client_id), or
// one Google Workspace domain. `vendor` must be a registered preset id, so a
// new vendor needs no schema change.
export interface ILmsPlatform {
  id: string;
  institutionId: string;
  provider: string;
  vendor: string;
  issuer: string;
  clientId: string;
  authLoginUrl?: string;
  authTokenUrl?: string;
  keysetUrl?: string;
  tokenAudience?: string;
  status: 'pending' | 'active' | 'disabled';
  registeredVia: 'dynamic' | 'manual' | 'google_oauth';
  scopes: string[];
  /** Trusted platforms may auto-create unknown deployments as `pending` (Spec §4). */
  autoCreateDeployments: boolean;
  roleOverrides?: Record<string, string>;
  /** Allow LMS Administrator -> ENARA admin (else teacher). Off by default (Spec §5.4). */
  allowAdminRole: boolean;
  /** Who registered it (ENARA user id) and, for a school admin's connection, who approved it. */
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: Date;
  /** Launch counters (Phase 1a). Cookieless = the browser sent no state cookie (decision 2:A). */
  launchCount: number;
  cookielessLaunchCount: number;
  /** Phase 1b: launches bound to the browser through LTI platform storage (no cookie needed, not cookieless). */
  storageLaunchCount?: number;
  lastLaunchAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const platformSchema = new Schema<ILmsPlatform>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmsp') },
    institutionId: requiredOrg,
    provider: { type: String, required: true },
    vendor: { type: String, required: true, validate: { validator: isKnownVendor, message: 'unknown LMS vendor preset' } },
    issuer: { type: String, required: true },
    clientId: { type: String, required: true },
    authLoginUrl: String,
    authTokenUrl: String,
    keysetUrl: String,
    tokenAudience: String,
    status: { type: String, enum: ['pending', 'active', 'disabled'], default: 'pending' },
    registeredVia: { type: String, enum: ['dynamic', 'manual', 'google_oauth'], required: true },
    scopes: { type: [String], default: [] },
    autoCreateDeployments: { type: Boolean, default: false },
    roleOverrides: { type: Schema.Types.Mixed },
    allowAdminRole: { type: Boolean, default: false },
    createdBy: String,
    approvedBy: String,
    approvedAt: Date,
    launchCount: { type: Number, default: 0, min: 0 },
    cookielessLaunchCount: { type: Number, default: 0, min: 0 },
    storageLaunchCount: { type: Number, default: 0, min: 0 },
    lastLaunchAt: Date,
  },
  { collection: 'lms_platforms', versionKey: false, timestamps: true },
);
platformSchema.index({ issuer: 1, clientId: 1 }, { unique: true });
platformSchema.index({ institutionId: 1, status: 1 });

// lms_deployments: an LTI deployment_id; a platform can have many.
export interface ILmsDeployment {
  id: string;
  platformId: string;
  deploymentId: string;
  institutionId: string;
  status: 'pending' | 'active' | 'disabled';
  createdBy?: string;
  approvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const deploymentSchema = new Schema<ILmsDeployment>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmsd') },
    platformId: { type: String, required: true },
    deploymentId: { type: String, required: true },
    institutionId: requiredOrg,
    status: { type: String, enum: ['pending', 'active', 'disabled'], default: 'pending' },
    createdBy: String,
    approvedBy: String,
  },
  { collection: 'lms_deployments', versionKey: false, timestamps: true },
);
deploymentSchema.index({ platformId: 1, deploymentId: 1 }, { unique: true });

export const LmsPlatform = (models.LmsPlatform as Model<ILmsPlatform>) || model<ILmsPlatform>('LmsPlatform', platformSchema);
export const LmsDeployment = (models.LmsDeployment as Model<ILmsDeployment>) || model<ILmsDeployment>('LmsDeployment', deploymentSchema);

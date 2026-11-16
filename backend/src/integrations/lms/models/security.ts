import { Schema, model, models, type Model } from 'mongoose';
import { requiredOrg } from './common';

// lms_tool_keys: ENARA's own signing keys (tool-wide, not per school). The
// private key is encrypted with LMS_KEK and never selected by default. At most
// one `active` and one `next` key exist (partial unique indexes), so two
// instances creating the first key at once cannot both win.
export interface ILmsToolKey {
  kid: string;
  alg: 'RS256';
  privateKeyEnc: string;
  publicJwk: Record<string, unknown>;
  status: 'active' | 'next' | 'retired';
  createdAt: Date;
  activatedAt?: Date;
  retiredAt?: Date;
}

const toolKeySchema = new Schema<ILmsToolKey>(
  {
    kid: { type: String, required: true, unique: true },
    alg: { type: String, enum: ['RS256'], default: 'RS256' },
    privateKeyEnc: { type: String, required: true, select: false },
    publicJwk: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['active', 'next', 'retired'], required: true },
    createdAt: { type: Date, default: () => new Date() },
    activatedAt: Date,
    retiredAt: Date,
  },
  { collection: 'lms_tool_keys', versionKey: false },
);
toolKeySchema.index({ status: 1 }, { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_key' });
toolKeySchema.index({ status: 1 }, { unique: true, partialFilterExpression: { status: 'next' }, name: 'one_next_key' });

// lms_oidc_state: OIDC login state and nonce, single use, 10-minute TTL.
// Only SHA-256 hashes are stored; the nonce row is deleted when used.
export interface ILmsOidcState {
  stateHash: string;
  nonceHash: string;
  platformId: string;
  institutionId: string;
  targetLinkUri: string;
  expiresAt: Date;
}

const oidcStateSchema = new Schema<ILmsOidcState>(
  {
    stateHash: { type: String, required: true, unique: true },
    nonceHash: { type: String, required: true, unique: true },
    platformId: { type: String, required: true },
    institutionId: requiredOrg,
    targetLinkUri: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'lms_oidc_state', versionKey: false },
);
oidcStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// lms_access_tokens: cached LTI service tokens (client_credentials), encrypted.
export interface ILmsAccessToken {
  platformId: string;
  institutionId: string;
  /** Sorted, space-joined scopes. */
  scopesKey: string;
  tokenEnc: string;
  expiresAt: Date;
}

const accessTokenSchema = new Schema<ILmsAccessToken>(
  {
    platformId: { type: String, required: true },
    institutionId: requiredOrg,
    scopesKey: { type: String, required: true },
    tokenEnc: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'lms_access_tokens', versionKey: false },
);
accessTokenSchema.index({ platformId: 1, scopesKey: 1 }, { unique: true });
accessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LmsToolKey = (models.LmsToolKey as Model<ILmsToolKey>) || model<ILmsToolKey>('LmsToolKey', toolKeySchema);
export const LmsOidcState = (models.LmsOidcState as Model<ILmsOidcState>) || model<ILmsOidcState>('LmsOidcState', oidcStateSchema);
export const LmsAccessToken = (models.LmsAccessToken as Model<ILmsAccessToken>) || model<ILmsAccessToken>('LmsAccessToken', accessTokenSchema);

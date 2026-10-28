import { Schema, model, Document } from 'mongoose';

export const API_KEY_PERMISSIONS = ['curriculum:ingest', 'ingestion:read'] as const;
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

export interface IApiKey extends Document {
  id: string;
  // Only the SHA-256 hash is stored; the full key is shown once when it is created.
  keyHash: string;
  keyPrefix: string;
  institutionId: string;
  adminUserId: string;
  adminEmail: string;
  lmsSystemId?: string;
  permissions: ApiKeyPermission[];
  status: 'active' | 'revoked';
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdBy?: string;
  createdAt: Date;
}

const apiKeySchema = new Schema<IApiKey>(
  {
    id: { type: String, required: true, unique: true },
    keyHash: { type: String, required: true, unique: true, select: false },
    keyPrefix: { type: String, required: true },
    institutionId: { type: String, required: true, index: true },
    adminUserId: { type: String, required: true },
    adminEmail: { type: String, required: true, lowercase: true },
    lmsSystemId: String,
    permissions: { type: [String], enum: API_KEY_PERMISSIONS, default: [...API_KEY_PERMISSIONS] },
    status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
    expiresAt: Date,
    lastUsedAt: Date,
    createdBy: String,
  },
  { timestamps: true }
);

export const ApiKey = model<IApiKey>('ApiKey', apiKeySchema);

import { Schema, model, models, type Model } from 'mongoose';
import { newId, requiredOrg } from './common';

// google_connections: a teacher's Classroom OAuth grant (Mode A). The refresh
// token is encrypted with LMS_KEK and never selected by default.
export interface IGoogleConnection {
  id: string;
  institutionId: string;
  enaraUserId: string;
  googleUserId: string;
  refreshTokenEnc: string;
  scopes: string[];
  status: 'active' | 'needs_reauth' | 'revoked';
  createdAt: Date;
  updatedAt: Date;
}

const googleConnectionSchema = new Schema<IGoogleConnection>(
  {
    id: { type: String, required: true, unique: true, default: newId('gcon') },
    institutionId: requiredOrg,
    enaraUserId: { type: String, required: true },
    googleUserId: { type: String, required: true, index: true },
    refreshTokenEnc: { type: String, required: true, select: false },
    scopes: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'needs_reauth', 'revoked'], default: 'active' },
  },
  { collection: 'google_connections', versionKey: false, timestamps: true },
);
googleConnectionSchema.index({ institutionId: 1, enaraUserId: 1 }, { unique: true });

export const GoogleConnection =
  (models.GoogleConnection as Model<IGoogleConnection>) || model<IGoogleConnection>('GoogleConnection', googleConnectionSchema);

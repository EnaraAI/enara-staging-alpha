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
  // Feature flags for this school (see services/featureFlags.ts). Missing = off.
  features?: Map<string, boolean>;
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
    features: { type: Map, of: Boolean, default: undefined },
    documentRetention: { type: { pilotEndsAt: Date, retentionDays: { type: Number, min: 1, max: 3650 }, _id: false }, default: undefined },
    learningSettings: {
      diagnosticMaxQuestions: { type: Number, min: 3, max: 30 },
      diagnosticMaxMinutes: { type: Number, min: 5, max: 120 },
      pathwayMode: { type: String, enum: ['strict_sequence', 'teacher_controlled', 'adaptive'] },
      shadowMode: Boolean,
    },
  },
  { timestamps: true }
);

export const Institution = model<IInstitution>('Institution', institutionSchema);

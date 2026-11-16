import { Schema, model, Document } from 'mongoose';

// A learner safety alert for the Parents Portal (SPEC §10). No detector writes
// these yet (decision 16 Nov 2026): the portal serves mock alerts from
// src/parents/mock until one exists.
//   reliable now (pattern / model refusal based): personal_details, inappropriate_content
//   beta, human review first (classifier, may misfire): distress, bullying
// Beta alerts are never shown to parents until a person has reviewed them.
export const SAFETY_CATEGORIES = ['personal_details', 'inappropriate_content', 'distress', 'bullying'] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];
export const BETA_SAFETY_CATEGORIES: readonly SafetyCategory[] = ['distress', 'bullying'];

export interface ISafetyAlert extends Document {
  id: string;
  studentId: string;
  institutionId?: string;
  category: SafetyCategory;
  // personal_details: phone | email | address | school_name
  subtype?: string;
  actionTaken: string;
  excerpt?: string;
  sessionId?: string;
  detector: 'pattern' | 'model_refusal' | 'classifier';
  beta: boolean;
  reviewRequired: boolean;
  reviewedAt?: Date;
  reviewedBy?: string;
  createdAt: Date;
}

const safetyAlertSchema = new Schema<ISafetyAlert>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, index: true },
    institutionId: String,
    category: { type: String, enum: SAFETY_CATEGORIES, required: true },
    subtype: String,
    actionTaken: { type: String, required: true },
    excerpt: String,
    sessionId: String,
    detector: { type: String, enum: ['pattern', 'model_refusal', 'classifier'], required: true },
    beta: { type: Boolean, required: true },
    reviewRequired: { type: Boolean, required: true },
    reviewedAt: Date,
    reviewedBy: String,
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'safety_alerts', versionKey: false },
);
safetyAlertSchema.index({ studentId: 1, createdAt: -1 });

export const SafetyAlert = model<ISafetyAlert>('SafetyAlert', safetyAlertSchema);

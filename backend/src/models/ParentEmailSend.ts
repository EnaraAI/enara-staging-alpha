import { Schema, model, Document } from 'mongoose';

// Parents P4: one row per parent email event (never sent twice). `key` names
// the event (e.g. confirmed:<linkId>:<codeId>, results:<parentId>:<studentId>:<day>,
// weekly:<parentId>:<weekStart>). IDs, the template, the outcome and a code only:
// no address, no subject (it carries a child's name), no body. A failed send is
// tried again by a later event with the same key, at most 3 times in all.
// Kept 13 months (TTL), like the other parent records.
export interface IParentEmailSend extends Document {
  key: string;
  template: string;
  parentUserId?: string;
  studentId?: string;
  institutionId?: string;
  status: 'pending' | 'sent' | 'captured' | 'held' | 'failed' | 'skipped';
  code?: string;
  attempts: number;
  at: Date;
}

const schema = new Schema<IParentEmailSend>(
  {
    key: { type: String, required: true, unique: true, maxlength: 300 },
    template: { type: String, required: true },
    parentUserId: { type: String, index: true },
    studentId: { type: String, index: true },
    institutionId: String,
    status: { type: String, enum: ['pending', 'sent', 'captured', 'held', 'failed', 'skipped'], required: true },
    code: String,
    attempts: { type: Number, default: 1 },
    at: { type: Date, required: true },
  },
  { collection: 'parent_email_sends', versionKey: false },
);
schema.index({ at: 1 }, { expireAfterSeconds: 396 * 86400 });

export const ParentEmailSend = model<IParentEmailSend>('ParentEmailSend', schema);

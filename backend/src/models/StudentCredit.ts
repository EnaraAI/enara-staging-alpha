import { Schema, model, Document } from 'mongoose';

export interface IStudentCredit extends Document {
  studentId: string;
  institutionId?: string;
  limit: number;
  usage: number;
  period: 'daily' | 'monthly' | 'total';
  status: 'active' | 'blocked' | 'throttled';
  restrictedFeatures: string[];
}

const studentCreditSchema = new Schema<IStudentCredit>(
  {
    studentId: { type: String, required: true, unique: true, index: true },
    institutionId: { type: String, index: true },
    limit: { type: Number, default: 50000 },
    usage: { type: Number, default: 0 },
    period: { type: String, enum: ['daily', 'monthly', 'total'], default: 'monthly' },
    status: {
      type: String,
      enum: ['active', 'blocked', 'throttled'],
      default: 'active',
    },
    restrictedFeatures: { type: [String], default: [] },
  },
  { timestamps: true }
);

studentCreditSchema.index({ institutionId: 1, status: 1 });

export const StudentCredit = model<IStudentCredit>('StudentCredit', studentCreditSchema);

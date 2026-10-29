import { Schema, model, Document } from 'mongoose';
import { USER_ROLES, UserRole } from '../auth/roles';

export type { UserRole };

export interface IUser extends Document {
  email: string;
  password: string;
  role: UserRole;
  name: string;
  studentId?: string;
  institutionId?: string;
  status: 'active' | 'disabled';
  // Explicit permission grants on top of the role's defaults (auth/permissions.ts).
  permissions?: string[];
  origin?: 'live' | 'demo_seed';
  // Bumped on logout and password reset: every token signed with an older
  // value is refused (S-1). Missing means 0, so earlier tokens stay valid.
  tokenVersion?: number;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'student',
    },
    name: { type: String, default: 'User' },
    studentId: { type: String, index: true },
    institutionId: { type: String, index: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
    permissions: { type: [String], default: undefined },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);

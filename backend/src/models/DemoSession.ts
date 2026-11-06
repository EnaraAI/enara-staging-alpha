import { Schema, model } from 'mongoose';

// One partner demo session: a throwaway school copied from the demo template.
export interface IDemoSession {
  id: string;
  institutionId: string;
  // sha256 of the visitor's network address: counts sessions per address.
  ipHash: string;
  // The session's own accounts, by role.
  users: { student?: string; teacher?: string; admin?: string };
  status: 'active' | 'ended';
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  endedAt?: Date;
  endReason?: 'closed' | 'idle' | 'expired' | 'replaced';
}

const demoSessionSchema = new Schema<IDemoSession>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true, index: true },
    ipHash: { type: String, required: true, index: true },
    users: { student: String, teacher: String, admin: String },
    status: { type: String, enum: ['active', 'ended'], default: 'active', index: true },
    createdAt: { type: Date, default: Date.now, index: true },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    endedAt: Date,
    endReason: { type: String, enum: ['closed', 'idle', 'expired', 'replaced'] },
  },
  { collection: 'demo_sessions' },
);

export const DemoSession = model<IDemoSession>('DemoSession', demoSessionSchema);

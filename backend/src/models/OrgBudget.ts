import { Schema, model, Document } from 'mongoose';

// AI spend protection per institution (4Level1 plan, P0d). Opt-in: nothing is
// enforced unless enforcementEnabled is set, and there are no default caps.
// Amounts are ENARA's internal spending limits in USD, never shown to schools.
// Every change bumps version and appends to history (who, when, what).

export interface IOrgBudget extends Document {
  institutionId: string;
  enforcementEnabled: boolean;
  // Blocks non-grading AI for the school, whether or not caps are enforced.
  aiPaused: boolean;
  dailyCapUsd?: number;
  monthlyCapUsd?: number;
  perUserDailyCapUsd?: number;
  // Monthly allowance kept for grading once the ordinary caps are reached.
  gradingAllowanceUsd?: number;
  // Spending-reservation ceiling per call for operations without a known price
  // or upper bound, keyed `provider:feature`. A limit, not a cost estimate.
  maxReservationUsdPerCall: Map<string, number>;
  // The tools the school will use; enabling enforcement requires a reservation
  // ceiling for each of them that has no catalogue price.
  intendedTools: string[];
  // P5: the school's own usage alert limits in customer credits (set by its
  // Workspace Admin within ENARA's ceiling). Alerts only, never enforced, and
  // separate from the internal USD caps above.
  customerLimits?: { dailyCredits?: number; monthlyCredits?: number; perUserDailyCredits?: number };
  version: number;
  updatedBy?: string;
  history: { version: number; at: Date; by?: string; changes: Record<string, unknown> }[];
  createdAt: Date;
  updatedAt: Date;
}

const orgBudgetSchema = new Schema<IOrgBudget>(
  {
    institutionId: { type: String, required: true, unique: true },
    enforcementEnabled: { type: Boolean, default: false },
    aiPaused: { type: Boolean, default: false },
    dailyCapUsd: { type: Number, min: 0 },
    monthlyCapUsd: { type: Number, min: 0 },
    perUserDailyCapUsd: { type: Number, min: 0 },
    gradingAllowanceUsd: { type: Number, min: 0 },
    maxReservationUsdPerCall: { type: Map, of: Number, default: () => new Map() },
    intendedTools: { type: [String], default: [] },
    customerLimits: { type: { dailyCredits: { type: Number, min: 0 }, monthlyCredits: { type: Number, min: 0 }, perUserDailyCredits: { type: Number, min: 0 }, _id: false }, default: undefined },
    version: { type: Number, default: 1 },
    updatedBy: String,
    history: { type: [{ version: Number, at: Date, by: String, changes: Schema.Types.Mixed, _id: false }], default: [] },
  },
  { collection: 'org_budgets', timestamps: true },
);

export const OrgBudget = model<IOrgBudget>('OrgBudget', orgBudgetSchema);

// Global AI controls: one document, `_id: 'global'`.
export interface IAiControl {
  _id: string;
  aiPaused: boolean;
  version: number;
  updatedBy?: string;
  updatedAt?: Date;
  history: { version: number; at: Date; by?: string; changes: Record<string, unknown> }[];
}
const aiControlSchema = new Schema<IAiControl>(
  {
    _id: String,
    aiPaused: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
    updatedBy: String,
    updatedAt: Date,
    history: { type: [{ version: Number, at: Date, by: String, changes: Schema.Types.Mixed, _id: false }], default: [] },
  },
  { collection: 'ai_controls', versionKey: false },
);
export const AiControl = model<IAiControl>('AiControl', aiControlSchema);

// Atomic spend counters, in integer micro-dollars to avoid float drift. One
// per institution and window (`<inst>:day:<YYYY-MM-DD>`, `<inst>:month:<YYYY-MM>`,
// `<inst>:user:<id>:day:<date>`, `<inst>:grading:<YYYY-MM>`). committed =
// in-flight reservations + settled spend + unknown exposure kept.
export interface IBudgetCounter {
  _id: string;
  institutionId: string;
  committedMicros: number;
  settledMicros: number;
  unknownMicros: number;
  alerts: string[];
  expiresAt: Date;
}
const budgetCounterSchema = new Schema<IBudgetCounter>(
  {
    _id: String,
    institutionId: { type: String, required: true },
    committedMicros: { type: Number, default: 0 },
    settledMicros: { type: Number, default: 0 },
    unknownMicros: { type: Number, default: 0 },
    alerts: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'budget_counters', versionKey: false },
);
budgetCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BudgetCounter = model<IBudgetCounter>('BudgetCounter', budgetCounterSchema);

// One mutable reservation per provider attempt (never a ledger row), keyed by
// the attempt's operation key, so a replay reserves nothing more.
export type ReservationStatus = 'reserving' | 'reserved' | 'settled' | 'released' | 'expired';
export interface IBudgetReservation {
  _id: string;
  institutionId: string;
  userId?: string;
  feature: string;
  provider: string;
  kind: 'standard' | 'grading_allowance' | 'grading_emergency';
  amountMicros: number;
  counters: string[];
  status: ReservationStatus;
  actualMicros?: number | null;
  createdAt: Date;
  expiresAt: Date;
  settledAt?: Date;
}
const budgetReservationSchema = new Schema<IBudgetReservation>(
  {
    _id: String,
    institutionId: { type: String, required: true },
    userId: String,
    feature: { type: String, required: true },
    provider: { type: String, required: true },
    kind: { type: String, enum: ['standard', 'grading_allowance', 'grading_emergency'], required: true },
    amountMicros: { type: Number, required: true, min: 0 },
    counters: { type: [String], default: [] },
    status: { type: String, enum: ['reserving', 'reserved', 'settled', 'released', 'expired'], required: true },
    actualMicros: { type: Number, default: undefined },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    settledAt: Date,
  },
  { collection: 'budget_reservations', versionKey: false },
);
budgetReservationSchema.index({ status: 1, expiresAt: 1 });
budgetReservationSchema.index({ institutionId: 1, createdAt: -1 });
export const BudgetReservation = model<IBudgetReservation>('BudgetReservation', budgetReservationSchema);

import { Schema, model, Document } from 'mongoose';

// Append-only record of billable AI and media usage (4Level1 plan, P0a; see
// docs/plans/4level1-ai-workspace/03-architecture-and-cost-metering.md §4).
// One row per billed provider attempt, keyed by a unique operationKey so a
// retried write is never counted twice. costInternal is ENARA's internal
// estimate and must never be returned to customer roles. Nothing writes here
// yet: call sites move to it in P0b.

// 'unpriced': units known, no catalogue price. 'usage_unknown': the provider
// reported no usage (error, cancellation); the cost is unknown, not zero.
export type LedgerCostStatus = 'measured' | 'estimated' | 'provisional' | 'reconciled' | 'unpriced' | 'usage_unknown';
export type LedgerStatus = 'ok' | 'error' | 'refusal' | 'cancelled';
export type LedgerProvider = 'anthropic' | 'elevenlabs' | 'anam' | 'orchestrator' | 'ingestion_engine';

export interface LedgerUnits {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  characters?: number;
  audioSeconds?: number;
  avatarSeconds?: number;
  pages?: number;
  requests?: number;
}

export interface IUsageLedger extends Document {
  id: string;
  operationKey: string;
  institutionId?: string;
  userId?: string;
  studentId?: string;
  role?: string;
  requestId?: string;
  feature: string;
  refs?: { sessionId?: string; assessmentId?: string; attemptId?: string; uploadId?: string };
  provider: LedgerProvider;
  modelName: string;
  units: LedgerUnits;
  attempt: number;
  status: LedgerStatus;
  errorCode?: string;
  priceCatalogVersion: string;
  currency: 'USD';
  costInternal: number | null;
  costStatus: LedgerCostStatus;
  billedUnits?: number;
  // How the units were obtained, when not provider-reported: measured by our
  // server clock, or inferred from the last activity seen (a lower bound).
  unitsBasis?: 'server_measured' | 'inferred_from_activity';
  origin: 'live' | 'demo_seed';
  createdAt: Date;
}

const unitsSchema = new Schema<LedgerUnits>(
  {
    inputTokens: { type: Number, min: 0 },
    outputTokens: { type: Number, min: 0 },
    cacheReadTokens: { type: Number, min: 0 },
    cacheWriteTokens: { type: Number, min: 0 },
    characters: { type: Number, min: 0 },
    audioSeconds: { type: Number, min: 0 },
    avatarSeconds: { type: Number, min: 0 },
    pages: { type: Number, min: 0 },
    requests: { type: Number, min: 0 },
  },
  { _id: false },
);

const usageLedgerSchema = new Schema<IUsageLedger>(
  {
    id: { type: String, required: true, unique: true },
    operationKey: { type: String, required: true, unique: true },
    institutionId: String,
    userId: String,
    studentId: String,
    role: String,
    requestId: String,
    feature: { type: String, required: true },
    refs: { type: { sessionId: String, assessmentId: String, attemptId: String, uploadId: String, _id: false }, default: undefined },
    provider: { type: String, enum: ['anthropic', 'elevenlabs', 'anam', 'orchestrator', 'ingestion_engine'], required: true },
    modelName: { type: String, required: true },
    units: { type: unitsSchema, default: () => ({}) },
    attempt: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: ['ok', 'error', 'refusal', 'cancelled'], required: true },
    errorCode: String,
    priceCatalogVersion: { type: String, required: true },
    currency: { type: String, enum: ['USD'], default: 'USD' },
    costInternal: { type: Number, default: null, min: 0 },
    costStatus: { type: String, enum: ['measured', 'estimated', 'provisional', 'reconciled', 'unpriced', 'usage_unknown'], required: true },
    billedUnits: { type: Number, min: 0 },
    unitsBasis: { type: String, enum: ['server_measured', 'inferred_from_activity'] },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
  },
  { collection: 'usage_ledger', timestamps: { createdAt: true, updatedAt: false } },
);
usageLedgerSchema.index({ institutionId: 1, createdAt: -1 });
usageLedgerSchema.index({ feature: 1, createdAt: -1 });
usageLedgerSchema.index({ institutionId: 1, origin: 1, createdAt: -1 });
// P5 usage chips: one request's rows for its user.
usageLedgerSchema.index({ requestId: 1, userId: 1 });

// Append-only: rows are never deleted or rewritten through the model.
// (Reconciliation will get its own narrow status update in a later phase.)
const refuse = function () {
  throw new Error('usage_ledger is append-only');
};
for (const op of ['deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'updateOne', 'updateMany', 'findOneAndUpdate'] as const) {
  usageLedgerSchema.pre(op, refuse);
}
// Query middleware does not cover document saves or bulkWrite (checked against
// Mongoose 8.24): a save is allowed only for a new row, and bulkWrite only for
// insertOne operations.
usageLedgerSchema.pre('save', function () {
  if (!this.isNew) refuse();
});
usageLedgerSchema.pre('bulkWrite', function (next, ops: Array<Record<string, unknown>>) {
  if (ops.some((op) => Object.keys(op).some((k) => k !== 'insertOne'))) return next(new Error('usage_ledger is append-only'));
  next();
});

export const UsageLedger = model<IUsageLedger>('UsageLedger', usageLedgerSchema);

import { Schema, model, Document } from 'mongoose';

// The ENARA commercial price for one school (P5): what the school pays ENARA,
// in the school's currency, and how usage converts to customer credits. Set
// only by ENARA admins (the authorized commercial path); schools may read it.
// It is a customer price, never ENARA's internal provider cost, and nothing
// here is derived from provider rates. Every change bumps version and appends
// to history.

export const CREDIT_UNITS = ['operation', 'minute', 'thousand_characters', 'thousand_tokens'] as const;
export type CreditUnit = (typeof CREDIT_UNITS)[number];

export interface ICommercialPlan extends Document {
  institutionId: string;
  status: 'proposed' | 'contracted';
  currency: string; // ISO 4217, e.g. 'EGP', 'USD'
  period: 'monthly';
  basePrice: number;
  seatPrice?: number;
  seatBasis?: 'staff' | 'students';
  includedCredits: number;
  // Price per credit above the included credits; absent means overage is not
  // priced (projections above the included credits show "Not enough data").
  overagePricePerCredit?: number;
  // Credits per unit of a tool, keyed by the ledger feature name.
  creditRates: Map<string, { unit: CreditUnit; credits: number }>;
  // ENARA's hard ceiling for the school's own monthly credit limit.
  maxCustomerMonthlyCredits?: number;
  validFrom?: Date;
  notes?: string;
  version: number;
  updatedBy?: string;
  history: { version: number; at: Date; by?: string; changes: Record<string, unknown> }[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ICommercialPlan>(
  {
    institutionId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['proposed', 'contracted'], required: true },
    currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
    period: { type: String, enum: ['monthly'], default: 'monthly' },
    basePrice: { type: Number, required: true, min: 0 },
    seatPrice: { type: Number, min: 0 },
    seatBasis: { type: String, enum: ['staff', 'students'] },
    includedCredits: { type: Number, required: true, min: 0 },
    overagePricePerCredit: { type: Number, min: 0 },
    creditRates: { type: Map, of: new Schema({ unit: { type: String, enum: CREDIT_UNITS, required: true }, credits: { type: Number, required: true, min: 0 } }, { _id: false }), default: () => new Map() },
    maxCustomerMonthlyCredits: { type: Number, min: 0 },
    validFrom: Date,
    notes: { type: String, maxlength: 1000 },
    version: { type: Number, default: 1 },
    updatedBy: String,
    history: { type: [{ version: Number, at: Date, by: String, changes: Schema.Types.Mixed, _id: false }], default: [] },
  },
  { collection: 'commercial_plans', timestamps: true },
);

export const CommercialPlan = model<ICommercialPlan>('CommercialPlan', schema);

// What a school currently pays for other AI tools, entered by its Workspace
// Admin. User-entered, not measured. Removal is soft so the audit stays.
export interface ICurrentToolSpend extends Document {
  id: string;
  institutionId: string;
  toolName: string;
  provider?: string;
  plan?: string;
  seats?: number;
  amount: number;
  currency: string;
  period: 'monthly' | 'annual';
  // Whether ENARA would replace this tool (only these count in savings).
  replacedByEnara: boolean;
  reference?: string;
  createdBy: string;
  updatedBy: string;
  removedAt?: Date;
  removedBy?: string;
  history: { at: Date; by: string; action: string; changes?: Record<string, unknown> }[];
  createdAt: Date;
  updatedAt: Date;
}

const spendSchema = new Schema<ICurrentToolSpend>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true },
    toolName: { type: String, required: true, maxlength: 120 },
    provider: { type: String, maxlength: 120 },
    plan: { type: String, maxlength: 120 },
    seats: { type: Number, min: 0, max: 100000 },
    amount: { type: Number, required: true, min: 0, max: 100_000_000 },
    currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
    period: { type: String, enum: ['monthly', 'annual'], required: true },
    replacedByEnara: { type: Boolean, default: true },
    reference: { type: String, maxlength: 300 },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: true },
    removedAt: Date,
    removedBy: String,
    history: { type: [{ at: Date, by: String, action: String, changes: Schema.Types.Mixed, _id: false }], default: [] },
  },
  { collection: 'current_tool_spend', timestamps: true },
);
spendSchema.index({ institutionId: 1, removedAt: 1, createdAt: -1 });

export const CurrentToolSpend = model<ICurrentToolSpend>('CurrentToolSpend', spendSchema);

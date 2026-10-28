import { Schema, model, Document } from 'mongoose';
import type { PriceProvider, PriceUnit } from '../services/priceCatalog';

// Stored copy of services/priceCatalog.ts (one row per version, provider,
// model and unit), for audit and reconciliation. Rows are never edited:
// prices change by adding a new version.
export interface IPriceCatalogRow extends Document {
  version: string;
  effectiveFrom: Date;
  currency: 'USD';
  provider: PriceProvider;
  modelName: string;
  unit: PriceUnit;
  usdPerUnitBlock: number;
  unitBlock: number;
  source: 'list_estimate' | 'contract';
  createdAt: Date;
}

const priceCatalogSchema = new Schema<IPriceCatalogRow>(
  {
    version: { type: String, required: true },
    effectiveFrom: { type: Date, required: true },
    currency: { type: String, enum: ['USD'], required: true },
    provider: { type: String, enum: ['anthropic', 'elevenlabs'], required: true },
    modelName: { type: String, required: true },
    unit: { type: String, enum: ['input_token', 'output_token', 'cache_read_token', 'cache_write_token', 'tts_character'], required: true },
    usdPerUnitBlock: { type: Number, required: true, min: 0 },
    unitBlock: { type: Number, required: true, min: 1 },
    source: { type: String, enum: ['list_estimate', 'contract'], required: true },
  },
  { collection: 'price_catalog', timestamps: { createdAt: true, updatedAt: false } },
);
priceCatalogSchema.index({ version: 1, provider: 1, modelName: 1, unit: 1 }, { unique: true });

export const PriceCatalogRow = model<IPriceCatalogRow>('PriceCatalogRow', priceCatalogSchema);

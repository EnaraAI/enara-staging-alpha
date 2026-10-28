import { PriceCatalogRow } from '../models/PriceCatalog';
import { PRICE_CATALOG, catalogRows } from './priceCatalog';

// Compares the stored price_catalog rows with the code catalogue
// (services/priceCatalog.ts). The code is the runtime source of truth; the
// stored rows are an audit copy, so drift is reported, never repaired here.
export interface PriceCatalogDrift {
  version: string;
  missing: string[]; // in code, not stored
  unexpected: string[]; // stored, not in code
  mismatched: { key: string; fields: string[] }[];
}

const COMPARED = ['effectiveFrom', 'currency', 'usdPerUnitBlock', 'unitBlock', 'source'] as const;
const keyOf = (r: { provider: string; modelName: string; unit: string }) => `${r.provider}/${r.modelName}/${r.unit}`;
const comparable = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

export async function checkPriceCatalogDrift(versions = PRICE_CATALOG.map((v) => v.version)): Promise<PriceCatalogDrift[]> {
  const out: PriceCatalogDrift[] = [];
  for (const version of versions) {
    const expected = new Map(catalogRows(version).map((r) => [keyOf(r), r]));
    const stored = await PriceCatalogRow.find({ version }).lean();
    const drift: PriceCatalogDrift = { version, missing: [], unexpected: [], mismatched: [] };
    const seen = new Set<string>();
    for (const row of stored) {
      const key = keyOf(row);
      seen.add(key);
      const want = expected.get(key);
      if (!want) {
        drift.unexpected.push(key);
        continue;
      }
      const fields = COMPARED.filter((f) => comparable(row[f]) !== comparable(want[f]));
      if (fields.length) drift.mismatched.push({ key, fields });
    }
    for (const key of expected.keys()) if (!seen.has(key)) drift.missing.push(key);
    if (drift.missing.length || drift.unexpected.length || drift.mismatched.length) out.push(drift);
  }
  return out;
}

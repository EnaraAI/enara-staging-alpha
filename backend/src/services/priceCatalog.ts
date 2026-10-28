// Versioned price catalogue for AI provider usage (4Level1 plan, P0a).
// The code is the source of truth so pricing stays synchronous on hot paths;
// migration 2026-10-28-price-catalog-v1 stores the same rows in the
// `price_catalog` collection for audit and reconciliation. Never edit a
// published version: add a new one with a later effectiveFrom.

export type PriceProvider = 'anthropic' | 'elevenlabs';
// Billing units. Token prices are per million tokens; TTS per 1,000 characters.
export type PriceUnit = 'input_token' | 'output_token' | 'cache_read_token' | 'cache_write_token' | 'tts_character';

export interface PriceEntry {
  provider: PriceProvider;
  model: string; // model family; dated snapshots match on the prefix
  unit: PriceUnit;
  usdPerUnitBlock: number;
  unitBlock: number; // 1_000_000 tokens or 1_000 characters
  source: 'list_estimate' | 'contract';
}

export interface PriceCatalogVersion {
  version: string;
  effectiveFrom: string; // ISO date
  currency: 'USD';
  note: string;
  entries: PriceEntry[];
}

const M = 1_000_000;
// v1: exactly the prices that were hardcoded in services/aiCalls.ts. Cache
// writes are billed at 1.25x input (5-minute TTL).
const tokens = (model: string, input: number, output: number, cacheRead: number): PriceEntry[] => [
  { provider: 'anthropic', model, unit: 'input_token', usdPerUnitBlock: input, unitBlock: M, source: 'list_estimate' },
  { provider: 'anthropic', model, unit: 'output_token', usdPerUnitBlock: output, unitBlock: M, source: 'list_estimate' },
  { provider: 'anthropic', model, unit: 'cache_read_token', usdPerUnitBlock: cacheRead, unitBlock: M, source: 'list_estimate' },
  { provider: 'anthropic', model, unit: 'cache_write_token', usdPerUnitBlock: input * 1.25, unitBlock: M, source: 'list_estimate' },
];

export const PRICE_CATALOG: readonly PriceCatalogVersion[] = [
  {
    version: 'v1',
    effectiveFrom: '2026-10-28',
    currency: 'USD',
    note: 'Estimated list prices previously hardcoded in services/aiCalls.ts',
    entries: [
      ...tokens('claude-opus-5-5', 4, 20, 0.2),
      ...tokens('claude-sonnet-5-5', 2, 10, 0.2),
      ...tokens('claude-haiku-5-5', 0.1, 0.5, 0.01),
      // ElevenLabs speech (Flash, approximate). Any voice model.
      { provider: 'elevenlabs', model: '*', unit: 'tts_character', usdPerUnitBlock: 0.08, unitBlock: 1000, source: 'list_estimate' },
    ],
  },
];

export const CURRENT_PRICE_VERSION = PRICE_CATALOG[PRICE_CATALOG.length - 1].version;

export function catalogVersion(version = CURRENT_PRICE_VERSION): PriceCatalogVersion {
  const v = PRICE_CATALOG.find((c) => c.version === version);
  if (!v) throw new Error(`Unknown price catalogue version ${version}`);
  return v;
}

const matches = (entryModel: string, model: string) => entryModel === '*' || model === entryModel || model.startsWith(`${entryModel}-`);

function findEntry(provider: PriceProvider, model: string, unit: PriceUnit, version: string) {
  return catalogVersion(version).entries.find((e) => e.provider === provider && e.unit === unit && matches(e.model, model));
}

// Price per unit block as published (e.g. USD per million tokens), or undefined.
export function blockPriceUsd(provider: PriceProvider, model: string, unit: PriceUnit, version = CURRENT_PRICE_VERSION): number | undefined {
  return findEntry(provider, model, unit, version)?.usdPerUnitBlock;
}

// Price of one unit (USD), or undefined when the catalogue has no price.
export function unitPriceUsd(provider: PriceProvider, model: string, unit: PriceUnit, version = CURRENT_PRICE_VERSION): number | undefined {
  const entry = findEntry(provider, model, unit, version);
  return entry ? entry.usdPerUnitBlock / entry.unitBlock : undefined;
}

export function hasTokenPrices(model: string, version = CURRENT_PRICE_VERSION): boolean {
  return unitPriceUsd('anthropic', model, 'input_token', version) !== undefined;
}

export interface UsageUnits {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  characters?: number;
}

export interface PricedUsage {
  costUsd: number | null; // null when not priced
  status: 'estimated' | 'unpriced'; // list prices are estimates until reconciled
  priceCatalogVersion: string;
  currency: 'USD';
}

// Prices usage against the catalogue. Unknown models are 'unpriced' (null),
// never a silent zero.
export function priceUsage(provider: PriceProvider, model: string, units: UsageUnits, version = CURRENT_PRICE_VERSION): PricedUsage {
  const base = { priceCatalogVersion: version, currency: 'USD' as const };
  let cost = 0;
  const parts: [PriceUnit, number | undefined][] =
    provider === 'elevenlabs'
      ? [['tts_character', units.characters]]
      : [['input_token', units.inputTokens], ['output_token', units.outputTokens], ['cache_read_token', units.cacheReadTokens], ['cache_write_token', units.cacheWriteTokens]];
  for (const [unit, amount] of parts) {
    if (!amount) continue;
    const price = unitPriceUsd(provider, model, unit, version);
    if (price === undefined) return { ...base, costUsd: null, status: 'unpriced' };
    cost += amount * price;
  }
  if (provider === 'anthropic' && !hasTokenPrices(model, version)) return { ...base, costUsd: null, status: 'unpriced' };
  return { ...base, costUsd: Math.round(cost * 1_000_000) / 1_000_000, status: 'estimated' };
}

// Rows for the `price_catalog` collection.
export function catalogRows(version = CURRENT_PRICE_VERSION) {
  const v = catalogVersion(version);
  return v.entries.map(({ model, ...e }) => ({ version: v.version, effectiveFrom: new Date(`${v.effectiveFrom}T00:00:00Z`), currency: v.currency, modelName: model, ...e }));
}

// Conservative upper bound for one call before it is made (budget
// reservations): every input token at the dearest input-side rate (input,
// cache write or cache read) and every output token at the output rate.
// `anyModel` (server-side fallback may answer with another model) prices at
// the dearest catalogue model. Null when there is no catalogue price.
export function upperBoundUsd(
  provider: PriceProvider,
  model: string,
  limits: { inputTokens?: number; outputTokens?: number; characters?: number; anyModel?: boolean },
  version = CURRENT_PRICE_VERSION,
): number | null {
  if (provider === 'elevenlabs') {
    const p = unitPriceUsd('elevenlabs', model, 'tts_character', version);
    return p === undefined || limits.characters === undefined ? null : limits.characters * p;
  }
  const models = limits.anyModel
    ? [...new Set(catalogVersion(version).entries.filter((e) => e.provider === 'anthropic').map((e) => e.model))]
    : [model];
  let worst: number | null = null;
  for (const m of models) {
    const inputSide = (['input_token', 'cache_write_token', 'cache_read_token'] as const).map((u) => unitPriceUsd('anthropic', m, u, version));
    const output = unitPriceUsd('anthropic', m, 'output_token', version);
    if (inputSide.some((p) => p === undefined) || output === undefined) {
      if (!limits.anyModel) return null;
      continue;
    }
    const cost = (limits.inputTokens ?? 0) * Math.max(...(inputSide as number[])) + (limits.outputTokens ?? 0) * output;
    worst = worst === null ? cost : Math.max(worst, cost);
  }
  return worst;
}

// Upper bound on the tokens in text-only request parts: a token is at least
// one byte of UTF-8, plus a fixed allowance for message framing.
export function textTokenBound(...parts: unknown[]): number {
  return Buffer.byteLength(JSON.stringify(parts)) + 1024;
}

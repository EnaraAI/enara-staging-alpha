import { AiCall, type AiCallStatus, type AiProvider } from '../models/AiCall';
import { getCallContext } from '../utils/callContext';
import { logger, serializeError } from '../utils/logging';
import { CURRENT_PRICE_VERSION, blockPriceUsd, catalogVersion, type PriceUnit } from './priceCatalog';

// Prices come from the versioned catalogue (services/priceCatalog.ts, v1 =
// the list prices previously hardcoded here). USD per million tokens; cache
// writes are billed at 1.25x input (5-minute TTL). estimateCostUsd returns
// 0 for an unknown model for compatibility; that 0 is not a cost, so callers
// check isPriced and ai_calls rows carry costStatus 'unpriced'.
const blockPrice = (model: string, unit: PriceUnit) => blockPriceUsd('anthropic', model, unit) ?? 0;
const TOKEN_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = Object.fromEntries(
  [...new Set(catalogVersion().entries.filter((e) => e.provider === 'anthropic').map((e) => e.model))].map((m) => [
    m,
    { input: blockPrice(m, 'input_token'), output: blockPrice(m, 'output_token'), cacheRead: blockPrice(m, 'cache_read_token'), cacheWrite: blockPrice(m, 'cache_write_token') },
  ]),
);
// ElevenLabs speech, USD per 1,000 characters.
const TTS_PRICE_PER_1K_CHARS = blockPriceUsd('elevenlabs', '*', 'tts_character') ?? 0;

const warnedModels = new Set<string>();
function warnUnpriced(modelName: string) {
  if (warnedModels.has(modelName)) return;
  warnedModels.add(modelName);
  logger.warn('ai_model_unpriced', { modelName, priceCatalogVersion: CURRENT_PRICE_VERSION });
}

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function priceFor(modelName: string) {
  // Responses may name a dated snapshot; match on the family prefix.
  const key = Object.keys(TOKEN_PRICES).find((k) => modelName === k || modelName.startsWith(`${k}-`));
  return key ? TOKEN_PRICES[key] : undefined;
}

// Upper bound for one call before it is made (budget reservations), or null
// when the model has no known price.
export function maxCallCostUsd(modelName: string, maxInputTokens: number, maxOutputTokens: number): number | null {
  const price = priceFor(modelName);
  if (!price) return null;
  return (maxInputTokens * price.input + maxOutputTokens * price.output) / 1_000_000;
}

// Whether estimateCostUsd has a real price for this call.
export function isPriced(modelName: string, characters = 0): boolean {
  return characters ? TTS_PRICE_PER_1K_CHARS > 0 : priceFor(modelName) !== undefined;
}

export function estimateCostUsd(modelName: string, usage: TokenUsage = {}, characters = 0): number {
  if (characters) return (characters / 1000) * TTS_PRICE_PER_1K_CHARS;
  const price = priceFor(modelName);
  if (!price) {
    warnUnpriced(modelName);
    return 0;
  }
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cost =
    (input * price.input + output * price.output + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export interface AiCallRecord {
  feature: string;
  provider?: AiProvider;
  modelName: string;
  status: AiCallStatus;
  startedAt: number;
  usage?: TokenUsage;
  characters?: number;
  errorCode?: string;
  // Overrides for calls made outside a request (cron jobs).
  institutionId?: string;
  userId?: string;
}

// Records an AI call. Never throws and never blocks the caller on the write.
export function recordAiCall(record: AiCallRecord): void {
  const context = getCallContext();
  const usage = record.usage ?? {};
  const doc = {
    feature: record.feature,
    provider: record.provider ?? 'anthropic',
    modelName: record.modelName,
    status: record.status,
    latencyMs: Math.max(0, Date.now() - record.startedAt),
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    characters: record.characters,
    costUsd: estimateCostUsd(record.modelName, usage, record.characters),
    costStatus: isPriced(record.modelName, record.characters) ? ('estimated' as const) : ('unpriced' as const),
    institutionId: record.institutionId ?? context.institutionId,
    userId: record.userId ?? context.userId,
    studentId: context.studentId,
    role: context.role,
    requestId: context.requestId,
    errorCode: record.errorCode,
  };
  logger.info('ai_call', { ...doc });
  AiCall.create(doc).catch((error) => logger.warn('ai_call_record_failed', { error: serializeError(error) }));
}

export function errorCodeOf(error: unknown): string {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === 'number') return `http_${status}`;
  return (error as { name?: string })?.name || 'error';
}

interface TrackableResponse {
  model?: string;
  usage?: TokenUsage;
  stop_reason?: string | null;
}

// Runs one non-streaming model call (one attempt, no retries), records it in
// ai_calls and meters it in usage_ledger via the gateway. Errors are recorded
// and rethrown. Kept for callers that predate the gateway, including the
// frozen hybridV1 client.
export async function trackAiCall<T extends TrackableResponse>(
  feature: string,
  modelName: string,
  call: () => Promise<T>,
  overrides: { institutionId?: string } = {},
): Promise<T> {
  const { meteredMessage } = await import('./aiGateway');
  return meteredMessage({ feature, modelName, institutionId: overrides.institutionId }, call);
}

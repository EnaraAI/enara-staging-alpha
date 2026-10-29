import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logging';
import { estimateCostUsd, isPriced } from './aiCalls';
import { meteredMessage, startOperation } from './aiGateway';
import { textTokenBound } from './priceCatalog';

// One way for Phase 3 features to ask the model for JSON: the reply is parsed
// and handed to a validator; an unreadable or invalid reply is retried once,
// then reported as AI_BAD_OUTPUT. Every call is tracked (feature, model,
// tokens, cost, latency) in ai_calls and metered in usage_ledger by aiGateway.
let client: Anthropic | undefined;

// Optional spending guard (offline benchmark only; never set in production).
// reserve() runs before every model call, including the validation retry, and
// throws to stop the call; settle() records the actual cost, or null when the
// provider reported none (the guard then keeps the full reservation).
export interface AiCallGuard {
  reserve(call: { model: string; maxTokens: number; promptBytes: number }): string;
  settle(ticket: string, costUsd: number | null): void;
}
let guard: AiCallGuard | null = null;
export function setAiCallGuard(next: AiCallGuard | null) {
  guard = next;
}

export function isAiConfigured() {
  return Boolean(getConfig().anthropicApiKey);
}

function parseJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

export async function askForJson<T>(params: {
  feature: string;
  system: string;
  user: string;
  maxTokens: number;
  institutionId?: string;
  refs?: { attemptId?: string; assessmentId?: string; sessionId?: string };
  validate: (value: unknown) => T;
  // Optional: a specific (priced) model instead of the tutor model, and fewer
  // validation attempts (default 2) for callers that must fail fast.
  model?: string;
  validationAttempts?: number;
}): Promise<{ value: T; model: string }> {
  const config = getConfig();
  if (!config.anthropicApiKey) throw new AppError('AI is not configured', 503, 'AI_UNAVAILABLE');
  // The SDK never retries on its own: the gateway retries once (each attempt
  // metered), except under a spending guard, where each HTTP request has to
  // pass through reserve() first.
  client ??= new Anthropic({ apiKey: config.anthropicApiKey, timeout: 55_000, maxRetries: 0 });
  const model = params.model ?? config.anthropicTutorModel;
  let lastError = '';
  // One operation: the validation retry and transport retries are separate,
  // numbered attempts under it.
  const op = startOperation();
  for (let attempt = 0; attempt < Math.min(2, Math.max(1, params.validationAttempts ?? 2)); attempt++) {
    const ticket = guard?.reserve({ model, maxTokens: params.maxTokens, promptBytes: Buffer.byteLength(params.system) + Buffer.byteLength(params.user) });
    let response;
    try {
      response = await meteredMessage(
        {
          feature: params.feature, modelName: model, institutionId: params.institutionId, refs: params.refs, maxAttempts: guard ? 1 : 2,
          bound: { inputTokens: textTokenBound(params.system, params.user), outputTokens: params.maxTokens },
        },
        () =>
          client!.messages.create({
            model,
            max_tokens: params.maxTokens,
            output_config: { effort: 'low' },
            system: params.system,
            messages: [{ role: 'user', content: params.user }],
          }),
        op,
      );
    } catch (error) {
      if (ticket !== undefined) guard?.settle(ticket, null);
      throw error;
    }
    if (ticket !== undefined) guard?.settle(ticket, response.usage && isPriced(response.model || model) ? estimateCostUsd(response.model || model, response.usage) : null);
    if (response.stop_reason === 'max_tokens') {
      lastError = 'reply was cut off';
      continue;
    }
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    try {
      return { value: params.validate(parseJson(text)), model: response.model || model };
    } catch (error) {
      lastError = (error as Error).message.slice(0, 300);
      logger.warn('ai_json_invalid', { feature: params.feature, attempt, error: lastError });
    }
  }
  throw new AppError(`The AI reply could not be used (${lastError}); try again`, 502, 'AI_BAD_OUTPUT');
}

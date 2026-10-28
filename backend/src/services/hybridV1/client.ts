import Anthropic from '@anthropic-ai/sdk';
import { trackAiCall } from '../aiCalls';
import type { V6Client } from './v6';

// The only place Hybrid V1 can reach a provider. Built only by the shadow
// script after the operator passes --execute and the config is enabled; tests
// inject fakes. Same request as the frozen adapter: no SDK retries (the frozen
// gateway made one attempt per call), 240 s timeout, no temperature/effort.
export function anthropicV6Client(apiKey: string, institutionId?: string): V6Client {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return {
    async create(body, opts) {
      try {
        const r = await trackAiCall('hybrid_v1_shadow', body.model, () => client.messages.create(body, { timeout: opts.timeoutMs }), { institutionId });
        return { text: r.content.map((b) => (b.type === 'text' ? b.text : '')).join(''), stopReason: r.stop_reason, usage: r.usage, model: r.model, requestId: r.id };
      } catch (e) {
        const status = (e as { status?: number }).status;
        const code = status === 429 ? 'MODEL_RATE_LIMITED' : status && status >= 500 ? 'MODEL_UNAVAILABLE' : status ? 'INVALID_REQUEST'
          : /timeout/i.test(String((e as Error).name) + String((e as Error).message)) ? 'MODEL_TIMEOUT' : 'MODEL_UNAVAILABLE';
        throw Object.assign(new Error(`provider call failed (${status ?? 'no status'})`), { code });
      }
    },
  };
}

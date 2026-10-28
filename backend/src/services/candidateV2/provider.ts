import type { GraderRequest } from './nativeGrader';

// Candidate V2 provider transport (design §1). The grader talks only to this
// interface. D1 implements the deterministic MockProvider; a live provider is a
// separate approval and must not write AiCall/telemetry records.
export type ProviderErrorCode = 'TIMEOUT' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'NETWORK' | 'BAD_REQUEST';
export const RETRYABLE: ReadonlySet<ProviderErrorCode> = new Set(['TIMEOUT', 'RATE_LIMITED', 'UNAVAILABLE', 'NETWORK']);

export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string = code) {
    super(message);
  }
}

export interface ProviderReply { text: string; usage?: { inputTokens: number; outputTokens: number }; model?: string }
export interface Provider {
  readonly name: string;
  complete(request: GraderRequest, opts: { timeoutMs: number }): Promise<ProviderReply>;
}

// Deterministic test provider: replies are taken in order; an Error entry is thrown; a
// 'hang' entry never resolves (timeout tests). Records every request it receives.
export type MockStep = string | ProviderError | Error | 'hang';
export class MockProvider implements Provider {
  readonly name = 'mock';
  readonly requests: GraderRequest[] = [];
  constructor(private steps: MockStep[]) {}
  async complete(request: GraderRequest, opts: { timeoutMs: number }): Promise<ProviderReply> {
    this.requests.push(structuredClone(request));
    const step = this.steps.length ? this.steps.shift()! : new ProviderError('UNAVAILABLE', 'mock exhausted');
    if (step === 'hang') {
      return new Promise((_, reject) => setTimeout(() => reject(new ProviderError('TIMEOUT')), opts.timeoutMs));
    }
    if (step instanceof Error) throw step;
    return { text: step, usage: { inputTokens: 1000, outputTokens: 200 }, model: 'mock' };
  }
}

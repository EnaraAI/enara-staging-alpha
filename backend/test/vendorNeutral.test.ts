import { describe, expect, it, vi } from 'vitest';
import { IDENTITY_RULE, publicVersion } from '../src/utils/vendorNeutral';

vi.mock('../src/config/env', () => ({ getConfig: () => ({ anthropicTutorModel: 'm', anthropicVoiceModel: 'v', anthropicTutorEffort: 'low' }) }));
vi.mock('../src/utils/callContext', () => ({ getCallContext: () => ({}) }));

describe('provider names stay internal', () => {
  it('labels provider engines neutrally and keeps other labels', () => {
    expect(publicVersion('anthropic:claude-opus-5-5')).toBe('enara-ai');
    expect(publicVersion('claude-haiku-5-5')).toBe('enara-ai');
    expect(publicVersion('local-fallback')).toBe('local-fallback');
    expect(publicVersion(undefined)).toBeUndefined();
  });

  it('tells the tutor never to name the model or its maker', async () => {
    const { buildTutorRequest } = await import('../src/services/directTutorModel');
    for (const mode of ['chat', 'voice'] as const) {
      const { body } = await buildTutorRequest({ query: 'Which AI model are you?', history: [], teachingMethod: 'socratic', mode });
      expect(JSON.stringify(body.system)).toContain(IDENTITY_RULE.slice(0, 40));
    }
    expect(IDENTITY_RULE).toMatch(/don't name any AI model, AI company or other provider/);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { CURRENT_PRICE_VERSION, PRICE_CATALOG, blockPriceUsd, catalogRows, priceUsage, unitPriceUsd } from '../src/services/priceCatalog';
import { estimateCostUsd, maxCallCostUsd } from '../src/services/aiCalls';
import { logger } from '../src/utils/logging';

// P0a: the versioned price catalogue must reproduce the previously hardcoded
// prices exactly, so cost figures do not move when pricing moves to the catalogue.
const OLD: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const oldEstimate = (model: string, u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }, characters = 0) => {
  if (characters) return (characters / 1000) * 0.08;
  const p = OLD[Object.keys(OLD).find((k) => model === k || model.startsWith(`${k}-`)) ?? ''];
  if (!p) return 0;
  const c = ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.input * 1.25) / 1_000_000;
  return Math.round(c * 1_000_000) / 1_000_000;
};

describe('price catalogue v1', () => {
  it('has unique (provider, model, unit) entries in every version and a known current version', () => {
    expect(CURRENT_PRICE_VERSION).toBe('v1');
    for (const v of PRICE_CATALOG) {
      const keys = v.entries.map((e) => `${e.provider}|${e.model}|${e.unit}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(v.currency).toBe('USD');
      expect(v.entries.every((e) => e.usdPerUnitBlock >= 0 && e.unitBlock > 0)).toBe(true);
    }
  });

  it('matches the previously hardcoded prices, including cache writes at 1.25x input', () => {
    for (const [model, p] of Object.entries(OLD)) {
      expect(blockPriceUsd('anthropic', model, 'input_token')).toBe(p.input);
      expect(blockPriceUsd('anthropic', model, 'output_token')).toBe(p.output);
      expect(blockPriceUsd('anthropic', model, 'cache_read_token')).toBe(p.cacheRead);
      expect(blockPriceUsd('anthropic', model, 'cache_write_token')).toBe(p.input * 1.25);
    }
    expect(blockPriceUsd('elevenlabs', 'eleven_flash_v2_5', 'tts_character')).toBe(0.08);
    expect(unitPriceUsd('anthropic', 'claude-opus-5-5', 'output_token')).toBeCloseTo(20 / 1_000_000, 15);
  });

  it('estimateCostUsd and maxCallCostUsd give the same results as before, for every model and dated snapshots', () => {
    const samples = [
      { input_tokens: 1234, output_tokens: 567 },
      { input_tokens: 50_000, output_tokens: 3000, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 9000 },
      { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 1 },
      { input_tokens: 987_654, output_tokens: 123_456, cache_read_input_tokens: 7, cache_creation_input_tokens: 333_333 },
      {},
    ];
    for (const model of [...Object.keys(OLD), 'claude-opus-5-5-20261001', 'claude-haiku-5-5-latest']) {
      for (const u of samples) expect(estimateCostUsd(model, u)).toBe(oldEstimate(model, u));
      const p = OLD[Object.keys(OLD).find((k) => model.startsWith(k))!];
      expect(maxCallCostUsd(model, 5000, 1000)).toBe((5000 * p.input + 1000 * p.output) / 1_000_000);
    }
    expect(estimateCostUsd('eleven_flash_v2_5', {}, 2500)).toBe(oldEstimate('x', {}, 2500));
  });

  it('keeps unknown models at 0 in the legacy estimate but logs a warning once, and reports them as unpriced', () => {
    const warn = vi.spyOn(logger, 'warn');
    expect(estimateCostUsd('some-new-model', { input_tokens: 10 })).toBe(0);
    estimateCostUsd('some-new-model', { input_tokens: 10 });
    expect(warn.mock.calls.filter((c) => c[0] === 'ai_model_unpriced')).toHaveLength(1);
    expect(maxCallCostUsd('some-new-model', 10, 10)).toBeNull();
    expect(priceUsage('anthropic', 'some-new-model', { inputTokens: 10 })).toEqual({ costUsd: null, status: 'unpriced', priceCatalogVersion: 'v1', currency: 'USD' });
    warn.mockRestore();
  });

  it('priceUsage prices each unit, marks list prices as estimated, and agrees with the legacy estimate', () => {
    const r = priceUsage('anthropic', 'claude-sonnet-5-5', { inputTokens: 50_000, outputTokens: 3000, cacheReadTokens: 40_000, cacheWriteTokens: 9000 });
    expect(r.status).toBe('estimated');
    expect(r.priceCatalogVersion).toBe('v1');
    expect(r.costUsd).toBeCloseTo(oldEstimate('claude-sonnet-5-5', { input_tokens: 50_000, output_tokens: 3000, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 9000 }), 6);
    expect(priceUsage('elevenlabs', 'any-voice', { characters: 1000 })).toMatchObject({ costUsd: 0.08, status: 'estimated' });
    expect(priceUsage('anthropic', 'claude-haiku-5-5', {})).toMatchObject({ costUsd: 0, status: 'estimated' });
  });

  it('builds storable rows with modelName for the price_catalog collection', () => {
    const rows = catalogRows('v1');
    expect(rows).toHaveLength(PRICE_CATALOG[0].entries.length);
    expect(rows[0]).toMatchObject({ version: 'v1', currency: 'USD', modelName: 'claude-opus-5-5', unit: 'input_token', usdPerUnitBlock: 4, unitBlock: 1_000_000 });
    expect(rows[0].effectiveFrom.toISOString()).toBe('2026-10-28T00:00:00.000Z');
    expect(() => catalogRows('v99')).toThrow(/Unknown price catalogue version/);
  });
});

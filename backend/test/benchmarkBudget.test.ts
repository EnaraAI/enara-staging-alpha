import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawn } from 'child_process';

// Mocked provider: no live AI calls. Each test queues the replies it wants.
const replies: any[] = [];
const create = vi.fn(async () => {
  const r = replies.shift();
  if (r instanceof Error) throw r;
  return r;
});
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));
vi.mock('../src/config/env', () => ({ getConfig: () => ({ anthropicApiKey: 'test-key', anthropicTutorModel: 'claude-opus-5-5' }) }));
vi.mock('../src/models/AiCall', () => ({ AiCall: { create: vi.fn(async () => ({})) } }));

import { askForJson, setAiCallGuard } from '../src/services/aiJson';
import { maxCallCostUsd } from '../src/services/aiCalls';
import { BudgetExhaustedError, BudgetLedger, createLedger } from '../src/scripts/benchmarkBudget';

const ok = (inTok = 1000, outTok = 200) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: inTok, output_tokens: outTok }, content: [{ type: 'text', text: '{"a":1}' }] });
const invalid = () => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: 'text', text: 'not json' }] });
// prompt of 1,000 bytes and 1,000 max tokens: worst case (1,064 x $4 + 1,000 x $20) / 1e6
const SYSTEM = 'x'.repeat(500);
const USER = 'y'.repeat(500);
const WORST = maxCallCostUsd('claude-opus-5-5', 1064, 1000)!;
const ACTUAL = (1000 * 4 + 200 * 20) / 1e6;
const ask = () => askForJson({ feature: 't', system: SYSTEM, user: USER, maxTokens: 1000, validate: (v) => v });

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'budget-'));
  path = join(dir, 'ledger.json');
  replies.length = 0;
  create.mockClear();
});
afterEach(() => {
  setAiCallGuard(null);
  rmSync(dir, { recursive: true, force: true });
});
const read = () => JSON.parse(readFileSync(path, 'utf8'));

describe('benchmark budget guard', () => {
  it('records the authorization and never overwrites or silently raises a cap', () => {
    createLedger(path, { name: 'batch', capUsd: 1, authorizedBy: 'owner, 2026-10-25' });
    expect(read()).toMatchObject({ cap_usd: 1, authorized_by: 'owner, 2026-10-25', spent_usd: 0 });
    expect(() => createLedger(path, { name: 'batch', capUsd: 100, authorizedBy: 'x' })).toThrow();
    expect(read().cap_usd).toBe(1);
    expect(() => createLedger(join(dir, 'b.json'), { name: 'b', capUsd: 1, authorizedBy: ' ' })).toThrow(/authorization/);
  });

  it('runs up to the cap, then stops before any call that could exceed it', async () => {
    createLedger(path, { name: 'batch', capUsd: WORST * 2.5, authorizedBy: 'test' });
    setAiCallGuard(new BudgetLedger(path));
    replies.push(ok(), ok(), ok(), ok());
    await ask();
    await ask(); // spent 2 x ACTUAL, far below 2 x WORST
    expect(read().spent_usd).toBeCloseTo(2 * ACTUAL, 6);
    // Keep calling until the guard refuses; total spend never passes the cap.
    let refused: unknown;
    for (let i = 0; i < 20 && !refused; i++) {
      replies.push(ok());
      await ask().catch((e) => (refused = e));
    }
    expect(refused).toBeInstanceOf(BudgetExhaustedError);
    expect((refused as Error).message).toMatch(/budget "batch" exhausted/);
    const l = read();
    expect(l.spent_usd + WORST).toBeGreaterThan(l.cap_usd);
    expect(l.spent_usd).toBeLessThanOrEqual(l.cap_usd);
    expect(l.stop_reason).toMatch(/exhausted/);
  });

  it('a validation retry that does not fit the remaining budget is never sent', async () => {
    createLedger(path, { name: 'batch', capUsd: WORST * 1.5, authorizedBy: 'test' }); // room for one worst case only
    setAiCallGuard(new BudgetLedger(path));
    // ACTUAL is small, so after the first call the remaining budget still can't hold WORST only if spent > 0.5 WORST:
    replies.push({ ...invalid(), usage: { input_tokens: 1064, output_tokens: 1000 } }); // first reply costs the full worst case
    await expect(ask()).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(create).toHaveBeenCalledTimes(1); // the retry was refused before the provider was called
    expect(read().spent_usd).toBeCloseTo(WORST, 6);
  });

  it('missing or failed cost data keeps the whole reservation', async () => {
    createLedger(path, { name: 'batch', capUsd: 10, authorizedBy: 'test' });
    setAiCallGuard(new BudgetLedger(path));
    replies.push({ ...ok(), usage: undefined });
    await ask();
    expect(read().spent_usd).toBeCloseTo(WORST, 6);
    replies.push(new Error('timeout'));
    await expect(ask()).rejects.toThrow('timeout');
    const l = read();
    expect(l.spent_usd).toBeCloseTo(2 * WORST, 6);
    expect(l.calls_without_cost).toBe(2);
    expect(Object.keys(l.reservations)).toHaveLength(0);
  });

  it('several runs share one cumulative budget', async () => {
    createLedger(path, { name: 'batch', capUsd: WORST * 3.2, authorizedBy: 'test' });
    const runA = new BudgetLedger(path, 'A');
    const runB = new BudgetLedger(path, 'B');
    const t1 = runA.reserve({ model: 'claude-opus-5-5', maxTokens: 1000, promptBytes: 1000 });
    const t2 = runB.reserve({ model: 'claude-opus-5-5', maxTokens: 1000, promptBytes: 1000 });
    const t3 = runA.reserve({ model: 'claude-opus-5-5', maxTokens: 1000, promptBytes: 1000 });
    expect(() => runB.reserve({ model: 'claude-opus-5-5', maxTokens: 1000, promptBytes: 1000 })).toThrow(BudgetExhaustedError);
    expect(runB.exhausted).toBe(true);
    runA.settle(t1, ACTUAL);
    runB.settle(t2, ACTUAL);
    runA.settle(t3, ACTUAL);
    expect(read().spent_usd).toBeCloseTo(3 * ACTUAL, 6);
    expect(read().calls).toBe(3);
  });

  it('concurrent reservations never commit more than the cap', async () => {
    createLedger(path, { name: 'batch', capUsd: WORST * 5.5, authorizedBy: 'test' });
    const runs = [new BudgetLedger(path, 'A'), new BudgetLedger(path, 'B'), new BudgetLedger(path, 'C')];
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        Promise.resolve().then(() => {
          try {
            return runs[i % 3].reserve({ model: 'claude-opus-5-5', maxTokens: 1000, promptBytes: 1000 });
          } catch {
            return null;
          }
        }),
      ),
    );
    expect(attempts.filter(Boolean)).toHaveLength(5);
    const l = read();
    expect(BudgetLedger.committed(l)).toBeLessThanOrEqual(l.cap_usd);
  });

  it('separate processes sharing one ledger cannot together exceed the cap', async () => {
    createLedger(path, { name: 'batch', capUsd: WORST * 7.5, authorizedBy: 'test' });
    const mod = resolve(__dirname, '../src/scripts/benchmarkBudget.ts');
    const code = `const { BudgetLedger } = require(${JSON.stringify(mod)}); const l = new BudgetLedger(${JSON.stringify(path)}, process.argv[1]); let n = 0;
      for (let i = 0; i < 6; i++) { try { const t = l.reserve({ model: 'claude-opus-5-5', maxTokens: 1000, promptBytes: 1000 }); n++; l.settle(t, null); } catch {} }
      console.log(n);`;
    const tsx = resolve(__dirname, '../node_modules/.bin/tsx');
    const counts = await Promise.all(['A', 'B', 'C'].map((name) => new Promise<number>((done, fail) => {
      const p = spawn(tsx, ['-e', code, name]);
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('close', (c) => (c === 0 ? done(Number(out.trim())) : fail(new Error(`child ${name} exited ${c}`))));
    })));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(7); // 18 attempts, room for exactly 7 worst cases
    const l = read();
    expect(l.spent_usd).toBeLessThanOrEqual(l.cap_usd);
    expect(l.calls).toBe(7);
  }, 30_000);

  it('after exhaustion no further paid calls are made, and unknown prices are refused', async () => {
    createLedger(path, { name: 'batch', capUsd: WORST * 0.5, authorizedBy: 'test' });
    setAiCallGuard(new BudgetLedger(path));
    replies.push(ok(), ok(), ok());
    for (let i = 0; i < 3; i++) await expect(ask()).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(create).not.toHaveBeenCalled();
    expect(read()).toMatchObject({ spent_usd: 0, calls: 0, refused: 3 });
    const g = new BudgetLedger(path);
    expect(() => g.reserve({ model: 'unknown-model', maxTokens: 10, promptBytes: 10 })).toThrow(/no price known/);
  });
});

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
// Append-only provider-attempt ledger. Every provider call attempt (including failed/retried) is one JSONL line.
// Unknown usage or unpriced models are recorded as null and counted as "unknown", never invented.
export interface Attempt {
  ts: string; seq: number; runId: string; campaign: string; studentId: string | null; blockId: string | null; role: string; // tutor|student|generic_tutor|judge|other
  provider: string; model: string; httpStatus: number | null; ok: boolean; retryOf: number | null;
  inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null; cacheWriteTokens: number | null; costUsd: number | null; priced: boolean; error: string | null;
}
export class BudgetExceeded extends Error {}
export class Ledger {
  private seq = 0; private total = 0; readonly costByBlock = new Map<string, { usd: number; unknown: boolean }>(); private unknown = 0; readonly file: string;
  constructor(dir: string, readonly runId: string, readonly capUsd: number) { mkdirSync(dir, { recursive: true }); this.file = path.join(dir, 'provider_attempts.jsonl'); if (existsSync(this.file)) for (const a of Ledger.read(this.file)) { this.seq = Math.max(this.seq, a.seq); this.total += a.costUsd ?? 0; if (a.costUsd === null) this.unknown += 1; } }
  static read(file: string): Attempt[] { return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
  get spentUsd(): number { return this.total; }
  get unknownCostAttempts(): number { return this.unknown; }
  /** Safe stop: throws BudgetExceeded before a new call when the cap is already reached. */
  assertBudget(): void { if (this.total >= this.capUsd) throw new BudgetExceeded(`budget cap $${this.capUsd} reached (spent $${this.total.toFixed(4)})`); }
  record(a: Omit<Attempt, 'ts' | 'seq' | 'runId'>): Attempt {
    const full: Attempt = { ts: new Date().toISOString(), seq: ++this.seq, runId: this.runId, ...a };
    appendFileSync(this.file, JSON.stringify(full) + '\n'); this.total += full.costUsd ?? 0; if (full.costUsd === null) this.unknown += 1; if (full.blockId) { const e = this.costByBlock.get(full.blockId) ?? { usd: 0, unknown: false }; e.usd += full.costUsd ?? 0; e.unknown = e.unknown || full.costUsd === null; this.costByBlock.set(full.blockId, e); } return full;
  }
}
export function summarizeLedger(attempts: Attempt[]) {
  const sum = (f: (a: Attempt) => boolean) => attempts.filter(f).reduce((s, a) => s + (a.costUsd ?? 0), 0);
  const by = (k: (a: Attempt) => string) => { const m: Record<string, { attempts: number; failed: number; costUsd: number; inputTokens: number; outputTokens: number }> = {}; for (const a of attempts) { const r = (m[k(a)] ??= { attempts: 0, failed: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 }); r.attempts += 1; if (!a.ok) r.failed += 1; r.costUsd += a.costUsd ?? 0; r.inputTokens += a.inputTokens ?? 0; r.outputTokens += a.outputTokens ?? 0; } return m; };
  return { attempts: attempts.length, failedAttempts: attempts.filter((a) => !a.ok).length, retryCostUsd: sum((a) => a.retryOf !== null), failedCostUsd: sum((a) => !a.ok), unknownCostAttempts: attempts.filter((a) => a.costUsd === null).length, totalUsd: sum(() => true), byRole: by((a) => a.role), byModel: by((a) => a.model), byCampaign: by((a) => a.campaign), byStudent: by((a) => a.studentId ?? 'none'), byBlock: by((a) => a.blockId ?? 'none') };
}

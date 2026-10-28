// Cumulative spending budget for offline benchmark runs (never used in
// production). One JSON ledger file is shared by every run in an approved
// batch; each AI call reserves its worst-case cost before it starts and
// settles the actual cost when it ends. Reads and writes happen under an
// exclusive lock file, so concurrent workers and concurrent runs (separate
// processes) cannot both spend the same remaining budget.
import { closeSync, existsSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { maxCallCostUsd } from '../services/aiCalls';
import type { AiCallGuard } from '../services/aiJson';

export interface BudgetLedgerFile {
  version: 1;
  name: string;
  cap_usd: number;
  authorized_by: string;
  created_at: string;
  spent_usd: number;
  reservations: Record<string, { amount: number; at: string; run?: string }>;
  calls: number;
  calls_without_cost: number;
  refused: number;
  stop_reason: string | null;
}

export class BudgetExhaustedError extends Error {
  code = 'BUDGET_EXHAUSTED';
}

// Token upper bound: a byte-level tokenizer never makes more tokens than bytes;
// the overhead covers message framing.
const FRAMING_TOKENS = 64;
const LOCK_STALE_MS = 30_000;

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function createLedger(path: string, init: { name: string; capUsd: number; authorizedBy: string }) {
  if (!(init.capUsd > 0)) throw new Error('budget cap must be positive');
  if (!init.authorizedBy.trim()) throw new Error('budget needs a recorded authorization');
  const ledger: BudgetLedgerFile = {
    version: 1, name: init.name, cap_usd: init.capUsd, authorized_by: init.authorizedBy, created_at: new Date().toISOString(),
    spent_usd: 0, reservations: {}, calls: 0, calls_without_cost: 0, refused: 0, stop_reason: null,
  };
  writeFileSync(path, JSON.stringify(ledger, null, 2), { flag: 'wx' }); // never overwrites an existing ledger
}

export class BudgetLedger implements AiCallGuard {
  exhausted = false;
  constructor(private path: string, private run = '') {
    if (!existsSync(path)) throw new Error(`budget ledger ${path} does not exist`);
  }

  private withLock<T>(fn: (l: BudgetLedgerFile) => T): T {
    const lock = `${this.path}.lock`;
    const deadline = Date.now() + 10_000;
    let fd: number | undefined;
    while (fd === undefined) {
      try {
        fd = openSync(lock, 'wx');
      } catch {
        try {
          if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) unlinkSync(lock); // holder died
        } catch {
          /* lock released meanwhile */
        }
        if (Date.now() > deadline) throw new Error('budget ledger is locked');
        sleep(5);
      }
    }
    try {
      const ledger = JSON.parse(readFileSync(this.path, 'utf8')) as BudgetLedgerFile;
      const save = () => {
        const tmp = `${this.path}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify(ledger, null, 2));
        renameSync(tmp, this.path);
      };
      try {
        const out = fn(ledger);
        save();
        return out;
      } catch (error) {
        if (error instanceof BudgetExhaustedError) save(); // keep the refusal and stop reason on record
        throw error;
      }
    } finally {
      closeSync(fd);
      unlinkSync(lock);
    }
  }

  snapshot(): BudgetLedgerFile {
    return JSON.parse(readFileSync(this.path, 'utf8'));
  }

  static committed(l: BudgetLedgerFile) {
    return l.spent_usd + Object.values(l.reservations).reduce((n, r) => n + r.amount, 0);
  }

  reserve(call: { model: string; maxTokens: number; promptBytes: number }): string {
    const amount = maxCallCostUsd(call.model, call.promptBytes + FRAMING_TOKENS, call.maxTokens);
    return this.withLock((l) => {
      const refuse = (reason: string) => {
        l.refused += 1;
        l.stop_reason = reason;
        this.exhausted = true;
        throw new BudgetExhaustedError(reason);
      };
      if (amount === null) refuse(`no price known for model ${call.model}; cannot bound the cost of the call`);
      const remaining = l.cap_usd - BudgetLedger.committed(l);
      if (amount! > remaining + 1e-9) {
        refuse(`budget "${l.name}" exhausted: next call needs up to $${amount!.toFixed(4)}, $${Math.max(0, remaining).toFixed(4)} of $${l.cap_usd} remains uncommitted`);
      }
      const ticket = randomUUID();
      l.reservations[ticket] = { amount: amount!, at: new Date().toISOString(), run: this.run || undefined };
      return ticket;
    });
  }

  settle(ticket: string, costUsd: number | null) {
    this.withLock((l) => {
      const r = l.reservations[ticket];
      if (!r) return;
      delete l.reservations[ticket];
      // No cost reported (error, timeout, missing usage): keep the whole reservation.
      const charged = costUsd === null || !Number.isFinite(costUsd) ? r.amount : costUsd;
      if (costUsd === null) l.calls_without_cost += 1;
      l.spent_usd = Math.round((l.spent_usd + charged) * 1e6) / 1e6;
      l.calls += 1;
    });
  }
}

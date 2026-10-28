import { CandidateV2Budget, type PriceBound } from './budget';
import { PRICES } from './pricing';

// Budget that books measured usage after each call: the upper bound is still reserved before
// the call (same stop rules), then replaced by the actual cost computed from verified prices.
// reservedUsd = actual cost of settled calls + bounds of calls in flight, so the USD cap
// limits real spend instead of the sum of worst cases.
export type CallShape = { model: string; inputChars: number; maxOutputTokens: number };
export class SettledBudget extends CandidateV2Budget {
  actualUsd = 0;
  settledCalls = 0;
  constructor(caps: { maxCalls: number; maxUsd: number }, private bound: PriceBound) {
    super(caps, bound);
  }
  settle(call: CallShape, usage: { inputTokens: number; outputTokens: number } | undefined) {
    const p = PRICES[call.model];
    const b = this.bound(call);
    if (!p || b === null || !usage) return; // unknown usage: the full bound stays booked
    const actual = (usage.inputTokens * p.inputPerMTok + usage.outputTokens * p.outputPerMTok) / 1_000_000;
    this.reservedUsd += actual - b;
    this.actualUsd += actual;
    this.settledCalls += 1;
  }
}

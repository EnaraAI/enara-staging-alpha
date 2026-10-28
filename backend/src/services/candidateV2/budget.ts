// Candidate V2 budget guard (design §1): a hard cap on calls and reserved USD,
// checked before every provider call. The price function is injected (tests use a
// fixed price; a live run would pass aiCalls.maxCallCostUsd) so this module has no
// production imports.
export class BudgetExceeded extends Error {
  readonly code = 'BUDGET_EXCEEDED';
}

export type PriceBound = (call: { model: string; inputChars: number; maxOutputTokens: number }) => number | null;

export class CandidateV2Budget {
  calls = 0;
  reservedUsd = 0;
  constructor(private caps: { maxCalls: number; maxUsd: number }, private price: PriceBound) {}

  reserve(call: { model: string; inputChars: number; maxOutputTokens: number }) {
    const bound = this.price(call);
    if (bound === null || !Number.isFinite(bound) || bound < 0) throw new BudgetExceeded(`no price bound for ${call.model}`);
    if (this.calls + 1 > this.caps.maxCalls || this.reservedUsd + bound > this.caps.maxUsd + 1e-9) throw new BudgetExceeded('candidate V2 budget cap reached');
    this.calls += 1;
    this.reservedUsd += bound;
  }
}

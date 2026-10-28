// Candidate V2 deterministic pricing for budget reservations (D5). Local records only;
// no network, no telemetry. A model without a VERIFIED entry has no price unless the
// operator explicitly allows UNVERIFIED prices, so the budget guard stops before the call.
export interface PriceEntry { inputPerMTok: number; outputPerMTok: number; status: 'VERIFIED' | 'UNVERIFIED'; source: string }

export const PRICES: Readonly<Record<string, PriceEntry>> = Object.freeze({
  'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10, status: 'VERIFIED',
    source: 'scripts/benchmarks/diagnostics/rubric_engine/v3/provider_anthropic.py SONNET_5_5: platform.claude.com pricing page, retrieved 2026-10-26' },
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20, status: 'UNVERIFIED',
    source: "backend/src/services/aiCalls.ts TOKEN_PRICES ('Estimated list prices'); no retrieval record" },
});

// Conservative upper bound: one token per input character (Arabic tokenises to fewer tokens than
// characters), plus the full output allowance. Returns null when no usable price exists.
export function priceBound(call: { model: string; inputChars: number; maxOutputTokens: number }, allowUnverified = false): number | null {
  const p = PRICES[call.model];
  if (!p || (p.status !== 'VERIFIED' && !allowUnverified)) return null;
  if (!(call.inputChars >= 0) || !(call.maxOutputTokens >= 0)) return null;
  return (call.inputChars * p.inputPerMTok + call.maxOutputTokens * p.outputPerMTok) / 1_000_000;
}

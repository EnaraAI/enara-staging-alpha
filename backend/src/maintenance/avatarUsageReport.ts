// Read-only numbers for the avatar cost and latency test on lms-test (owner go 21 Nov 2026, VOICE_KIDS_PICTURES_PLAN, task 1).
// For each listed avatar call: speech mode, start/end, measured server latencies, Anam seconds from the usage ledger, and the LLM calls
// of that user during the call. IDs and numbers only: no message text, no names, no emails, no tokens.
import { AiCall } from '../models/AiCall';
import { AvatarSession } from '../models/AvatarSession';
import { UsageLedger } from '../models/UsageLedger';

export const MAX_IDS = 30;
const ID = /^av-[0-9a-f-]{36}$/;

export function parseAvatarIds(raw: unknown): string[] | null {
  const ids = String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length || ids.length > MAX_IDS || !ids.every((i) => ID.test(i))) return null;
  return [...new Set(ids)];
}

export async function avatarUsageReport(ids: string[]) {
  const out = [];
  for (const id of ids) {
    const s = await AvatarSession.findOne({ id }).select('id userId speech createdAt endedAt usageEndAt usageEndBasis latencyMs providerSessionIds').lean() as
      | { id: string; userId?: string; speech?: string; createdAt?: Date; endedAt?: Date; usageEndAt?: Date; usageEndBasis?: string; latencyMs?: number[]; providerSessionIds?: string[] } | null;
    if (!s) { out.push({ id, found: false }); continue; }
    const ledger = await UsageLedger.find({ operationKey: `avatar:${id}` }).select('provider modelName units costUsd costStatus unitsBasis').lean() as Array<Record<string, unknown>>;
    const end = s.usageEndAt ?? s.endedAt ?? new Date();
    const calls = s.userId && s.createdAt
      ? await AiCall.find({ userId: s.userId, createdAt: { $gte: s.createdAt, $lte: new Date(end.getTime() + 60_000) } })
        .select('feature modelName inputTokens outputTokens cacheReadTokens cacheWriteTokens costUsd costStatus').lean() as Array<Record<string, any>>
      : [];
    const llm: Record<string, { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number; unpriced: number }> = {};
    for (const c of calls) {
      const k = `${c.feature}|${c.modelName}`;
      const r = (llm[k] ??= { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, unpriced: 0 });
      r.calls += 1; r.inputTokens += c.inputTokens ?? 0; r.outputTokens += c.outputTokens ?? 0;
      r.cacheReadTokens += c.cacheReadTokens ?? 0; r.cacheWriteTokens += c.cacheWriteTokens ?? 0; r.costUsd += c.costUsd ?? 0;
      if (c.costStatus === 'unpriced') r.unpriced += 1;
    }
    out.push({
      id, found: true, speech: s.speech ?? null, createdAt: s.createdAt ?? null, endedAt: s.endedAt ?? null, usageEndBasis: s.usageEndBasis ?? null,
      latencyMs: s.latencyMs ?? [], providerSessions: s.providerSessionIds?.length ?? 0,
      ledger: ledger.map((l) => ({ provider: l.provider, modelName: l.modelName, units: l.units, costUsd: l.costUsd, costStatus: l.costStatus, unitsBasis: l.unitsBasis ?? null })),
      llm,
    });
  }
  return out;
}

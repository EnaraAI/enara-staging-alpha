// Hybrid V1 switches. Everything is off unless explicitly enabled; eval-v2
// stays the only official grader in every mode (V1 implements shadow only).
//
//   ENARA_HYBRID_V1_ENABLED=false            kill switch (default false)
//   ENARA_HYBRID_V1_MODE=shadow              only 'shadow' is implemented
//   ENARA_HYBRID_V1_SHADOW_INSTITUTIONS=a,b  schools allowed to run shadow grading (required)
//   ENARA_HYBRID_V1_MAX_CALLS=<n>            hard cap on V6 model calls per run (required)
//   ENARA_HYBRID_V1_MAX_USD=<usd>            hard cap on reserved V6 cost per run (required)
export interface HybridV1Config {
  enabled: boolean;
  mode: 'shadow';
  institutions: Set<string>;
  maxCalls: number;
  maxUsd: number;
}

export type ConfigResult = { ok: true; config: HybridV1Config } | { ok: false; reason: string };

export function readHybridV1Config(env: Record<string, string | undefined> = process.env): ConfigResult {
  if ((env.ENARA_HYBRID_V1_ENABLED ?? 'false').trim().toLowerCase() !== 'true') return { ok: false, reason: 'disabled' };
  const mode = (env.ENARA_HYBRID_V1_MODE ?? '').trim();
  if (mode !== 'shadow') return { ok: false, reason: `unsupported mode '${mode || '(unset)'}': only shadow is implemented` };
  const institutions = new Set((env.ENARA_HYBRID_V1_SHADOW_INSTITUTIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  if (!institutions.size) return { ok: false, reason: 'no shadow institutions allowlisted' };
  const maxCalls = Number(env.ENARA_HYBRID_V1_MAX_CALLS);
  const maxUsd = Number(env.ENARA_HYBRID_V1_MAX_USD);
  if (!Number.isInteger(maxCalls) || maxCalls <= 0) return { ok: false, reason: 'ENARA_HYBRID_V1_MAX_CALLS must be a positive integer' };
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) return { ok: false, reason: 'ENARA_HYBRID_V1_MAX_USD must be a positive number' };
  return { ok: true, config: { enabled: true, mode: 'shadow', institutions, maxCalls, maxUsd } };
}

// Hybrid V1 shadow grading (ENARA-HYBRID-experimental@v1). Dry run by default:
// reports eligibility only, makes no model call and writes nothing.
//
//   npx tsx src/scripts/hybridShadow.ts --attempts ids.txt              (dry run)
//   ENARA_HYBRID_V1_ENABLED=true ENARA_HYBRID_V1_MODE=shadow \
//   ENARA_HYBRID_V1_SHADOW_INSTITUTIONS=<id> ENARA_HYBRID_V1_MAX_CALLS=<n> ENARA_HYBRID_V1_MAX_USD=<usd> \
//   npx tsx src/scripts/hybridShadow.ts --attempts ids.txt --execute     (owner-authorized only)
//
// Official grades are never changed: results go to HybridShadowResult only.
import { readFileSync } from 'fs';
import mongoose from 'mongoose';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const file = arg('attempts');
  if (!file) throw new Error('--attempts <file with one attempt id per line> is required');
  const ids = readFileSync(file, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const execute = process.argv.includes('--execute');
  const { getConfig } = await import('../config/env');
  const { readHybridV1Config } = await import('../services/hybridV1/config');
  const { verifyFrozenSpec } = await import('../services/hybridV1/v6');
  console.log(JSON.stringify({ frozenConfigSha256: verifyFrozenSpec(), attempts: ids.length, execute }));
  const cfg = readHybridV1Config();
  await mongoose.connect(getConfig().mongoUri);
  try {
    if (!execute || !cfg.ok) {
      const { AssessmentAttempt } = await import('../models/AssessmentAttempt');
      const { getVersion } = await import('../services/assessmentVersions');
      const { eligibility } = await import('../services/hybridV1/hybrid');
      const counts: Record<string, number> = {};
      for (const id of ids) {
        const t = await AssessmentAttempt.findOne({ id }).lean();
        if (!t?.assessmentVersion) {
          counts.attempt_or_version_missing = (counts.attempt_or_version_missing ?? 0) + 1;
          continue;
        }
        const v = await getVersion(t.assessmentId, t.assessmentVersion);
        for (const a of t.answers) {
          const e = eligibility((v.questions as any[]).find((q) => q.id === a.questionId), String(a.studentAnswer ?? ''));
          const k = e.eligible ? 'eligible' : e.reason;
          counts[k] = (counts[k] ?? 0) + 1;
        }
      }
      console.log(JSON.stringify({ mode: 'dry_run', config: cfg.ok ? 'enabled' : cfg.reason, eligibility: counts }));
      return;
    }
    const key = getConfig().anthropicApiKey;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    const { anthropicV6Client } = await import('../services/hybridV1/client');
    const { ShadowBudget, shadowGradeAttempt } = await import('../services/hybridV1/shadow');
    const budget = new ShadowBudget(cfg.config);
    const client = anthropicV6Client(key);
    for (const id of ids) {
      const out = await shadowGradeAttempt(id, { client, budget, config: cfg.config });
      console.log(JSON.stringify(out));
      if (out.skipped === 'budget_exceeded') break;
    }
    console.log(JSON.stringify({ calls: budget.calls, reservedUsd: budget.reservedUsd, estimatedUsd: budget.estimatedUsd }));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

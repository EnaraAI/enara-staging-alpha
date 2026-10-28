import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

// Writes the post-P0c source provenance manifest: current hashes of the
// production sources the V1 freeze manifest recorded (several changed in
// P0a-P0c), the still-frozen hybridV1 / candidateV2Live artifacts, and the
// P0 metering sources. The V1 manifest itself is never rewritten: it stays the
// historical baseline. Offline; no network.
//   npx tsx src/scripts/sourceProvenance.ts                         (post-P0c, OUT_PATH)
//   npx tsx src/scripts/sourceProvenance.ts --phase P0d --out <path>  (a later snapshot)
// Each snapshot is its own file; earlier snapshots are never overwritten.

export const REPO = path.resolve(__dirname, '../../..');
export const BASELINE_PATH = 'docs/benchmarks/diagnostics/20261028T090000Z-hybrid-v1-production-readiness/V1_FREEZE_MANIFEST.json';
export const OUT_PATH = 'docs/benchmarks/diagnostics/20261029T090000Z-p0c-source-provenance/SOURCE_PROVENANCE_POST_P0C.json';

// candidateV2Live hashes as last recorded (promptProvider in the R1 manifest;
// liveProvider has no earlier recorded hash).
const CANDIDATE_V2_LIVE_RECORDED: Record<string, string | null> = {
  'backend/src/services/candidateV2Live/promptProvider.ts': '88d63ab00747643ffb6b8b3104cac97ca19deb1fcf4eecd52568eaf885bc3148',
  'backend/src/services/candidateV2Live/liveProvider.ts': null,
};

export const P0_METERING_SOURCES = [
  'backend/src/services/priceCatalog.ts',
  'backend/src/services/priceCatalogDrift.ts',
  'backend/src/models/PriceCatalog.ts',
  'backend/src/models/UsageLedger.ts',
  'backend/src/services/usageLedger.ts',
  'backend/src/services/aiGateway.ts',
  'backend/src/services/avatarUsage.ts',
  'backend/src/models/AvatarSession.ts',
  'backend/src/migrations/index.ts',
  // P0d
  'backend/src/models/OrgBudget.ts',
  'backend/src/services/aiBudget.ts',
  'backend/src/services/aiRateLimit.ts',
  'backend/src/middleware/aiRateLimits.ts',
  'backend/src/routes/aiControls.routes.ts',
  // P1
  'backend/src/auth/permissions.ts',
  'backend/src/auth/roles.ts',
  'backend/src/models/AccountToken.ts',
  'backend/src/services/accountTokens.ts',
  'backend/src/routes/workspace.routes.ts',
  'backend/src/routes/curriculum.routes.ts',
  'backend/src/controllers/curriculum.controller.ts',
  'backend/src/scripts/seed4Level1.ts',
  // P1 review fixes
  'backend/src/services/originScope.ts',
  'backend/src/controllers/teaching.controller.ts',
  'backend/src/controllers/learningInsights.controller.ts',
  'backend/src/controllers/learningPedagogy.controller.ts',
  'frontend/services/roleRouting.ts',
  // P1 final gaps
  'frontend/components/OriginSelector.tsx',
  'frontend/pages/teaching/TeachingDashboard.tsx',
  'frontend/pages/ClassInsights.tsx',
  // P2
  'backend/src/utils/docxText.ts',
  'backend/src/services/malwareScan.ts',
  'backend/src/services/documentSafety.ts',
  'backend/src/services/documents.ts',
  'backend/src/services/documentRetention.ts',
  'backend/src/services/curriculumExtraction.ts',
  'backend/src/services/curriculumRetrieval.ts',
  'backend/src/routes/documents.routes.ts',
  'backend/src/models/CurriculumChunk.ts',
  'frontend/pages/workspace/Documents.tsx',
  // P3
  'backend/src/services/educatorChat.ts',
  'backend/src/models/EducatorConversation.ts',
  'backend/src/routes/educatorChat.routes.ts',
  'backend/src/services/featureFlags.ts',
  'backend/src/app.ts',
  'frontend/pages/workspace/AIChat.tsx',
  // P4
  'backend/src/services/speakingExam.ts',
  'backend/src/controllers/speakingExam.controller.ts',
  'backend/src/routes/speaking.routes.ts',
  'backend/src/services/sourceSelection.ts',
  'backend/src/controllers/outcomes.controller.ts',
  'backend/src/services/educatorAi.ts',
  'backend/src/services/conversationExam.ts',
  'backend/src/controllers/assignments.controller.ts',
  'backend/src/controllers/meAssignments.controller.ts',
  'backend/src/models/Assignment.ts',
  'backend/src/models/AssessmentAttempt.ts',
  'backend/src/config/env.ts',
  'frontend/components/SpeakingExam.tsx',
  'frontend/components/SourcePicker.tsx',
  'frontend/pages/teaching/SpeakingExamSettings.tsx',
  'frontend/pages/workspace/Outcomes.tsx',
  // P5
  'backend/src/models/CommercialPlan.ts',
  'backend/src/services/usageReport.ts',
  'backend/src/routes/usage.routes.ts',
  'frontend/components/UsageChip.tsx',
  'frontend/pages/workspace/Usage.tsx',
  'frontend/pages/workspace/SavingsCenter.tsx',
  // P6
  'frontend/pages/Login.tsx',
  'frontend/services/avatarService.ts',
  'frontend/tsconfig.json',
  'frontend/worker/tsconfig.json',
  // P6 staging preflight
  'backend/src/config/stagingGuard.ts',
  'backend/src/config/db.ts',
  'backend/.env.staging.example',
];

export const sha256 = (rel: string) => createHash('sha256').update(readFileSync(path.join(REPO, rel))).digest('hex');

export function buildProvenance(now = new Date(), phase = 'P0c') {
  const baseline = JSON.parse(readFileSync(path.join(REPO, BASELINE_PATH), 'utf8'));
  let branch = 'unknown';
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    // not a git checkout
  }
  const recorded: Record<string, string> = {
    ...Object.fromEntries(Object.entries(baseline.evalv2.production_sources_sha256 as Record<string, string>).map(([f, h]) => [`backend/src/services/${f}`, h])),
    'scripts/benchmarks/run_grading_eval.py': baseline.evalv2.harness_sha256,
  };
  const productionSources = Object.fromEntries(
    Object.entries(recorded).map(([file, baselineSha]) => {
      const current = sha256(file);
      return [file, { baseline_sha256: baselineSha, current_sha256: current, changed_since_baseline: current !== baselineSha }];
    }),
  );
  const frozenHybrid = Object.fromEntries(
    Object.entries(baseline.new_files_sha256 as Record<string, string>)
      .filter(([f]) => f.startsWith('backend/src/services/hybridV1/'))
      .map(([file, baselineSha]) => [file, { baseline_sha256: baselineSha, current_sha256: sha256(file), unchanged: sha256(file) === baselineSha }]),
  );
  const candidateV2Live = Object.fromEntries(
    Object.entries(CANDIDATE_V2_LIVE_RECORDED).map(([file, recordedSha]) => [file, { recorded_sha256: recordedSha, current_sha256: sha256(file), unchanged: recordedSha === null ? null : sha256(file) === recordedSha }]),
  );
  return {
    created_utc: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    kind: `post-${phase} working-tree source provenance`,
    branch,
    commit_sha: null,
    note:
      'Snapshot of an uncommitted working tree (no commit SHA). It does not replace the V1 freeze manifest, which stays the historical baseline. ' +
      `Files under production_sources changed in P0a-${phase} work (or are local edits) and no longer match the baseline; ` +
      'the hybridV1 and candidateV2Live artifacts are frozen and unchanged.',
    baseline_manifest: { path: BASELINE_PATH, sha256: sha256(BASELINE_PATH) },
    production_sources: productionSources,
    frozen_artifacts: { hybridV1: frozenHybrid, candidateV2Live },
    p0_metering_sources: Object.fromEntries(P0_METERING_SOURCES.filter((f) => existsSync(path.join(REPO, f))).map((f) => [f, sha256(f)])),
  };
}

if (require.main === module) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const phase = arg('--phase') ?? 'P0c';
  const rel = arg('--out') ?? OUT_PATH;
  const out = path.join(REPO, rel);
  if (rel !== OUT_PATH && existsSync(out)) throw new Error(`${rel} exists; snapshots are never overwritten`);
  if (!existsSync(path.dirname(out))) mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(buildProvenance(new Date(), phase), null, 1) + '\n');
  process.stdout.write(`wrote ${rel}\n`);
}

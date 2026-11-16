// Recomputes rubric v2 outcomes from STORED evaluator outputs with the current
// evaluator core (no provider call). Writes judge_v2_<role>_rescored.jsonl next to
// the original, which is left unchanged.
//   npx tsx benchmarks/ltc-v2/rescore_v2.ts <eval dir> <rubric_v2_machine.json>
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { EVALUATOR_CORE_VERSION, computeOutcomeV2, loadRubricV2 } from './judge_v2_core';

const [dir, rubricFile] = process.argv.slice(2);
const { rubric, sha256 } = loadRubricV2(readFileSync(rubricFile, 'utf8'));
for (const role of ['official', 'independent']) {
  const f = path.join(dir, `judge_v2_${role}.jsonl`);
  if (!existsSync(f)) continue;
  const out = readFileSync(f, 'utf8').trim().split('\n').map((l) => {
    const r = JSON.parse(l);
    if (r.rubricSha256 !== sha256) throw new Error(`${r.caseId}: rubric hash differs`);
    return JSON.stringify({ ...r, outcomeAsRun: r.outcome, outcome: r.result ? computeOutcomeV2(r.result, r.deterministic, rubric) : null, coreVersionAsRun: r.coreVersion, coreVersion: EVALUATOR_CORE_VERSION, rescored: true });
  });
  writeFileSync(path.join(dir, `judge_v2_${role}_rescored.jsonl`), out.join('\n') + '\n');
  console.log(dir, role, out.length);
}

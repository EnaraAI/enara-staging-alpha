import { readFileSync } from 'fs';
import path from 'path';
import { runExperiment, generateReports, lockPrereg, loadBenchmark, type ExperimentConfig } from './orchestrator/run';
import { validateBenchmark } from './benchmark/validate';
const ROOT = path.resolve(__dirname, '..');
const LIMITATIONS = [
  'All learners are AI-simulated. Nothing here is evidence of learning in real humans; it can only guide engineering and prioritise a real classroom study.',
  'The simulated learner is itself a language model prompted from numeric parameters; its learning behaviour has not been validated against real learner data. Simulator-validity checks (docs/SIMULATOR_VALIDATION.md) test internal sanity, not human realism.',
  'Listening outcomes are TEXT-BASED dialogue comprehension, not audio. Pronunciation and speaking are not assessed.',
  'Delayed retention is simulated by seeded sentence-level forgetting of the learner\'s own note, not by real elapsed time.',
  'Deterministic key/rubric scoring is authoritative; the blind second judge is a model and agrees only imperfectly (see judge agreement in finished.json). Disagreements are listed for human review.',
  'Teaching exposure differs by condition (e.g. notes have no interaction; the scripted tutor is not generative); differences are recorded per block as unavoidableDifferences.',
  'The ENARA ablation (condition E) removes prompt-level adaptive instructions only; answer-hiding guards stay on in all ENARA conditions.',
  'Student replies and tutor replies are sampled from provider models, so reruns with the same seed reproduce the design, assignment and student parameters exactly but not word-for-word model output.',
];
const [cmd, arg] = process.argv.slice(2);
(async () => {
  if (cmd === 'validate-benchmark') { const e = validateBenchmark(loadBenchmark()); console.log(e.length ? e.join('\n') : '48 outcomes valid'); process.exit(e.length ? 1 : 0); }
  else if (cmd === 'lock-prereg') console.log('locked', lockPrereg());
  else if (cmd === 'run') { const cfg = JSON.parse(readFileSync(path.resolve(arg), 'utf8')) as ExperimentConfig; const r = await runExperiment(cfg, { dry: process.argv.includes('--dry') }); generateReports(r.dir, LIMITATIONS); console.log(JSON.stringify({ dir: r.dir, complete: r.finished.complete, recorded: r.finished.blocksRecorded, planned: r.finished.blocksPlanned, failed: r.finished.blocksFailed, spentUsd: r.finished.ledger.totalUsd, leakage: r.finished.leakageEvents }, null, 1)); }
  else if (cmd === 'report') { generateReports(path.resolve(arg), LIMITATIONS); console.log('reports regenerated from raw results'); }
  else { console.log('commands: validate-benchmark | lock-prereg | run <config.json> [--dry] | report <run-dir>'); process.exit(2); }
})().catch((e) => { console.error('ERR', (e as Error).message); process.exit(1); });
